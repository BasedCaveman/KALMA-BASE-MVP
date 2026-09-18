// kalma/frontend/lib/signal-engine/cache.ts
//
// Supabase-backed cache for Open-Meteo historical fetches.
// Historical data is stable for past dates so we cache aggressively.
// TTL is 7 days — long enough to dedupe calls within a sprint of cron
// runs, short enough that the latest year's data eventually flows in.
//
// The cache stores the pre-sorted-ascending values array so percentile
// lookups are O(log n) without re-sorting on every read.

import type { SupabaseClient } from '@supabase/supabase-js';
import { dayOfYearUTC } from './percentile';
import { fetchHistoricalBaseline, type DailyVariable } from './openMeteoFetcher';

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

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

  // Try cache
  const { data: cached, error } = await supabase
    .from('historical_cache')
    .select('values, cached_at')
    .eq('place_id', params.placeId)
    .eq('variable', params.variable)
    .eq('doy_center', doyCenter)
    .eq('doy_half_window', params.doyHalfWindow)
    .eq('baseline_years', params.yearsBack)
    .maybeSingle();

  if (!error && cached) {
    const ageMs = Date.now() - new Date(cached.cached_at).getTime();
    if (ageMs < CACHE_TTL_MS) {
      return cached.values as number[];
    }
  }

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
