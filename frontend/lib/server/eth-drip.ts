// Policy only: no keys, RPC or database access. Existing ledger schema retained.
export type DripRow = { status: string; tx_hash: string | null };
export type DripResult = { status: number; body: Record<string, string> };
export class DripConfigurationError extends Error {
  constructor(public code: string, message: string) { super(message); }
}
export interface DripDependencies {
  preflight(): Promise<void>;
  reserve(): Promise<DripRow | null>;
  existing(): Promise<DripRow | null>;
  save(status: string, hash: string | null): Promise<void>;
  send(): Promise<`0x${string}`>;
  wait(hash: `0x${string}`): Promise<'success' | 'reverted'>;
  receipt(hash: `0x${string}`): Promise<'success' | 'reverted' | null>;
}
const recovery = (): DripResult => ({ status: 409, body: {
  error: 'drip_recovery_required', message: 'Your test account needs a support check before another attempt.',
} });
// Existing clients treat any 2xx as ready and would attempt a cash claim.
const pending = (hash?: string): DripResult => ({ status: 409, body: {
  error: 'drip_pending', status: 'pending', message: 'Your test account is still being prepared. Please check again shortly.', ...(hash ? { txHash: hash } : {}),
} });

export async function prepareEthDrip(deps: DripDependencies): Promise<DripResult> {
  // Owner/network/simulation checks happen before reserving or changing any row.
  await deps.preflight();
  const reserved = await deps.reserve();
  if (!reserved) {
    const row = await deps.existing();
    if (!row) return recovery();
    if (row.status === 'sent' && row.tx_hash) return {
      status: 200, body: { status: 'already_requested', txHash: row.tx_hash },
    };
    if (row.status === 'pending' && !row.tx_hash) return pending();
    if (row.status === 'pending' && row.tx_hash) {
      const hash = row.tx_hash as `0x${string}`;
      const receipt = await deps.receipt(hash);
      if (!receipt) return pending(hash);
      if (receipt === 'reverted') {
        await deps.save('failed_reverted', hash);
        return recovery();
      }
      await deps.save('sent', hash);
      return { status: 200, body: { status: 'sent', txHash: hash } };
    }
    // Legacy `failed` can mean broadcast succeeded but receipt/ledger failed.
    // Never reuse it automatically, even when tx_hash is null.
    return recovery();
  }
  let hash: `0x${string}` | undefined;
  try {
    hash = await deps.send();
    // Persist immediately after submission, BEFORE receipt waiting.
    await deps.save('pending', hash);
    const receipt = await deps.wait(hash);
    if (receipt === 'reverted') {
      await deps.save('failed_reverted', hash);
      return recovery();
    }
    await deps.save('sent', hash);
    return { status: 200, body: { status: 'sent', txHash: hash } };
  } catch {
    // RPC timeouts can happen after broadcast. Do not label them retryable.
    // If even this save fails, the original pending reservation still blocks.
    try { await deps.save(hash ? 'pending' : 'submission_unknown', hash ?? null); } catch { /* fail closed */ }
    return hash ? pending(hash) : {
      status: 502, body: { error: 'drip_submission_unknown', message: 'Could not confirm test account preparation. A support check is needed before retrying.' },
    };
  }
}
