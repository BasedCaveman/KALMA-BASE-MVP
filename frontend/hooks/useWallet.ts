//kalma/frontend/hooks/useWallet.ts
'use client';

import { useAccount as useWagmiAccount } from 'wagmi';
import { usePrivy, useWallets } from '@privy-io/react-auth';

export type WalletState = {
  address: `0x${string}` | undefined;
  isConnected: boolean;
  isReady: boolean;
  isReconnecting: boolean;
  isConnecting: boolean;
  isDisconnected: boolean;
  status: 'connected' | 'connecting' | 'disconnected' | 'reconnecting';
  chainId: number | undefined;
  connector: ReturnType<typeof useWagmiAccount>['connector'] | undefined;
};

export function useWallet(): WalletState {
  const wagmi = useWagmiAccount();
  const { authenticated, ready: privyReady } = usePrivy();
  const { wallets, ready: walletsReady } = useWallets();
  const isReady = wagmi.isConnected || (privyReady && walletsReady);

  const privyWallet =
    wallets.find((wallet) => wallet.walletClientType === 'privy') ?? wallets[0];
  const fallbackAddress = privyWallet?.address as `0x${string}` | undefined;
  const fallbackChainId =
    typeof privyWallet?.chainId === 'string' && privyWallet.chainId.startsWith('eip155:')
      ? Number(privyWallet.chainId.replace('eip155:', ''))
      : undefined;
  const hasPrivyWallet =
    !!fallbackAddress && privyReady && authenticated && walletsReady;

  if (wagmi.isConnected) {
    return {
      address: wagmi.address as `0x${string}` | undefined,
      isConnected: true,
      isReady,
      isReconnecting: wagmi.isReconnecting,
      isConnecting: wagmi.isConnecting,
      isDisconnected: false,
      status: wagmi.status,
      chainId: wagmi.chainId,
      connector: wagmi.connector,
    };
  }

  if (hasPrivyWallet) {
    return {
      address: fallbackAddress,
      isConnected: true,
      isReady,
      isReconnecting: wagmi.isReconnecting,
      isConnecting: wagmi.isConnecting,
      isDisconnected: false,
      status: wagmi.isConnecting || wagmi.isReconnecting ? wagmi.status : 'connected',
      chainId: wagmi.chainId ?? fallbackChainId,
      connector:
        wagmi.connector ??
        ({
          name:
            privyWallet?.walletClientType === 'privy'
              ? 'Privy embedded wallet'
              : privyWallet?.meta?.name ?? 'Privy wallet',
        } as WalletState['connector']),
    };
  }

  return {
    address: wagmi.address as `0x${string}` | undefined,
    isConnected: wagmi.isConnected,
    isReady,
    isReconnecting: wagmi.isReconnecting,
    isConnecting: wagmi.isConnecting,
    isDisconnected: wagmi.isDisconnected,
    status: wagmi.status,
    chainId: wagmi.chainId,
    connector: wagmi.connector,
  };
}

export const useAccount = useWallet;
