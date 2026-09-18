//kalma/frontend/lib/server/privy-auth.ts
//
// Server-side Privy auth for wallet-scoped API routes (audit H-1).
//
// Every social/preferences route used to trust the `address` field in the
// request body/query — anyone could impersonate any wallet (profile takeover,
// feed impersonation, moderation hijack). Now the client must send its Privy
// access token as `Authorization: Bearer <token>`; we verify the token,
// resolve the Privy user's linked wallets, and reject when the claimed
// address is not one of them.
//
// Env:
//   NEXT_PUBLIC_PRIVY_APP_ID — already set (client uses it too)
//   PRIVY_APP_SECRET         — server-only, from dashboard.privy.io → App settings
//
// Fail-closed in production: if PRIVY_APP_SECRET is missing, wallet-scoped
// writes return 500 rather than silently reverting to the spoofable posture.
// In development the check is skipped with a console warning so local work
// doesn't require the secret.

import type { NextRequest } from 'next/server';
import { PrivyClient } from '@privy-io/node';

const APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? '';
const APP_SECRET = process.env.PRIVY_APP_SECRET ?? '';

let client: PrivyClient | null = null;
function getPrivyClient() {
  if (!APP_ID || !APP_SECRET) return null;
  if (!client) client = new PrivyClient({ appId: APP_ID, appSecret: APP_SECRET });
  return client;
}

// userId → { addresses, expires } — avoids a Privy API round trip per request.
const WALLET_CACHE_TTL_MS = 5 * 60 * 1000;
const walletCache = new Map<string, { addresses: Set<string>; expires: number }>();

async function getLinkedWallets(privy: PrivyClient, userId: string): Promise<Set<string>> {
  const cached = walletCache.get(userId);
  if (cached && cached.expires > Date.now()) return cached.addresses;

  const user = await privy.users()._get(userId);
  const addresses = new Set<string>();
  for (const account of user.linked_accounts ?? []) {
    const address = (account as { address?: string }).address;
    if (account.type === 'wallet' && typeof address === 'string') {
      addresses.add(address.toLowerCase());
    }
  }
  if (walletCache.size > 5000) walletCache.clear();
  walletCache.set(userId, { addresses, expires: Date.now() + WALLET_CACHE_TTL_MS });
  return addresses;
}

export type WalletAuthResult =
  | { ok: true }
  | { ok: false; status: number; error: string; message: string };

/**
 * Verify that the request's Privy access token belongs to a user who controls
 * `claimedAddress` (lowercase 0x wallet). Call AFTER validating the address shape.
 */
export async function requireWalletAuth(
  req: NextRequest,
  claimedAddress: string,
): Promise<WalletAuthResult> {
  const privy = getPrivyClient();
  if (!privy) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[privy-auth] PRIVY_APP_SECRET not set — skipping wallet auth (dev only).');
      return { ok: true };
    }
    return { ok: false, status: 500, error: 'auth_misconfigured', message: 'Something went wrong on our end. Try again shortly.' };
  }

  const header = req.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) {
    // English fallback only, for any API consumer that doesn't map `error`
    // to its own localised copy. Plain language on purpose (CLAUDE.md Golden
    // Rule 1, blockchain invisible): no "auth token", this is the string a
    // few call sites still show verbatim.
    return { ok: false, status: 401, error: 'unauthenticated', message: 'You are not signed in. Sign in and try again.' };
  }

  let userId: string;
  try {
    const claims = await privy.utils().auth().verifyAccessToken(token);
    userId = claims.user_id;
  } catch {
    return { ok: false, status: 401, error: 'bad_token', message: 'Your sign-in expired. Sign in again.' };
  }

  try {
    const wallets = await getLinkedWallets(privy, userId);
    if (!wallets.has(claimedAddress.toLowerCase())) {
      return { ok: false, status: 403, error: 'wallet_mismatch', message: 'This account does not match. Sign in again.' };
    }
  } catch {
    return { ok: false, status: 502, error: 'auth_lookup_failed', message: 'Could not confirm your sign-in. Try again in a moment.' };
  }

  return { ok: true };
}
