//frontend/lib/identity/resolveDisplayIdentity.ts
import type {
  DisplayIdentity,
  IdentitySource,
  ResolvedIdentity,
  StoredProfileIdentity,
} from './types';

export function shortenAddress(address: `0x${string}`): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function cleanName(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function resolveDisplayIdentity(params: {
  address: `0x${string}`;
  profile: StoredProfileIdentity | null;
  resolved: ResolvedIdentity | null;
}): DisplayIdentity {
  const { address, profile, resolved } = params;

  const shortenedAddress = shortenAddress(address);
  const manualName = cleanName(profile?.displayNameOverride);
  const resolvedName = cleanName(resolved?.resolvedName);

  let displayName = shortenedAddress;
  let source: IdentitySource = 'address';

  if (manualName) {
    displayName = manualName;
    source = 'manual';
  } else if (resolvedName && resolved) {
    displayName = resolvedName;
    source = resolved.source;
  }

  return {
    address,
    displayName,
    resolvedName: resolvedName ?? null,
    source,
    avatarUrl: resolved?.avatarUrl ?? null,
    bio: resolved?.bio ?? null,
    shortenedAddress,
  };
}
