// kalma/frontend/lib/signal-engine/seriesCache.ts
//
// Supabase-backed cache for the DATED Open-Meteo historical series, storing
// (anchor_years, dates, values) index-aligned arrays instead of one
// pre-sorted flat array. rainfall_risk_rising and water_recovery_signal use
// this directly — they need real N-day rolling sums via
// rollingNDaySumByYear(), which requires calendar date and the anchor-window
// label to be preserved. heat_stress_window and heavy_rain_event (its
// percentile mode) use this indirectly through cache.ts's
// getHistoricalBaseline(), a thin adapter that requests rollingWindowDays=1
// and flattens+sorts the result — see cache.ts's own doc for why that
// changed (review 2026-09-21, R1: the OLD historical_cache table stays
// exactly as main's still-deployed writer needs it, unmodified, forever;
// this table is where new code's caching actually lives now). dry_stretch,
// frost_risk, and cold_spell are fixed-threshold signal types and use
// neither this nor cache.ts — no percentile baseline to fetch.
//
// See supabase/migrations/20260921_historical_series_cache.sql,
// 20260921120000_historical_series_cache_fixes.sql,
// 20260921180000_historical_series_cache_coverage.sql, and
// 20260921220100_historical_series_cache_model_identity.sql for why this is
// a separate table rather than a column on historical_cache, for the
// lookback_days column this file writes and reads by, for the
// years_requested/years_with_usable_window columns, and for the model
// column.

import type { SupabaseClient } from '@supabase/supabase-js';
import { dayOfYearUTC, hasSufficientYearCoverage, rollingNDaySumByYear, type DatedValue } from './percentile';
import { fetchHistoricalSeries, ARCHIVE_MODEL, type DailyVariable } from './openMeteoFetcher';
import { candidateDoys, doyDistance } from './doyTolerance';

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days, same as historical_cache

const SOURCE = 'open-meteo';

export interface HistoricalSeriesWithCoverage {
  series: DatedValue[];
  yearsRequested: number;
}

/**
 * Hit/miss counters for this table, mirroring cache.ts's getCacheStats() —
 * kept separate so the cron can report each table's effectiveness on its
 * own instead of one number hiding two different access patterns.
 */
const stats = { hits: 0, misses: 0, shiftedHits: 0, upsertErrors: 0, uncacheablePartial: 0 };

export function getSeriesCacheStats(): {
  hits: number;
  misses: number;
  shiftedHits: number;
  upsertErrors: number;
  uncacheablePartial: number;
  hitRate: number;
} {
  const total = stats.hits + stats.misses;
  return { ...stats, hitRate: total === 0 ? 0 : stats.hits / total };
}

export function resetSeriesCacheStats(): void {
  stats.hits = 0;
  stats.misses = 0;
  stats.shiftedHits = 0;
  stats.upsertErrors = 0;
  stats.uncacheablePartial = 0;
}

/**
 * Get the dated historical series for a (place, variable, DOY window).
 * Reads from cache if fresh (tolerating a shifted DOY centre, same policy
 * as cache.ts), otherwise fetches from Open-Meteo and writes back.
 *
 * `rollingWindowDays` (N) must match what the caller will roll N-day sums
 * over — see fetchHistoricalSeries's doc for why this function derives
 * `lookbackDays` from it internally rather than taking lookback directly,
 * and is part of the cache key: a row fetched with less lookback doesn't
 * have enough history to produce the same rolling sums, so it must not be
 * reused as if it did.
 *
 * A fetched (not cached) series is only written to the cache if
 * hasSufficientYearCoverage() says the years that actually produced a
 * full N-day window (via rollingNDaySumByYear, NOT "any year that
 * returned any sample" — see its doc) clear the same threshold
 * evaluator.ts enforces before firing a signal. Otherwise a cache miss
 * next run is preferable to freezing a thin, partial result for the full
 * 7-day TTL as if it were reliable (review 2026-09-21, item 2).
 */
export async function getHistoricalSeries(
  supabase: SupabaseClient,
  params: {
    placeId: string;
    latitude: number;
    longitude: number;
    variable: DailyVariable;
    targetDate: Date;
    yearsBack: number;
    doyHalfWindow: number;
    rollingWindowDays?: number;
  }
): Promise<HistoricalSeriesWithCoverage> {
  const doyCenter = dayOfYearUTC(params.targetDate);
  const rollingWindowDays = params.rollingWindowDays ?? 1;
  const lookbackDays = rollingWindowDays - 1;

  const { data: candidates, error } = await supabase
    .from('historical_series_cache')
    .select('anchor_years, dates, values, years_requested, cached_at, doy_center')
    .eq('place_id', params.placeId)
    .eq('variable', params.variable)
    .eq('source', SOURCE)
    .eq('model', ARCHIVE_MODEL)
    .eq('lookback_days', lookbackDays)
    .in('doy_center', candidateDoys(doyCenter))
    .eq('doy_half_window', params.doyHalfWindow)
    .eq('baseline_years', params.yearsBack);

  if (!error && candidates?.length) {
    const now = Date.now();
    const fresh = candidates
      .filter((row) => now - new Date(row.cached_at).getTime() < CACHE_TTL_MS)
      .filter((row) => Array.isArray(row.values) && row.values.length > 0)
      .sort(
        (a, b) =>
          doyDistance(a.doy_center, doyCenter) - doyDistance(b.doy_center, doyCenter) ||
          new Date(b.cached_at).getTime() - new Date(a.cached_at).getTime()
      );

    const best = fresh[0];
    if (best) {
      stats.hits += 1;
      if (best.doy_center !== doyCenter) stats.shiftedHits += 1;
      return {
        series: zip(best.anchor_years as number[], best.dates as string[], best.values as number[]),
        yearsRequested: best.years_requested as number,
      };
    }
  }

  stats.misses += 1;

  // Fetch fresh
  const result = await fetchHistoricalSeries(
    params.latitude,
    params.longitude,
    params.variable,
    params.targetDate,
    params.yearsBack,
    params.doyHalfWindow,
    rollingWindowDays
  );

  if (result.series.length > 0) {
    const { yearsWithUsableWindow } = rollingNDaySumByYear(result.series, rollingWindowDays);
    if (!hasSufficientYearCoverage(result.yearsRequested, yearsWithUsableWindow)) {
      stats.uncacheablePartial += 1;
    } else {
      const { error: upsertError } = await supabase.from('historical_series_cache').upsert(
        {
          place_id: params.placeId,
          variable: params.variable,
          doy_center: doyCenter,
          doy_half_window: params.doyHalfWindow,
          baseline_years: params.yearsBack,
          source: SOURCE,
          model: ARCHIVE_MODEL,
          lookback_days: lookbackDays,
          anchor_years: result.series.map((s) => s.anchorYear),
          dates: result.series.map((s) => s.date),
          values: result.series.map((s) => s.value),
          years_requested: result.yearsRequested,
          years_with_usable_window: yearsWithUsableWindow,
          cached_at: new Date().toISOString(),
        },
        { onConflict: 'place_id,variable,doy_center,doy_half_window,baseline_years,source,lookback_days,model' }
      );
      if (upsertError) {
        stats.upsertErrors += 1;
        console.warn(`[historical_series_cache] upsert failed: ${upsertError.message}`);
      }
    }
  }

  return result;
}

function zip(anchorYears: number[], dates: string[], values: number[]): DatedValue[] {
  const out: DatedValue[] = [];
  for (let i = 0; i < values.length; i++) {
    out.push({ anchorYear: anchorYears[i], date: dates[i], value: values[i] });
  }
  return out;
}

/**
 * Clear cache rows older than the TTL. Run periodically, same policy as
 * cache.ts's purgeStaleCache.
 */
export async function purgeStaleSeriesCache(supabase: SupabaseClient): Promise<number> {
  const cutoff = new Date(Date.now() - CACHE_TTL_MS * 2).toISOString();
  const { count } = await supabase
    .from('historical_series_cache')
    .delete({ count: 'exact' })
    .lt('cached_at', cutoff);
  return count ?? 0;
}
