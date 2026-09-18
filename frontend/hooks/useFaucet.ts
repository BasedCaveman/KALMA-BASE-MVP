'use client';
import { useEffect, useState } from 'react';
import { useAccount } from '@/hooks/useWallet';
import { useWriteContract } from '@/hooks/useWriteContract';
import { useReadContract, useWaitForTransactionReceipt } from 'wagmi';
import { CHAIN, CONTRACTS, faucetAbi, usdcAbi } from '@/lib/contracts';
import { RECEIPT_POLL_INTERVAL_MS } from '@/lib/chain';

export type FaucetStage = 'idle' | 'checking_gas' | 'signing_gas' | 'waiting_gas' | 'requesting_cash' | 'refreshing_cash' | 'success';
export function useFaucet() {
  const { address, isConnected } = useAccount();
  const [stage, setStage] = useState<FaucetStage>('idle');
  const [error, setError] = useState<Error | null>(null);
  const [testCashTxHash, setTestCashTxHash] = useState<`0x${string}`>();
  const { writeContractAsync, isPending, reset } = useWriteContract();
  const { data: balance = 0n, refetch: refetchBalance } = useReadContract({ chainId: CHAIN.id, address: CONTRACTS.USDC, abi: usdcAbi, functionName: 'balanceOf', args: address ? [address] : undefined, query: { enabled: Boolean(address), staleTime: 0 } });
  const { data: canClaim = false, refetch: refetchCanClaim } = useReadContract({ chainId: CHAIN.id, address: CONTRACTS.FAUCET, abi: faucetAbi, functionName: 'canClaim', args: address ? [address] : undefined, query: { enabled: Boolean(address) } });
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ chainId: CHAIN.id, hash: testCashTxHash, pollingInterval: RECEIPT_POLL_INTERVAL_MS, query: { enabled: Boolean(testCashTxHash) } });
  useEffect(() => { if (isSuccess) { setStage('success'); void Promise.all([refetchBalance(), refetchCanClaim()]); } }, [isSuccess, refetchBalance, refetchCanClaim]);
  async function claimFaucet() {
    if (!address || !isConnected) return;
    setError(null); setStage('requesting_cash');
    try { setTestCashTxHash(await writeContractAsync({ address: CONTRACTS.FAUCET, abi: faucetAbi, functionName: 'claimTestCredits' })); }
    catch (cause) { const next = cause instanceof Error ? cause : new Error('Could not deposit test credits.'); setError(next); setStage('idle'); throw next; }
  }
  function resetFaucetState() { reset(); setError(null); setTestCashTxHash(undefined); setStage('idle'); }
  return { showBanner: isConnected && balance === 0n && canClaim, onCooldown: !canClaim && balance === 0n, cooldownSeconds: 0, claimFaucet, requestStarterGas: async () => undefined, stage, isPending, isGasDripping: false, isConfirming, isSuccess, error, gasDripTxHash: undefined, testCashTxHash, confirmationSlow: false, reset: resetFaucetState, usdmBalance: balance };
}
