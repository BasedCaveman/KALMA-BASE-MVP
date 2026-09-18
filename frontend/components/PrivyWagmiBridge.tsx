// kalma/frontend/components/PrivyWagmiBridge.tsx
//
// Reconnect bridge: keeps wagmi's connection in sync with Privy's auth state.
//
// THE BUG THIS FIXES — on a return visit Privy restores the session
// (`authenticated === true`) from its own storage, but wagmi does NOT always
// re-attach the connector, so `useAccount().isConnected` stays false. Every
// Kalma CTA gates on that wagmi flag and, when it's false, calls Privy
// `login()` — which throws "user is already logged in" and does nothing. The
// result the user sees: Start/Connect look dead, and "Deposit test credits"
// bounces to /profile because the app thinks no wallet is connected.
//
// The fix: whenever Privy is authenticated and holds a wallet but wagmi is
// disconnected, set that wallet active for wagmi (silent, no modal). This
// restores `isConnected` so the existing gated CTAs work again. Mounted under
// the WagmiProvider in Web3Provider so the wagmi + Privy hooks resolve.

'use client';

import { useEffect, useRef } from 'react';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { useSetActiveWallet } from '@privy-io/wagmi';
import { useAccount } from 'wagmi';
import { KALMA_DISCONNECTING_KEY } from '@/hooks/useWriteContract';

export default function PrivyWagmiBridge() {
  const { ready, authenticated } = usePrivy();
  const { wallets, ready: walletsReady } = useWallets();
  const { setActiveWallet } = useSetActiveWallet();
  const { isConnected, isConnecting, isReconnecting } = useAccount();

  // Guard against re-firing setActiveWallet in a loop for the same wallet
  // while a connect attempt is in flight. Cleared once wagmi connects (or the
  // attempt fails) so a later wallet change can still reconnect.
  const attemptedAddress = useRef<string | null>(null);

  useEffect(() => {
    const isDisconnecting =
      typeof window !== 'undefined' &&
      window.sessionStorage.getItem(KALMA_DISCONNECTING_KEY) === '1';

    if (isDisconnecting) {
      if (!authenticated && typeof window !== 'undefined') {
        window.sessionStorage.removeItem(KALMA_DISCONNECTING_KEY);
      }
      return;
    }

    if (isConnected || isConnecting || isReconnecting) {
      attemptedAddress.current = null;
      return;
    }
    if (!ready || !authenticated || !walletsReady || wallets.length === 0) return;

    // Prefer the embedded (Privy) wallet — social/passkey users sign with it
    // silently — falling back to the first connected wallet for wallet logins.
    const wallet = wallets.find((w) => w.walletClientType === 'privy') ?? wallets[0];
    if (!wallet || attemptedAddress.current === wallet.address) return;

    attemptedAddress.current = wallet.address;
    void setActiveWallet(wallet).catch(() => {
      // Let a later render retry (e.g. transient RPC blip on connect).
      attemptedAddress.current = null;
    });
  }, [
    ready,
    authenticated,
    walletsReady,
    wallets,
    isConnected,
    isConnecting,
    isReconnecting,
    setActiveWallet,
  ]);

  return null;
}
