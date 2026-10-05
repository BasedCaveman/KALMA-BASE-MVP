// kalma/frontend/lib/signal-engine/validity.ts

/**
 * Keep the published validity window stable while an active signal is being
 * re-evaluated. Evaluation refreshes evidence and severity; it must not turn
 * a signal into an endlessly extending forecast.
 */
export function effectiveValidUntil(input: {
  existingValidUntil?: string | null;
  candidateValidUntil: string;
  now?: Date;
}): string {
  const now = input.now ?? new Date();
  const existing = input.existingValidUntil ? new Date(input.existingValidUntil) : null;
  if (existing && Number.isFinite(existing.getTime()) && existing > now) {
    return existing.toISOString();
  }
  return new Date(input.candidateValidUntil).toISOString();
}

/**
 * The single definition of "currently valid" for a local_signals row, used
 * both at query time (buildValidityFilter, below) and for in-process
 * re-checks of rows already fetched (Phase B's brief→social consumption-time
 * recheck, the client-side open-tab expiry watchdog). Every reader of
 * local_signals across the app used to filter only on `status = 'active'`,
 * with no `valid_until` check anywhere — a row could sit stale for up to a
 * full cron cycle before the expire sweep (route.ts) caught up, and every
 * one of those readers would present it as current in the meantime. Found
 * and fixed 2026-09-22 (Lote 1, review item 2).
 *
 * Deliberately NOT exported for direct use as a Supabase filter — Postgres
 * does the comparison server-side via buildValidityFilter's three PostgREST
 * operators, not this function; this is for values already in hand.
 */
export function isCurrentlyValid(
  row: { status: string; valid_from: string; valid_until: string },
  now: Date = new Date()
): boolean {
  if (row.status !== 'active') return false;
  const from = new Date(row.valid_from).getTime();
  const until = new Date(row.valid_until).getTime();
  if (!Number.isFinite(from) || !Number.isFinite(until)) return false;
  return from <= now.getTime() && until > now.getTime();
}

/**
 * Applies isCurrentlyValid()'s exact definition as Supabase/PostgREST query
 * filters, so every local_signals reader uses the identical rule instead of
 * each hand-rolling its own `.eq('status', 'active')` (the bug this fixes).
 * `now` is injectable so tests can assert the boundary precisely.
 */
export function applyValidityFilter<Q extends { eq: Function; lte: Function; gt: Function }>(
  query: Q,
  now: Date = new Date()
): Q {
  const nowIso = now.toISOString();
  return query.eq('status', 'active').lte('valid_from', nowIso).gt('valid_until', nowIso) as Q;
}
