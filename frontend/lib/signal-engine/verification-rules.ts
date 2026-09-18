// kalma/frontend/lib/signal-engine/verification-rules.ts
//
// When a directional check is worth recording, and what it says.
//
// Self-contained on purpose, zero imports, same reason as claim.ts: this rule
// has to be checkable by a test in plain Node, by the cron on Vercel and by
// the browser, without dragging a Supabase client behind it.

export type Verdict = 'above_baseline' | 'near_baseline' | 'below_baseline';

export function directionalVerdict(
  actual: number,
  baseline: number,
  nearBand: number,
): Verdict {
  if (Math.abs(actual - baseline) <= nearBand) return 'near_baseline';
  return actual > baseline ? 'above_baseline' : 'below_baseline';
}

/**
 * A directional check is only worth recording when all three verdicts can
 * actually happen.
 *
 * Precipitation and snowfall cannot go below zero. So when the baseline sits
 * at or under the near band, `below_baseline` is unreachable by physics: every
 * wet day reads "above the usual" and the check can look like a hit without
 * ever having been able to miss. That is a claim that cannot fail, which is
 * the one thing claim.ts and test:claims exist to forbid.
 *
 * Measured in production on 2026-09-13, over 14 days of stamped briefs: 450 of
 * 802 `above_baseline` rain checks sat on a zero baseline, and NOT ONE of the
 * 681 `below_baseline` checks did. Temperature, which has no floor at zero,
 * had none at all. That asymmetry is the fingerprint of the defect.
 *
 * Such a signal is not wrong and stays in the brief; it just stops being
 * offered as a verified check. The recorded actuals are stored either way, so
 * nothing measurable is lost, only a false appearance of having been right.
 *
 * `floor` is the metric's physical lower bound, or null when it has none
 * (temperature in °C goes negative, so every verdict stays reachable there).
 */
export function verdictSpaceIsDegenerate(
  baseline: number,
  nearBand: number,
  floor: number | null,
): boolean {
  return floor !== null && baseline - nearBand <= floor;
}

/** The near band for a rain baseline, in mm. */
export function rainNearBand(baselineMm: number): number {
  return Math.max(1, baselineMm * 0.2);
}
