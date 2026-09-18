// kalma/frontend/lib/signal-engine/openMeteoFetcher.ts
//
// Fetches forecast and historical data from Open-Meteo.
// - Forecast: live data, no cache (changes too often)
// - Historical: cached per (place, variable, DOY window) for 7 days
//
// Open-Meteo non-commercial API requires no key but rate-limits to
// roughly 10k requests/day. Aggressive caching is essential.

import { buildBaselineWindow, dayOfYearUTC } from './percentile';

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

/**
 * Fetch historical daily values for the DOY window across N past years.
 * Returns a flat sorted-ascending array suitable for percentile calc.
 *
 * Example: targetDate=2026-03-05, yearsBack=10, doyHalfWindow=7
 * → fetches DOY 57..71 for years 2016..2025
 * → ~150 samples per variable
 */
export async function fetchHistoricalBaseline(
  latitude: number,
  longitude: number,
  variable: DailyVariable,
  targetDate: Date,
  yearsBack: number = 10,
  doyHalfWindow: number = 7
): Promise<number[]> {
  const windows = buildBaselineWindow(targetDate, yearsBack, doyHalfWindow);

  // Open-Meteo throttles concurrent connections aggressively on the free
  // tier — 10 parallel year-window requests reliably trips 429. Process
  // sequentially with a small jitter to stay polite.
  const results: number[][] = [];
  for (const w of windows) {
    try {
      const r = await fetchArchiveRange(latitude, longitude, variable, w.startDate, w.endDate);
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

  // Flatten, drop nulls, sort ascending
  const all: number[] = [];
  for (const r of results) {
    for (const v of r) {
      if (v !== null && v !== undefined && Number.isFinite(v)) {
        all.push(v);
      }
    }
  }
  all.sort((a, b) => a - b);
  return all;
}

async function fetchArchiveRange(
  latitude: number,
  longitude: number,
  variable: DailyVariable,
  startDate: Date,
  endDate: Date
): Promise<number[]> {
  const params = new URLSearchParams({
    latitude: latitude.toString(),
    longitude: longitude.toString(),
    start_date: toISODate(startDate),
    end_date: toISODate(endDate),
    daily: variable,
    timezone: 'UTC',
  });

  const res = await fetch(`${ARCHIVE_URL}?${params}`, {
    headers: { 'User-Agent': 'kalma-signal-engine/0.1' },
  });
  if (!res.ok) {
    throw new Error(`Open-Meteo archive ${res.status}: ${await res.text()}`);
  }
  const data: ArchivePayload = await res.json();
  return data.daily[variable] ?? [];
}

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Sum of the next N forecast days from a daily array.
 * Used for "next 48h precip", "next 7d max temp avg", etc.
 */
export function sumNext(values: number[], n: number): number {
  let sum = 0;
  for (let i = 0; i < Math.min(n, values.length); i++) {
    sum += values[i] ?? 0;
  }
  return sum;
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

/**
 * Aggregate a historical baseline into N-day rolling sums to compare
 * against a forecast N-day sum. For example, comparing "next 48h
 * precip" needs the historical baseline to also be in 48h windows.
 *
 * Takes a flat array of daily values and returns an array of N-day sums.
 * Approximate — assumes the input is already DOY-windowed, so this
 * just transforms the distribution shape.
 */
export function rollingNDaySum(values: number[], n: number): number[] {
  if (values.length < n) return values;
  const out: number[] = [];
  let sum = 0;
  for (let i = 0; i < n; i++) sum += values[i];
  out.push(sum);
  for (let i = n; i < values.length; i++) {
    sum += values[i] - values[i - n];
    out.push(sum);
  }
  out.sort((a, b) => a - b);
  return out;
}
