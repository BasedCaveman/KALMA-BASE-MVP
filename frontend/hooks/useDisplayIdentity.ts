//kalma/frontend/hooks/useDisplayIdentity.ts
'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAccount } from '@/hooks/useWallet';
import { usePrivy } from '@privy-io/react-auth';
import { createPublicClient, http } from 'viem';
import { mainnet } from 'viem/chains';
import { getStoredProfileIdentity } from '@/lib/identity/profileIdentityStorage';
import { resolveDisplayIdentity, shortenAddress } from '@/lib/identity/resolveDisplayIdentity';
import type { DisplayIdentity, ResolvedIdentity, StoredProfileIdentity } from '@/lib/identity/types';

// ── ENS: standalone mainnet client (ENS always resolves from L1) ──────────────
// Kept separate from wagmi/Privy so it never interferes with Base Sepolia config.
const ensClient = createPublicClient({
  chain: mainnet,
  // llamarpc supports CCIP-Read gateways required by viem ENS resolution
  transport: http('https://eth.llamarpc.com'),
});

// ── Cache (localStorage, 10-min TTL) ─────────────────────────────────────────
// v2 keys — bumped to clear any null entries cached when CSP was blocking requests
const ENS_CACHE_KEY  = 'kalma-ens-name-v2';
const MEGA_CACHE_KEY = 'kalma-mega-name-v2';
const CACHE_TTL_MS   = 10 * 60 * 1000;

type CacheEntry = { name: string | null; ts: number };

function readCache(key: string, address: string): string | null | undefined {
  // undefined = not cached; null = confirmed no name; string = found
  if (typeof window === 'undefined') return undefined;
  try {
    const map = JSON.parse(localStorage.getItem(key) ?? '{}') as Record<string, CacheEntry>;
    const entry = map[address.toLowerCase()];
    if (!entry || Date.now() - entry.ts > CACHE_TTL_MS) return undefined;
    return entry.name;
  } catch { return undefined; }
}

function writeCache(key: string, address: string, name: string | null) {
  // Only cache positive results — don't cache null so failed requests retry next load
  if (name === null) return;
  if (typeof window === 'undefined') return;
  try {
    const map = JSON.parse(localStorage.getItem(key) ?? '{}') as Record<string, CacheEntry>;
    map[address.toLowerCase()] = { name, ts: Date.now() };
    localStorage.setItem(key, JSON.stringify(map));
  } catch {}
}

// ── Resolvers ─────────────────────────────────────────────────────────────────

async function fetchEnsName(address: `0x${string}`): Promise<string | null> {
  try {
    const name = await ensClient.getEnsName({ address });
    return name ?? null;
  } catch {
    return null;
  }
}

async function fetchMegaName(address: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://api.dotmega.domains/resolve?address=${address}`,
      { signal: AbortSignal.timeout(5000) }
    );
    if (!res.ok) return null;
    const json = await res.json();
    return (typeof json?.name === 'string' && json.name) ? json.name : null;
  } catch {
    return null;
  }
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useDisplayIdentity(): {
  identity: DisplayIdentity | null;
  profileIdentity: StoredProfileIdentity | null;
  resolvedIdentity: ResolvedIdentity | null;
  socialName: string | null;
  authProvider: string | null;
  megaName: string | null;
  ensName: string | null;
} {
  const { address } = useAccount();
  const { user } = usePrivy();
  const [megaName, setMegaName] = useState<string | null>(null);
  const [ensName,  setEnsName]  = useState<string | null>(null);

  useEffect(() => {
    if (!address) {
      setMegaName(null);
      setEnsName(null);
      return;
    }

    let cancelled = false;

    // .mega — check cache, else fetch
    const cachedMega = readCache(MEGA_CACHE_KEY, address);
    if (cachedMega !== undefined) {
      setMegaName(cachedMega);
    } else {
      fetchMegaName(address).then((name) => {
        if (cancelled) return;
        writeCache(MEGA_CACHE_KEY, address, name);
        setMegaName(name);
      });
    }

    // ENS — check cache, else fetch
    const cachedEns = readCache(ENS_CACHE_KEY, address);
    if (cachedEns !== undefined) {
      setEnsName(cachedEns);
    } else {
      fetchEnsName(address).then((name) => {
        if (cancelled) return;
        writeCache(ENS_CACHE_KEY, address, name);
        setEnsName(name);
      });
    }

    return () => { cancelled = true; };
  }, [address]);

  return useMemo(() => {
    if (!address) {
      return {
        identity: null,
        profileIdentity: null,
        resolvedIdentity: null,
        socialName: null,
        authProvider: null,
        megaName: null,
        ensName: null,
      };
    }

    const linkedAccounts = user?.linkedAccounts ?? [];
    const xAccount = linkedAccounts.find((item) => item.type === 'twitter_oauth');
    const instagramAccount = linkedAccounts.find((item) => item.type === 'instagram_oauth');
    const farcasterAccount = linkedAccounts.find((item) => item.type === 'farcaster');
    const googleAccount = linkedAccounts.find((item) => item.type === 'google_oauth');
    const appleAccount = linkedAccounts.find((item) => item.type === 'apple_oauth');

    const socialName: string | null =
      xAccount?.type === 'twitter_oauth'
        ? xAccount.username ?? xAccount.name ?? null
        : instagramAccount?.type === 'instagram_oauth'
          ? instagramAccount.username ?? null
          : farcasterAccount?.type === 'farcaster'
            ? farcasterAccount.username ?? farcasterAccount.displayName ?? null
            : googleAccount?.type === 'google_oauth'
              ? googleAccount.name ?? googleAccount.email ?? null
              : appleAccount?.type === 'apple_oauth'
                ? appleAccount.email ?? null
                : null;

    const authProvider: string | null =
      xAccount?.type === 'twitter_oauth'
        ? 'x'
        : instagramAccount?.type === 'instagram_oauth'
          ? 'instagram'
          : farcasterAccount?.type === 'farcaster'
            ? 'farcaster'
            : googleAccount?.type === 'google_oauth'
              ? 'google'
              : appleAccount?.type === 'apple_oauth'
                ? 'apple'
                : null;

    // Priority: custom → .mega → ENS → social → address
    const autoName   = megaName ?? ensName ?? socialName;
    const autoSource = megaName   ? 'Base Sepolia_name'
                     : ensName    ? 'ens'
                     : socialName ? ('social' as any)
                     : null;

    const resolvedIdentity: ResolvedIdentity | null = autoName && autoSource
      ? { address, resolvedName: autoName, source: autoSource, avatarUrl: null, bio: null }
      : null;

    const profileIdentity = getStoredProfileIdentity(address);
    const identity = resolveDisplayIdentity({ address, profile: profileIdentity, resolved: resolvedIdentity });

    return { identity, profileIdentity, resolvedIdentity, socialName, authProvider, megaName, ensName };
  }, [address, megaName, ensName, user?.linkedAccounts]);
}

export { shortenAddress };
