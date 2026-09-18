// kalma/frontend/lib/wallet-errors.ts
//
// Wallet error classifier. Walks an error object (anything thrown by
// Privy, wagmi, or a wallet provider) and turns it into a small union of
// kinds the UI can branch on without parsing strings everywhere.
//
// The driving case: wallet/provider schema drift can surface as a
// Zod-flavoured wall of text instead of a user-readable recovery path:
//
//   "Validation failed with 1 error: – at `key.type`: Invalid union
//   value. – Expected 'p256' – Expected 'secp256k1' – Expected
//   'webauthnp256'"
//
// That message is actionable for us (revoke + re-grant the session
// permission) but useless to the user. Classifying once, here, lets
// every call-site render a human message and offer the right CTA.

export type WalletErrorKind =
  | 'stale_session_key' // wallet session permission needs refresh
  | 'wallet_timeout' // embedded wallet did not submit a transaction
  | 'user_cancelled' // user dismissed the wallet popup
  | 'insufficient_balance' // contract / wallet rejected for funds
  | 'network_mismatch' // wrong chain selected
  | 'unknown';

export type ClassifiedWalletError = {
  kind: WalletErrorKind;
  /** Original error message — kept so the user can copy-paste to support. */
  raw: string;
  /** Short, human-readable explanation for the UI. */
  friendly: string;
  /** Suggested CTA verb, when the UI wants to offer one. */
  action?: 'reset_session' | 'connect' | 'switch_network';
};

export function readWalletErrorMessage(err: unknown): string {
  if (!err) return '';
  if (typeof err === 'string') return err;
  if (err instanceof Error) {
    const parts = [err.message];
    const cause = (err as Error & { cause?: unknown }).cause;
    if (cause) parts.push(readWalletErrorMessage(cause));
    return parts.filter(Boolean).join('\n');
  }
  if (typeof err === 'object') {
    const e = err as Record<string, unknown>;
    if (typeof e.message === 'string') return e.message;
    if (typeof e.shortMessage === 'string') return e.shortMessage;
    if (typeof e.details === 'string') return e.details;
    if (typeof e.reason === 'string') return e.reason;
    if (typeof e.error === 'string') return e.error;
    if (e.error) return readWalletErrorMessage(e.error);
    if (e.cause) return readWalletErrorMessage(e.cause);
    try {
      return JSON.stringify(err, null, 2);
    } catch {
      return String(err);
    }
  }
  return String(err);
}

export function toWalletError(err: unknown, fallback = 'Something went wrong. Please try again.'): Error {
  if (err instanceof Error && err.message && err.message !== '[object Object]') return err;
  const message = readWalletErrorMessage(err);
  return new Error(message && message !== '[object Object]' ? message : fallback);
}

export function classifyWalletError(err: unknown): ClassifiedWalletError {
  const raw = readWalletErrorMessage(err);
  const lower = raw.toLowerCase();

  // ── Stale session key / provider schema drift ─────────────────────────
  // Match conservatively — we want "key.type" + at least two of the
  // three expected literals from the union so we don't catch unrelated
  // validation errors that happen to mention p256.
  const looksLikeKeyTypeError =
    lower.includes('key.type') &&
    (lower.includes('p256') ||
      lower.includes('secp256k1') ||
      lower.includes('webauthnp256')) &&
    (lower.includes('invalid union') || lower.includes('validation failed'));

  if (looksLikeKeyTypeError) {
    return {
      kind: 'stale_session_key',
      raw,
      friendly:
        'Your account session needs to be refreshed before this action can go through. This is a one-time reset — your funds stay in place.',
      action: 'reset_session',
    };
  }

  if (lower.includes('wallet request timed out before a transaction was submitted')) {
    return {
      kind: 'wallet_timeout',
      raw,
      friendly:
        'Your account took too long to respond. Refresh the page and try once more.',
    };
  }

  // ── User cancelled the wallet popup ───────────────────────────────────
  if (
    lower.includes('user rejected') ||
    lower.includes('user denied') ||
    lower.includes('cancelled by user') ||
    lower.includes('action_cancelled') ||
    lower.includes('user closed')
  ) {
    return {
      kind: 'user_cancelled',
      raw,
      friendly: 'Action cancelled. You can try again anytime.',
    };
  }

  // ── Insufficient balance / allowance ─────────────────────────────────
  if (
    lower.includes('insufficient funds') ||
    lower.includes('insufficient balance') ||
    lower.includes('exceeds balance')
  ) {
    return {
      kind: 'insufficient_balance',
      raw,
      friendly:
        'Not enough test funds for this action. Check your account balance on /profile.',
    };
  }

  // ── Wrong chain ──────────────────────────────────────────────────────
  if (
    lower.includes('chain mismatch') ||
    lower.includes('wrong network') ||
    lower.includes('unsupported chain')
  ) {
    return {
      kind: 'network_mismatch',
      raw,
      friendly:
        'Your account is on a different network. Switch to Base Sepolia Testnet (chain 6343) and try again.',
      action: 'switch_network',
    };
  }

  return {
    kind: 'unknown',
    raw,
    friendly: raw || 'Something went wrong. Please try again.',
  };
}
