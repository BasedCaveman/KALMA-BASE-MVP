export type MarketUiState =
  | 'live'
  | 'cooldown'
  | 'expired'
  | 'resolved'
  | 'cancelled';

export function deriveMarketUiState(params: {
  startTime: number;
  endTime: number;
  resolved: boolean;
  cancelled?: boolean;
  now?: number;
  predictionDeadline?: number;
}): MarketUiState {
  const {
    startTime,
    endTime,
    resolved,
    cancelled = false,
    now = Math.floor(Date.now() / 1000),
    predictionDeadline,
  } = params;

  if (cancelled) return 'cancelled';
  if (resolved) return 'resolved';
  if (now >= endTime) return 'expired';
  // Answering closes at the contract's predictionDeadline, not at the start
  // of the observation window: future-start markets close when observation
  // begins (deadline = startTime), but instant-start markets stay answerable
  // through the window (deadline = endTime). Callers that don't have the
  // deadline fall back to the legacy startTime boundary.
  const answerDeadline =
    predictionDeadline && predictionDeadline > 0 ? predictionDeadline : startTime;
  if (now >= answerDeadline) return 'cooldown';
  return 'live';
}

export function getMarketStateLabel(state: MarketUiState, hasPosition: boolean) {
  if (state === 'live') return hasPosition ? 'Live · your position' : 'Live';
  if (state === 'cooldown') return hasPosition ? 'Waiting for result' : 'Prediction closed';
  if (state === 'expired') return hasPosition ? 'Waiting for resolution' : 'Expired';
  if (state === 'resolved') return hasPosition ? 'Resolved · review / claim' : 'Resolved';
  return 'Cancelled';
}

export function getStateRank(state: MarketUiState, hasPosition: boolean) {
  if (hasPosition) {
    if (state === 'live') return 0;
    if (state === 'cooldown') return 1;
    if (state === 'expired') return 2;
    if (state === 'resolved') return 3;
    return 4;
  }

  if (state === 'live') return 10;
  if (state === 'cooldown') return 20;
  if (state === 'expired') return 30;
  if (state === 'resolved') return 40;
  return 50;
}

export function getRegionKey(cityName: string) {
  const parts = cityName.split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 3) {
    return `${parts[parts.length - 2]}, ${parts[parts.length - 1]}`;
  }
  if (parts.length >= 2) {
    return parts.slice(-2).join(', ');
  }
  return cityName;
}

export function sortMarkets<T extends {
  uiState: MarketUiState;
  userHasPosition: boolean;
  timeToResolveSec: number;
  pool: number;
  distanceKm: number | null;
}>(
  a: T,
  b: T
) {
  const rankDiff =
    getStateRank(a.uiState, a.userHasPosition) -
    getStateRank(b.uiState, b.userHasPosition);
  if (rankDiff !== 0) return rankDiff;

  if (a.userHasPosition && b.userHasPosition) {
    if (a.timeToResolveSec !== b.timeToResolveSec) {
      return a.timeToResolveSec - b.timeToResolveSec;
    }
    if (a.pool !== b.pool) return b.pool - a.pool;
    if (a.distanceKm != null && b.distanceKm != null) return a.distanceKm - b.distanceKm;
    if (a.distanceKm != null) return -1;
    if (b.distanceKm != null) return 1;
    return 0;
  }

  if (a.uiState === 'live' && b.uiState === 'live') {
    if (a.distanceKm != null && b.distanceKm != null && a.distanceKm !== b.distanceKm) {
      return a.distanceKm - b.distanceKm;
    }
    if (a.distanceKm != null && b.distanceKm == null) return -1;
    if (a.distanceKm == null && b.distanceKm != null) return 1;
    if (a.pool !== b.pool) return b.pool - a.pool;
    return a.timeToResolveSec - b.timeToResolveSec;
  }

  if (
    (a.uiState === 'resolved' || a.uiState === 'expired' || a.uiState === 'cancelled') &&
    (b.uiState === 'resolved' || b.uiState === 'expired' || b.uiState === 'cancelled')
  ) {
    return a.timeToResolveSec - b.timeToResolveSec;
  }

  if (a.timeToResolveSec !== b.timeToResolveSec) {
    return a.timeToResolveSec - b.timeToResolveSec;
  }

  return b.pool - a.pool;
}
