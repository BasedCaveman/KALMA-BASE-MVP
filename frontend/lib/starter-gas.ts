// Shared across hook instances so mounting two surfaces cannot duplicate POSTs.
const preparations = new Map<string, Promise<void>>();
export const STARTER_GAS_MIN_BALANCE = 5_000_000_000_000n;
type Result = { ok: boolean; error?: string; message?: string; txHash?: `0x${string}` };
export type StarterGasDependencies = {
  balance(): Promise<bigint>;
  request(): Promise<Result>;
  receipt(hash: `0x${string}`): Promise<void>;
  pause(): Promise<void>;
};

export function prepareStarterGas(address: string, deps: StarterGasDependencies): Promise<void> {
  const key = address.toLowerCase();
  const existing = preparations.get(key);
  if (existing) return existing;
  const attempt = (async () => {
    if (await deps.balance() >= STARTER_GAS_MIN_BALANCE) return;
    for (let retry = 0; retry < 8; retry++) {
      const result = await deps.request();
      if (result.txHash && (result.ok || result.error === 'drip_pending')) {
        await deps.receipt(result.txHash);
        if (await deps.balance() >= STARTER_GAS_MIN_BALANCE) return;
        throw new Error('Your test account is still being prepared. Please check again shortly.');
      }
      if (result.ok) {
        if (await deps.balance() >= STARTER_GAS_MIN_BALANCE) return;
        throw new Error('Your test account needs a support check before another attempt.');
      }
      // Only explicit pending/busy and auth-readiness errors are retryable.
      // An ambiguous broadcast or recovery-required record must never resend.
      if (!['drip_signer_busy', 'drip_pending', 'unauthenticated', 'bad_token'].includes(result.error ?? ''))
        throw new Error(result.message || 'Could not prepare your test account.');
      await deps.pause();
      if (await deps.balance() >= STARTER_GAS_MIN_BALANCE) return;
    }
    throw new Error('Your test account is still being prepared. Please check again shortly.');
  })();
  preparations.set(key, attempt);
  void attempt.finally(() => { if (preparations.get(key) === attempt) preparations.delete(key); }).catch(() => undefined);
  return attempt;
}
