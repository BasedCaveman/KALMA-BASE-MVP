//frontend/hooks/useActionGate.ts
'use client';

import { useCallback, useMemo, useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';

export type KalmaActionType =
  | 'predict'
  | 'create'
  | 'claim'
  | 'follow'
  | 'favorite'
  | 'comment'
  | 'share';

export type ActionGateState =
  | 'idle'
  | 'needs_connection'
  | 'needs_funding'
  | 'ready'
  | 'running'
  | 'error';

type UseActionGateParams = {
  action: KalmaActionType;
  isConnected: boolean;
  requiresFunds?: boolean;
  hasFunds?: boolean;
  onReadyAction: () => void | Promise<void>;
  onNeedsFunding?: () => void;
  onBeforeConnect?: () => void;
  onError?: (error: unknown) => void;
};

type UseActionGateResult = {
  state: ActionGateState;
  label: string;
  canProceed: boolean;
  run: () => Promise<void>;
};

function getActionLabel(
  action: KalmaActionType,
  state: ActionGateState
): string {
  if (state === 'needs_connection') {
    switch (action) {
      case 'predict':
        return 'Connect to answer';
      case 'create':
        return 'Connect to create';
      case 'claim':
        return 'Connect to claim';
      case 'follow':
        return 'Connect to follow';
      case 'favorite':
        return 'Connect to favorite';
      case 'comment':
        return 'Connect to comment';
      case 'share':
        return 'Connect to share';
      default:
        return 'Connect';
    }
  }

  if (state === 'needs_funding') {
    switch (action) {
      case 'predict':
        return 'Fund to predict';
      case 'create':
        return 'Fund to create';
      case 'claim':
        return 'Claim ready';
      default:
        return 'Add funds';
    }
  }

  if (state === 'running') {
    switch (action) {
      case 'predict':
        return 'Preparing prediction...';
      case 'create':
        return 'Preparing market...';
      case 'claim':
        return 'Preparing claim...';
      case 'follow':
        return 'Following...';
      case 'favorite':
        return 'Saving...';
      case 'comment':
        return 'Preparing comment...';
      case 'share':
        return 'Preparing share...';
      default:
        return 'Working...';
    }
  }

  switch (action) {
    case 'predict':
      return 'Predict';
    case 'create':
      return 'Create market';
    case 'claim':
      return 'Claim';
    case 'follow':
      return 'Follow';
    case 'favorite':
      return 'Favorite';
    case 'comment':
      return 'Comment';
    case 'share':
      return 'Share';
    default:
      return 'Continue';
  }
}

export function useActionGate({
  action,
  isConnected,
  requiresFunds = false,
  hasFunds = true,
  onReadyAction,
  onNeedsFunding,
  onBeforeConnect,
  onError,
}: UseActionGateParams): UseActionGateResult {
  const [isRunning, setIsRunning] = useState(false);
  const [hasError, setHasError] = useState(false);
  const { login, authenticated, ready } = usePrivy();

  const state = useMemo<ActionGateState>(() => {
    if (hasError) return 'error';
    if (isRunning) return 'running';
    if (!isConnected) return 'needs_connection';
    if (requiresFunds && !hasFunds) return 'needs_funding';
    return 'ready';
  }, [hasError, isRunning, isConnected, requiresFunds, hasFunds]);

  const run = useCallback(async () => {
    setHasError(false);

    try {
      if (!isConnected) {
        onBeforeConnect?.();
        // If Privy already has a session, login() throws "already logged in";
        // PrivyWagmiBridge restores the wagmi connection on its own, so only
        // open the modal for a genuinely-new session.
        if (ready && !authenticated) login();
        return;
      }

      if (requiresFunds && !hasFunds) {
        onNeedsFunding?.();
        return;
      }

      setIsRunning(true);
      await onReadyAction();
    } catch (error) {
      setHasError(true);
      onError?.(error);
    } finally {
      setIsRunning(false);
    }
  }, [
    isConnected,
    requiresFunds,
    hasFunds,
    onReadyAction,
    onNeedsFunding,
    onBeforeConnect,
    onError,
    login,
    authenticated,
    ready,
  ]);

  return {
    state,
    label: getActionLabel(action, state),
    canProceed: state !== 'running',
    run,
  };
}
