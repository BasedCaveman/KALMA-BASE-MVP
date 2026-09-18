// kalma/frontend/hooks/useFavorites.ts
//
// Favorite/followed places. Guests use localStorage; connected users hydrate
// from the server-side follow_places graph, with localStorage kept as a
// same-device fallback and migration source.
//
// Stored as a flat array of place slugs at the V1 storage key.

'use client';

import { useCallback, useEffect, useState } from 'react';
import { authFetch } from '@/lib/social/auth-fetch';
import { useAccount } from '@/hooks/useWallet';

const STORAGE_KEY = 'kalma-favorites-v1';

// Cross-tab + cross-component event so multiple instances of the hook
// stay in sync within the same tab without React context boilerplate.
const CHANGE_EVENT = 'kalma:favorites-changed';

function readFavorites(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((v): v is string => typeof v === 'string')
      : [];
  } catch {
    return [];
  }
}

function writeFavorites(next: string[]) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    // Broadcast so other components in the same tab re-read.
    window.dispatchEvent(new Event(CHANGE_EVENT));
  } catch {
    // ignore quota / privacy-mode write failures
  }
}

export function useFavorites() {
  const { address } = useAccount();
  const [favorites, setFavorites] = useState<string[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    // Initial read after mount — avoids SSR/CSR mismatch.
    setFavorites(readFavorites());
    setHydrated(true);

    const onChange = () => setFavorites(readFavorites());

    // Same-tab updates (our custom event).
    window.addEventListener(CHANGE_EVENT, onChange);
    // Cross-tab updates (browser fires `storage` for OTHER tabs).
    window.addEventListener('storage', onChange);

    return () => {
      window.removeEventListener(CHANGE_EVENT, onChange);
      window.removeEventListener('storage', onChange);
    };
  }, []);

  useEffect(() => {
    if (!address) return;

    let cancelled = false;
    const walletAddress = address;

    async function loadRemote() {
      const local = readFavorites();
      if (local.length > 0) {
        await authFetch('/api/follows/places', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ address: walletAddress, action: 'sync', slugs: local }),
        }).catch(() => null);
      }

      const response = await authFetch(`/api/follows/places?address=${encodeURIComponent(walletAddress)}`, {
        headers: { accept: 'application/json' },
      }).catch(() => null);
      const payload = await response?.json().catch(() => null);
      if (cancelled || !response?.ok) return;

      const remote = Array.isArray(payload?.slugs)
        ? payload.slugs.filter((slug: unknown): slug is string => typeof slug === 'string')
        : [];
      setFavorites(remote);
      writeFavorites(remote);
    }

    void loadRemote();
    return () => {
      cancelled = true;
    };
  }, [address]);

  const isFavorited = useCallback(
    (slug: string) => favorites.includes(slug),
    [favorites],
  );

  const toggle = useCallback((slug: string) => {
    const current = readFavorites();
    const active = current.includes(slug);
    const next = active
      ? current.filter((s) => s !== slug)
      : [...current, slug];
    writeFavorites(next);
    setFavorites(next);
    if (address) {
      void authFetch('/api/follows/places', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ address, slug, action: active ? 'unfollow' : 'follow' }),
      }).catch(() => null);
    }
  }, [address]);

  const add = useCallback((slug: string) => {
    const current = readFavorites();
    if (current.includes(slug)) return;
    const next = [...current, slug];
    writeFavorites(next);
    setFavorites(next);
    if (address) {
      void authFetch('/api/follows/places', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ address, slug, action: 'follow' }),
      }).catch(() => null);
    }
  }, [address]);

  const remove = useCallback((slug: string) => {
    const current = readFavorites();
    if (!current.includes(slug)) return;
    const next = current.filter((s) => s !== slug);
    writeFavorites(next);
    setFavorites(next);
    if (address) {
      void authFetch('/api/follows/places', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ address, slug, action: 'unfollow' }),
      }).catch(() => null);
    }
  }, [address]);

  return { favorites, isFavorited, toggle, add, remove, hydrated };
}
