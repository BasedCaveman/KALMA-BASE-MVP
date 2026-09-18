//frontend/lib/identity/profileIdentityStorage.ts
import type { StoredProfileIdentity } from './types';

const STORAGE_KEY = 'kalma-profile-identity-v1';

type IdentityMap = Record<string, StoredProfileIdentity>;

function safeRead(): IdentityMap {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as IdentityMap;
  } catch {
    return {};
  }
}

function safeWrite(data: IdentityMap) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // ignore storage errors
  }
}

export function getStoredProfileIdentity(
  address: `0x${string}`
): StoredProfileIdentity | null {
  const map = safeRead();
  return map[address.toLowerCase()] ?? null;
}

export function setStoredProfileDisplayName(
  address: `0x${string}`,
  displayNameOverride: string | null
) {
  const map = safeRead();
  const key = address.toLowerCase();

  map[key] = {
    address,
    displayNameOverride: displayNameOverride?.trim() || null,
  };

  safeWrite(map);
}

export function clearStoredProfileDisplayName(address: `0x${string}`) {
  const map = safeRead();
  delete map[address.toLowerCase()];
  safeWrite(map);
}
