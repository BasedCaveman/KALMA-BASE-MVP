// kalma/frontend/lib/signal-engine/brief-track-record.ts
//
// Per-place verification track record derived from place_briefs.
//
// HONESTY CONTRACT (mirrors lib/signal-engine/brief.ts + the migration):
// brief verification is *directional* ("was the recorded day above / near /
// below the place's baseline?") and is explicitly NOT a forecast pass/fail
// grade. So this module deliberately computes a COVERAGE / TRACK-RECORD
// signal, never an "accuracy" or "% correct" number:
//   - how many of the last N days have a brief that has been checked against
//     recorded weather (the dated, self-checked public memory a prediction
//     market lacks);
//   - the directional distribution of those checks, labeled as a description
//     of the weather vs the local baseline, not as Kalma being "right".
// Any consumer copy must keep that framing. `note` carries the caveat so the
// JSON feed can't be quoted as a scorecard.

import type { SupabaseClient } from '@supabase/supabase-js';

export type VerdictBreakdown = {
  above_baseline: number;
  near_baseline: number;
  below_baseline: number;
};

export type BriefTrackRecord = {
  /** Rolling window used, in days. */
  window_days: number;
  /** Briefs recorded in the window (verified or not). */
  briefs_total: number;
  /** Briefs in the window that have been checked against recorded weather. */
  briefs_verified: number;
  /** Total directional signal-day checks across the verified briefs. */
  signal_days_checked: number;
  /** Directional distribution of those checks vs the local baseline. */
  verdicts: VerdictBreakdown;
  /** Most recent verified brief date in the window (YYYY-MM-DD), or null. */
  latest_verified_date: string | null;
  /** Honesty caveat, carried into any machine feed. */
  note: string;
};

export const TRACK_RECORD_NOTE =
  'Directional coverage, not a forecast accuracy grade: each check reports ' +
  'whether the recorded day ran above, near, or below the place’s historical ' +
  'baseline. It measures that Kalma checks its own record daily, not that a ' +
  'prediction was “right”.';

/** Minimal shape we read from place_briefs. */
type TrackRow = {
  brief_date: string;
  verified_at: string | null;
  verification: { checks?: Array<{ verdict?: string }> } | null;
};

function utcDaysAgo(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

/**
 * Reduce a set of brief rows into a track record. Pure (no I/O), so it is
 * unit-testable and reusable by both the SSR page and the JSON feed.
 */
export function reduceTrackRecord(
  rows: TrackRow[],
  windowDays: number,
): BriefTrackRecord {
  const verdicts: VerdictBreakdown = {
    above_baseline: 0,
    near_baseline: 0,
    below_baseline: 0,
  };
  let briefsVerified = 0;
  let signalDaysChecked = 0;
  let latestVerified: string | null = null;

  for (const row of rows) {
    if (!row.verified_at) continue;
    briefsVerified += 1;
    if (!latestVerified || row.brief_date > latestVerified) {
      latestVerified = row.brief_date;
    }
    const checks = row.verification?.checks ?? [];
    for (const c of checks) {
      if (c.verdict === 'above_baseline') verdicts.above_baseline += 1;
      else if (c.verdict === 'near_baseline') verdicts.near_baseline += 1;
      else if (c.verdict === 'below_baseline') verdicts.below_baseline += 1;
      else continue;
      signalDaysChecked += 1;
    }
  }

  return {
    window_days: windowDays,
    briefs_total: rows.length,
    briefs_verified: briefsVerified,
    signal_days_checked: signalDaysChecked,
    verdicts,
    latest_verified_date: latestVerified,
    note: TRACK_RECORD_NOTE,
  };
}

/**
 * Compute the rolling verification track record for one place. Anon-readable
 * (place_briefs has a public-read policy). Returns a zeroed record on error
 * or when the place has no briefs yet. The surface treats "no track record"
 * as "nothing to show", never an error box.
 */
export async function computeTrackRecord(
  supabase: SupabaseClient,
  placeId: string,
  windowDays = 30,
): Promise<BriefTrackRecord> {
  const since = utcDaysAgo(windowDays);
  const { data, error } = await supabase
    .from('place_briefs')
    .select('brief_date, verified_at, verification')
    .eq('place_id', placeId)
    .gte('brief_date', since)
    .order('brief_date', { ascending: false });

  if (error) {
    console.error('[track-record] fetch error:', error.message);
    return reduceTrackRecord([], windowDays);
  }
  return reduceTrackRecord((data ?? []) as TrackRow[], windowDays);
}
