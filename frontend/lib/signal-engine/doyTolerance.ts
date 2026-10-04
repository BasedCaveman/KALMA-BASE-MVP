// kalma/frontend/lib/signal-engine/doyTolerance.ts
//
// Shared by cache.ts (historical_cache) and seriesCache.ts
// (historical_series_cache). Both cache a row keyed by doy_center, which
// advances every day — an exact-match read has a zero hit rate by
// construction (see cache.ts's header for the measured 2026-09-18 numbers).
// Both readers accept a row centred within DOY_TOLERANCE days of the
// request instead. Extracted here so the two tables share one tolerance
// value and one distance calculation instead of two copies drifting apart.

/** How far the centre of a cached window may sit from the requested DOY. */
export const DOY_TOLERANCE = 3;

// Fixed at 366, not 365, so wrapping is uniform and doesn't need to know
// whether any particular year was a leap year — dayOfYearUTC() can return
// 366, and this is a soft cache-reuse heuristic (a few days of tolerance),
// not an exact climate boundary. Consequence, accepted: a leap year's
// Dec 31 (366) and a non-leap year's Dec 31 (365) are one day apart
// instead of identical, which still matches at DOY_TOLERANCE >= 1.
//
// Previously this wrapped via `Math.min(doy, 365) ...`, which folded DOY
// 366 onto 365 but ALSO clamped every value above 365 to exactly 365 —
// so arithmetic overflow near year-end (e.g. doyCenter 364 + tolerance 3
// = 367) collapsed to 365 instead of wrapping to 1, and candidateDoys()
// could never generate the low DOYs (1, 2, 3...) that doyDistance() itself
// considered nearby. Reproduced 2026-09-21: candidateDoys(364) omitted 1
// even though doyDistance(364, 1) reported a small distance.
const DAYS_IN_YEAR = 366;

/** Wrap any integer day-of-year onto 1..366, cycling in both directions. */
export function wrapDoy(doy: number): number {
  return ((((doy - 1) % DAYS_IN_YEAR) + DAYS_IN_YEAR) % DAYS_IN_YEAR) + 1;
}

/** Acceptable window centres for a request, including across New Year. */
export function candidateDoys(doyCenter: number, tolerance: number = DOY_TOLERANCE): number[] {
  const out = [wrapDoy(doyCenter)];
  for (let d = 1; d <= tolerance; d += 1) {
    out.push(wrapDoy(doyCenter - d), wrapDoy(doyCenter + d));
  }
  return [...new Set(out)];
}

/** Distance between two DOYs the short way round the year. */
export function doyDistance(a: number, b: number): number {
  const raw = Math.abs(wrapDoy(a) - wrapDoy(b));
  return Math.min(raw, DAYS_IN_YEAR - raw);
}
