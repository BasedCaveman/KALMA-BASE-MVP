//frontend/lib/identity/types.ts
export type IdentitySource =
  | 'ens'
  | 'farcaster'
  | 'lens'
  | 'Base Sepolia_name'
  | 'manual'
  | 'address';

export type ResolvedIdentity = {
  address: `0x${string}`;
  resolvedName: string | null;
  source: Exclude<IdentitySource, 'manual'>;
  avatarUrl: string | null;
  bio: string | null;
};

export type StoredProfileIdentity = {
  address: `0x${string}`;
  displayNameOverride: string | null;
};

export type DisplayIdentity = {
  address: `0x${string}`;
  displayName: string;
  resolvedName: string | null;
  source: IdentitySource;
  avatarUrl: string | null;
  bio: string | null;
  shortenedAddress: string;
};
