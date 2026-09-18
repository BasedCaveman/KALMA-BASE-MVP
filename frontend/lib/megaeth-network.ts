'use client';

import { CHAIN } from '@/lib/contracts';

type SwitchChainAsync = ((args: any) => Promise<unknown>) | undefined;

type BrowserEthereum = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
};

function getBrowserEthereum(): BrowserEthereum | null {
  if (typeof window === 'undefined') return null;
  const eth = (window as Window & { ethereum?: BrowserEthereum }).ethereum;
  return eth && typeof eth.request === 'function' ? eth : null;
}

function chainIdHex(chainId: number) {
  return `0x${chainId.toString(16)}`;
}

function readCode(err: unknown): number | string | undefined {
  if (!err || typeof err !== 'object') return undefined;
  const value = (err as { code?: unknown }).code;
  return typeof value === 'number' || typeof value === 'string' ? value : undefined;
}

function readMessage(err: unknown): string {
  if (!err) return '';
  if (typeof err === 'string') return err;
  if (err instanceof Error) return err.message;
  if (typeof err === 'object') {
    const obj = err as { message?: unknown; shortMessage?: unknown; details?: unknown };
    if (typeof obj.message === 'string') return obj.message;
    if (typeof obj.shortMessage === 'string') return obj.shortMessage;
    if (typeof obj.details === 'string') return obj.details;
  }
  return String(err);
}

function isChainMissingError(err: unknown) {
  const code = readCode(err);
  const message = readMessage(err).toLowerCase();
  return (
    code === 4902 ||
    code === '4902' ||
    message.includes('unrecognized chain') ||
    message.includes('unknown chain') ||
    message.includes('chain not added') ||
    message.includes('does not have chain') ||
    message.includes('missing chain')
  );
}

export async function ensureBaseSepoliaNetwork(
  currentChainId: number | undefined,
  switchChainAsync?: SwitchChainAsync,
) {
  if (currentChainId === CHAIN.id) return;

  try {
    if (switchChainAsync) {
      await switchChainAsync({ chainId: CHAIN.id });
      return;
    }
  } catch (error) {
    if (!isChainMissingError(error)) throw error;
  }

  const ethereum = getBrowserEthereum();
  if (!ethereum) {
    throw new Error('Your account is on a different network. Switch to Base Sepolia and try again.');
  }

  await ethereum.request({
    method: 'wallet_addEthereumChain',
    params: [
      {
        chainId: chainIdHex(CHAIN.id),
        chainName: CHAIN.name,
        nativeCurrency: {
          name: 'Ether',
          symbol: 'ETH',
          decimals: 18,
        },
        rpcUrls: [CHAIN.rpcUrl, CHAIN.rpcBackup],
        blockExplorerUrls: [CHAIN.blockExplorer],
      },
    ],
  });

  await ethereum.request({
    method: 'wallet_switchEthereumChain',
    params: [{ chainId: chainIdHex(CHAIN.id) }],
  });
}
