//kalma/frontend/lib/social/auth-fetch.ts
//
// Client helper for wallet-scoped API calls (audit H-1). The server now
// verifies a Privy access token and checks the claimed wallet is linked to
// it, so every profile / observation / notification / follow / preference
// request must carry `Authorization: Bearer <token>`.

'use client';

import { getAccessToken } from '@privy-io/react-auth';

export async function withAuthHeaders(
  headers: Record<string, string> = {},
): Promise<Record<string, string>> {
  const token = await getAccessToken().catch(() => null);
  return token ? { ...headers, authorization: `Bearer ${token}` } : headers;
}

/** Drop-in replacement for fetch() that attaches the Privy access token. */
export async function authFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const headers = await withAuthHeaders((init.headers as Record<string, string>) ?? {});
  return fetch(input, { ...init, headers });
}
