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

/**
 * At least half of the requested historical years must have actually
 * returned data for a fixed sample-count floor (e.g. "30 rolling sums")
 * to mean what it looks like it means. Without this, 2 complete years at
 * doy_half_window=7 with a 13-day lookback already yield 2*15=30
 * overlapping 14-day sums — 30 numbers, but drawn from 2 seasons, not the
 * requested 10. Shared by evaluator.ts (throws if this is false) and
 * seriesCache.ts (won't cache a series this thin as if it were reusable).
 * Found in review 2026-09-21, item 2.
 */
export function hasSufficientYearCoverage(yearsRequested: number, yearsWithData: number): boolean {
  return yearsWithData >= Math.ceil(yearsRequested / 2);
}

/**
 * One sample of a historical daily series. `anchorYear` is deliberately
 * NOT "the calendar year of `date`" — it's the label of the anchor-window
 * iteration this sample was fetched for (buildBaselineWindow's `year`,
 * i.e. targetYear - i). A DOY window near January can include late-
 * December dates from the calendar year before the anchor: for
 * targetDate 2026-01-01 with doyHalfWindow=1, the anchor-year-2025
 * iteration fetches 2024-12-31, 2025-01-01, 2025-01-02, and all three
 * carry anchorYear 2025.
 *
 * This is intentional, not a bug to paper over with the true calendar
 * year: grouping by anchorYear is what stops rollingNDaySumByYear from
 * blending two DIFFERENT anchor windows together (they always have
 * distinct anchorYear values, one whole year apart), while still letting
 * a genuinely continuous December->January run within ONE window sum
 * across the real date boundary — isConsecutiveDays checks true calendar
 * adjacency independently via the `date` field, so grouping by anchorYear
 * costs nothing there. Grouping by the true calendar year instead would
 * be the actual bug: two different anchor windows a year apart can each
 * touch the same real calendar year from opposite ends (one ending in its
 * December, the next starting in its January), and pooling by true year
 * would blend them.
 */
export interface DatedValue {
  anchorYear: number;
  date: string; // ISO yyyy-mm-dd
  value: number;
}

export interface RollingSumByYear {
  /** N-day rolling sums, sorted ascending — the aggregated distribution,
   *  ready for percentileRank(). */
  sums: number[];
  /** How many DISTINCT anchor years contributed at least one full,
   *  calendar-consecutive N-day window — not how many years returned any
   *  data at all. A year with only 1-13 days of a 14-day window present
   *  contributes zero sums and must not count as "this year has data" for
   *  a coverage check: it did, but none of it was usable at this N. See
   *  hasSufficientYearCoverage's doc; the earlier version of this metric
   *  (openMeteoFetcher.ts's yearsWithData, counting any non-empty year)
   *  let 2 full years plus 3 single-day years read as "5 good years" while
   *  the percentile only ever saw the 2. */
  yearsWithUsableWindow: number;
}

/**
 * Aggregate a dated historical series into N-day rolling sums, to compare
 * against a forecast N-day sum (e.g. "next 48h precip" needs the historical
 * baseline in 48h windows too). Replaces an earlier rollingNDaySum(), which
 * took an already value-sorted flat array and summed ARRAY-adjacent
 * entries — reproduced 2026-09-21: daily series [0,10,0,10] has real 2-day
 * sums [10,10,10], but sorting first to [0,0,10,10] and summing
 * array-adjacent pairs gives [0,10,20], an unrelated distribution.
 *
 * This groups by anchorYear first (see DatedValue's doc for why that's the
 * correct grouping key, not the true calendar year of each date), sorts
 * each group's points by date, and only sums a window of N points when
 * they are N truly consecutive calendar days — a gap in the fetched
 * series (a missing day) breaks the window instead of silently summing
 * across it. The returned sums are sorted by value at the end, which is
 * correct: it's the *aggregated* distribution being sorted for percentile
 * ranking, not the raw daily values.
 */
export function rollingNDaySumByYear(series: DatedValue[], n: number): RollingSumByYear {
  const byAnchorYear = new Map<number, DatedValue[]>();
  for (const point of series) {
    const bucket = byAnchorYear.get(point.anchorYear);
    if (bucket) bucket.push(point);
    else byAnchorYear.set(point.anchorYear, [point]);
  }

  const sums: number[] = [];
  let yearsWithUsableWindow = 0;
  for (const points of byAnchorYear.values()) {
    points.sort((a, b) => a.date.localeCompare(b.date));
    let contributed = false;
    for (let i = 0; i + n <= points.length; i++) {
      const window = points.slice(i, i + n);
      if (!isConsecutiveDays(window)) continue;
      sums.push(window.reduce((sum, p) => sum + p.value, 0));
      contributed = true;
    }
    if (contributed) yearsWithUsableWindow += 1;
  }

  sums.sort((a, b) => a - b);
  return { sums, yearsWithUsableWindow };
}

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function isConsecutiveDays(window: DatedValue[]): boolean {
  for (let i = 1; i < window.length; i++) {
    const prev = Date.parse(`${window[i - 1].date}T00:00:00Z`);
    const curr = Date.parse(`${window[i].date}T00:00:00Z`);
    if (curr - prev !== ONE_DAY_MS) return false;
  }
  return true;
}

/**
 * Turn one Open-Meteo daily-archive response into DatedValue samples,
 * dropping any day whose value is missing or non-numeric instead of
 * fabricating one. Pulled out of openMeteoFetcher.ts's fetch call so it's
 * a pure function scripts can test directly.
 *
 * The bug this guards against: `Number(null) === 0` and
 * `Number.isFinite(0)` is true, so a naive `Number(raw[i])` silently
 * turned a day Open-Meteo has no data for into a real observed zero.
 * `typeof v !== 'number'` rejects null/undefined/strings before any
 * coercion happens, so only a value that was already a genuine JSON
 * number survives — including a genuine 0.
 */
export function parseDailySeries(anchorYear: number, dates: string[], raw: unknown[]): DatedValue[] {
  const out: DatedValue[] = [];
  for (let i = 0; i < dates.length; i++) {
    const v = raw[i];
    if (typeof v !== 'number' || !Number.isFinite(v)) continue;
    out.push({ anchorYear, date: dates[i], value: v });
  }
  return out;
}

/**
 * Sum exactly `expectedDays` consecutive calendar days starting at
 * `expectedStartDate`, or refuse. Used for a recent historical window
 * (past days from the archive) and a forecast window (future days) alike
 * — "complete" means the same thing either way.
 *
 * A count-and-numeric check alone isn't enough (that was the previous
 * version of this function): a response with the right number of
 * non-null values doesn't prove they're the requested consecutive run.
 * Open-Meteo's own date array (`daily.time`) can disagree with what was
 * asked for — a shifted archive window, a provider bug, or (for the
 * forecast side) a request that landed on a stale served-from-cache
 * response — and none of that shows up if only the value count is
 * checked. This validates dates[i] against the expected date for every
 * position before trusting any value.
 */
export function sumIfComplete(
  dates: string[],
  raw: unknown[],
  expectedStartDate: string,
  expectedDays: number
): { sum: number; complete: boolean } {
  const values = extractCompleteWindow(dates, raw, expectedStartDate, expectedDays);
  if (!values) return { sum: 0, complete: false };
  return { sum: values.reduce((a, b) => a + b, 0), complete: true };
}

/**
 * Same validation as sumIfComplete, but returns the actual values instead
 * of a sum — for callers that need an average, a max, or any other
 * reduction over the window (heat_stress_window's 7-day average,
 * heavy_rain_event's wettest day). Added Lote 1 (2026-09-22): both of
 * those evaluators used to average/max over whatever the forecast
 * happened to return, with no completeness check at all — a partial
 * response could neither be trusted to contain the actual peak/average
 * nor be read as "nothing crossed", so it must throw, not silently
 * degrade. `sumIfComplete` above is now a thin wrapper over this.
 */
export function extractCompleteWindow(
  dates: string[],
  raw: unknown[],
  expectedStartDate: string,
  expectedDays: number
): number[] | null {
  if (dates.length !== expectedDays || raw.length !== expectedDays) {
    return null;
  }
  const values: number[] = [];
  for (let i = 0; i < expectedDays; i++) {
    if (dates[i] !== addDaysISO(expectedStartDate, i)) return null;
    const v = raw[i];
    if (typeof v !== 'number' || !Number.isFinite(v)) return null;
    values.push(v);
  }
  return values;
}

/** Add `days` (may be negative) to an ISO yyyy-mm-dd date string, in UTC. */
export function addDaysISO(expectedStartDate: string, days: number): string {
  const d = new Date(`${expectedStartDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
