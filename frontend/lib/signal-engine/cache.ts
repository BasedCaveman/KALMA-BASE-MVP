// kalma/frontend/lib/signal-engine/cache.ts
//
// Supabase-backed cache for Open-Meteo historical fetches.
// Historical data is stable for past dates so we cache aggressively.
// TTL is 7 days — long enough to dedupe calls within a sprint of cron
// runs, short enough that the latest year's data eventually flows in.
//
// The cache stores the pre-sorted-ascending values array so percentile
// lookups are O(log n) without re-sorting on every read.
//
// WHY THE READ TOLERATES A SHIFTED DOY.
//
// The cache key includes doy_center, and doy_center advances every day. With
// an exact-match read the hit rate is zero BY CONSTRUCTION: a row written for
// DOY 261 can only be reused if DOY 261 is asked for again, and the next one
// is a year away — long past the TTL. Measured on 2026-09-18: all 44,001 rows
// in the table had doy_center equal to the day they were written, with no
// exceptions. The table was write-only, costing ~605 Open-Meteo archive calls
// a day and saving none.
//
// So the read now accepts a row centred within DOY_TOLERANCE days of the
// request. The cost is a shifted sampling window: asking for DOY 262 and
// getting a row centred on 260 moves a 15-day window (doy_half_window = 7) by
// 2 days. Against ~143 samples that is noise for the p75/p90/p95 estimate that
// is the only thing these values feed.
//
// Expected effect at DOY_TOLERANCE = 3: each (place, variable) is refetched
// every 4 days instead of every day, so ~605 calls/day becomes ~150. That
// headroom is what pays for adding temperature_2m_min, which the cold and
// frost signals need in order to stop using a fixed threshold.
//
// Writes still happen at the exact DOY. Nothing stored changes shape, so this
// is reversible by setting DOY_TOLERANCE back to 0 — no migration either way.

import type { SupabaseClient } from '@supabase/supabase-js';
import { dayOfYearUTC } from './percentile';
import { fetchHistoricalBaseline, type DailyVariable } from './openMeteoFetcher';

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * How far the centre of a cached window may sit from the requested DOY.
 *
 * This is the knob that sets the refetch cycle, and the TTL is NOT what
 * limits it. A row written on DOY N answers requests for N..N+DOY_TOLERANCE
 * and then falls outside the candidate band, so it is refetched every
 * DOY_TOLERANCE + 1 days — 4 days at the current value. Its age never exceeds
 * 3 days, so the 7-day TTL is pure slack and only starts to bind above
 * DOY_TOLERANCE = 6. Raise them together or not at all.
 *
 * Widening costs accuracy: the sampling window is 2 * doy_half_window + 1 = 15
 * days, so a tolerance of t replaces roughly t/15 of the samples. At 3 that is
 * 20% of a 143-sample set moving — noise for a p75/p90/p95. Past about 5 it
 * stops being noise and someone should check it against real percentiles
 * before shipping.
 *
 * Set to 0 to restore exact-match behaviour.
 */
const DOY_TOLERANCE = 3;

const DAYS_IN_YEAR = 365;

/** Wrap a day-of-year into 1..365. DOY 366 of a leap year folds onto 365. */
function wrapDoy(doy: number): number {
  return ((Math.min(doy, DAYS_IN_YEAR) - 1 + DAYS_IN_YEAR) % DAYS_IN_YEAR) + 1;
}

/** Acceptable window centres for a request, including across New Year. */
function candidateDoys(doyCenter: number): number[] {
  const out = [wrapDoy(doyCenter)];
  for (let d = 1; d <= DOY_TOLERANCE; d += 1) {
    out.push(wrapDoy(doyCenter - d), wrapDoy(doyCenter + d));
  }
  return [...new Set(out)];
}

/** Distance between two DOYs the short way round the year. */
function doyDistance(a: number, b: number): number {
  const raw = Math.abs(wrapDoy(a) - wrapDoy(b));
  return Math.min(raw, DAYS_IN_YEAR - raw);
}

/**
 * Hit/miss counters for one process. The cron reads these after a run to see
 * whether the cache is doing anything — the number that was silently zero
 * before this change. `shiftedHits` counts hits served by a neighbouring DOY,
 * which is the share of reads this change is responsible for.
 */
const stats = { hits: 0, misses: 0, shiftedHits: 0 };

export function getCacheStats(): {
  hits: number;
  misses: number;
  shiftedHits: number;
  hitRate: number;
} {
  const total = stats.hits + stats.misses;
  return { ...stats, hitRate: total === 0 ? 0 : stats.hits / total };
}

export function resetCacheStats(): void {
  stats.hits = 0;
  stats.misses = 0;
  stats.shiftedHits = 0;
}

type CacheRow = {
  id: string;
  place_id: string;
  variable: string;
  doy_center: number;
  doy_half_window: number;
  baseline_years: number;
  values: number[];
  cached_at: string;
};

/**
 * Get historical baseline values for a (place, variable, DOY window).
 * Reads from cache if fresh, otherwise fetches from Open-Meteo and writes back.
 */
export async function getHistoricalBaseline(
  supabase: SupabaseClient,
  params: {
    placeId: string;
    latitude: number;
    longitude: number;
    variable: DailyVariable;
    targetDate: Date;
    yearsBack: number;
    doyHalfWindow: number;
  }
): Promise<number[]> {
  const doyCenter = dayOfYearUTC(params.targetDate);

  // Try cache. At most 2 * DOY_TOLERANCE + 1 rows can match, so this reads a
  // handful of rows and picks in memory rather than asking Postgres to rank
  // by a circular distance it has no index for.
  const { data: candidates, error } = await supabase
    .from('historical_cache')
    .select('values, cached_at, doy_center')
    .eq('place_id', params.placeId)
    .eq('variable', params.variable)
    .in('doy_center', candidateDoys(doyCenter))
    .eq('doy_half_window', params.doyHalfWindow)
    .eq('baseline_years', params.yearsBack);

  if (!error && candidates?.length) {
    const now = Date.now();
    const fresh = candidates
      .filter((row) => now - new Date(row.cached_at).getTime() < CACHE_TTL_MS)
      .filter((row) => Array.isArray(row.values) && row.values.length > 0)
      // Nearest window centre wins; the freshest breaks a tie.
      .sort(
        (a, b) =>
          doyDistance(a.doy_center, doyCenter) - doyDistance(b.doy_center, doyCenter) ||
          new Date(b.cached_at).getTime() - new Date(a.cached_at).getTime()
      );

    const best = fresh[0];
    if (best) {
      stats.hits += 1;
      if (best.doy_center !== doyCenter) stats.shiftedHits += 1;
      return best.values as number[];
    }
  }

  stats.misses += 1;

  // Fetch fresh
  const values = await fetchHistoricalBaseline(
    params.latitude,
    params.longitude,
    params.variable,
    params.targetDate,
    params.yearsBack,
    params.doyHalfWindow
  );

  // Upsert cache
  await supabase
    .from('historical_cache')
    .upsert(
      {
        place_id: params.placeId,
        variable: params.variable,
        doy_center: doyCenter,
        doy_half_window: params.doyHalfWindow,
        baseline_years: params.yearsBack,
        values,
        cached_at: new Date().toISOString(),
      },
      { onConflict: 'place_id,variable,doy_center,doy_half_window,baseline_years' }
    );

  return values;
}

/**
 * Clear cache rows older than the TTL. Run periodically.
 */
export async function purgeStaleCache(supabase: SupabaseClient): Promise<number> {
  const cutoff = new Date(Date.now() - CACHE_TTL_MS * 2).toISOString();
  const { count } = await supabase
    .from('historical_cache')
    .delete({ count: 'exact' })
    .lt('cached_at', cutoff);
  return count ?? 0;
}
