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
  avgNext,
  ARCHIVE_MODEL,
  type DailyVariable,
} from './openMeteoFetcher';
import { getHistoricalBaseline } from './cache';
import { getHistoricalSeries } from './seriesCache';
import {
  percentileRank,
  anomalyScore,
  severityFromPercentile,
  computeConfidence,
  rollingNDaySumByYear,
  sumIfComplete,
  extractCompleteWindow,
  hasSufficientYearCoverage,
  addDaysISO,
  type Severity,
} from './percentile';

/**
 * Thrown instead of returning null when an evaluator could not actually
 * evaluate the trigger — missing/incomplete data, insufficient historical
 * coverage — as opposed to evaluating fully and finding no crossing.
 *
 * Why this matters: the cron (app/api/cron/signal-engine/route.ts)
 * supersedes any existing active signal when evaluateSignal() returns
 * null, on the theory that the firing condition stopped holding (the
 * water_recovery/Lima case this was built for). That's only true for a
 * real "evaluated, nothing crossed" outcome. A transient data gap
 * returning null would wipe a genuinely still-active signal for a reason
 * that has nothing to do with whether it's still true — found in review
 * 2026-09-21 (docs/kalma-coordination-handover-2026-09-15/09-UI-HANDOVER-
 * CLIMATE-INTEGRITY-2026-09-21.md, item 1) right after the completeness
 * checks below were added, which made hitting this case far more likely
 * than the pre-existing (also real, but rarer) `baseline.length < 30`
 * case.
 *
 * The cron's existing per-place try/catch already does the right thing
 * for a thrown error — log it, leave existing signals untouched, move on
 * — so throwing this instead of returning null costs no new plumbing
 * there; the cron only needs to count it separately from a genuine fetch
 * failure for observability (see route.ts).
 */
export class InsufficientDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InsufficientDataError';
  }
}

/**
 * Bumped whenever the statistical METHOD behind a signal type changes
 * (not its trigger_logic config, which already has its own history).
 * Stored in structured_data so a shift in emitted signals after a code
 * change reads as "method changed", never as "climate changed" or a
 * silent rewrite of history — see review item 5.
 */
const ROLLING_SUM_METHOD_VERSION = 'rolling-sum-v2-anchor-lookback-2026-09-21';

/**
 * heat_stress_window and heavy_rain_event's percentile mode do NOT use a
 * rolling sum — averaging and taking a single-day max are different
 * aggregation methods, and reusing ROLLING_SUM_METHOD_VERSION for them
 * (found in review, Lote 1 2026-09-22) would make a future rolling-sum-
 * only change look like it also touched these two, or vice versa. Each
 * method family gets its own version.
 */
const HEAT_STRESS_METHOD_VERSION = 'heat-stress-avg-v1-2026-09-22';
const HEAVY_RAIN_PERCENTILE_METHOD_VERSION = 'heavy-rain-percentile-max-v1-2026-09-22';
const HEAVY_RAIN_FIXED_METHOD_VERSION = 'heavy-rain-fixed-threshold-v1-2026-09-22';

/**
 * Names the forecast provider in structured_data without overclaiming a
 * specific model: fetchForecastDaily (openMeteoFetcher.ts) does not pass a
 * `models` param today, even though Open-Meteo's forecast endpoint accepts
 * one — so "which forecast model" is genuinely unspecified, not ERA5 (that
 * label is reserved for ARCHIVE_MODEL, the historical/reanalysis fetch,
 * which is a different endpoint and a different kind of data). Conflating
 * the two was a real defect in this batch's own first draft, caught before
 * shipping.
 */
const FORECAST_SOURCE = 'open-meteo';

/** Throws InsufficientDataError if hasSufficientYearCoverage() (percentile.ts) says no. */
function requireSufficientYears(yearsRequested: number, yearsWithData: number): void {
  if (!hasSufficientYearCoverage(yearsRequested, yearsWithData)) {
    throw new InsufficientDataError(
      `only ${yearsWithData}/${yearsRequested} historical years returned data (need >= ${Math.ceil(yearsRequested / 2)})`
    );
  }
}

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
  const ROLLING_WINDOW_DAYS = 2; // 48h

  // 1. Forecast: next 48h precipitation total. Request EXACTLY
  // ROLLING_WINDOW_DAYS days — a leftover `7` here (unused beyond the
  // first 2 by the old sumNext()-based code) meant sumIfComplete() below,
  // which validates the ENTIRE returned array length against
  // ROLLING_WINDOW_DAYS, rejected a perfectly normal 7-day forecast as
  // "incomplete" 100% of the time: it never had a chance to equal 2.
  // Found in review 2026-09-21 (second round), reproduced against a
  // forecast mock that (unlike the first version of this test) actually
  // honors the requested forecast_days.
  const forecast = await fetchForecastDaily(
    place.latitude,
    place.longitude,
    ['precipitation_sum'],
    ROLLING_WINDOW_DAYS
  );
  const todayISO = now.toISOString().slice(0, 10);
  const forecastResult = sumIfComplete(forecast.dates, forecast.values.precipitation_sum, todayISO, ROLLING_WINDOW_DAYS);
  if (!forecastResult.complete) {
    throw new InsufficientDataError(
      `forecast did not return ${ROLLING_WINDOW_DAYS} complete consecutive days starting ${todayISO}`
    );
  }
  const forecast48h = forecastResult.sum;

  // 2. Historical baseline: dated daily precipitation across DOY window.
  // rollingWindowDays = ROLLING_WINDOW_DAYS so every one of the
  // 2*doy_half_window+1 candidate end-dates per year has a full 48h sum
  // available (see fetchHistoricalSeries's doc).
  const { series: dailySeries, yearsRequested } = await getHistoricalSeries(supabase, {
    placeId: place.id,
    latitude: place.latitude,
    longitude: place.longitude,
    variable: 'precipitation_sum',
    targetDate: now,
    yearsBack: signalType.trigger_logic.baseline_years,
    doyHalfWindow: signalType.trigger_logic.doy_half_window,
    rollingWindowDays: ROLLING_WINDOW_DAYS,
  });

  // 3. Build 48h rolling sums for fair comparison — within-year, calendar-
  // consecutive days only (see rollingNDaySumByYear's header).
  const { sums: baseline48h, yearsWithUsableWindow } = rollingNDaySumByYear(dailySeries, ROLLING_WINDOW_DAYS);
  requireSufficientYears(yearsRequested, yearsWithUsableWindow);

  if (baseline48h.length < 30) {
    throw new InsufficientDataError(`only ${baseline48h.length} rolling 48h baseline samples (need >= 30)`);
  }

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
      forecast_window: { start: forecast.dates[0], end: forecast.dates[ROLLING_WINDOW_DAYS - 1] },
      forecast_source: FORECAST_SOURCE,
      historical_model: ARCHIVE_MODEL,
      baseline_median_mm: round(median(baseline48h), 1),
      baseline_p90_mm: round(quantile(baseline48h, 0.9), 1),
      percentile: round(pct, 0),
      sample_size: baseline48h.length,
      window: { years: signalType.trigger_logic.baseline_years, doy_half: signalType.trigger_logic.doy_half_window },
      historical_years_requested: yearsRequested,
      historical_years_with_usable_window: yearsWithUsableWindow,
      method_version: ROLLING_SUM_METHOD_VERSION,
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
  const todayISO = now.toISOString().slice(0, 10);

  // The forecast average used to run over whatever came back
  // (avgNext, no completeness check) — a partial week could neither be
  // trusted as a real 7-day average nor read as "nothing crossed" (the
  // missing days could have been the hot ones). Require the full window
  // for the PRIMARY ranked quantity, same discipline as every rolling-sum
  // evaluator's forecast side. Found in review, Lote 1 2026-09-22.
  const tempWindow = extractCompleteWindow(forecast.dates, forecast.values.temperature_2m_max, todayISO, 7);
  if (!tempWindow) {
    throw new InsufficientDataError(
      `forecast did not return 7 complete consecutive days of temperature_2m_max starting ${todayISO}`
    );
  }
  const forecast7dMaxAvg = tempWindow.reduce((a, b) => a + b, 0) / tempWindow.length;

  // Humidity is a secondary COMPOUNDING input only (can downgrade severity,
  // never block evaluation on its own) — deliberately not gated the same
  // way as temperature. Still record whether the window was actually
  // complete, so a partial/degraded reading is never indistinguishable
  // from a genuine 7-day observation in structured_data.
  const forecastHumidityWindow = extractCompleteWindow(forecast.dates, forecast.values.relative_humidity_2m_mean, todayISO, 7);
  const forecast7dHumidityAvg = forecastHumidityWindow
    ? forecastHumidityWindow.reduce((a, b) => a + b, 0) / forecastHumidityWindow.length
    : avgNext(forecast.values.relative_humidity_2m_mean, 7);
  const forecastHumidityCoverage: 'complete' | 'partial' = forecastHumidityWindow ? 'complete' : 'partial';

  // Temperature baseline (DOY-windowed daily max temps). Same completeness
  // discipline as the rolling-sum signal types (review 2026-09-21, round
  // 6/7): years coverage first, then a raw sample-count floor — a year
  // count alone doesn't catch a handful of real years padding out to 30+
  // samples via multi-day DOY windows.
  const tempResult = await getHistoricalBaseline(supabase, {
    placeId: place.id,
    latitude: place.latitude,
    longitude: place.longitude,
    variable: 'temperature_2m_max',
    targetDate: now,
    yearsBack: signalType.trigger_logic.baseline_years,
    doyHalfWindow: signalType.trigger_logic.doy_half_window,
  });
  requireSufficientYears(tempResult.yearsRequested, tempResult.yearsWithUsableWindow);
  const tempBaseline = tempResult.values;
  if (tempBaseline.length < 30) {
    throw new InsufficientDataError(`only ${tempBaseline.length} temperature baseline samples (need >= 30)`);
  }

  const tempPct = percentileRank(forecast7dMaxAvg, tempBaseline);
  const tempSeverity = severityFromPercentile(tempPct, signalType.trigger_logic.thresholds);
  if (!tempSeverity) return null;

  // Compounding factor: humidity above local median amplifies the signal.
  // Below median humidity, we downgrade by one tier (or kill it if already
  // low). Humidity is a secondary compounding input with an existing
  // graceful fallback for missing data (median 50 below) — unlike the
  // primary temperature baseline above, thin humidity coverage does not
  // block evaluation.
  const humidityResult = await getHistoricalBaseline(supabase, {
    placeId: place.id,
    latitude: place.latitude,
    longitude: place.longitude,
    variable: 'relative_humidity_2m_mean',
    targetDate: now,
    yearsBack: signalType.trigger_logic.baseline_years,
    doyHalfWindow: signalType.trigger_logic.doy_half_window,
  });
  const humidityBaseline = humidityResult.values;
  const historicalHumidityCoverage: 'observed' | 'fallback' = humidityBaseline.length > 0 ? 'observed' : 'fallback';
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
      forecast_window: { start: forecast.dates[0], end: forecast.dates[6] },
      forecast_source: FORECAST_SOURCE,
      forecast_humidity_coverage: forecastHumidityCoverage,
      historical_model: ARCHIVE_MODEL,
      historical_humidity_coverage: historicalHumidityCoverage,
      baseline_median_c: round(median(tempBaseline), 1),
      baseline_p90_c: round(quantile(tempBaseline, 0.9), 1),
      humidity_local_median: round(humidityMedian, 0),
      humidity_compound_amplifies: humidityHighEnough,
      percentile: round(tempPct, 0),
      sample_size: tempBaseline.length,
      historical_years_requested: tempResult.yearsRequested,
      historical_years_with_usable_window: tempResult.yearsWithUsableWindow,
      method_version: HEAT_STRESS_METHOD_VERSION,
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

/**
 * NOT the archive API's default. Open-Meteo's own default for
 * archive-api.open-meteo.com is "Best Match", which blends ECMWF IFS
 * (updates every 6h, no delay) for the most recent 1-10 days with ERA5/
 * ERA5-Land further back — verified live 2026-09-21, the same request
 * without `models` returns real values through today. openMeteoFetcher.ts
 * requests `models=era5` explicitly on every archive call (this one and
 * the historical baseline's), so the "recent" window here and the
 * baseline it's compared against are the same kind of data throughout: a
 * settled reanalysis with a real, documented "5 days delay", not a mix
 * of near-real-time forecast-model output (which can still be revised
 * once ERA5 replaces it) for whichever days happen to be recent. This
 * constant is that documented delay, and getHistoricalSeries below is
 * anchored to the date it actually produces (`recent.endDate`), not
 * `now` — a 5-day-old reading must not compare against "today's season"
 * as if it were current. See review 2026-09-21 (third round), item 3,
 * and https://open-meteo.com/en/docs/historical-weather-api.
 */
const ARCHIVE_DATA_LAG_DAYS = 5;

async function evalWaterRecovery(
  supabase: SupabaseClient,
  place: Place,
  signalType: SignalTypeDef,
  now: Date
): Promise<CandidateSignal | null> {
  const RECENT_WINDOW_DAYS = 14;

  // Past 14 complete days of actual rainfall, ending ARCHIVE_DATA_LAG_DAYS
  // before now (see its doc) — not "yesterday", and not now itself. The
  // old range (now-14d .. now inclusive) was also 15 dates, not 14,
  // comparing a mismatched window against a 14-day historical baseline.
  const recent = await fetchRecentNDaySum(place.latitude, place.longitude, now, RECENT_WINDOW_DAYS);
  if (!recent.complete) {
    throw new InsufficientDataError(
      `recent ${RECENT_WINDOW_DAYS}-day window is not complete for any end date from ` +
        `${ARCHIVE_DATA_LAG_DAYS}d to ${ARCHIVE_DATA_LAG_DAYS + MAX_EXTRA_LAG_DAYS}d before now`
    );
  }
  const recent14dSum = recent.sum;

  // Baseline: 14-day rolling sums in a DOY window CENTRED ON THE RECENT
  // WINDOW'S OWN END DATE (recent.endDate), not `now`. The recent
  // observation already ends ARCHIVE_DATA_LAG_DAYS in the past — anchoring
  // the "is this unusual for the season" comparison on today's
  // day-of-year instead of the actual observed date would silently
  // compare against the wrong slice of the calendar, worse the further
  // doy_half_window is from ARCHIVE_DATA_LAG_DAYS. Found in review
  // 2026-09-21 (third round), item 3.
  //
  // rollingWindowDays = RECENT_WINDOW_DAYS so every one of the
  // 2*doy_half_window+1 candidate end-dates per year has a full 14-day
  // sum available — without it, baseline_years=10 & doy_half_window=7
  // (the production config) yields only 20 rolling sums, under the
  // 30-sample floor below, and this signal type could never fire.
  const baselineAnchorDate = new Date(`${recent.endDate}T00:00:00Z`);
  const { series: dailySeries, yearsRequested } = await getHistoricalSeries(supabase, {
    placeId: place.id,
    latitude: place.latitude,
    longitude: place.longitude,
    variable: 'precipitation_sum',
    targetDate: baselineAnchorDate,
    yearsBack: signalType.trigger_logic.baseline_years,
    doyHalfWindow: signalType.trigger_logic.doy_half_window,
    rollingWindowDays: RECENT_WINDOW_DAYS,
  });

  const { sums: baseline14d, yearsWithUsableWindow } = rollingNDaySumByYear(dailySeries, RECENT_WINDOW_DAYS);
  requireSufficientYears(yearsRequested, yearsWithUsableWindow);
  if (baseline14d.length < 30) {
    throw new InsufficientDataError(`only ${baseline14d.length} rolling 14d baseline samples (need >= 30)`);
  }

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
      recent_window: { start: recent.startDate, end: recent.endDate, lag_days_from_now: recent.lagDaysUsed },
      // No forecast_source: this signal never fetches a forecast — both
      // the "recent" window and the baseline come from the archive
      // (ARCHIVE_MODEL). Lote 1, 2026-09-22.
      historical_model: ARCHIVE_MODEL,
      baseline_median_mm: round(median(baseline14d), 1),
      baseline_p75_mm: round(quantile(baseline14d, 0.75), 1),
      percentile: round(pct, 0),
      sample_size: baseline14d.length,
      historical_years_requested: yearsRequested,
      historical_years_with_usable_window: yearsWithUsableWindow,
      method_version: ROLLING_SUM_METHOD_VERSION,
    },
    dedupe_key: dedupeKey,
    valid_from: validFrom.toISOString(),
    valid_until: validUntil.toISOString(),
  };
}

// ============================================================
// helpers
// ============================================================

/**
 * How many extra days beyond ARCHIVE_DATA_LAG_DAYS this looks further back
 * for a complete window before giving up. ERA5's "5 days delay" is
 * typical, not guaranteed: review 2026-09-21 (fifth round) found a live
 * place (Perdoes) where the D-5 window was genuinely null while D-6 was
 * fully populated — a fixed D-5 request threw InsufficientDataError even
 * though a real, complete, more-recent-than-baseline observation existed.
 * This never fills the gap inside D-5's window; it only tries a wholly
 * different, wholly complete window ending one or more days earlier, up
 * to this bound, and reports the actual lag used (structured_data.
 * recent_window.lag_days_from_now) so an unusually stale read is visible
 * rather than silently indistinguishable from a normal one.
 */
const MAX_EXTRA_LAG_DAYS = 3;

/**
 * Sum of the last `n` COMPLETE calendar days of rain, ending at the most
 * recent date (from ARCHIVE_DATA_LAG_DAYS to ARCHIVE_DATA_LAG_DAYS +
 * MAX_EXTRA_LAG_DAYS before now) for which a full n-day window is
 * actually complete. `now` itself is never a candidate end date: today's
 * archive entry is routinely null (the source hasn't finished the day
 * yet). Returns `complete: false` (and no fabricated sum) if every
 * candidate window within the bound has a missing or non-numeric day,
 * rather than folding a gap into 0mm.
 */
async function fetchRecentNDaySum(
  lat: number,
  lon: number,
  now: Date,
  n: number
): Promise<{ sum: number; complete: boolean; startDate: string; endDate: string; lagDaysUsed: number }> {
  const latestPossibleEnd = new Date(now.getTime() - ARCHIVE_DATA_LAG_DAYS * 24 * 60 * 60 * 1000);
  const earliestPossibleEnd = new Date(latestPossibleEnd.getTime() - MAX_EXTRA_LAG_DAYS * 24 * 60 * 60 * 1000);
  const fetchStart = new Date(earliestPossibleEnd.getTime() - (n - 1) * 24 * 60 * 60 * 1000);
  const fetchStartDate = fetchStart.toISOString().slice(0, 10);
  const fetchEndDate = latestPossibleEnd.toISOString().slice(0, 10);
  // models=era5, not the archive API's Best Match default — see
  // ARCHIVE_DATA_LAG_DAYS's doc for why the recent window and the
  // historical baseline must be the same kind of data.
  const url =
    `https://archive-api.open-meteo.com/v1/archive?` +
    `latitude=${lat}&longitude=${lon}` +
    `&start_date=${fetchStartDate}` +
    `&end_date=${fetchEndDate}` +
    `&daily=precipitation_sum&timezone=UTC&models=era5`;
  const res = await fetch(url, { headers: { 'User-Agent': 'kalma-signal-engine/0.1' } });
  if (!res.ok) throw new Error(`Open-Meteo archive ${res.status}`);
  const data = await res.json();
  const dates: string[] = data?.daily?.time ?? [];
  const values: unknown[] = data?.daily?.precipitation_sum ?? [];

  // Walk backward from the latest possible end date, trying the most
  // recent n-day window first and then progressively earlier ones.
  // sumIfComplete still validates each candidate window's own dates and
  // values as an exact consecutive run — this only changes WHICH window
  // is tried, never how "complete" is judged.
  for (let k = 0; k <= MAX_EXTRA_LAG_DAYS; k++) {
    const candidateEndDate = addDaysISO(fetchEndDate, -k);
    const candidateStartDate = addDaysISO(candidateEndDate, -(n - 1));
    const startIdx = dates.indexOf(candidateStartDate);
    if (startIdx === -1 || startIdx + n > dates.length) continue;
    const result = sumIfComplete(
      dates.slice(startIdx, startIdx + n),
      values.slice(startIdx, startIdx + n),
      candidateStartDate,
      n
    );
    if (result.complete) {
      return { ...result, startDate: candidateStartDate, endDate: candidateEndDate, lagDaysUsed: ARCHIVE_DATA_LAG_DAYS + k };
    }
  }
  return {
    sum: 0,
    complete: false,
    startDate: addDaysISO(fetchEndDate, -(n - 1)),
    endDate: fetchEndDate,
    lagDaysUsed: ARCHIVE_DATA_LAG_DAYS,
  };
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
  const todayISO = now.toISOString().slice(0, 10);

  // Require the full 7-day window in BOTH modes (fixed and percentile both
  // use this forecast). A partial week can neither be trusted to contain
  // the actual wettest day (it may be one of the missing ones) nor be read
  // as "no heavy rain" — the old code silently maxed/searched over
  // whatever came back, treating a gap as if it just wasn't there. Found
  // in review, Lote 1 2026-09-22.
  const precipWindow = extractCompleteWindow(forecast.dates, forecast.values.precipitation_sum, todayISO, 7);
  if (!precipWindow) {
    throw new InsufficientDataError(
      `forecast did not return 7 complete consecutive days of precipitation_sum starting ${todayISO}`
    );
  }

  let wettestIdx = 0;
  for (let i = 1; i < precipWindow.length; i++) {
    if (precipWindow[i] > precipWindow[wettestIdx]) wettestIdx = i;
  }
  const wettestValue = precipWindow[wettestIdx];

  let severity: Severity | 'active' | 'strong' | null = null;
  const meta: Record<string, any> = {
    threshold_mode: mode,
    wettest_forecast_mm: round(wettestValue, 1),
    wettest_forecast_date: forecast.dates[wettestIdx],
    forecast_window: { start: forecast.dates[0], end: forecast.dates[6] },
    forecast_source: FORECAST_SOURCE,
  };

  if (mode === 'fixed') {
    const thresholdMm = Number(params.threshold_mm ?? 25);
    meta.threshold_mm = thresholdMm;
    meta.method_version = HEAVY_RAIN_FIXED_METHOD_VERSION;
    // Fixed mode never consults a historical baseline — historical_model
    // and coverage fields are deliberately absent here, not zero/null-
    // as-if-checked (Lote 1 2026-09-22).
    if (wettestValue >= thresholdMm) {
      // No graded severity in fixed mode — treat as 'high' for visibility,
      // or downgrade to 'medium' if just over threshold by <20%.
      severity = wettestValue >= thresholdMm * 1.2 ? 'high' : 'medium';
    }
  } else {
    // percentile mode — compare against local DOY-window historical
    // p75/90/95/99. Same completeness discipline as the rolling-sum signal
    // types (review 2026-09-21, round 6/7): years coverage first, then a
    // raw sample-count floor.
    const dailyResult = await getHistoricalBaseline(supabase, {
      placeId: place.id,
      latitude: place.latitude,
      longitude: place.longitude,
      variable: 'precipitation_sum',
      targetDate: now,
      yearsBack: signalType.trigger_logic.baseline_years,
      doyHalfWindow: signalType.trigger_logic.doy_half_window,
    });
    requireSufficientYears(dailyResult.yearsRequested, dailyResult.yearsWithUsableWindow);
    const dailyBaseline = dailyResult.values;
    if (dailyBaseline.length < 30) {
      throw new InsufficientDataError(`only ${dailyBaseline.length} precipitation baseline samples (need >= 30)`);
    }

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
    meta.historical_model = ARCHIVE_MODEL;
    meta.historical_years_requested = dailyResult.yearsRequested;
    meta.historical_years_with_usable_window = dailyResult.yearsWithUsableWindow;
    meta.method_version = HEAVY_RAIN_PERCENTILE_METHOD_VERSION;

    // Keep the nominal registry reference distinct from severity buckets
    // and the absolute amount floor. This descriptive P95 does not add a
    // second activation gate; preserve the existing scientific calibration.
    meta.registry_reference_percentile = Number(params.percentile ?? 95);
    meta.registry_reference_is_activation_floor = false;
    meta.activation_rule = 'severity-percentile-buckets-and-absolute-mm-floor';
    meta.severity_percentile_thresholds = { ...signalType.trigger_logic.thresholds };
    meta.activation_minimum_mm = MIN_HEAVY_RAIN_SINGLE_DAY_MM;

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
