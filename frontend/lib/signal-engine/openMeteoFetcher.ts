// kalma/frontend/lib/signal-engine/openMeteoFetcher.ts
//
// Fetches forecast and historical data from Open-Meteo.
// - Forecast: live data, no cache (changes too often)
// - Historical: cached per (place, variable, DOY window) for 7 days
//
// Open-Meteo non-commercial API requires no key but rate-limits to
// roughly 10k requests/day. Aggressive caching is essential.

import { buildBaselineWindow, dayOfYearUTC, parseDailySeries, type DatedValue } from './percentile';

const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const ARCHIVE_URL = 'https://archive-api.open-meteo.com/v1/archive';

// Variables we care about — daily granularity for percentile work
export type DailyVariable =
  | 'precipitation_sum'
  | 'temperature_2m_max'
  | 'temperature_2m_min'
  | 'relative_humidity_2m_mean'
  | 'snowfall_sum';

type ForecastPayload = {
  daily: {
    time: string[];
    [key: string]: any;
  };
};

type ArchivePayload = {
  daily: {
    time: string[];
    [key: string]: any;
  };
};

/**
 * Fetch forecast data for the next N days for a single place.
 * Returns daily values keyed by ISO date.
 */
export async function fetchForecastDaily(
  latitude: number,
  longitude: number,
  variables: DailyVariable[],
  forecastDays: number = 7
): Promise<{ dates: string[]; values: Record<DailyVariable, number[]> }> {
  const params = new URLSearchParams({
    latitude: latitude.toString(),
    longitude: longitude.toString(),
    daily: variables.join(','),
    forecast_days: forecastDays.toString(),
    timezone: 'UTC',
  });

  const res = await fetch(`${FORECAST_URL}?${params}`, {
    headers: { 'User-Agent': 'kalma-signal-engine/0.1' },
  });
  if (!res.ok) {
    throw new Error(`Open-Meteo forecast ${res.status}: ${await res.text()}`);
  }
  const data: ForecastPayload = await res.json();

  const out: Record<string, number[]> = {};
  for (const v of variables) {
    out[v] = data.daily[v] ?? [];
  }
  return {
    dates: data.daily.time,
    values: out as Record<DailyVariable, number[]>,
  };
}

// A flat, sorted-ascending, single-day-per-year baseline (what
// heat_stress_window, heavy_rain_event, dry_stretch, frost_risk, and
// cold_spell actually rank against) used to have its own fetchHistoricalBaseline()
// here, called only from cache.ts. cache.ts is now a thin adapter onto
// fetchHistoricalSeries() (via seriesCache.ts's getHistoricalSeries(),
// rollingWindowDays=1) instead — see cache.ts's doc for why (review
// 2026-09-21, R1) — so that flatten-and-sort now happens there, and this
// function was deleted as unused rather than kept as a second, divergent
// path to the same data.

export interface HistoricalSeriesResult {
  series: DatedValue[];
  /** How many anchor-year windows were requested (= yearsBack). */
  yearsRequested: number;
}

/**
 * Fetch historical daily values for the DOY window across N past years,
 * preserving calendar date and the anchor-window label. Use this (with
 * rollingNDaySumByYear) for any baseline that needs N-day accumulation,
 * not a single-day rank.
 *
 * Order is NOT sorted by value — it is year-window fetch order, i.e.
 * chronological within each year's window. Group by `anchorYear` (see
 * DatedValue's doc) before doing any windowed arithmetic; never assume two
 * adjacent entries are calendar-adjacent days without checking, because a
 * year boundary can sit between the last day of one window and the first
 * day of the next.
 *
 * This does NOT report "years with usable data" — whether a year actually
 * contributed a full N-day window depends on `rollingNDaySumByYear`'s own
 * gap/consecutiveness check, which this function has no visibility into.
 * An earlier version counted a year as "has data" if it returned even one
 * raw sample, which let 2 genuinely complete years plus 3 single-day years
 * read as "5 good years" while the percentile only ever drew from 2 —
 * found in review 2026-09-21. Callers needing that number must compute it
 * themselves from the returned series via rollingNDaySumByYear (see
 * evaluator.ts, seriesCache.ts).
 *
 * `rollingWindowDays` (N) extends each year's fetch window backward by
 * N-1 days — it does not change which end-dates are considered "in" the
 * DOY window, only how much history is fetched before them — so a caller
 * building N-day rolling sums can produce a full sum ending at every one
 * of the `2*doyHalfWindow+1` candidate end-dates per year. Without this,
 * water_recovery_signal's production config (baseline_years=10,
 * doy_half_window=7, N=14) fetches only 15 days per year — enough for two
 * 14-day sums per year, 20 total, under the 30-sample floor evaluator.ts
 * requires. Defaults to 1 (no extra lookback), matching the single-day
 * ranking callers (heat_stress_window, heavy_rain_event via
 * fetchHistoricalBaseline).
 */
export async function fetchHistoricalSeries(
  latitude: number,
  longitude: number,
  variable: DailyVariable,
  targetDate: Date,
  yearsBack: number = 10,
  doyHalfWindow: number = 7,
  rollingWindowDays: number = 1
): Promise<HistoricalSeriesResult> {
  const lookbackDays = rollingWindowDays - 1;
  const windows = buildBaselineWindow(targetDate, yearsBack, doyHalfWindow);

  // Open-Meteo throttles concurrent connections aggressively on the free
  // tier — 10 parallel year-window requests reliably trips 429. Process
  // sequentially with a small jitter to stay polite.
  const results: DatedValue[][] = [];
  for (const w of windows) {
    const fetchStart = lookbackDays > 0 ? addDays(w.startDate, -lookbackDays) : w.startDate;
    try {
      const r = await fetchArchiveRangeDated(latitude, longitude, variable, fetchStart, w.endDate, w.year);
      results.push(r);
    } catch (e) {
      // One year-window failing should not kill the whole baseline —
      // 9 good years still produces a usable percentile estimate.
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(`[open-meteo] year-window archive failed: ${msg}`);
      results.push([]);
    }
    // 80ms gap — empirically enough to avoid 429s without slowing the
    // whole pass to a crawl. 10 years × 80ms = 0.8s added per place×type.
    await new Promise((r) => setTimeout(r, 80));
  }

  return { series: results.flat(), yearsRequested: windows.length };
}

function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 24 * 60 * 60 * 1000);
}

/**
 * Explicitly the ERA5 reanalysis, not Open-Meteo's default "Best Match"
 * (which blends ECMWF IFS for the most recent 1-10 days with ERA5/
 * ERA5-Land further back — verified live 2026-09-21: the same request
 * without `models` returns real values through today; with
 * `models=era5` the last ~5-6 days come back null, matching ERA5's
 * documented "5 days delay"). Requested explicitly, on every archive
 * call including the historical baseline years, so the baseline and the
 * "recent" window (evaluator.ts's ARCHIVE_DATA_LAG_DAYS) are the same
 * kind of data throughout — a settled reanalysis with a known, constant
 * lag — instead of silently mixing in near-real-time model output for
 * whichever days happen to be recent, which has different statistical
 * character and can still be revised once ERA5 catches up to replace it.
 * See review 2026-09-21 (third round), item 3, and
 * https://open-meteo.com/en/docs/historical-weather-api.
 *
 * Exported so the cache layers (cache.ts, seriesCache.ts) key and filter
 * their reads/writes by this SAME model identity — see cache.ts's doc for
 * why a cache that doesn't know which model wrote a row can silently
 * serve Best Match data as if it were ERA5 (review 2026-09-21, fifth
 * round).
 */
export const ARCHIVE_MODEL = 'era5';

async function fetchArchiveRangeDated(
  latitude: number,
  longitude: number,
  variable: DailyVariable,
  startDate: Date,
  endDate: Date,
  anchorYear: number
): Promise<DatedValue[]> {
  const params = new URLSearchParams({
    latitude: latitude.toString(),
    longitude: longitude.toString(),
    start_date: toISODate(startDate),
    end_date: toISODate(endDate),
    daily: variable,
    timezone: 'UTC',
    models: ARCHIVE_MODEL,
  });

  const res = await fetch(`${ARCHIVE_URL}?${params}`, {
    headers: { 'User-Agent': 'kalma-signal-engine/0.1' },
  });
  if (!res.ok) {
    throw new Error(`Open-Meteo archive ${res.status}: ${await res.text()}`);
  }
  const data: ArchivePayload = await res.json();
  return parseDailySeries(anchorYear, data.daily.time ?? [], data.daily[variable] ?? []);
}

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function avgNext(values: number[], n: number): number {
  let sum = 0;
  let count = 0;
  for (let i = 0; i < Math.min(n, values.length); i++) {
    if (values[i] !== null && values[i] !== undefined && Number.isFinite(values[i])) {
      sum += values[i];
      count++;
    }
  }
  return count === 0 ? 0 : sum / count;
}

export function maxNext(values: number[], n: number): number {
  let max = -Infinity;
  for (let i = 0; i < Math.min(n, values.length); i++) {
    if (values[i] > max) max = values[i];
  }
  return max === -Infinity ? 0 : max;
}

// rollingNDaySumByYear() lives in ./percentile, not here — it's a pure
// function (no I/O) and percentile.ts is this codebase's home for that,
// kept deliberately import-free so scripts can test it directly.
