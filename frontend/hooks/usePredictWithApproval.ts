'use client';

import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useWriteContract } from '@/hooks/useWriteContract';
import { useWaitForTransactionReceipt } from 'wagmi';
import { CHAIN, CONTRACTS, climatePoolAbi, usdcAbi } from '@/lib/contracts';
import { RECEIPT_POLL_INTERVAL_MS } from '@/lib/chain';

type StartPredictArgs = {
  marketId: bigint;
  isAbove: boolean;
  amount: bigint;
  needsApproval: boolean;
};

type Phase = 'idle' | 'approving' | 'predicting' | 'success';

export function usePredictWithApproval() {
  const queryClient = useQueryClient();
  const [phase, setPhase] = useState<Phase>('idle');
  const [queued, setQueued] = useState<Omit<StartPredictArgs, 'needsApproval'> | null>(null);
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>(undefined);
  const [handledHash, setHandledHash] = useState<`0x${string}` | undefined>(undefined);

  const {
    writeContract,
    data: writeHash,
    error: writeError,
    isPending: isSubmitting,
  } = useWriteContract();

  useEffect(() => {
    if (writeHash) {
      setTxHash(writeHash);
    }
  }, [writeHash]);

  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    chainId: CHAIN.id,
    hash: txHash,
    pollingInterval: RECEIPT_POLL_INTERVAL_MS,
    query: { enabled: !!txHash },
  });

  useEffect(() => {
    if (!isConfirmed || !txHash || handledHash === txHash) return;

    setHandledHash(txHash);

    // The approval (or predict) just confirmed on-chain. wagmi reads are React
    // Query entries that otherwise hold their pre-tx value forever (the
    // allowance read is enabled-on-address with no refetch trigger), so the UI
    // would keep showing the old allowance/balance. Invalidate so every read
    // refetches fresh — this is what makes the approval "register" in the UI.
    void queryClient.invalidateQueries();

    if (phase === 'approving' && queued) {
      setPhase('predicting');
      setTxHash(undefined);

      void writeContract({
        address: CONTRACTS.CLIMATE_POOL,
        abi: climatePoolAbi,
        functionName: 'predict',
        args: [queued.marketId, queued.isAbove, queued.amount],
      }).catch(() => {
        setPhase('idle');
        setQueued(null);
      });

      return;
    }

    if (phase === 'predicting') {
      setPhase('success');
      setQueued(null);
      setTxHash(undefined);
    }
  }, [isConfirmed, txHash, handledHash, phase, queued, writeContract, queryClient]);

  function startPredict({ marketId, isAbove, amount, needsApproval }: StartPredictArgs) {
    setHandledHash(undefined);
    setTxHash(undefined);
    setQueued({ marketId, isAbove, amount });

    if (needsApproval) {
      setPhase('approving');
      void writeContract({
        address: CONTRACTS.USDC,
        abi: usdcAbi,
        functionName: 'approve',
        args: [CONTRACTS.CLIMATE_POOL, amount],
      }).catch(() => {
        setPhase('idle');
        setQueued(null);
      });
      return;
    }

    setPhase('predicting');
    void writeContract({
      address: CONTRACTS.CLIMATE_POOL,
      abi: climatePoolAbi,
      functionName: 'predict',
      args: [marketId, isAbove, amount],
    }).catch(() => {
      setPhase('idle');
      setQueued(null);
    });
  }

  function reset() {
    setPhase('idle');
    setQueued(null);
    setTxHash(undefined);
    setHandledHash(undefined);
  }

  const errorMessage =
    writeError && 'message' in writeError ? writeError.message : null;

  return {
    startPredict,
    reset,
    phase,
    txHash,
    isBusy: isSubmitting || isConfirming,
    errorMessage,
    // Raw error so consumers can run it through classifyWalletError /
    // mount a WalletErrorPanel with the session-reset CTA. Keeping
    // errorMessage too for any callers that just want a string.
    error: writeError,
  };
}
