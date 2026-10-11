import { CONTRACTS, CHAIN } from '@/lib/contracts';

const KEY = `kalma:pending-market-index:${CHAIN.id}:${CONTRACTS.CLIMATE_POOL.toLowerCase()}`;
const pending = new Set<number>();
const inFlight = new Map<number, Promise<Record<string, unknown>>>();
function storage() { try { return typeof window === 'undefined' ? null : window.localStorage; } catch { return null; } }
export function pendingMarketIndexes(): number[] {
  try {
    const saved = JSON.parse(storage()?.getItem(KEY) ?? '[]');
    if (Array.isArray(saved)) for (const id of saved) if (Number.isSafeInteger(id) && id > 0) pending.add(id);
  } catch { /* An invalid local queue never authorizes a write. */ }
  return [...pending];
}
function persist() { try { storage()?.setItem(KEY, JSON.stringify([...pending])); } catch { /* Session queue remains available. */ } }
export function queueMarketIndex(id: number) {
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error('Invalid market ID');
  pendingMarketIndexes(); pending.add(id); persist();
}
export function syncMarketIndex(id: number, request: typeof fetch = fetch, pause = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))) {
  queueMarketIndex(id);
  const existing = inFlight.get(id);
  if (existing) return existing;
  const task = (async () => {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await request(`/api/markets/${id}/refresh-snapshot`, { method: 'POST', signal: AbortSignal.timeout(25000) });
        const body = await response.json();
        if (!response.ok || body?.ok !== true || Number(body.row?.market_id) !== id || body.row?.pool_address?.toLowerCase() !== CONTRACTS.CLIMATE_POOL.toLowerCase()) throw new Error('Market confirmed on-chain, but listing synchronization is still pending.');
        pending.delete(id); persist();
        return body.row as Record<string, unknown>;
      } catch (error) {
        if (attempt === 2) throw error;
        await pause(1000 * (attempt + 1));
      }
    }
    throw new Error('Market listing synchronization is pending.');
  })().finally(() => inFlight.delete(id));
  inFlight.set(id, task);
  return task;
}
