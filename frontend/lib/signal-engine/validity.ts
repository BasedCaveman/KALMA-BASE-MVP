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
