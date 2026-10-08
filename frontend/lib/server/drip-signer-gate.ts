// Durable exclusion stored as a reserved row in eth_drip_claims, not a lease.
// Ambiguity must never free a signer nonce.
export type SignerLock = { token: string; tx_hash: string | null };
export interface SignerGateStore {
  read(): Promise<SignerLock | null>;
  acquire(token: string): Promise<boolean>;
  hash(token: string, hash: string): Promise<void>;
  release(token: string): Promise<void>;
}
export class SignerBusyError extends Error {}

export async function createSignerGate(store: SignerGateStore, token: string,
  receipt: (hash: `0x${string}`) => Promise<'success' | 'reverted' | null>) {
  // Recovery is safe only for a known mined transaction. Never steal by age.
  const previous = await store.read();
  if (previous?.tx_hash && await receipt(previous.tx_hash as `0x${string}`)) {
    await store.release(previous.token);
  }
  if (!await store.acquire(token)) throw new SignerBusyError('Signer is busy.');
  let attempted = false;
  let settled = false;
  return {
    async send(submit: () => Promise<`0x${string}`>) {
      if (attempted) throw new Error('Signer submission already attempted.');
      attempted = true; // Even a thrown RPC response can hide a broadcast.
      const hash = await submit();
      await store.hash(token, hash);
      return hash;
    },
    settled() { settled = true; },
    async close() {
      // SQL token fencing prevents an old worker freeing a new worker's lock.
      if (!attempted || settled) await store.release(token);
    },
  };
}
