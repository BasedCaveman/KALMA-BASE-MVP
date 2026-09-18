// kalma/frontend/lib/privy.ts
//
// Privy auth configuration (replaces lib/reown.ts).
//
// Login priority (per product decision): passkey first, then social
// (Google / Apple), then external EVM wallet. Embedded wallets are created for
// users who sign in without one, so social/passkey users transparently get a
// Base Sepolia wallet. Order of methods in the modal is controlled in the Privy
// dashboard; `loginMethods` here just enables the allowed set.
//
// NOTE: passkey, Google and Apple must ALSO be enabled in the Privy dashboard
// (dashboard.privy.io → your app → Login methods), and the app's domains
// (kalma.me, the Vercel preview, localhost:3000) must be added as allowed
// origins.

import { type PrivyClientConfig } from '@privy-io/react-auth';
import { baseSepolia } from './chain';

export const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? '';

export const privyConfig: PrivyClientConfig = {
  // Apple removed for now: real "Sign in with Apple" needs a paid Apple
  // Developer account (Services ID + key), and the prior config broke (expired
  // client secret / redirect mismatch). Passkey gives Apple-device users a
  // native Face ID / Touch ID login for free; re-add 'apple' once the Apple
  // Developer OAuth is wired in the Privy dashboard.
  loginMethods: ['passkey', 'google', 'wallet'],
  appearance: {
    theme: 'dark',
    accentColor: '#5AAF72', // Kalma accent (matches darkPalette)
    walletChainType: 'ethereum-only',
    showWalletLoginFirst: false, // socials/passkey first, wallets after
  },
  embeddedWallets: {
    ethereum: {
      // create a Base Sepolia embedded wallet for passkey/social users who have
      // no external wallet linked
      createOnLogin: 'users-without-wallets',
    },
    // Frictionless / "signless" UX: hide Privy's per-transaction confirmation
    // modal so user-initiated actions (predict / claim / create) sign silently
    // with the embedded wallet — no prompt. Gas is covered by the existing
    // eth-drip (/api/eth-drip funds the embedded wallet on connect). This is
    // sufficient because every Kalma tx is user-initiated; true server-side
    // delegated signing (Privy session signers + an authorization key) is only
    // needed for automated/background txs, which we don't have. Revisit with
    // delegated-action policies before mainnet.
    showWalletUIs: false,
  },
  defaultChain: baseSepolia,
  supportedChains: [baseSepolia],
};
