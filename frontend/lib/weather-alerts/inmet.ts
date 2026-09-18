// kalma/frontend/lib/weather-alerts/inmet.ts
//
// Ingestion for INMET (Brazil) official weather alerts — the "source context"
// alerts layer (Golden Rule 8), kept SEPARATE from the weather-news feed.
//
// INMET publishes CAP 1.2 (OASIS emergency-alert standard). Two endpoints:
//   list:   https://apiprevmet3.inmet.gov.br/avisos/rss        (active alert ids)
//   detail: https://apiprevmet3.inmet.gov.br/avisos/rss/<id>   (full CAP + polygon)
// The API rate-limits ("Você atingiu o limite de requisições"), so detail
// fetches are throttled, capped per run, and skipped for alerts already stored
// and unchanged. CAP polygons let alerts route precisely to a place lat/lon
// (see lib/weather-alerts/routing.ts).

import type { SupabaseClient } from '@supabase/supabase-js';

const LIST_URL = 'https://apiprevmet3.inmet.gov.br/avisos/rss';
const DETAIL_URL = (id: string) => `https://apiprevmet3.inmet.gov.br/avisos/rss/${id}`;
// A browser-ish UA: INMET's WAF 403s obvious bot UAs (same as BoM).
const USER_AGENT =
  'Mozilla/5.0 (compatible; KalmaWeatherAlerts/1.0; +https://kalma.me)';

export interface InmetAlertRow {
  id: string;
  source: 'inmet';
  event: string;
  event_key: string;
  severity: string;
  response_type: string | null;
  headline: string | null;
  description: string | null;
  area_desc: string | null;
  polygon: [number, number][];
  bbox: [number, number, number, number];
  onset: string | null;
  expires: string;
  link: string | null;
  raw: Record<string, unknown>;
}

export interface InmetIngestSummary {
  listed: number;
  detailsFetched: number;
  upserted: number;
  skippedFresh: number;
  expiredDropped: number;
  failed: number;
  elapsedMs: number;
}

interface IngestOptions {
  maxDetailsPerRun?: number;
  throttleMs?: number;
  log?: (message: string) => void;
  now?: Date;
}

// INMET event (pt) → stable normalized key. Deliberately conservative: an
// unmapped event falls back to a slug of the source string, never guessed.
const EVENT_KEY_MAP: Record<string, string> = {
  'chuvas intensas': 'heavy_rain',
  'acumulado de chuva': 'heavy_rain',
  tempestade: 'storm',
  vendaval: 'high_wind',
  'ventos costeiros': 'coastal_wind',
  'baixa umidade': 'low_humidity',
  geada: 'frost',
  'declinio de temperatura': 'cold_spell',
  'onda de calor': 'heatwave',
};

function slugifyEvent(event: string): string {
  return event
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'unknown';
}

export function eventKeyFor(event: string): string {
  const norm = event
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
  return EVENT_KEY_MAP[norm] ?? slugifyEvent(event);
}

function decodeEntities(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function tag(xml: string, name: string): string | null {
  const m = xml.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`, 'i'));
  return m ? decodeEntities(m[1].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim() : null;
}

async function fetchText(url: string, timeoutMs = 12_000): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { accept: 'application/xml, text/xml, application/rss+xml', 'user-agent': USER_AGENT },
      cache: 'no-store',
      redirect: 'follow',
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = await res.text();
    // INMET returns a plain-text rate-limit notice with a 200.
    if (/limite de requisi/i.test(body)) throw new Error('rate_limited');
    return body;
  } finally {
    clearTimeout(timer);
  }
}

// CAP <polygon> is whitespace-separated "lat,lon" pairs (may repeat the first
// point to close the ring). Returns [] when unparseable.
function parsePolygon(cap: string): [number, number][] {
  const raw = cap.match(/<polygon>([\s\S]*?)<\/polygon>/i)?.[1]?.trim();
  if (!raw) return [];
  const points: [number, number][] = [];
  for (const pair of raw.split(/\s+/)) {
    const [lat, lon] = pair.split(',').map(Number);
    if (Number.isFinite(lat) && Number.isFinite(lon)) points.push([lat, lon]);
  }
  return points;
}

function bboxOf(polygon: [number, number][]): [number, number, number, number] | null {
  if (polygon.length === 0) return null;
  let minLat = Infinity;
  let minLon = Infinity;
  let maxLat = -Infinity;
  let maxLon = -Infinity;
  for (const [lat, lon] of polygon) {
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lon < minLon) minLon = lon;
    if (lon > maxLon) maxLon = lon;
  }
  return [minLat, minLon, maxLat, maxLon];
}

function toIso(value: string | null): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Parse one CAP 1.2 alert document into a row, or null if unusable. */
export function parseCapAlert(cap: string): InmetAlertRow | null {
  const id = tag(cap, 'identifier');
  const event = tag(cap, 'event');
  const expiresRaw = toIso(tag(cap, 'expires'));
  const polygon = parsePolygon(cap);
  const bbox = bboxOf(polygon);
  // Require the fields the layer depends on: identity, event, expiry, geometry.
  if (!id || !event || !expiresRaw || !bbox) return null;

  return {
    id,
    source: 'inmet',
    event,
    event_key: eventKeyFor(event),
    severity: tag(cap, 'severity') ?? 'Unknown',
    response_type: tag(cap, 'responseType'),
    headline: tag(cap, 'headline'),
    description: tag(cap, 'description'),
    area_desc: tag(cap, 'areaDesc'),
    polygon,
    bbox,
    onset: toIso(tag(cap, 'onset')),
    expires: expiresRaw,
    link: tag(cap, 'web'),
    raw: {
      urgency: tag(cap, 'urgency'),
      certainty: tag(cap, 'certainty'),
      category: tag(cap, 'category'),
    },
  };
}

function listIds(listRss: string): string[] {
  const ids = new Set<string>();
  for (const m of listRss.matchAll(/\/avisos\/rss\/(\d+)/g)) ids.add(m[1]);
  return [...ids];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Fetch INMET's active alerts, parse CAP detail (throttled), and upsert.
 * Existing rows whose stored `expires` still matches are skipped (cheap
 * re-runs). Returns a summary for the cron JSON.
 */
export async function runInmetAlertsIngest(
  supabase: SupabaseClient,
  options: IngestOptions = {},
): Promise<InmetIngestSummary> {
  const startedAt = Date.now();
  const now = options.now ?? new Date();
  const maxDetails = Math.max(1, Math.min(150, options.maxDetailsPerRun ?? 120));
  const throttleMs = Math.max(0, options.throttleMs ?? 250);
  const log = options.log ?? (() => undefined);

  const summary: InmetIngestSummary = {
    listed: 0,
    detailsFetched: 0,
    upserted: 0,
    skippedFresh: 0,
    expiredDropped: 0,
    failed: 0,
    elapsedMs: 0,
  };

  const listRss = await fetchText(LIST_URL);
  const ids = listIds(listRss);
  summary.listed = ids.length;

  // Already-stored INMET alerts, to skip unchanged ones and detect drops.
  const { data: existing } = await supabase
    .from('weather_alerts')
    .select('id, expires')
    .eq('source', 'inmet');
  const known = new Map<string, string>((existing ?? []).map((r) => [r.id as string, r.expires as string]));
  const seen = new Set<string>();

  let budget = maxDetails;
  for (const id of ids) {
    if (budget <= 0) break;
    // We can't know expiry without fetching detail, but if we've already got
    // this id stored and unexpired, skip the network call entirely.
    const knownExpiry = known.get(id);
    if (knownExpiry && new Date(knownExpiry).getTime() > now.getTime()) {
      seen.add(id);
      summary.skippedFresh += 1;
      continue;
    }

    budget -= 1;
    try {
      const cap = await fetchText(DETAIL_URL(id));
      summary.detailsFetched += 1;
      const row = parseCapAlert(cap);
      if (!row) {
        summary.failed += 1;
        continue;
      }
      if (new Date(row.expires).getTime() <= now.getTime()) {
        summary.expiredDropped += 1;
        continue;
      }
      const { error } = await supabase
        .from('weather_alerts')
        .upsert({ ...row, updated_at: now.toISOString() }, { onConflict: 'id' });
      if (error) {
        log(`[inmet-alerts] upsert ${id} failed: ${error.message}`);
        summary.failed += 1;
      } else {
        seen.add(id);
        summary.upserted += 1;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log(`[inmet-alerts] ${id}: ${msg}`);
      summary.failed += 1;
      if (msg === 'rate_limited') break; // stop hammering a limited API
    }
    if (throttleMs) await sleep(throttleMs);
  }

  // Drop INMET rows that already expired (RLS hides them from readers anyway,
  // but keep the table tidy).
  await supabase.from('weather_alerts').delete().eq('source', 'inmet').lt('expires', now.toISOString());

  summary.elapsedMs = Date.now() - startedAt;
  return summary;
}
