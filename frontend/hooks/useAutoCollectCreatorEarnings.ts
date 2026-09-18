//kalma/frontend/hooks/useAutoCollectCreatorEarnings.ts
//
// Auto-delivers creator earnings so a creator who never opens the
// CreatorEarningsPanel still gets paid. The contract's withdrawCreatorEarnings
// is creator-only (a keeper can't deliver it), so we trigger the creator's OWN
// wallet — but ONLY for embedded (Privy) wallets, where it signs silently
// (showWalletUIs:false) and gas is covered by the drip. Injected wallets would
// prompt per tx, so we never auto-fire for them (they use the panel's button).
//
// Runs at most once per address per browser session.

'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useReadContract, useReadContracts } from 'wagmi';
import { useWallets } from '@privy-io/react-auth';
import { useAccount } from '@/hooks/useWallet';
import { useWriteContract } from '@/hooks/useWriteContract';
import { CONTRACTS, climatePoolAbi } from '@/lib/contracts';

const MAX_PER_RUN = 2; // keep the on-open burst tiny; the rest collect next session or via the panel's "Collect all"

export function useAutoCollectCreatorEarnings() {
  const { address } = useAccount();
  const { wallets } = useWallets();
  const { writeContract } = useWriteContract();
  const ran = useRef<string | null>(null);

  // Only auto-collect for the embedded Privy wallet (silent + gasless). If we
  // can't positively confirm it's embedded, do nothing (the panel still works).
  const isEmbedded = useMemo(() => {
    if (!address) return false;
    const w = wallets.find((x) => x.address?.toLowerCase() === address.toLowerCase());
    return w?.walletClientType === 'privy';
  }, [wallets, address]);

  const enabled = !!address && isEmbedded;

  const { data: nextId } = useReadContract({
    address: CONTRACTS.CLIMATE_POOL,
    abi: climatePoolAbi,
    functionName: 'nextMarketId',
    query: { enabled },
  });
  const ids = useMemo(() => {
    const n = nextId ? Math.max(0, Number(nextId) - 1) : 0;
    return Array.from({ length: n }, (_, i) => BigInt(i + 1));
  }, [nextId]);

  const { data: statuses } = useReadContracts({
    contracts: ids.map((id) => ({
      address: CONTRACTS.CLIMATE_POOL,
      abi: climatePoolAbi,
      functionName: 'getMarketStatus' as const,
      args: [id],
    })),
    query: { enabled: enabled && ids.length > 0 },
  });

  useEffect(() => {
    if (!enabled || !address || !statuses) return;
    const key = address.toLowerCase();
    if (ran.current === key) return;

    const sessionKey = `kalma-auto-collect-${key}`;
    try {
      if (sessionStorage.getItem(sessionKey)) { ran.current = key; return; }
    } catch { /* sessionStorage unavailable — proceed once */ }

    // Find this creator's resolved, non-cancelled markets with a pending balance.
    const pending: bigint[] = [];
    for (let i = 0; i < ids.length; i++) {
      const st = statuses[i];
      if (st?.status !== 'success') continue;
      const [, , resolved, , creator, cancelled, creatorEarnings] =
        st.result as [bigint, bigint, boolean, boolean, string, boolean, bigint];
      if (cancelled || !resolved) continue;
      if (creator.toLowerCase() !== key) continue;
      if (creatorEarnings > 0n) pending.push(ids[i]);
    }

    // Mark done for this session regardless (avoid re-scanning every render).
    ran.current = key;
    try { sessionStorage.setItem(sessionKey, '1'); } catch { /* ignore */ }
    if (pending.length === 0) return;

    void (async () => {
      for (const id of pending.slice(0, MAX_PER_RUN)) {
        try {
          // Submit only (no receipt polling) — the browser RPC proxy is
          // same-origin on kalma.me and every poll counts toward the IP rate
          // limit. Space the txs so the on-open footprint stays a few requests.
          await writeContract({
            address: CONTRACTS.CLIMATE_POOL,
            abi: climatePoolAbi,
            functionName: 'withdrawCreatorEarnings',
            args: [id],
            waitForReceipt: false,
          });
          await new Promise((r) => setTimeout(r, 1500));
        } catch (e) {
          // Non-fatal: a slow/failed withdraw shouldn't break the others or the app.
          console.warn('[Kalma] auto-collect creator earnings failed for market', id.toString(), e instanceof Error ? e.message : e);
        }
      }
    })();
  }, [enabled, address, statuses, ids, writeContract]);
}
