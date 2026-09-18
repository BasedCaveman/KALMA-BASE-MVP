//Kalma/frontend/hooks/useHistoricalWeather.ts
'use client';

import { useEffect, useMemo, useState } from 'react';

export type WeatherConfidence = 'High' | 'Medium' | 'Low';
export type MarketMetric =
  | 'rain'
  | 'temp_high'
  | 'temp_low'
  | 'snow'
  | 'cold_spell'
  | 'dry_stretch'
  | 'frost_risk'
  | 'heavy_rain';

export type HistoricalWeatherContext = {
  avg: number;
  min: number;
  max: number;
  stdDev: number;
  confidence: WeatherConfidence;
  confidenceScore: number;
  label: string;
  unit: string;
  source: string;
  basis: string;
  durationDays: number;
  yearsUsed: number;
  metric:
    | 'rain_accumulation'
    | 'daily_high_average'
    | 'daily_low_average'
    | 'snow_accumulation'
    | 'dry_stretch_run'
    | 'heavy_rain_day';
};

// marketTypeId → MarketMetric
export function marketTypeToMetric(marketTypeId: number): MarketMetric {
  if (marketTypeId === 1) return 'rain';
  if (marketTypeId === 2) return 'temp_high';
  if (marketTypeId === 3) return 'temp_low';
  if (marketTypeId === 4) return 'snow';
  if (marketTypeId === 5) return 'cold_spell';
  if (marketTypeId === 6) return 'dry_stretch';
  if (marketTypeId === 7) return 'frost_risk';
  if (marketTypeId === 8) return 'heavy_rain';
  return 'temp_high'; // safe default
}

type Params = {
  lat: number;
  lon: number;
  marketTypeId: number;
  thresholdValue?: number;
  startTime: number;
  endTime: number;
};

type HookResult = {
  data: HistoricalWeatherContext | null;
  isLoading: boolean;
  error: string | null;
};

// Open-Meteo field + aggregation per market type
const METRIC_CONFIG: Record<MarketMetric, { field: string; aggregate: 'sum' | 'avg' | 'max' | 'dryRun' }> = {
  rain:        { field: 'precipitation_sum',   aggregate: 'sum' },
  temp_high:   { field: 'temperature_2m_max',  aggregate: 'avg' },
  temp_low:    { field: 'temperature_2m_min',  aggregate: 'avg' },
  snow:        { field: 'snowfall_sum',        aggregate: 'sum' },
  cold_spell:  { field: 'temperature_2m_min',  aggregate: 'avg' },
  dry_stretch: { field: 'precipitation_sum',   aggregate: 'dryRun' },
  frost_risk:  { field: 'temperature_2m_min',  aggregate: 'avg' },
  heavy_rain:  { field: 'precipitation_sum',   aggregate: 'max' },
};

const UNIT_MAP: Record<MarketMetric, string> = {
  rain:        'mm',
  temp_high:   '°C',
  temp_low:    '°C',
  snow:        'cm',
  cold_spell:  '°C',
  dry_stretch: 'days',
  frost_risk:  '°C',
  heavy_rain:  'mm',
};

const METRIC_LABEL_MAP: Record<MarketMetric, HistoricalWeatherContext['metric']> = {
  rain:        'rain_accumulation',
  temp_high:   'daily_high_average',
  temp_low:    'daily_low_average',
  snow:        'snow_accumulation',
  cold_spell:  'daily_low_average',
  dry_stretch: 'dry_stretch_run',
  frost_risk:  'daily_low_average',
  heavy_rain:  'heavy_rain_day',
};

function round1(value: number) {
  return Math.round(value * 10) / 10;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function getConfidence(ratio: number): {
  confidence: WeatherConfidence;
  confidenceScore: number;
  label: string;
} {
  if (ratio < 0.18) return { confidence: 'High',   confidenceScore: 86, label: 'Calm pattern' };
  if (ratio < 0.38) return { confidence: 'Medium', confidenceScore: 62, label: 'Mixed pattern' };
  return                    { confidence: 'Low',    confidenceScore: 36, label: 'Volatile pattern' };
}

function getWindowLengthDays(startTime: number, endTime: number) {
  const seconds = Math.max(86400, endTime - startTime);
  return Math.max(1, Math.round(seconds / 86400));
}

function longestDryRun(values: number[], thresholdMm: number) {
  let best = 0;
  let current = 0;
  for (const value of values) {
    if (Number.isFinite(value) && value <= thresholdMm) {
      current += 1;
      best = Math.max(best, current);
    } else {
      current = 0;
    }
  }
  return best;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function formatDateLocal(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function useHistoricalWeather({
  lat,
  lon,
  marketTypeId,
  thresholdValue,
  startTime,
  endTime,
}: Params): HookResult {
  const [data, setData] = useState<HistoricalWeatherContext | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const marketMetric = useMemo(() => marketTypeToMetric(marketTypeId), [marketTypeId]);

  const durationDays = useMemo(
    () => getWindowLengthDays(startTime, endTime),
    [startTime, endTime]
  );

  const anchorDate = useMemo(() => {
    const d = new Date(startTime * 1000);
    return { month: d.getMonth(), day: d.getDate() };
  }, [startTime]);

  // v3 cache key — includes marketTypeId so old v2 entries are ignored
  const cacheKey = useMemo(() => {
    const dryThreshold =
      marketMetric === 'dry_stretch'
        ? `t${Number.isFinite(thresholdValue) ? thresholdValue : 1}`
        : 't0';
    return [
      'kalma-history-v5',
      lat.toFixed(4),
      lon.toFixed(4),
      marketMetric,
      `m${anchorDate.month + 1}`,
      `d${anchorDate.day}`,
      `w${durationDays}`,
      dryThreshold,
    ].join(':');
  }, [lat, lon, marketMetric, anchorDate.month, anchorDate.day, durationDays, thresholdValue]);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!lat || !lon || !startTime || !endTime) {
        setIsLoading(false);
        setError('Missing market timing or location.');
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
          const parsed = JSON.parse(cached) as HistoricalWeatherContext;
          if (!cancelled) {
            setData(parsed);
            setIsLoading(false);
          }
          return;
        }

        const now = new Date();
        const endYear = now.getFullYear() - 1;
        const startYear = endYear - 9;

        const config = METRIC_CONFIG[marketMetric];

        // Fetch all years in parallel and tolerate individual failures —
        // a sequential fail-fast loop meant one flaky year (or one slow
        // round trip on a rural connection) dropped the whole context.
        const years: number[] = [];
        for (let year = startYear; year <= endYear; year++) years.push(year);

        const settled = await Promise.allSettled(
          years.map(async (year) => {
            const startDate = new Date(year, anchorDate.month, anchorDate.day);
            const endDate = addDays(startDate, durationDays - 1);

            const url =
              `https://archive-api.open-meteo.com/v1/archive` +
              `?latitude=${lat}` +
              `&longitude=${lon}` +
              `&start_date=${formatDateLocal(startDate)}` +
              `&end_date=${formatDateLocal(endDate)}` +
              `&daily=${config.field}` +
              `&timezone=auto`;

            const res = await fetch(url);
            if (!res.ok) throw new Error(`Open-Meteo failed for ${year}`);

            const json = await res.json();
            const series = Array.isArray(json?.daily?.[config.field])
              ? json.daily[config.field]
                  .map((v: unknown) => Number(v))
                  .filter((v: number) => Number.isFinite(v))
              : [];

            if (!series.length) return null;

            let yearValue: number;
            if (config.aggregate === 'sum') {
              yearValue = series.reduce((sum: number, v: number) => sum + v, 0);
            } else if (config.aggregate === 'max') {
              yearValue = Math.max(...series);
            } else if (config.aggregate === 'dryRun') {
              const dryThresholdMm = Number.isFinite(thresholdValue) ? Number(thresholdValue) : 1;
              yearValue = longestDryRun(series, dryThresholdMm);
            } else {
              yearValue = series.reduce((sum: number, v: number) => sum + v, 0) / series.length;
            }

            return yearValue;
          }),
        );

        const yearlyValues = settled
          .filter(
            (r): r is PromiseFulfilledResult<number | null> => r.status === 'fulfilled',
          )
          .map((r) => r.value)
          .filter((v): v is number => v != null);

        // Below half the archive the averages stop being honest — treat
        // that as unavailable rather than showing shaky statistics.
        if (yearlyValues.length < 5) throw new Error('No historical weather windows found.');

        const avg = yearlyValues.reduce((s, v) => s + v, 0) / yearlyValues.length;
        const variance = yearlyValues.reduce((s, v) => s + (v - avg) ** 2, 0) / yearlyValues.length;
        const stdDev = Math.sqrt(variance);
        const min = Math.min(...yearlyValues);
        const max = Math.max(...yearlyValues);

        const ratio = avg === 0 ? stdDev : stdDev / Math.abs(avg);
        const confidenceMeta = getConfidence(ratio);

        const next: HistoricalWeatherContext = {
          avg: round1(avg),
          min: round1(min),
          max: round1(max),
          stdDev: round1(stdDev),
          confidence: confidenceMeta.confidence,
          confidenceScore: clamp(confidenceMeta.confidenceScore, 0, 100),
          label: confidenceMeta.label,
          unit: UNIT_MAP[marketMetric],
          source: 'Open-Meteo',
          basis: `${yearlyValues.length}-year historical ${durationDays}-day window`,
          durationDays,
          yearsUsed: yearlyValues.length,
          metric: METRIC_LABEL_MAP[marketMetric],
        };

        localStorage.setItem(cacheKey, JSON.stringify(next));
        if (!cancelled) setData(next);
      } catch (err) {
        console.error(err);
        if (!cancelled) setError('Could not load weather context.');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    run();
    return () => { cancelled = true; };
  }, [cacheKey, lat, lon, marketMetric, anchorDate.month, anchorDate.day, durationDays, thresholdValue, startTime, endTime]);

  return { data, isLoading, error };
}
