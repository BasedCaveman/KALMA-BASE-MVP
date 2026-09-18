// kalma/frontend/lib/growth/triage.ts
//
// Classify + enrich an incoming link so the composer can draft the right thing:
//   - An X/Twitter status URL  → kind 'reply'  (reply to that tweet)
//   - Anything else (a news article, blog, report) → kind 'post' (original post
//     referencing the source)
//
// Then match the content to a place we already cover (public.places), so a
// draft only ever embeds a card for a real, live place. Pure functions here —
// the Supabase reads (place list, live-signal check) live in the caller so this
// stays unit-testable.

import type { GrowthLang, PlaceLite, TriageResult } from './types';

const SUPPORTED_LANGS: GrowthLang[] = ['en', 'pt', 'es', 'fr', 'de', 'zh'];

/** Map a raw BCP-47 code (e.g. "pt-BR", "zh-Hans", "und") to a supported lang. */
export function toSupportedLang(raw: string | null | undefined): GrowthLang | null {
  if (!raw) return null;
  const base = raw.toLowerCase().split('-')[0] as GrowthLang;
  return SUPPORTED_LANGS.includes(base) ? base : null;
}

// ── URL classification ──────────────────────────────────────────────────────

const X_HOST = /(^|\.)((twitter|x)\.com|nitter\.[^/]+)$/i;

/** Extract the numeric status id from an X/Twitter status URL, else null. */
export function extractTweetId(rawUrl: string): string | null {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    return null;
  }
  if (!X_HOST.test(u.hostname)) return null;
  // /<handle>/status/<id> (also /statuses/<id> on legacy)
  const m = u.pathname.match(/\/status(?:es)?\/(\d{5,25})/);
  return m ? m[1] : null;
}

export function isTweetUrl(rawUrl: string): boolean {
  return extractTweetId(rawUrl) !== null;
}

/** First path segment of an X URL — the author handle. */
export function extractHandle(rawUrl: string): string | null {
  try {
    const seg = new URL(rawUrl).pathname.split('/').filter(Boolean)[0];
    return seg && seg.toLowerCase() !== 'i' ? seg : null;
  } catch {
    return null;
  }
}

/**
 * Read a tweet's text + author WITHOUT the X API, via the free fxtwitter proxy
 * (returns OG/JSON for a status). Fail-soft: null text on any error, so the
 * caller degrades to whatever the teammate typed alongside the link.
 */
export async function fetchTweet(
  rawUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ text: string; author: string | null; lang: GrowthLang | null }> {
  const id = extractTweetId(rawUrl);
  if (!id) return { text: '', author: null, lang: null };
  const handle = extractHandle(rawUrl) ?? 'i';
  const fallbackAuthor = handle === 'i' ? null : handle;
  try {
    const res = await fetchImpl(
      `https://api.fxtwitter.com/${handle}/status/${id}`,
      {
        headers: { 'user-agent': 'KalmaBot/1.0 (+https://kalma.me)' },
        signal: AbortSignal.timeout(10000),
      },
    );
    if (!res.ok) return { text: '', author: fallbackAuthor, lang: null };
    const json = (await res.json()) as {
      tweet?: {
        text?: string;
        lang?: string;
        author?: { screen_name?: string };
      };
    };
    return {
      text: json.tweet?.text ?? '',
      author: json.tweet?.author?.screen_name ?? fallbackAuthor,
      lang: toSupportedLang(json.tweet?.lang),
    };
  } catch {
    return { text: '', author: fallbackAuthor, lang: null };
  }
}

/** Pull the first http(s) URL out of a free-text Telegram message. */
export function firstUrl(text: string): string | null {
  const m = text.match(/https?:\/\/[^\s<>"')]+/i);
  return m ? m[0].replace(/[.,;:]+$/, '') : null;
}

// ── place matching ──────────────────────────────────────────────────────────

/** Fold accents + lowercase for tolerant matching ("São Paulo" ~ "sao paulo"). */
export function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

// City names that are also common English/PT words or too short to match safely.
const AMBIGUOUS_NAMES = new Set(['salem', 'jackson', 'mobile', 'reading', 'nice']);

/**
 * Find the place whose name appears in the text. Prefers the longest matching
 * name (so "Rio de Janeiro" wins over a stray "Rio"), requires a word boundary,
 * and skips ambiguous short names unless the country is also mentioned.
 */
export function matchPlace(text: string, places: PlaceLite[]): PlaceLite | null {
  const hay = normalize(text);
  let best: PlaceLite | null = null;
  let bestLen = 0;

  for (const place of places) {
    const name = normalize(place.name);
    if (name.length < 4) continue;

    const boundary = new RegExp(`(^|[^a-z0-9])${escapeRe(name)}([^a-z0-9]|$)`);
    if (!boundary.test(hay)) continue;

    if (AMBIGUOUS_NAMES.has(name)) {
      const countryHit =
        hay.includes(normalize(place.country)) ||
        (place.region ? hay.includes(normalize(place.region)) : false);
      if (!countryHit) continue;
    }

    if (name.length > bestLen) {
      best = place;
      bestLen = name.length;
    }
  }
  return best;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ── news metadata ────────────────────────────────────────────────────────────

/**
 * Best-effort fetch of a news page's title + lead. Reads og:title / <title> and
 * og:description / meta description from the HTML head. No dependency, fail-soft:
 * on any error returns nulls and the caller falls back to the bare URL.
 */
export async function fetchNewsMeta(
  url: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ title: string | null; summary: string | null }> {
  try {
    const res = await fetchImpl(url, {
      headers: { 'user-agent': 'KalmaBot/1.0 (+https://kalma.me)' },
      redirect: 'follow',
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return { title: null, summary: null };
    const html = (await res.text()).slice(0, 200_000); // head is early; cap read
    return {
      title: metaContent(html, 'og:title') ?? titleTag(html),
      summary:
        metaContent(html, 'og:description') ?? metaContent(html, 'description'),
    };
  } catch {
    return { title: null, summary: null };
  }
}

function metaContent(html: string, key: string): string | null {
  // matches property="og:title" or name="description", content in either order
  const patterns = [
    new RegExp(
      `<meta[^>]+(?:property|name)=["']${key}["'][^>]*content=["']([^"']+)["']`,
      'i',
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']${key}["']`,
      'i',
    ),
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1]) return decodeEntities(m[1].trim());
  }
  return null;
}

function titleTag(html: string): string | null {
  const m = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return m?.[1] ? decodeEntities(m[1].trim()) : null;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
}

// ── orchestration (pure given the place list + fetch) ────────────────────────

/**
 * Classify a link and enrich it. `places` is the caller-loaded place catalog;
 * `fetchImpl` is injectable for tests.
 */
export async function triageLink(
  url: string,
  places: PlaceLite[],
  fetchImpl: typeof fetch = fetch,
): Promise<TriageResult> {
  const tweetId = extractTweetId(url);

  if (tweetId) {
    // Read the tweet text via fxtwitter (no X API needed) so relevance + place
    // matching work even when the teammate sends only the bare link.
    const tweet = await fetchTweet(url, fetchImpl);
    return {
      kind: 'reply',
      targetTweetId: tweetId,
      contextText: tweet.text,
      newsTitle: null,
      newsSummary: null,
      author: tweet.author,
      sourceLang: tweet.lang,
      place: tweet.text ? matchPlace(tweet.text, places) : null,
    };
  }

  const meta = await fetchNewsMeta(url, fetchImpl);
  const contextText = [meta.title, meta.summary].filter(Boolean).join('. ');
  return {
    kind: 'post',
    targetTweetId: null,
    contextText,
    newsTitle: meta.title,
    newsSummary: meta.summary,
    author: null,
    sourceLang: null,
    place: contextText ? matchPlace(contextText, places) : null,
  };
}
