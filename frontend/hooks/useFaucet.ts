'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { useQueryClient } from '@tanstack/react-query';
import { useAccount } from '@/hooks/useWallet';
import { useWriteContract } from '@/hooks/useWriteContract';
import { usePublicClient, useReadContract, useWaitForTransactionReceipt } from 'wagmi';
import { CHAIN, CONTRACTS, faucetAbi, usdcAbi } from '@/lib/contracts';
import { RECEIPT_POLL_INTERVAL_MS } from '@/lib/chain';
import { authFetch } from '@/lib/social/auth-fetch';
import { faucetReadState } from '@/lib/contract-read-state';
import { prepareStarterGas } from '@/lib/starter-gas';

export type FaucetStage = 'idle' | 'checking_gas' | 'signing_gas' | 'waiting_gas' | 'requesting_cash' | 'refreshing_cash' | 'success';
export function useFaucet() {
  const { address, isConnected } = useAccount();
  const { ready, authenticated } = usePrivy();
  const publicClient = usePublicClient({ chainId: CHAIN.id });
  const queryClient = useQueryClient();
  const claimInFlight = useRef(false);
  const [isGasDripping, setIsGasDripping] = useState(false);
  const [gasDripTxHash, setGasDripTxHash] = useState<`0x${string}`>();
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
  const requestStarterGas = useCallback(async () => {
    if (!address || !isConnected || !ready || !authenticated || !publicClient)
      throw new Error('Sign in and wait for your account to connect.');
    setIsGasDripping(true);
    try {
      await prepareStarterGas(address, {
        balance: () => publicClient.getBalance({ address, blockTag: 'latest' }),
        request: async () => {
          const response = await authFetch('/api/eth-drip', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ address }), signal: AbortSignal.timeout(45_000) });
          const payload = await response.json().catch(() => null);
          return { ...payload, ok: response.ok };
        },
        receipt: async hash => {
          setGasDripTxHash(hash);
          const receipt = await publicClient.waitForTransactionReceipt({ hash, confirmations: 2, timeout: 60_000 });
          if (receipt.status !== 'success') throw new Error('Test account preparation could not be confirmed.');
        },
        pause: () => new Promise(resolve => setTimeout(resolve, 1500)),
      });
      await queryClient.invalidateQueries({ queryKey: ['balance'] });
    } finally { setIsGasDripping(false); }
  }, [address, isConnected, ready, authenticated, publicClient, queryClient]);
  useEffect(() => {
    if (address && isConnected && ready && authenticated) {
      let active = true;
      void requestStarterGas().catch(cause => { if (active) setError(cause instanceof Error ? cause : new Error('Could not prepare your test account.')); });
      return () => { active = false; };
    }
  }, [address, isConnected, ready, authenticated, requestStarterGas]);
  useEffect(() => { if (isSuccess) { setStage('success'); void Promise.all([refetchBalance(), refetchCanClaim(), queryClient.invalidateQueries({ queryKey: ['readContract'] })]); } }, [isSuccess, refetchBalance, refetchCanClaim, queryClient]);
  async function claimFaucet() {
    if (!address || !isConnected || claimInFlight.current) return;
    claimInFlight.current = true;
    setError(null); setStage('checking_gas');
    try { await requestStarterGas(); setStage('requesting_cash'); setTestCashTxHash(await writeContractAsync({ address: CONTRACTS.FAUCET, abi: faucetAbi, functionName: 'claimTestCredits' })); }
    catch (cause) { const next = cause instanceof Error ? cause : new Error('Could not deposit test credits.'); setError(next); setStage('idle'); throw next; }
    finally { claimInFlight.current = false; }
  }
  function resetFaucetState() { reset(); setError(null); setTestCashTxHash(undefined); setStage('idle'); }
  async function refetchReads() { await Promise.all([refetchBalance(), refetchCanClaim()]); }
  return { ...readState, claimFaucet, requestStarterGas, stage, isPending, isGasDripping, isConfirming, isSuccess, error, gasDripTxHash, testCashTxHash, confirmationSlow: false, reset: resetFaucetState, refetchReads, usdmBalance: readState.balance };
}
