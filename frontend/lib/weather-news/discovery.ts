import type { SupabaseClient } from '@supabase/supabase-js';
import {
  isWeatherNewsRelevant,
  scoreWeatherNewsStory,
  type WeatherNewsStatus,
} from './scoring';

type DiscoveryKind = 'html' | 'rss';

interface WeatherNewsSourceRow {
  id: string;
  slug: string;
  name: string;
  region: string;
  discovery_url: string;
  discovery_kind: DiscoveryKind;
  allowed_hosts: string[];
  include_path_fragments: string[];
  exclude_path_fragments: string[];
  languages: string[];
  score_total: number;
  consecutive_failures: number;
}

interface StoryCandidate {
  canonicalUrl: string;
  title: string;
  summary: string | null;
  language: string;
  publishedAt: string | null;
}

interface SourceRunResult {
  source: string;
  ok: boolean;
  discovered: number;
  approved: number;
  review: number;
  rejected: number;
  error?: string;
}

export interface WeatherNewsDiscoverySummary {
  runDate: string;
  status: 'completed' | 'partial';
  sourcesChecked: number;
  sourcesFailed: number;
  itemsDiscovered: number;
  itemsApproved: number;
  itemsReview: number;
  itemsRejected: number;
  sourceResults: SourceRunResult[];
  elapsedMs: number;
}

interface DiscoveryOptions {
  maxItemsPerSource?: number;
  log?: (message: string) => void;
  now?: Date;
}

const USER_AGENT =
  'Kalma weather-news curator/1.0 (+https://kalma.me; daily public-interest discovery)';
const TRACKING_PARAMS = new Set([
  'fbclid',
  'gclid',
  'mc_cid',
  'mc_eid',
  'ref',
  'source',
]);

function decodeEntities(value: string): string {
  const named: Record<string, string> = {
    amp: '&',
    apos: "'",
    gt: '>',
    hellip: '…',
    ldquo: '“',
    lsquo: '‘',
    lt: '<',
    nbsp: ' ',
    quot: '"',
    rdquo: '”',
    rsquo: '’',
  };

  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    )
    .replace(/&([a-z]+);/gi, (entity, name: string) => named[name.toLowerCase()] ?? entity);
}

function plainText(value: string): string {
  return decodeEntities(value)
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function canonicalizeUrl(rawUrl: string, baseUrl: string): string | null {
  try {
    const url = new URL(decodeEntities(rawUrl), baseUrl);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) {
      if (key.toLowerCase().startsWith('utm_') || TRACKING_PARAMS.has(key.toLowerCase())) {
        url.searchParams.delete(key);
      }
    }
    if (url.pathname !== '/') url.pathname = url.pathname.replace(/\/+$/, '');
    return url.toString();
  } catch {
    return null;
  }
}

function parseDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const parsed = new Date(plainText(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function getAttributes(tag: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  const pattern = /([:\w-]+)\s*=\s*(["'])([\s\S]*?)\2/g;
  for (const match of tag.matchAll(pattern)) {
    attributes[match[1].toLowerCase()] = decodeEntities(match[3]);
  }
  return attributes;
}

function getMeta(html: string, ...keys: string[]): string | null {
  const wanted = new Set(keys.map((key) => key.toLowerCase()));
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attributes = getAttributes(match[0]);
    const key = (attributes.property ?? attributes.name ?? attributes.itemprop ?? '').toLowerCase();
    if (wanted.has(key) && attributes.content) return plainText(attributes.content);
  }
  return null;
}

function getHtmlLanguage(html: string, fallback: string): string {
  const htmlTag = html.match(/<html\b[^>]*>/i)?.[0];
  const language = htmlTag ? getAttributes(htmlTag).lang : null;
  return (language ?? fallback).split(/[-_]/)[0].toLowerCase().slice(0, 8);
}

function getCanonicalLink(html: string, baseUrl: string): string | null {
  for (const match of html.matchAll(/<link\b[^>]*>/gi)) {
    const attributes = getAttributes(match[0]);
    if (attributes.rel?.toLowerCase().split(/\s+/).includes('canonical') && attributes.href) {
      return canonicalizeUrl(attributes.href, baseUrl);
    }
  }
  return null;
}

async function fetchText(url: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 7_000);
  try {
    const response = await fetch(url, {
      headers: {
        accept: 'text/html, application/rss+xml, application/atom+xml, application/xml;q=0.9',
        'user-agent': USER_AGENT,
      },
      cache: 'no-store',
      redirect: 'follow',
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

function hostAllowed(url: URL, source: WeatherNewsSourceRow): boolean {
  return source.allowed_hosts.some(
    (allowed) => url.hostname === allowed || url.hostname.endsWith(`.${allowed}`),
  );
}

function pathAllowed(url: URL, source: WeatherNewsSourceRow): boolean {
  const target = `${url.pathname}${url.search}`.toLowerCase();
  const included =
    source.include_path_fragments.length === 0 ||
    source.include_path_fragments.some((fragment) =>
      target.includes(fragment.toLowerCase()),
    );
  const excluded = source.exclude_path_fragments.some((fragment) =>
    target.includes(fragment.toLowerCase()),
  );
  return included && !excluded;
}

function uniqueCandidates(candidates: StoryCandidate[]): StoryCandidate[] {
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    if (seen.has(candidate.canonicalUrl)) return false;
    seen.add(candidate.canonicalUrl);
    return true;
  });
}

// Derive a human title from a document URL's filename. Bulletin index pages
// often link stories with generic anchor text ("Ver Comunicado", "Read more")
// or an icon, while the descriptive title lives in the filename
// (e.g. .../CIIFEN-Comunicado-01-2026-Posible-Nino-Costero.pdf). PDFs are also
// skipped by enrichCandidate, so the filename is the only title source.
function titleFromUrl(rawUrl: string): string {
  try {
    const segment = decodeURIComponent(new URL(rawUrl).pathname.split('/').filter(Boolean).pop() ?? '');
    return segment
      .replace(/\.[a-z0-9]{2,4}$/i, '') // strip extension
      .replace(/[._\-]+/g, ' ') // separators → spaces
      .replace(/\bv\d+\b/gi, '') // drop version suffixes like v2
      .replace(/\s+/g, ' ')
      .trim();
  } catch {
    return '';
  }
}

// Extract a publish date from a /YYYY/MM/ path segment (WordPress upload
// convention). Returns midday UTC on the 1st of that month, or null.
function publishedFromUrl(rawUrl: string): string | null {
  try {
    const match = new URL(rawUrl).pathname.match(/\/(20\d{2})\/(0[1-9]|1[0-2])\//);
    if (!match) return null;
    const iso = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1, 12)).toISOString();
    return Number.isNaN(Date.parse(iso)) ? null : iso;
  } catch {
    return null;
  }
}

function parseHtmlIndex(html: string, source: WeatherNewsSourceRow): StoryCandidate[] {
  const candidates: StoryCandidate[] = [];
  const anchorPattern = /<a\b([^>]*?)>([\s\S]*?)<\/a>/gi;

  for (const match of html.matchAll(anchorPattern)) {
    const attributes = getAttributes(`<a ${match[1]}>`);
    if (!attributes.href) continue;
    const canonicalUrl = canonicalizeUrl(attributes.href, source.discovery_url);
    if (!canonicalUrl) continue;
    const parsed = new URL(canonicalUrl);
    if (!hostAllowed(parsed, source) || !pathAllowed(parsed, source)) continue;

    // Prefer the anchor's visible text, but fall back to the filename-derived
    // title when the link text is too short or not weather-relevant (generic
    // "Ver Comunicado" links, icon-only links, PDF bulletins).
    let title = plainText(match[2]);
    if (title.length < 18 || !isWeatherNewsRelevant(title)) {
      const fromUrl = titleFromUrl(canonicalUrl);
      if (fromUrl.length >= 18 && isWeatherNewsRelevant(fromUrl)) title = fromUrl;
    }
    if (title.length < 18 || title.length > 260 || !isWeatherNewsRelevant(title)) continue;

    candidates.push({
      canonicalUrl,
      title,
      summary: null,
      language: source.languages[0] ?? 'en',
      // Date a document by the /YYYY/MM/ segment in its (WordPress) upload path
      // so the staleness gate can exclude old bulletins instead of surfacing
      // them undated as if current. No date → treated as fresh (unchanged).
      publishedAt: publishedFromUrl(canonicalUrl),
    });
  }

  return uniqueCandidates(candidates);
}

function tagValue(block: string, tagNames: string[]): string | null {
  for (const tagName of tagNames) {
    const escaped = tagName.replace(':', '\\:');
    const match = block.match(new RegExp(`<${escaped}\\b[^>]*>([\\s\\S]*?)<\\/${escaped}>`, 'i'));
    if (match) return plainText(match[1]);
  }
  return null;
}

function parseXmlFeed(xml: string, source: WeatherNewsSourceRow): StoryCandidate[] {
  const blocks = [
    ...xml.matchAll(/<item\b[\s\S]*?<\/item>/gi),
    ...xml.matchAll(/<entry\b[\s\S]*?<\/entry>/gi),
  ].map((match) => match[0]);
  const candidates: StoryCandidate[] = [];

  for (const block of blocks) {
    const title = tagValue(block, ['title']);
    if (!title) continue;

    const linkTag = block.match(/<link\b[^>]*>/i)?.[0];
    const linkAttributes = linkTag ? getAttributes(linkTag) : {};
    const rawUrl = linkAttributes.href ?? tagValue(block, ['link', 'guid']);
    if (!rawUrl) continue;
    const canonicalUrl = canonicalizeUrl(rawUrl, source.discovery_url);
    if (!canonicalUrl) continue;
    const parsed = new URL(canonicalUrl);
    if (!hostAllowed(parsed, source) || !pathAllowed(parsed, source)) continue;

    const summary = tagValue(block, ['description', 'summary', 'content:encoded']);
    if (!isWeatherNewsRelevant(`${title} ${summary ?? ''}`)) continue;
    candidates.push({
      canonicalUrl,
      title: title.slice(0, 300),
      summary: summary?.slice(0, 2_000) ?? null,
      language: source.languages[0] ?? 'en',
      publishedAt: parseDate(tagValue(block, ['pubDate', 'published', 'updated', 'dc:date'])),
    });
  }

  return uniqueCandidates(candidates);
}

function parseIndex(html: string, source: WeatherNewsSourceRow): StoryCandidate[] {
  const looksLikeFeed = /<(?:rss|feed)\b/i.test(html);
  return source.discovery_kind === 'rss' || looksLikeFeed
    ? parseXmlFeed(html, source)
    : parseHtmlIndex(html, source);
}

async function enrichCandidate(
  candidate: StoryCandidate,
  source: WeatherNewsSourceRow,
): Promise<StoryCandidate> {
  if (
    candidate.canonicalUrl.toLowerCase().endsWith('.pdf') ||
    (candidate.summary && candidate.publishedAt)
  ) {
    return candidate;
  }

  try {
    const html = await fetchText(candidate.canonicalUrl);
    const title =
      getMeta(html, 'og:title', 'twitter:title') ??
      plainText(html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '') ??
      candidate.title;
    const summary =
      getMeta(html, 'description', 'og:description', 'twitter:description') ??
      candidate.summary;
    const pageCanonical = getCanonicalLink(html, candidate.canonicalUrl);
    const canonicalUrl =
      pageCanonical && hostAllowed(new URL(pageCanonical), source)
        ? pageCanonical
        : candidate.canonicalUrl;
    const publishedAt =
      parseDate(
        getMeta(
          html,
          'article:published_time',
          'datepublished',
          'date',
          'dc.date',
          'parsely-pub-date',
        ),
      ) ?? candidate.publishedAt;

    return {
      canonicalUrl,
      title: (title || candidate.title).slice(0, 300),
      summary: summary?.slice(0, 2_000) ?? null,
      language: getHtmlLanguage(html, candidate.language || source.languages[0] || 'en'),
      publishedAt,
    };
  } catch {
    return candidate;
  }
}

function dayKey(now: Date): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
    .toISOString()
    .slice(0, 10);
}

function tallyStatus(
  status: WeatherNewsStatus,
  result: SourceRunResult,
): void {
  if (status === 'approved') result.approved += 1;
  else if (status === 'review') result.review += 1;
  else result.rejected += 1;
}

export async function runWeatherNewsDiscovery(
  supabase: SupabaseClient,
  options: DiscoveryOptions = {},
): Promise<WeatherNewsDiscoverySummary> {
  const startedAt = Date.now();
  const now = options.now ?? new Date();
  const runDate = dayKey(now);
  const maxItemsPerSource = Math.min(
    20,
    Math.max(1, options.maxItemsPerSource ?? 5),
  );
  const log = options.log ?? (() => undefined);

  const { error: runStartError } = await supabase
    .from('weather_news_runs')
    .upsert(
      {
        run_date: runDate,
        status: 'running',
        started_at: now.toISOString(),
        finished_at: null,
        sources_checked: 0,
        sources_failed: 0,
        items_discovered: 0,
        items_approved: 0,
        items_review: 0,
        items_rejected: 0,
        source_results: [],
        error: null,
      },
      { onConflict: 'run_date' },
    );
  if (runStartError) throw new Error(`start run ledger: ${runStartError.message}`);

  try {
    const { data, error } = await supabase
      .from('weather_news_sources')
      .select(
        'id,slug,name,region,discovery_url,discovery_kind,allowed_hosts,include_path_fragments,exclude_path_fragments,languages,score_total,consecutive_failures',
      )
      .eq('status', 'approved')
      .order('region');
    if (error) throw new Error(`load sources: ${error.message}`);

    const sources = (data ?? []) as WeatherNewsSourceRow[];
    const sourceResults: SourceRunResult[] = [];
    let sourcesFailed = 0;
    let itemsDiscovered = 0;
    let itemsApproved = 0;
    let itemsReview = 0;
    let itemsRejected = 0;

    for (const source of sources) {
      const result: SourceRunResult = {
        source: source.slug,
        ok: false,
        discovered: 0,
        approved: 0,
        review: 0,
        rejected: 0,
      };
      const checkedAt = new Date().toISOString();

      try {
        log(`[weather-news] ${source.slug}: reading ${source.discovery_url}`);
        const index = await fetchText(source.discovery_url);
        const baseCandidates = parseIndex(index, source).slice(0, maxItemsPerSource);
        const candidates = await Promise.all(
          baseCandidates.map((candidate) => enrichCandidate(candidate, source)),
        );

        for (const candidate of uniqueCandidates(candidates)) {
          const scorecard = scoreWeatherNewsStory({
            title: candidate.title,
            summary: candidate.summary,
            sourceScore: source.score_total,
            publishedAt: candidate.publishedAt,
            now,
          });
          const expiresAt = new Date(now.getTime() + 62 * 24 * 60 * 60 * 1_000).toISOString();
          const { error: upsertError } = await supabase
            .from('weather_news_items')
            .upsert(
              {
                source_id: source.id,
                region: source.region,
                canonical_url: candidate.canonicalUrl,
                title: candidate.title,
                summary: candidate.summary,
                language: candidate.language,
                published_at: candidate.publishedAt,
                last_seen_at: now.toISOString(),
                expires_at: expiresAt,
                editorial_score: scorecard.total,
                scorecard,
                alarmist_signal: scorecard.alarmistSignal,
                denial_signal: scorecard.denialSignal,
                status: scorecard.status,
                rejection_reasons: scorecard.rejectionReasons,
              },
              { onConflict: 'source_id,canonical_url' },
            );
          if (upsertError) throw new Error(`upsert item: ${upsertError.message}`);
          result.discovered += 1;
          tallyStatus(scorecard.status, result);
        }

        result.ok = true;
        const { error: sourceUpdateError } = await supabase
          .from('weather_news_sources')
          .update({
            last_checked_at: checkedAt,
            last_success_at: checkedAt,
            consecutive_failures: 0,
            last_error: null,
            updated_at: checkedAt,
          })
          .eq('id', source.id);
        if (sourceUpdateError) {
          throw new Error(`update source health: ${sourceUpdateError.message}`);
        }
      } catch (sourceError) {
        sourcesFailed += 1;
        const message =
          sourceError instanceof Error ? sourceError.message : String(sourceError);
        result.error = message.slice(0, 500);
        const { error: failureUpdateError } = await supabase
          .from('weather_news_sources')
          .update({
            last_checked_at: checkedAt,
            consecutive_failures: source.consecutive_failures + 1,
            last_error: result.error,
            updated_at: checkedAt,
          })
          .eq('id', source.id);
        if (failureUpdateError) {
          log(`[weather-news] ${source.slug}: health update failed: ${failureUpdateError.message}`);
        }
        log(`[weather-news] ${source.slug}: ${message}`);
      }

      itemsDiscovered += result.discovered;
      itemsApproved += result.approved;
      itemsReview += result.review;
      itemsRejected += result.rejected;
      sourceResults.push(result);
    }

    const status = sourcesFailed > 0 ? 'partial' : 'completed';
    const finishedAt = new Date().toISOString();
    const { error: runFinishError } = await supabase
      .from('weather_news_runs')
      .update({
        status,
        finished_at: finishedAt,
        sources_checked: sources.length,
        sources_failed: sourcesFailed,
        items_discovered: itemsDiscovered,
        items_approved: itemsApproved,
        items_review: itemsReview,
        items_rejected: itemsRejected,
        source_results: sourceResults,
      })
      .eq('run_date', runDate);
    if (runFinishError) throw new Error(`finish run ledger: ${runFinishError.message}`);

    return {
      runDate,
      status,
      sourcesChecked: sources.length,
      sourcesFailed,
      itemsDiscovered,
      itemsApproved,
      itemsReview,
      itemsRejected,
      sourceResults,
      elapsedMs: Date.now() - startedAt,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await supabase
      .from('weather_news_runs')
      .update({
        status: 'failed',
        finished_at: new Date().toISOString(),
        error: message.slice(0, 1_000),
      })
      .eq('run_date', runDate);
    throw error;
  }
}
