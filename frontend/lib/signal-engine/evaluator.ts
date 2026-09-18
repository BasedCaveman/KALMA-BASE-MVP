// kalma/frontend/lib/signal-engine/evaluator.ts
//
// Given a place + a signal type definition, fetch the relevant data,
// evaluate the trigger logic, and produce a candidate signal record
// (or null if the trigger isn't met).
//
// The evaluator is a pure data → data function (modulo the cache reads
// inside fetchers). The cron loop calls it once per (place × signal type)
// per evaluation cycle.
//
// IMPORTANT: this layer does not write to the database. It returns a
// structured record. The orchestrator (signal-engine.mjs) handles
// upserts, supersedes, and dedupe-key logic.

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  fetchForecastDaily,
  sumNext,
  avgNext,
  rollingNDaySum,
  type DailyVariable,
} from './openMeteoFetcher';
import { getHistoricalBaseline } from './cache';
import {
  percentileRank,
  anomalyScore,
  severityFromPercentile,
  computeConfidence,
  type Severity,
} from './percentile';

// ─────────────────────────────────────────────────────────────────────────────
// Absolute-value floors for percentile-based rainfall signals.
//
// Why: percentile rank becomes pathological when the baseline distribution
// is bunched at zero. A hyper-arid place like Lima has 14-day rainfall
// totals near 0mm for most days of the year. Any positive recent value
// (say 0.9mm) lands above 90% of the baseline samples → "STRONG" severity
// — even though 0.9mm of rain is meaningless rainfall anywhere on Earth.
//
// These floors gate the *absolute amount* before we even look at the
// percentile, so a signal can't fire on a statistically-rare-but-tiny event.
// Numbers are conservative — they err toward not firing rather than firing
// loud signals about trivial rain.
// ─────────────────────────────────────────────────────────────────────────────

/** Minimum 48-hour forecast precipitation to even consider a "rising risk".
 *  5mm in two days = ~2.5mm/day average — still a modest amount, but enough
 *  to be a real observation in any climate. Below this, the signal would be
 *  noise. */
const MIN_FORECAST_48H_MM = 5;

/** Minimum 14-day recent total for "water recovery" to be a meaningful claim.
 *  10mm spread over two weeks is below subsistence-agriculture water needs
 *  but is enough rain to actually show up in soil moisture and runoff. */
const MIN_RECENT_14D_MM = 10;

/** Minimum single-day rainfall to qualify as a "heavy rain event" in
 *  percentile mode. Anything less is just a rainy day, not a heavy event,
 *  regardless of how rare it is locally. */
const MIN_HEAVY_RAIN_SINGLE_DAY_MM = 5;

export type Place = {
  id: string;
  slug: string;
  name: string;
  latitude: number;
  longitude: number;
  country_code: string | null;
  region_code: string | null;
};

export type SignalTypeDef = {
  id: string;
  slug: string;
  category: string;
  title_template_key: string;
  body_template_key: string;
  trigger_logic: TriggerLogic;
  affected_groups: string[];
  supported_regions: string[];
  active: boolean;
};

export type TriggerLogic = {
  source: 'open-meteo';
  metric: string;
  compound_with?: string;
  method:
    | 'doy_window_percentile'
    | 'consecutive_days_below_threshold'
    | 'any_day_below_threshold'
    | 'any_day_above_threshold';
  baseline_years: number;
  doy_half_window: number;
  /**
   * For percentile signals: severity → percentile (e.g. {low: 75, high: 95}).
   * For run-length signals: severity → minimum consecutive-day count
   *   (e.g. {low: 3, medium: 5, high: 7, extreme: 10}).
   * For "any_day_*" signals: typically {active: 1}.
   */
  thresholds: Record<string, number>;
  /**
   * Type-specific defaults read by event-based evaluators.
   * - consecutive_cold_below: { min_consecutive_days, threshold_celsius }
   * - dry_stretch_window:     { min_consecutive_days, threshold_mm, crop_context? }
   * - frost_risk:             { threshold_celsius }
   * - heavy_rain_event:       { threshold_mode: 'percentile' | 'fixed',
   *                             percentile?, historicalAvg_encoded?, threshold_mm? }
   */
  default_params?: Record<string, any>;
  /** Frost-risk fixed threshold (Celsius). Not user-configurable on chain. */
  fixed_threshold_celsius?: number;
  fixed_historicalAvg?: number;
  /** Notes / comments from the registry — purely descriptive. */
  threshold_encoding?: string;
  threshold_field?: string;
  note?: string;
};

export type CandidateSignal = {
  place_id: string;
  signal_type_id: string;
  severity: Severity | 'active' | 'strong';
  confidence: number;
  anomaly_score: number;
  affected_groups: string[];
  source_stack: string[];
  structured_data: Record<string, any>;
  dedupe_key: string;
  valid_from: string; // ISO timestamp
  valid_until: string;
};

/**
 * Evaluate one signal type for one place. Returns null if the trigger
 * doesn't fire. Returns a candidate signal record if it does.
 */
export async function evaluateSignal(
  supabase: SupabaseClient,
  place: Place,
  signalType: SignalTypeDef,
  now: Date = new Date()
): Promise<CandidateSignal | null> {
  // Region gate — if the registry says this signal is regional, skip mismatched places
  if (
    signalType.supported_regions.length > 0 &&
    !signalType.supported_regions.includes('global') &&
    place.country_code &&
    !signalType.supported_regions.includes(place.country_code)
  ) {
    return null;
  }

  switch (signalType.id) {
    case 'rainfall_risk_rising':
      return evalRainfallRisk(supabase, place, signalType, now);
    case 'heat_stress_window':
      return evalHeatStress(supabase, place, signalType, now);
    case 'water_recovery_signal':
      return evalWaterRecovery(supabase, place, signalType, now);
    case 'consecutive_cold_below':
      return evalConsecutiveCold(place, signalType, now);
    case 'dry_stretch_window':
      return evalDryStretch(place, signalType, now);
    case 'frost_risk':
      return evalFrostRisk(place, signalType, now);
    case 'heavy_rain_event':
      return evalHeavyRain(supabase, place, signalType, now);
    default:
      return null;
  }
}

// ============================================================
// rainfall_risk_rising
// "Next 48h rain forecast vs DOY-window historical 48h sums"
// ============================================================

async function evalRainfallRisk(
  supabase: SupabaseClient,
  place: Place,
  signalType: SignalTypeDef,
  now: Date
): Promise<CandidateSignal | null> {
  // 1. Forecast: next 48h precipitation total
  const forecast = await fetchForecastDaily(
    place.latitude,
    place.longitude,
    ['precipitation_sum'],
    7
  );
  const forecast48h = sumNext(forecast.values.precipitation_sum, 2);

  // 2. Historical baseline: daily precipitation across DOY window
  const dailyBaseline = await getHistoricalBaseline(supabase, {
    placeId: place.id,
    latitude: place.latitude,
    longitude: place.longitude,
    variable: 'precipitation_sum',
    targetDate: now,
    yearsBack: signalType.trigger_logic.baseline_years,
    doyHalfWindow: signalType.trigger_logic.doy_half_window,
  });

  // 3. Build 48h rolling sums for fair comparison
  const baseline48h = rollingNDaySum(dailyBaseline, 2);

  if (baseline48h.length < 30) return null;

  // Absolute-value floor — guards against the percentile-rank-of-near-zero
  // pitfall in arid climates. See evaluator.ts header comment for context.
  if (forecast48h < MIN_FORECAST_48H_MM) return null;

  // 4. Percentile rank + severity
  const pct = percentileRank(forecast48h, baseline48h);
  const severity = severityFromPercentile(pct, signalType.trigger_logic.thresholds);
  if (!severity) return null;

  // 5. Confidence
  const confidence = computeConfidence(baseline48h, forecast48h);
  const anomaly = anomalyScore(forecast48h, baseline48h);

  // 6. Validity window
  const validFrom = new Date(now);
  const validUntil = new Date(now.getTime() + 48 * 60 * 60 * 1000);

  // Dedupe by (place + type + day-of-year bucket)
  const dayBucket = forecast.dates[0]; // today's ISO date
  const dedupeKey = `${place.id}:${signalType.id}:${dayBucket}`;

  return {
    place_id: place.id,
    signal_type_id: signalType.id,
    severity,
    confidence,
    anomaly_score: anomaly,
    affected_groups: signalType.affected_groups,
    source_stack: ['open-meteo'],
    structured_data: {
      forecast_48h_mm: round(forecast48h, 1),
      baseline_median_mm: round(median(baseline48h), 1),
      baseline_p90_mm: round(quantile(baseline48h, 0.9), 1),
      percentile: round(pct, 0),
      sample_size: baseline48h.length,
      window: { years: signalType.trigger_logic.baseline_years, doy_half: signalType.trigger_logic.doy_half_window },
    },
    dedupe_key: dedupeKey,
    valid_from: validFrom.toISOString(),
    valid_until: validUntil.toISOString(),
  };
}

// ============================================================
// heat_stress_window
// "7-day max temp avg vs historical, compounded with humidity check"
// ============================================================

async function evalHeatStress(
  supabase: SupabaseClient,
  place: Place,
  signalType: SignalTypeDef,
  now: Date
): Promise<CandidateSignal | null> {
  const forecast = await fetchForecastDaily(
    place.latitude,
    place.longitude,
    ['temperature_2m_max', 'relative_humidity_2m_mean'],
    7
  );
  const forecast7dMaxAvg = avgNext(forecast.values.temperature_2m_max, 7);
  const forecast7dHumidityAvg = avgNext(forecast.values.relative_humidity_2m_mean, 7);

  // Temperature baseline (DOY-windowed daily max temps)
  const tempBaseline = await getHistoricalBaseline(supabase, {
    placeId: place.id,
    latitude: place.latitude,
    longitude: place.longitude,
    variable: 'temperature_2m_max',
    targetDate: now,
    yearsBack: signalType.trigger_logic.baseline_years,
    doyHalfWindow: signalType.trigger_logic.doy_half_window,
  });

  if (tempBaseline.length < 30) return null;

  const tempPct = percentileRank(forecast7dMaxAvg, tempBaseline);
  const tempSeverity = severityFromPercentile(tempPct, signalType.trigger_logic.thresholds);
  if (!tempSeverity) return null;

  // Compounding factor: humidity above local median amplifies the signal.
  // Below median humidity, we downgrade by one tier (or kill it if already low).
  const humidityBaseline = await getHistoricalBaseline(supabase, {
    placeId: place.id,
    latitude: place.latitude,
    longitude: place.longitude,
    variable: 'relative_humidity_2m_mean',
    targetDate: now,
    yearsBack: signalType.trigger_logic.baseline_years,
    doyHalfWindow: signalType.trigger_logic.doy_half_window,
  });
  const humidityMedian = humidityBaseline.length > 0 ? median(humidityBaseline) : 50;
  const humidityHighEnough = forecast7dHumidityAvg >= humidityMedian;

  let finalSeverity: Severity = tempSeverity as Severity;
  if (!humidityHighEnough) {
    const downgraded = downgradeSeverity(finalSeverity);
    if (!downgraded) return null;
    finalSeverity = downgraded;
  }

  const confidence = computeConfidence(tempBaseline, forecast7dMaxAvg);
  const anomaly = anomalyScore(forecast7dMaxAvg, tempBaseline);

  const validFrom = new Date(now);
  const validUntil = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const dayBucket = forecast.dates[0];
  const dedupeKey = `${place.id}:${signalType.id}:${dayBucket}`;

  return {
    place_id: place.id,
    signal_type_id: signalType.id,
    severity: finalSeverity,
    confidence,
    anomaly_score: anomaly,
    affected_groups: signalType.affected_groups,
    source_stack: ['open-meteo'],
    structured_data: {
      forecast_7d_max_avg_c: round(forecast7dMaxAvg, 1),
      forecast_7d_humidity_avg: round(forecast7dHumidityAvg, 0),
      baseline_median_c: round(median(tempBaseline), 1),
      baseline_p90_c: round(quantile(tempBaseline, 0.9), 1),
      humidity_local_median: round(humidityMedian, 0),
      humidity_compound_amplifies: humidityHighEnough,
      percentile: round(tempPct, 0),
      sample_size: tempBaseline.length,
    },
    dedupe_key: dedupeKey,
    valid_from: validFrom.toISOString(),
    valid_until: validUntil.toISOString(),
  };
}

// ============================================================
// water_recovery_signal
// "14-day rolling rainfall accumulation in 75-90 percentile"
// (positive signal — wet conditions returning)
// ============================================================

async function evalWaterRecovery(
  supabase: SupabaseClient,
  place: Place,
  signalType: SignalTypeDef,
  now: Date
): Promise<CandidateSignal | null> {
  // Past 14 days of actual rainfall — fetch from archive ending today
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
  const historical14d = await fetchPast14d(place.latitude, place.longitude, fourteenDaysAgo, now);
  const recent14dSum = historical14d.reduce((a, b) => a + (b ?? 0), 0);

  // Baseline: 14-day rolling sums in DOY window
  const dailyBaseline = await getHistoricalBaseline(supabase, {
    placeId: place.id,
    latitude: place.latitude,
    longitude: place.longitude,
    variable: 'precipitation_sum',
    targetDate: now,
    yearsBack: signalType.trigger_logic.baseline_years,
    doyHalfWindow: signalType.trigger_logic.doy_half_window,
  });
  const baseline14d = rollingNDaySum(dailyBaseline, 14);
  if (baseline14d.length < 30) return null;

  // Absolute-value floor — Lima example: 0.9mm of recent 14-day rain
  // landed at the 90th+ percentile against a near-zero baseline and
  // fired "STRONG / 94% confidence". Without this guard, percentile
  // rank lies in any climate where the baseline distribution piles up
  // at zero.
  if (recent14dSum < MIN_RECENT_14D_MM) return null;

  const pct = percentileRank(recent14dSum, baseline14d);
  const severity = severityFromPercentile(pct, signalType.trigger_logic.thresholds);
  if (!severity) return null;

  const confidence = computeConfidence(baseline14d, recent14dSum);
  const anomaly = anomalyScore(recent14dSum, baseline14d);

  const validFrom = new Date(now);
  const validUntil = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000); // refresh in 5 days
  const dayBucket = now.toISOString().slice(0, 10);
  const dedupeKey = `${place.id}:${signalType.id}:${dayBucket}`;

  return {
    place_id: place.id,
    signal_type_id: signalType.id,
    severity,
    confidence,
    anomaly_score: anomaly,
    affected_groups: signalType.affected_groups,
    source_stack: ['open-meteo'],
    structured_data: {
      recent_14d_sum_mm: round(recent14dSum, 1),
      baseline_median_mm: round(median(baseline14d), 1),
      baseline_p75_mm: round(quantile(baseline14d, 0.75), 1),
      percentile: round(pct, 0),
      sample_size: baseline14d.length,
    },
    dedupe_key: dedupeKey,
    valid_from: validFrom.toISOString(),
    valid_until: validUntil.toISOString(),
  };
}

// ============================================================
// helpers
// ============================================================

async function fetchPast14d(lat: number, lon: number, start: Date, end: Date): Promise<number[]> {
  const url =
    `https://archive-api.open-meteo.com/v1/archive?` +
    `latitude=${lat}&longitude=${lon}` +
    `&start_date=${start.toISOString().slice(0, 10)}` +
    `&end_date=${end.toISOString().slice(0, 10)}` +
    `&daily=precipitation_sum&timezone=UTC`;
  const res = await fetch(url, { headers: { 'User-Agent': 'kalma-signal-engine/0.1' } });
  if (!res.ok) throw new Error(`Open-Meteo archive ${res.status}`);
  const data = await res.json();
  return data?.daily?.precipitation_sum ?? [];
}

function median(sortedAsc: number[]): number {
  if (sortedAsc.length === 0) return 0;
  const mid = sortedAsc.length >> 1;
  return sortedAsc.length % 2 === 1
    ? sortedAsc[mid]
    : (sortedAsc[mid - 1] + sortedAsc[mid]) / 2;
}

function quantile(sortedAsc: number[], q: number): number {
  if (sortedAsc.length === 0) return 0;
  if (sortedAsc.length === 1) return sortedAsc[0];
  const pos = (sortedAsc.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return lo === hi ? sortedAsc[lo] : sortedAsc[lo] + (sortedAsc[hi] - sortedAsc[lo]) * (pos - lo);
}

function round(n: number, digits: number): number {
  const f = Math.pow(10, digits);
  return Math.round(n * f) / f;
}

function downgradeSeverity(s: Severity): Severity | null {
  switch (s) {
    case 'extreme':
      return 'high';
    case 'high':
      return 'medium';
    case 'medium':
      return 'low';
    case 'low':
      return null;
    default:
      return null;
  }
}

/**
 * Map a run length (number of consecutive qualifying days) to a severity
 * bucket. Used by event-based signals like consecutive_cold_below and
 * dry_stretch_window where the trigger_logic.thresholds map is
 *   { low: 3, medium: 5, high: 7, extreme: 10 }
 * meaning "≥3 days → low, ≥5 → medium, …".
 */
function severityFromRunLength(
  runLength: number,
  thresholds: Record<string, number>
): Severity | null {
  if (runLength >= (thresholds.extreme ?? Infinity)) return 'extreme';
  if (runLength >= (thresholds.high ?? Infinity)) return 'high';
  if (runLength >= (thresholds.medium ?? Infinity)) return 'medium';
  if (runLength >= (thresholds.low ?? Infinity)) return 'low';
  return null;
}

/**
 * Longest run of consecutive entries in `values` where `qualifies(v)` holds.
 * Returns 0 if no qualifying day. Skips null/undefined values (treats them
 * as breakers — Open-Meteo can return null when a day is outside the model's
 * range; conservative to not bridge over a gap).
 */
function longestQualifyingRun(
  values: Array<number | null | undefined>,
  qualifies: (v: number) => boolean
): { runLength: number; startIdx: number; endIdx: number } {
  let best = { runLength: 0, startIdx: -1, endIdx: -1 };
  let cur = 0;
  let curStart = -1;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v === null || v === undefined || !Number.isFinite(v)) {
      cur = 0;
      curStart = -1;
      continue;
    }
    if (qualifies(v as number)) {
      if (cur === 0) curStart = i;
      cur += 1;
      if (cur > best.runLength) {
        best = { runLength: cur, startIdx: curStart, endIdx: i };
      }
    } else {
      cur = 0;
      curStart = -1;
    }
  }
  return best;
}

// ============================================================
// consecutive_cold_below
// "N consecutive forecast days with temperature_2m_min below threshold"
// User-configurable: threshold_celsius (default 15), min_consecutive_days
// (default 3). Severity comes from thresholds map by run length.
// ============================================================

async function evalConsecutiveCold(
  place: Place,
  signalType: SignalTypeDef,
  now: Date
): Promise<CandidateSignal | null> {
  const params = signalType.trigger_logic.default_params ?? {};
  const thresholdC = Number(params.threshold_celsius ?? 15);
  const minRun = Math.max(1, Number(params.min_consecutive_days ?? 3));

  const forecast = await fetchForecastDaily(
    place.latitude,
    place.longitude,
    ['temperature_2m_min'],
    14
  );
  const mins = forecast.values.temperature_2m_min ?? [];
  if (mins.length === 0) return null;

  const run = longestQualifyingRun(mins, (v) => v < thresholdC);
  if (run.runLength < minRun) return null;

  const severity = severityFromRunLength(run.runLength, signalType.trigger_logic.thresholds);
  if (!severity) return null;

  const validFrom = new Date(now);
  // Cold spells re-resolve daily; keep signal alive for a 3-day window.
  const validUntil = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
  const dayBucket = forecast.dates[0];

  return {
    place_id: place.id,
    signal_type_id: signalType.id,
    severity,
    confidence: 85, // forecast horizon ≤14d → moderately high confidence
    anomaly_score: run.runLength, // raw run length doubles as anomaly magnitude
    affected_groups: signalType.affected_groups,
    source_stack: ['open-meteo'],
    structured_data: {
      threshold_celsius: thresholdC,
      min_consecutive_days: minRun,
      observed_run_days: run.runLength,
      run_start_date: forecast.dates[run.startIdx] ?? null,
      run_end_date: forecast.dates[run.endIdx] ?? null,
      forecast_horizon_days: mins.length,
    },
    dedupe_key: `${place.id}:${signalType.id}:${dayBucket}`,
    valid_from: validFrom.toISOString(),
    valid_until: validUntil.toISOString(),
  };
}

// ============================================================
// dry_stretch_window
// "N consecutive forecast days with precipitation_sum below threshold mm"
// User-configurable: threshold_mm (default 1), min_consecutive_days
// (default 5). Severity comes from thresholds map by run length.
// ============================================================

async function evalDryStretch(
  place: Place,
  signalType: SignalTypeDef,
  now: Date
): Promise<CandidateSignal | null> {
  const params = signalType.trigger_logic.default_params ?? {};
  const thresholdMm = Number(params.threshold_mm ?? 1);
  const minRun = Math.max(1, Number(params.min_consecutive_days ?? 5));

  const forecast = await fetchForecastDaily(
    place.latitude,
    place.longitude,
    ['precipitation_sum'],
    14
  );
  const precip = forecast.values.precipitation_sum ?? [];
  if (precip.length === 0) return null;

  // ≤ threshold counts as a dry day. Use <= because threshold_mm=1 should
  // include exactly-1mm days as dry per the SQL note.
  const run = longestQualifyingRun(precip, (v) => v <= thresholdMm);
  if (run.runLength < minRun) return null;

  const severity = severityFromRunLength(run.runLength, signalType.trigger_logic.thresholds);
  if (!severity) return null;

  const validFrom = new Date(now);
  const validUntil = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000);
  const dayBucket = forecast.dates[0];

  return {
    place_id: place.id,
    signal_type_id: signalType.id,
    severity,
    confidence: 80,
    anomaly_score: run.runLength,
    affected_groups: signalType.affected_groups,
    source_stack: ['open-meteo'],
    structured_data: {
      threshold_mm: thresholdMm,
      min_consecutive_days: minRun,
      observed_run_days: run.runLength,
      run_start_date: forecast.dates[run.startIdx] ?? null,
      run_end_date: forecast.dates[run.endIdx] ?? null,
      forecast_horizon_days: precip.length,
      crop_context: params.crop_context ?? null,
    },
    dedupe_key: `${place.id}:${signalType.id}:${dayBucket}`,
    valid_from: validFrom.toISOString(),
    valid_until: validUntil.toISOString(),
  };
}

// ============================================================
// frost_risk
// "Any day in the forecast horizon with temperature_2m_min < fixed_threshold_celsius"
// Threshold fixed at 2°C by registry (not user-configurable). Severity
// is 'active' — single bin (the threshold map is {active: 1}).
// ============================================================

async function evalFrostRisk(
  place: Place,
  signalType: SignalTypeDef,
  now: Date
): Promise<CandidateSignal | null> {
  const tl = signalType.trigger_logic;
  const thresholdC = Number(
    tl.fixed_threshold_celsius ?? tl.default_params?.threshold_celsius ?? 2
  );

  const forecast = await fetchForecastDaily(
    place.latitude,
    place.longitude,
    ['temperature_2m_min'],
    14
  );
  const mins = forecast.values.temperature_2m_min ?? [];
  if (mins.length === 0) return null;

  let coldestIdx = -1;
  let coldestValue = Infinity;
  for (let i = 0; i < mins.length; i++) {
    const v = mins[i];
    if (v === null || v === undefined || !Number.isFinite(v)) continue;
    if ((v as number) < coldestValue) {
      coldestValue = v as number;
      coldestIdx = i;
    }
  }
  if (coldestIdx === -1 || coldestValue >= thresholdC) return null;

  const validFrom = new Date(now);
  // Frost windows are short-lived; re-resolve daily.
  const validUntil = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
  const dayBucket = forecast.dates[0];

  return {
    place_id: place.id,
    signal_type_id: signalType.id,
    severity: 'active',
    confidence: 80,
    anomaly_score: thresholdC - coldestValue, // how far below threshold
    affected_groups: signalType.affected_groups,
    source_stack: ['open-meteo'],
    structured_data: {
      threshold_celsius: thresholdC,
      coldest_forecast_celsius: round(coldestValue, 1),
      coldest_forecast_date: forecast.dates[coldestIdx] ?? null,
      forecast_horizon_days: mins.length,
    },
    dedupe_key: `${place.id}:${signalType.id}:${dayBucket}`,
    valid_from: validFrom.toISOString(),
    valid_until: validUntil.toISOString(),
  };
}

// ============================================================
// heavy_rain_event
// "Any single forecast day with precipitation_sum above a percentile
//  (default 95th) of the DOY-windowed historical distribution, OR above
//  a fixed mm threshold when threshold_mode = 'fixed'."
// Severity is derived from which threshold bucket the observed forecast
// exceeds (thresholds = {low: 75, medium: 90, high: 95, extreme: 99}).
// ============================================================

async function evalHeavyRain(
  supabase: SupabaseClient,
  place: Place,
  signalType: SignalTypeDef,
  now: Date
): Promise<CandidateSignal | null> {
  const params = signalType.trigger_logic.default_params ?? {};
  const mode = (params.threshold_mode as 'percentile' | 'fixed') ?? 'percentile';

  const forecast = await fetchForecastDaily(
    place.latitude,
    place.longitude,
    ['precipitation_sum'],
    7
  );
  const precip = forecast.values.precipitation_sum ?? [];
  if (precip.length === 0) return null;

  // Find the wettest forecast day
  let wettestIdx = -1;
  let wettestValue = -Infinity;
  for (let i = 0; i < precip.length; i++) {
    const v = precip[i];
    if (v === null || v === undefined || !Number.isFinite(v)) continue;
    if ((v as number) > wettestValue) {
      wettestValue = v as number;
      wettestIdx = i;
    }
  }
  if (wettestIdx === -1) return null;

  let severity: Severity | 'active' | 'strong' | null = null;
  const meta: Record<string, any> = {
    threshold_mode: mode,
    wettest_forecast_mm: round(wettestValue, 1),
    wettest_forecast_date: forecast.dates[wettestIdx] ?? null,
    forecast_horizon_days: precip.length,
  };

  if (mode === 'fixed') {
    const thresholdMm = Number(params.threshold_mm ?? 25);
    meta.threshold_mm = thresholdMm;
    if (wettestValue >= thresholdMm) {
      // No graded severity in fixed mode — treat as 'high' for visibility,
      // or downgrade to 'medium' if just over threshold by <20%.
      severity = wettestValue >= thresholdMm * 1.2 ? 'high' : 'medium';
    }
  } else {
    // percentile mode — compare against local DOY-window historical p75/90/95/99
    const dailyBaseline = await getHistoricalBaseline(supabase, {
      placeId: place.id,
      latitude: place.latitude,
      longitude: place.longitude,
      variable: 'precipitation_sum',
      targetDate: now,
      yearsBack: signalType.trigger_logic.baseline_years,
      doyHalfWindow: signalType.trigger_logic.doy_half_window,
    });
    if (dailyBaseline.length < 30) return null;

    // Absolute-value floor — same percentile-vs-near-zero pitfall as
    // rainfall_risk_rising and water_recovery_signal. A 3mm day in a
    // place that usually sees 0mm is statistically rare but is not a
    // "heavy rain event" by any practical definition.
    if (wettestValue < MIN_HEAVY_RAIN_SINGLE_DAY_MM) return null;

    const pct = percentileRank(wettestValue, dailyBaseline);
    meta.percentile = round(pct, 0);
    meta.baseline_p75_mm = round(quantile(dailyBaseline, 0.75), 1);
    meta.baseline_p90_mm = round(quantile(dailyBaseline, 0.9), 1);
    meta.baseline_p95_mm = round(quantile(dailyBaseline, 0.95), 1);
    meta.baseline_p99_mm = round(quantile(dailyBaseline, 0.99), 1);
    meta.sample_size = dailyBaseline.length;

    // thresholds map for heavy_rain_event is percentile cutoffs
    severity = severityFromPercentile(pct, signalType.trigger_logic.thresholds);
  }

  if (!severity) return null;

  const validFrom = new Date(now);
  // Heavy rain events resolve within the forecast horizon.
  const validUntil = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000);
  const dayBucket = forecast.dates[0];

  return {
    place_id: place.id,
    signal_type_id: signalType.id,
    severity,
    confidence: 80,
    anomaly_score: meta.percentile ?? wettestValue,
    affected_groups: signalType.affected_groups,
    source_stack: ['open-meteo'],
    structured_data: meta,
    dedupe_key: `${place.id}:${signalType.id}:${dayBucket}`,
    valid_from: validFrom.toISOString(),
    valid_until: validUntil.toISOString(),
  };
}
