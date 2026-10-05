'use client';
import { useEffect, useState } from 'react';
import { useAccount } from '@/hooks/useWallet';
import { useWriteContract } from '@/hooks/useWriteContract';
import { useReadContract, useWaitForTransactionReceipt } from 'wagmi';
import { CHAIN, CONTRACTS, faucetAbi, usdcAbi } from '@/lib/contracts';
import { RECEIPT_POLL_INTERVAL_MS } from '@/lib/chain';
import { authFetch } from '@/lib/social/auth-fetch';
import { faucetReadState } from '@/lib/contract-read-state';

export type FaucetStage = 'idle' | 'checking_gas' | 'signing_gas' | 'waiting_gas' | 'requesting_cash' | 'refreshing_cash' | 'success';
export function useFaucet() {
  const { address, isConnected } = useAccount();
  const [stage, setStage] = useState<FaucetStage>('idle');
  const [error, setError] = useState<Error | null>(null);
  const [testCashTxHash, setTestCashTxHash] = useState<`0x${string}`>();
  const { writeContractAsync, isPending, reset } = useWriteContract();
  const balanceRead = useReadContract({ chainId: CHAIN.id, address: CONTRACTS.USDC, abi: usdcAbi, functionName: 'balanceOf', args: address ? [address] : undefined, query: { enabled: Boolean(address), staleTime: 0 } });
  const claimRead = useReadContract({ chainId: CHAIN.id, address: CONTRACTS.FAUCET, abi: faucetAbi, functionName: 'canClaim', args: address ? [address] : undefined, query: { enabled: Boolean(address) } });
  const { refetch: refetchBalance } = balanceRead;
  const { refetch: refetchCanClaim } = claimRead;
  const readState = faucetReadState(isConnected && Boolean(address), balanceRead, claimRead);
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ chainId: CHAIN.id, hash: testCashTxHash, pollingInterval: RECEIPT_POLL_INTERVAL_MS, query: { enabled: Boolean(testCashTxHash) } });
  async function requestStarterGas() {
    if (!address || !isConnected) return;
    const response = await authFetch('/api/eth-drip', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ address }) });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(payload?.message || 'Could not prepare your test account.');
  }
  useEffect(() => { if (address && isConnected) void requestStarterGas().catch(() => undefined); }, [address, isConnected]);
  useEffect(() => { if (isSuccess) { setStage('success'); void Promise.all([refetchBalance(), refetchCanClaim()]); } }, [isSuccess, refetchBalance, refetchCanClaim]);
  async function claimFaucet() {
    if (!address || !isConnected) return;
    setError(null); setStage('requesting_cash');
    try { await requestStarterGas(); setTestCashTxHash(await writeContractAsync({ address: CONTRACTS.FAUCET, abi: faucetAbi, functionName: 'claimTestCredits' })); }
    catch (cause) { const next = cause instanceof Error ? cause : new Error('Could not deposit test credits.'); setError(next); setStage('idle'); throw next; }
  }
  function resetFaucetState() { reset(); setError(null); setTestCashTxHash(undefined); setStage('idle'); }
  async function refetchReads() { await Promise.all([refetchBalance(), refetchCanClaim()]); }
  return { ...readState, claimFaucet, requestStarterGas, stage, isPending, isGasDripping: false, isConfirming, isSuccess, error, gasDripTxHash: undefined, testCashTxHash, confirmationSlow: false, reset: resetFaucetState, refetchReads, usdmBalance: readState.balance };
}
