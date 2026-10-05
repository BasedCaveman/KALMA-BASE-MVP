// kalma/frontend/lib/signal-engine/cronDecision.ts
//
// The one decision app/api/cron/signal-engine/route.ts makes per (place,
// signal type): what to do to local_signals given what evaluateSignal()
// returned. Pulled out of the route so it's testable without a live
// Supabase connection or the Next.js request/response machinery — see
// scripts/test-cron-decision.mjs, which is the test the review
// 2026-09-21 (fourth round) asked for: confirm insufficiency preserves
// an existing active signal (no write at all, so its valid_until is
// never touched), and only a real "evaluated fully, nothing crossed"
// outcome supersedes it.
//
// evaluate/refineGroups/upsert are injected rather than imported so this
// module has no dependency on the concrete evaluator/activity-profile
// implementations — the test can substitute a scripted `evaluate` that
// throws or returns null on command, without loading the real (network-
// calling) evaluator.ts.

import type { SupabaseClient } from '@supabase/supabase-js';
import { InsufficientDataError, type Place, type SignalTypeDef, type CandidateSignal } from './evaluator';

export type SignalOutcome =
  | { kind: 'created' }
  | { kind: 'updated' }
  | { kind: 'skipped_duplicate' }
  /** evaluateSignal() returned null: evaluated fully, nothing crossed.
   *  The only outcome that supersedes an existing active row. */
  | { kind: 'no_crossing'; supersededCount: number }
  /** evaluateSignal() threw InsufficientDataError: could not evaluate.
   *  Deliberately makes NO write to local_signals — an existing active
   *  row (and its valid_until) is left exactly as it was. */
  | { kind: 'insufficient_data'; message: string }
  /** Any other thrown error (network, parse, etc.) — also no write. */
  | { kind: 'error'; message: string };

export interface CronDecisionDeps {
  evaluate: (supabase: SupabaseClient, place: Place, signalType: SignalTypeDef) => Promise<CandidateSignal | null>;
  refineGroups: (candidate: CandidateSignal, signalType: SignalTypeDef) => void;
  upsert: (supabase: SupabaseClient, candidate: CandidateSignal) => Promise<'created' | 'updated' | 'unchanged'>;
}

export async function decideAndApply(
  supabase: SupabaseClient,
  place: Place,
  signalType: SignalTypeDef,
  deps: CronDecisionDeps
): Promise<SignalOutcome> {
  try {
    const candidate = await deps.evaluate(supabase, place, signalType);
    if (!candidate) {
      // "No longer fires" cleanup (Lima water_recovery case): supersede a
      // still-active row whose firing conditions have stopped holding.
      // Only reachable when evaluate() returned null, i.e. it fully
      // evaluated the trigger and nothing crossed.
      const { data: stale, error: supersedeError } = await supabase
        .from('local_signals')
        .update({ status: 'superseded' })
        .eq('place_id', place.id)
        .eq('signal_type_id', signalType.id)
        .eq('status', 'active')
        .select('id');
      // A failed write must not be reported as "nothing was active to
      // supersede" — review 2026-09-21 (fifth round) reproduced this:
      // `stale` comes back null on a DB error, and `stale?.length ?? 0`
      // silently read as supersededCount: 0, indistinguishable from a
      // genuine no-op. Surface it as an error instead.
      if (supersedeError) {
        return { kind: 'error', message: supersedeError.message };
      }
      return { kind: 'no_crossing', supersededCount: stale?.length ?? 0 };
    }

    deps.refineGroups(candidate, signalType);
    const result = await deps.upsert(supabase, candidate);
    return result === 'created' ? { kind: 'created' } : result === 'updated' ? { kind: 'updated' } : { kind: 'skipped_duplicate' }; // 'unchanged'
  } catch (e) {
    if (e instanceof InsufficientDataError) {
      return { kind: 'insufficient_data', message: e.message };
    }
    return { kind: 'error', message: e instanceof Error ? e.message : String(e) };
  }
}
