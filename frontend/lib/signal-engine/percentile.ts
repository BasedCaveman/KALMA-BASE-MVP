// kalma/frontend/lib/signal-engine/percentile.ts
//
// Pure statistical functions. No I/O, no side effects.
// Used by the evaluator to convert (current value, historical distribution)
// into a percentile rank + anomaly score + severity label.
//
// Design principle: the engine never uses absolute thresholds.
// 40mm of rain is catastrophic in one place and ordinary in another.
// We always compare current observation to the local DOY-window distribution.

export type Thresholds = {
  low?: number;
  medium?: number;
  high?: number;
  extreme?: number;
  active?: number;
  strong?: number;
  [key: string]: number | undefined;
};

export type Severity = 'low' | 'medium' | 'high' | 'extreme';

/**
 * Returns the percentile rank (0-100) of `value` within `sortedValues`.
 * sortedValues MUST be ascending; we don't sort here for speed.
 *
 * Uses linear interpolation between bracketing samples — gives smoother
 * results than rank-based percentile on small samples.
 */
export function percentileRank(value: number, sortedValues: number[]): number {
  if (sortedValues.length === 0) return 50;
  if (sortedValues.length === 1) return value >= sortedValues[0] ? 100 : 0;

  const n = sortedValues.length;

  // Below all samples
  if (value <= sortedValues[0]) return 0;
  // Above all samples
  if (value >= sortedValues[n - 1]) return 100;

  // Find bracketing indices
  let lo = 0;
  let hi = n - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (sortedValues[mid] <= value) lo = mid;
    else hi = mid;
  }

  // Linear interpolation between rank(lo) and rank(hi)
  const rankLo = (lo / (n - 1)) * 100;
  const rankHi = (hi / (n - 1)) * 100;
  const span = sortedValues[hi] - sortedValues[lo];
  const t = span === 0 ? 0 : (value - sortedValues[lo]) / span;
  return rankLo + t * (rankHi - rankLo);
}

/**
 * Anomaly score in standard deviations.
 * (current - median) / stdDev
 *
 * Median is more robust than mean for skewed precipitation distributions.
 * Returns 0 if stdDev is zero (no variation in baseline).
 */
export function anomalyScore(value: number, sortedValues: number[]): number {
  if (sortedValues.length < 2) return 0;
  const median = quantile(sortedValues, 0.5);
  const stdDev = standardDeviation(sortedValues);
  if (stdDev === 0) return 0;
  return (value - median) / stdDev;
}

/**
 * Severity label from percentile rank using the thresholds map.
 * Returns null if the value is below the lowest threshold (signal not triggered).
 *
 * Supports both the standard 4-tier (low/medium/high/extreme) used by
 * rainfall_risk_rising and heat_stress_window, and the 2-tier (active/strong)
 * used by water_recovery_signal.
 */
export function severityFromPercentile(
  pct: number,
  thresholds: Thresholds
): Severity | 'active' | 'strong' | null {
  // 4-tier
  if (
    thresholds.extreme !== undefined &&
    thresholds.high !== undefined &&
    thresholds.medium !== undefined &&
    thresholds.low !== undefined
  ) {
    if (pct >= thresholds.extreme) return 'extreme';
    if (pct >= thresholds.high) return 'high';
    if (pct >= thresholds.medium) return 'medium';
    if (pct >= thresholds.low) return 'low';
    return null;
  }
  // 2-tier (recovery / improvement signals)
  if (thresholds.strong !== undefined && thresholds.active !== undefined) {
    if (pct >= thresholds.strong) return 'strong';
    if (pct >= thresholds.active) return 'active';
    return null;
  }
  return null;
}

/**
 * Confidence (0-100) reflects how trustworthy the signal is, not the
 * probability of the event. It combines:
 *   - sample size of the baseline (more years → higher confidence)
 *   - anomaly magnitude (further from median → more meaningful)
 *   - distribution stability (lower CV → more reliable percentile)
 *
 * Caps at 95 — we never claim certainty.
 */
export function computeConfidence(
  sortedValues: number[],
  currentValue: number
): number {
  const n = sortedValues.length;
  if (n < 30) return Math.max(40, Math.round(40 + n * 0.5));

  // Baseline factor — full credit at 100+ samples (10 years × 10 days = 100)
  const sampleFactor = Math.min(1, n / 100);

  // Anomaly factor — how far from median
  const anomaly = Math.abs(anomalyScore(currentValue, sortedValues));
  const anomalyFactor = Math.min(1, anomaly / 2); // capped at 2 stdDev

  // Distribution stability — lower CV (stdDev/median) → more trustworthy
  const median = quantile(sortedValues, 0.5);
  const stdDev = standardDeviation(sortedValues);
  const cv = median > 0 ? stdDev / median : 1;
  const stabilityFactor = Math.max(0, Math.min(1, 1 - cv * 0.3));

  const score =
    50 + // base
    sampleFactor * 25 +
    anomalyFactor * 15 +
    stabilityFactor * 5;

  return Math.min(95, Math.max(0, Math.round(score)));
}

// ---------------------- helpers ----------------------

export function quantile(sortedValues: number[], q: number): number {
  if (sortedValues.length === 0) return 0;
  if (sortedValues.length === 1) return sortedValues[0];
  const pos = (sortedValues.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sortedValues[lo];
  return sortedValues[lo] + (sortedValues[hi] - sortedValues[lo]) * (pos - lo);
}

export function standardDeviation(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance =
    values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

/**
 * Compute the day-of-year (1-366) for a given UTC date.
 */
export function dayOfYearUTC(date: Date): number {
  const start = Date.UTC(date.getUTCFullYear(), 0, 0);
  const diff = date.getTime() - start;
  return Math.floor(diff / 86400000);
}

/**
 * Returns the set of (year, doy) pairs to query for a baseline window.
 * For DOY 64 with halfWindow=7 and yearsBack=10, returns:
 *   2016: DOY 57..71
 *   2017: DOY 57..71
 *   ...
 *   2025: DOY 57..71
 *
 * Caller maps these to actual dates and queries Open-Meteo per year.
 */
export function buildBaselineWindow(
  targetDate: Date,
  yearsBack: number,
  doyHalfWindow: number
): { year: number; startDate: Date; endDate: Date }[] {
  const targetYear = targetDate.getUTCFullYear();
  const targetDoy = dayOfYearUTC(targetDate);
  const out: { year: number; startDate: Date; endDate: Date }[] = [];

  // Skip the current year — we want historical context, not the present
  for (let i = 1; i <= yearsBack; i++) {
    const year = targetYear - i;
    // Compute start/end dates for this year's window around targetDoy
    const startDoy = targetDoy - doyHalfWindow;
    const endDoy = targetDoy + doyHalfWindow;
    const startDate = doyToDate(year, startDoy);
    const endDate = doyToDate(year, endDoy);
    out.push({ year, startDate, endDate });
  }
  return out;
}

function doyToDate(year: number, doy: number): Date {
  // Handle DOY underflow (negative) and overflow (>366) by rolling year boundary
  const date = new Date(Date.UTC(year, 0, 1));
  date.setUTCDate(date.getUTCDate() + doy - 1);
  return date;
}
