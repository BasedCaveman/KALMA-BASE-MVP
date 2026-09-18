// kalma/frontend/lib/growth/kalma-data.ts
//
// The growth account's source of truth: what Kalma actually recorded today.
// Read straight from PostgREST with the ANON key — `place_briefs` and live
// `weather_alerts` are anon-readable by design, so the poster needs no
// service-role secret and can never write.
//
// This is the whole reason the account can post every day without inventing
// anything: 190+ places carry at least one live signal on a normal day, each
// one with a real number attached.

import type { GrowthLang } from './types.ts';
import { isFocusCity } from './focus-cities.ts';
import { fetchPlaceEvents, type PlaceEvent } from './place-events.ts';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export interface SignalPlace {
  id: string;
  slug: string;
  name: string;
  region: string | null;
  country: string | null;
  country_code: string;
  /** Needed to re-check a forecast number against a live model run. */
  lat: number | null;
  lon: number | null;
}

export interface BriefSignal {
  signal_type_id: string;
  title: string;
  body: string;
  category: string;
  severity: string;
  confidence: number;
  valid_from: string | null;
  valid_until: string | null;
  affected_groups: string[];
  structured_data: Record<string, number | string | boolean | null>;
  sources: string[];
}

export interface VerificationCheck {
  signal_type_id: string;
  title: string;
  metric: string;
  unit: string;
  actual: number;
  baseline: number;
  verdict: string;
}

export interface BriefRow {
  brief_date: string;
  place: SignalPlace;
  /**
   * Verified activity groups for the place (Wikipedia-grounded). Empty when
   * the place has no `coord_verified` profile, which is a reason not to post
   * about it: we would not know who the weather actually touches there.
   */
  groups: string[];
  /** Verified recurring/scheduled events at this place. Empty when none are
   *  on record: most places have none, which is the honest default. */
  events: PlaceEvent[];
  signals: BriefSignal[];
  observations: { count: number; latest: Array<Record<string, unknown>> };
  commodity_events: Array<Record<string, unknown>>;
  verification: {
    note?: string;
    method?: string;
    checks?: VerificationCheck[];
    actuals?: Record<string, number>;
  } | null;
}

export interface AlertRow {
  id: string;
  source: string;
  event: string;
  event_key: string;
  severity: string;
  headline: string;
  description: string;
  area_desc: string;
  onset: string | null;
  expires: string | null;
}

function assertConfigured(): void {
  if (!SUPABASE_URL || !SUPABASE_ANON) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY missing — run with --env-file=.env.local',
    );
  }
}

/**
 * Transient network failures get one retry, then a short backoff, then give
 * up. Not a general-purpose resilience layer: this exists because the
 * autopilot gets ONE reply window a day, and a single `TypeError: fetch
 * failed` here used to end that window silently. Observed live twice, on
 * 2026-08-23 and 2026-08-25 (the second inside the day's only reply slot).
 *
 * Only connection-level failures are retried. An HTTP error from Supabase is
 * a real answer, not a blip, so it throws on the first try as before: retrying
 * a 401 or a malformed query just wastes the window differently.
 */
const REST_ATTEMPTS = 3;
const REST_BACKOFF_MS = [400, 1200];

export async function rest<T>(path: string): Promise<T> {
  assertConfigured();
  let lastError: unknown;
  for (let attempt = 0; attempt < REST_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
        headers: { apikey: SUPABASE_ANON, authorization: `Bearer ${SUPABASE_ANON}` },
        signal: AbortSignal.timeout(20000),
      });
      if (!res.ok) {
        // A response IS an answer. Do not retry it.
        throw new Error(`supabase ${res.status}: ${(await res.text()).slice(0, 200)}`);
      }
      return (await res.json()) as T;
    } catch (err) {
      // Anything that produced an HTTP status is final; only the transport
      // layer (fetch failed, timeout, socket reset) is worth another try.
      if (err instanceof Error && err.message.startsWith('supabase ')) throw err;
      lastError = err;
      const backoff = REST_BACKOFF_MS[attempt];
      if (backoff === undefined) break;
      await new Promise((resolve) => setTimeout(resolve, backoff));
    }
  }
  throw new Error(
    `supabase unreachable after ${REST_ATTEMPTS} attempts: ` +
      (lastError instanceof Error ? lastError.message : String(lastError)),
  );
}

const BRIEF_SELECT =
  'brief_date,signals,observations,commodity_events,verification,places!inner(id,slug,name,region,country,country_code,lat,lon)';

interface RawBrief {
  brief_date: string;
  signals: BriefSignal[] | null;
  observations: BriefRow['observations'] | null;
  commodity_events: Array<Record<string, unknown>> | null;
  verification: BriefRow['verification'];
  places: SignalPlace;
}

function normalizeBrief(
  raw: RawBrief,
  groups: Map<string, string[]>,
  events: Map<string, PlaceEvent[]>,
): BriefRow {
  return {
    brief_date: raw.brief_date,
    place: raw.places,
    groups: groups.get(raw.places.id) ?? [],
    events: events.get(raw.places.id) ?? [],
    signals: raw.signals ?? [],
    observations: raw.observations ?? { count: 0, latest: [] },
    commodity_events: raw.commodity_events ?? [],
    verification: raw.verification ?? null,
  };
}

/** place_id → verified activity groups. Only `coord_verified` rows are trusted. */
export async function fetchActivityProfiles(): Promise<Map<string, string[]>> {
  const rows = await rest<Array<{ place_id: string; groups: string[] | null }>>(
    'place_activity_profiles?select=place_id,groups&coord_verified=is.true&limit=1000',
  );
  const map = new Map<string, string[]>();
  for (const row of rows) map.set(row.place_id, row.groups ?? []);
  return map;
}

/** Today's briefs (UTC day), with each place's verified activity groups
 *  and events. */
export async function fetchBriefs(date: string): Promise<BriefRow[]> {
  const [rows, groups, events] = await Promise.all([
    rest<RawBrief[]>(
      `place_briefs?select=${BRIEF_SELECT}&brief_date=eq.${date}&limit=400`,
    ),
    fetchActivityProfiles(),
    fetchPlaceEvents(),
  ]);
  return rows.map((r) => normalizeBrief(r, groups, events));
}

/** Past briefs already stamped with recorded actuals — the receipts pile. */
export async function fetchVerifiedBriefs(limit = 200): Promise<BriefRow[]> {
  const [rows, groups, events] = await Promise.all([
    rest<RawBrief[]>(
      `place_briefs?select=${BRIEF_SELECT}&verification=not.is.null&order=brief_date.desc&limit=${limit}`,
    ),
    fetchActivityProfiles(),
    fetchPlaceEvents(),
  ]);
  return rows
    .map((r) => normalizeBrief(r, groups, events))
    .filter((b) => (b.verification?.checks?.length ?? 0) > 0);
}

/** Official CAP alerts still in force. */
export async function fetchActiveAlerts(limit = 40): Promise<AlertRow[]> {
  const nowIso = new Date().toISOString();
  return rest<AlertRow[]>(
    `weather_alerts?select=id,source,event,event_key,severity,headline,description,area_desc,onset,expires&expires=gt.${nowIso}&order=onset.desc&limit=${limit}`,
  );
}

// ── ranking ──────────────────────────────────────────────────────────────────

/** How loud a signal is. Higher wins when choosing the day's post. */
const SEVERITY_WEIGHT: Record<string, number> = {
  extreme: 5,
  active: 4,
  strong: 4,
  high: 4,
  medium: 3,
  moderate: 3,
  low: 2,
};

/**
 * Signals that carry a number a stranger can feel. A "water conditions are
 * improving" note is true and useful in the app, but it does not stop a
 * thumb — the poster ranks it below a frost or a 12-day dry run.
 */
const TYPE_WEIGHT: Record<string, number> = {
  frost_risk: 6,
  heavy_rain_event: 5,
  rainfall_risk_rising: 5,
  dry_stretch_window: 4,
  heat_stress_window: 4,
  consecutive_cold_below: 3,
  water_recovery_signal: 1,
};

/**
 * How far this signal sits from normal, in units a reader can feel: degrees
 * below the frost line, days in the run, times the usual rainfall. Two places
 * can both carry a "heavy rain" signal and only one of them is a post.
 */
export function anomalyScore(signal: BriefSignal): number {
  const sd = signal.structured_data ?? {};
  const n = (key: string): number => {
    const value = Number(sd[key]);
    return isFinite(value) ? value : NaN;
  };
  const ratio = (value: number, base: number): number =>
    isFinite(value) && isFinite(base) ? Math.log2(1 + value / Math.max(base, 1)) : 0;

  switch (signal.signal_type_id) {
    case 'frost_risk': {
      const gap = n('threshold_celsius') - n('coldest_forecast_celsius');
      return isFinite(gap) ? Math.min(gap, 12) / 2 : 0;
    }
    case 'heat_stress_window': {
      const gap = n('forecast_7d_max_avg_c') - n('baseline_median_c');
      return isFinite(gap) ? Math.min(Math.max(gap, 0), 12) / 2 : 0;
    }
    case 'rainfall_risk_rising':
      return ratio(n('forecast_48h_mm'), n('baseline_median_mm')) * 1.5;
    case 'heavy_rain_event':
      return ratio(n('wettest_forecast_mm'), n('baseline_p90_mm')) * 1.5;
    case 'dry_stretch_window':
    case 'consecutive_cold_below': {
      const days = n('observed_run_days');
      return isFinite(days) ? Math.min(days, 14) / 3 : 0;
    }
    case 'water_recovery_signal':
      return ratio(n('recent_14d_sum_mm'), n('baseline_p75_mm'));
    default:
      return 0;
  }
}

/**
 * Is this number worth saying out loud?
 *
 * Ratios lie when the baseline is near zero. "8mm against a 0mm normal" scores
 * as eight times normal and reads as nothing, which is how the first version
 * ended up answering a state flood alert with 8mm of rain. These are absolute
 * floors: below them the signal is real, useful inside the app, and not worth
 * a stranger's attention.
 */
export function isNotable(signal: BriefSignal): boolean {
  const sd = signal.structured_data ?? {};
  const n = (key: string): number => Number(sd[key]);
  switch (signal.signal_type_id) {
    case 'rainfall_risk_rising':
      return n('forecast_48h_mm') >= 25;
    case 'heavy_rain_event':
      return n('wettest_forecast_mm') >= 20;
    case 'dry_stretch_window':
      return n('observed_run_days') >= 7;
    case 'consecutive_cold_below':
      return n('observed_run_days') >= 3;
    case 'frost_risk':
      return n('coldest_forecast_celsius') <= 2;
    case 'heat_stress_window':
      return n('forecast_7d_max_avg_c') - n('baseline_median_c') >= 2.5;
    case 'water_recovery_signal':
      return n('recent_14d_sum_mm') >= 15;
    default:
      return false;
  }
}

export function signalScore(signal: BriefSignal): number {
  const sev = SEVERITY_WEIGHT[String(signal.severity).toLowerCase()] ?? 1;
  const type = TYPE_WEIGHT[signal.signal_type_id] ?? 2;
  const confidence = (signal.confidence ?? 0) / 100;
  return sev * 2 + type * 3 + confidence * 2 + anomalyScore(signal) * 3;
}

/** The one signal worth a post for this place today. */
export function topSignal(brief: BriefRow): BriefSignal | null {
  if (!brief.signals.length) return null;
  return [...brief.signals].sort((a, b) => signalScore(b) - signalScore(a))[0];
}

/** Briefs worth posting, loudest first. */
/**
 * Small enough that it only decides between comparable signals. signalScore
 * spans a wide range, so this shifts a near-tie and never rescues a dull one.
 */
const FOCUS_SIGNAL_BONUS = 1.5;

/**
 * Best signal first, with the focus cities preferred when they have one worth
 * publishing.
 *
 * The preference is a TIE-SHIFT, not an override: a focus city outranks a
 * comparable signal elsewhere, but a genuinely bigger event anywhere still
 * wins. Concentration cannot be allowed to make the account post a mild
 * anomaly in Tampa over a real one somewhere else, because the claim is the
 * product and the interesting number is the reason anyone reads it. On days
 * when no focus city has a notable signal, this changes nothing and the
 * engine publishes the best signal it has, which is the intended behaviour:
 * the alternative is silence, and there is nothing to say about a calm sky.
 */
export function rankBriefs(briefs: BriefRow[]): BriefRow[] {
  return briefs
    .filter((b) => b.signals.length > 0)
    .sort((a, b) => {
      const sa = topSignal(a);
      const sb = topSignal(b);
      const scoreA = (sa ? signalScore(sa) : 0) + (isFocusCity(a.place.slug) ? FOCUS_SIGNAL_BONUS : 0);
      const scoreB = (sb ? signalScore(sb) : 0) + (isFocusCity(b.place.slug) ? FOCUS_SIGNAL_BONUS : 0);
      return scoreB - scoreA;
    });
}

// ── language ─────────────────────────────────────────────────────────────────

const COUNTRY_LANG: Record<string, GrowthLang> = {
  BR: 'pt', PT: 'pt',
  ES: 'es', MX: 'es', AR: 'es', CO: 'es', CL: 'es', PE: 'es', VE: 'es',
  EC: 'es', BO: 'es', PY: 'es', UY: 'es', GT: 'es', CR: 'es', PA: 'es',
  DO: 'es', CU: 'es', HN: 'es', NI: 'es', SV: 'es',
};

/**
 * Which language to post a place in. Everything outside the PT/ES belt goes
 * out in English: the account is talking to the people who live under that
 * sky first, and to the wider feed second.
 */
export function langForPlace(place: SignalPlace): GrowthLang {
  return COUNTRY_LANG[place.country_code] ?? 'en';
}

/** UTC date string, the same key `place_briefs` is written under. */
export function todayUtc(offsetDays = 0): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}
