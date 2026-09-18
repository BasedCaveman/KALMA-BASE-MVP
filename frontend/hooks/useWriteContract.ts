//kalma/frontend/hooks/useWriteContract.ts
'use client';

import { useCallback, useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import {
  useAccount as useWagmiAccount,
  useDisconnect as useWagmiDisconnect,
  useSwitchChain,
  useWriteContract as useWagmiWriteContract,
} from 'wagmi';
import { waitForTransactionReceipt } from 'wagmi/actions';
import { wagmiConfig } from '@/lib/wagmi';
import { CHAIN } from '@/lib/contracts';
import { RECEIPT_POLL_INTERVAL_MS } from '@/lib/chain';
import { ensureBaseSepoliaNetwork } from '@/lib/megaeth-network';
import { toWalletError } from '@/lib/wallet-errors';

export const KALMA_DISCONNECT_EVENT = 'kalma:wallet-disconnected';
export const KALMA_DISCONNECTING_KEY = 'kalma:wallet-disconnecting';
const RECEIPT_TIMEOUT_MS = 60_000;
const WALLET_REQUEST_TIMEOUT_MS = 30_000;
const WALLET_REQUEST_TIMEOUT_MESSAGE =
  'Wallet request timed out before a transaction was submitted.';
const SLOW_CONFIRMATION_MESSAGE =
  'Transaction submitted, but confirmation is taking longer than expected. Refresh your balance or check again in a moment.';

type WriteParams = {
  address: `0x${string}`;
  abi: any;
  functionName: string;
  args?: any[];
  value?: bigint;
  waitForReceipt?: boolean;
  receiptTimeoutMs?: number;
  onSubmitted?: (hash: `0x${string}`) => void;
};

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error(message)), ms);
    promise
      .then((value) => {
        window.clearTimeout(timeout);
        resolve(value);
      })
      .catch((error) => {
        window.clearTimeout(timeout);
        reject(error);
      });
  });
}

export function useWriteContract() {
  const [data, setData] = useState<`0x${string}` | undefined>(undefined);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const wagmi = useWagmiAccount();
  const wagmiWrite = useWagmiWriteContract();
  const { switchChainAsync } = useSwitchChain();

  const writeContract = useCallback(async (params: WriteParams) => {
    setIsPending(true);
    setError(null);
    setData(undefined);

    try {
      if (!wagmi.isConnected || !wagmi.address) {
        throw new Error('No wallet connected');
      }

      if (wagmi.chainId !== CHAIN.id) {
        await ensureBaseSepoliaNetwork(wagmi.chainId, switchChainAsync);
      }

      // Privy embedded wallets normally sign this silently. If the provider
      // stalls before returning a hash (seen on mobile social-login sessions),
      // wagmi otherwise stays pending forever and every CTA remains disabled.
      // Bound only the pre-submission request; receipt waiting has its own
      // timeout below.
      const hash = await withTimeout(
        wagmiWrite.writeContractAsync({
          chainId: CHAIN.id,
          address: params.address,
          abi: params.abi,
          functionName: params.functionName,
          args: params.args ?? [],
          ...(params.value !== undefined ? { value: params.value } : {}),
        }),
        WALLET_REQUEST_TIMEOUT_MS,
        WALLET_REQUEST_TIMEOUT_MESSAGE,
      );
      setData(hash);
      params.onSubmitted?.(hash);

      if (params.waitForReceipt === false) {
        return hash;
      }

      const receipt = await withTimeout(
        waitForTransactionReceipt(wagmiConfig, {
          chainId: CHAIN.id,
          hash,
          confirmations: 1,
          pollingInterval: RECEIPT_POLL_INTERVAL_MS,
        }),
        params.receiptTimeoutMs ?? RECEIPT_TIMEOUT_MS,
        `${SLOW_CONFIRMATION_MESSAGE} Tx: ${hash}`,
      );
      if (receipt.status === 'reverted') {
        throw new Error(`Transaction reverted on Base Sepolia. Tx: ${hash}`);
      }
      return hash;
    } catch (err: any) {
      const wrapped = toWalletError(err);
      setError(wrapped);
      throw wrapped;
    } finally {
      setIsPending(false);
    }
  }, [wagmi.isConnected, wagmi.address, wagmi.chainId, wagmiWrite, switchChainAsync]);

  const writeContractAsync = useCallback(
    async (params: WriteParams) => writeContract(params),
    [writeContract],
  );

  const reset = useCallback(() => {
    setData(undefined);
    setError(null);
    setIsPending(false);
  }, []);

  return {
    writeContract,
    writeContractAsync,
    data,
    isPending,
    error,
    reset,
  };
}

export function useDisconnect() {
  const { disconnect: wagmiDisconnect } = useWagmiDisconnect();
  const { logout, authenticated } = usePrivy();

  const disconnect = useCallback(() => {
    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem(KALMA_DISCONNECTING_KEY, '1');
    }
    wagmiDisconnect();
    // Must also end the Privy session — otherwise PrivyWagmiBridge sees
    // `authenticated && !isConnected` and silently reconnects wagmi, so
    // "Disconnect" appears to do nothing. logout() clears the session;
    // wagmi then stays disconnected.
    if (authenticated) void logout();
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event(KALMA_DISCONNECT_EVENT));
    }
  }, [wagmiDisconnect, logout, authenticated]);

  return { disconnect };
}
