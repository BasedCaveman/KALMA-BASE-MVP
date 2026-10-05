// kalma/frontend/lib/signal-engine/cache.ts
//
// Thin adapter from "flat sorted-ascending baseline" (what heat_stress_window
// and heavy_rain_event's percentile mode want) onto seriesCache.ts's
// getHistoricalSeries() (what actually talks to Supabase and Open-Meteo
// now). dry_stretch_window, frost_risk, and consecutive_cold_below are
// fixed-threshold signal types (default_params.threshold_mode is null for
// all three) and never call this at all — no percentile baseline to
// fetch. This file used to own its own historical_cache table,
// DOY-tolerance matching, and model-identity versioning directly — all of
// that is now seriesCache.ts's job, on historical_series_cache, for every
// caller, not just the rolling-sum ones.
//
// WHY THIS CHANGED (review 2026-09-21, fifth+sixth rounds, R1): retrofitting
// historical_cache with a `model` column and a narrower unique constraint
// broke main's THEN-DEPLOYED cache.ts, which had no `model` awareness and
// upserted against the old constraint — every production upsert started
// failing with Postgres 42P10 the moment the migration landed, because
// ON CONFLICT needs an exact index match, not a superset. Rolling that
// migration back (20260921230000_historical_cache_model_identity_rollback.sql)
// fixed main, but left the two migrations netting to "no change" on
// historical_cache while this file's code still expected `model` to exist —
// a state that's only consistent if this file stops touching that table.
// So: historical_cache keeps its ORIGINAL shape permanently (main's writer
// never needs to change), and this file's actual storage moves to the
// already-separate, already-additive, already-model-aware
// historical_series_cache (zero production readers/writers of that table
// exist on main, so extending its use here carries none of the same risk).
// historical_cache itself is not deleted — main still writes it — but no
// code on this branch reads or writes it as a cache anymore; purgeStaleCache
// below is kept only because it's a generic, harmless maintenance utility
// for whatever main still puts there.

import type { SupabaseClient } from '@supabase/supabase-js';
import { getHistoricalSeries } from './seriesCache';
import { rollingNDaySumByYear } from './percentile';
import type { DailyVariable } from './openMeteoFetcher';

const HISTORICAL_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days, matches historical_cache's own policy

export interface HistoricalBaselineResult {
  /** Flat, sorted ascending — the shape percentileRank() etc. expect. */
  values: number[];
  /** How many anchor-year windows were requested (= yearsBack). */
  yearsRequested: number;
  /**
   * How many of those years actually produced a usable (here: any) day —
   * NOT the same as `values.length`, which counts samples, not years. See
   * this function's own doc for why both matter.
   */
  yearsWithUsableWindow: number;
}

/**
 * Get historical baseline values for a (place, variable, DOY window) as a
 * flat array sorted ascending — for callers that rank a single day against
 * the whole distribution (heat_stress_window, heavy_rain_event, dry_stretch,
 * frost_risk, cold_spell), not a rolling N-day sum. Delegates entirely to
 * getHistoricalSeries() with rollingWindowDays=1 (no extra lookback, one
 * value per DOY-window day per year — exactly this function's old shape),
 * so the same model identity and DOY tolerance apply here as they do for
 * the rolling-sum callers.
 *
 * Also returns yearsRequested/yearsWithUsableWindow (computed locally via
 * rollingNDaySumByYear(series, 1), the same pattern evalRainfallRisk()/
 * evalWaterRecovery() use on their own rolling windows) so callers can
 * apply requireSufficientYears() themselves. Until review 2026-09-21
 * (round 6/7), this function discarded that metadata when it flattened
 * the result — getHistoricalSeries()'s own yearsWithUsableWindow only
 * gates whether a fetched series gets CACHED, never what's returned to
 * the caller, so heat_stress_window/heavy_rain_event's `values.length <
 * 30` checks were a raw sample-count floor only, not a years-actually-
 * usable floor: the same class of bug fixed for the rolling-sum signal
 * types in earlier rounds (a handful of real years padding out to 30+
 * samples via multi-day DOY windows without broad year coverage). Fixed
 * by returning the metadata instead of discarding it; see evaluator.ts's
 * evalHeatStress()/evalHeavyRain() for where it's now enforced.
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
): Promise<HistoricalBaselineResult> {
  const { series, yearsRequested } = await getHistoricalSeries(supabase, { ...params, rollingWindowDays: 1 });
  const { yearsWithUsableWindow } = rollingNDaySumByYear(series, 1);
  const values = series.map((s) => s.value).sort((a, b) => a - b);
  return { values, yearsRequested, yearsWithUsableWindow };
}

/**
 * Clear historical_cache rows older than the TTL. Run periodically.
 * Operates only on historical_cache (main's own table, untouched shape) —
 * unrelated to historical_series_cache's own purgeStaleSeriesCache in
 * seriesCache.ts.
 */
export async function purgeStaleCache(supabase: SupabaseClient): Promise<number> {
  const cutoff = new Date(Date.now() - HISTORICAL_CACHE_TTL_MS * 2).toISOString();
  const { count } = await supabase
    .from('historical_cache')
    .delete({ count: 'exact' })
    .lt('cached_at', cutoff);
  return count ?? 0;
}
