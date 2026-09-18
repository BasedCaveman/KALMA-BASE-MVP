//frontend/hooks/useMarkets.ts
'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAccount } from '@/hooks/useWallet';
import { useReadContract, useReadContracts } from 'wagmi';
import { formatUnits } from 'viem';
import { CONTRACTS, climatePoolAbi, MARKET_TYPES } from '@/lib/contracts';
import {
  deriveMarketUiState,
  getMarketStateLabel,
  getRegionKey,
  type MarketUiState,
} from '@/lib/market-state';
import { formatPlaceLabel } from '@/lib/place-format';
import type { LocationContextValue } from '@/lib/location';

// Exported so useMarketsSnapshot (RS-2 off-chain browse) reuses the EXACT same
// helpers — no divergence between chain-rendered and snapshot-rendered cards.
export const FAVORITES_STORAGE_KEY = 'kalma-favorite-markets';
export const EXAMPLE_STAKE = 10;
export const TOKEN_DECIMALS = 18;
const PUBLIC_MARKET_REFETCH_MS = 60 * 60 * 1000;
const PUBLIC_MARKET_STALE_MS = 5 * 60 * 1000;
const PUBLIC_MARKET_GC_MS = 60 * 60 * 1000;
const USER_POSITION_REFETCH_MS = 15 * 1000;
const USER_POSITION_STALE_MS = 5 * 1000;

type MarketV5Tuple = [
  string,
  bigint,
  bigint,
  bigint,
  bigint,
  bigint,
  bigint,
  bigint
];

type MarketStatusTuple = [bigint, bigint, boolean, boolean, string, boolean, bigint];
type DistributionTuple = [bigint, bigint, bigint, bigint];
type UserPositionTuple = [bigint, bigint, boolean];
type ResolutionDetailsTuple = [bigint, bigint, boolean, boolean];

type MetricKey =
  | 'rain'
  | 'temp_high'
  | 'temp_low'
  | 'snow'
  | 'cold_spell'
  | 'dry_stretch'
  | 'frost_risk'
  | 'heavy_rain'
  | 'unknown';

export type Market = {
  id: bigint;
  cityName: string;
  displayCityName: string;
  cityPillName: string;
  regionCode: string;
  countryCode: string;
  lat: number;
  lon: number;

  marketTypeId: number;
  metricKey: MetricKey;
  isRainMarket: boolean;
  unit: string;

  thresholdValue: number;
  startTime: number;
  endTime: number;
  predictionDeadline: number;
  daysLeft: number;
  timeToResolveSec: number;

  pool: number;
  abovePoolValue: number;
  belowPoolValue: number;

  aboveCrowdPct: number;
  belowCrowdPct: number;

  aboveMultiplier: number;
  belowMultiplier: number;

  aboveExampleReturn: number;
  belowExampleReturn: number;

  participantCount: number;

  resolved: boolean;
  cancelled: boolean;
  outcome: boolean;
  actualValue: number | null;

  popularSide: 'above' | 'below' | 'balanced';
  betterReturnSide: 'above' | 'below' | 'equal';
  contrarianSide: 'above' | 'below' | 'none';

  regionKey: string;
  distanceKm: number | null;

  userHasPosition: boolean;
  userClaimed: boolean;
  userPositionValue: number;
  userSide: 'above' | 'below' | null;
  userWon: boolean;
  userAboveRaw: bigint;
  userBelowRaw: bigint;

  isFavorite: boolean;

  uiState: MarketUiState;
  uiStateLabel: string;
};

export function round1(value: number) {
  return Math.round(value * 10) / 10;
}

export function round0(value: number) {
  return Math.round(value);
}

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function readFavoriteIds(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(FAVORITES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

export function writeFavoriteIds(ids: string[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(ids));
}

export function getMetricKey(marketTypeId: number): MetricKey {
  if (marketTypeId === MARKET_TYPES.RAIN) return 'rain';
  if (marketTypeId === MARKET_TYPES.TEMP_HIGH) return 'temp_high';
  if (marketTypeId === MARKET_TYPES.TEMP_LOW) return 'temp_low';
  if (marketTypeId === MARKET_TYPES.SNOW) return 'snow';
  if (marketTypeId === MARKET_TYPES.COLD_SPELL) return 'cold_spell';
  if (marketTypeId === MARKET_TYPES.DRY_STRETCH) return 'dry_stretch';
  if (marketTypeId === MARKET_TYPES.FROST_RISK) return 'frost_risk';
  if (marketTypeId === MARKET_TYPES.HEAVY_RAIN) return 'heavy_rain';
  return 'unknown';
}

export function getUnitForType(marketTypeId: number): string {
  if (marketTypeId === MARKET_TYPES.RAIN) return 'mm';
  if (marketTypeId === MARKET_TYPES.TEMP_HIGH) return '°C';
  if (marketTypeId === MARKET_TYPES.TEMP_LOW) return '°C';
  if (marketTypeId === MARKET_TYPES.SNOW) return 'cm';
  if (marketTypeId === MARKET_TYPES.COLD_SPELL) return '°C';
  if (marketTypeId === MARKET_TYPES.DRY_STRETCH) return 'mm';
  if (marketTypeId === MARKET_TYPES.FROST_RISK) return '°C';
  if (marketTypeId === MARKET_TYPES.HEAVY_RAIN) return 'mm';
  return '';
}

export function isLiveActionable(m: Market) {
  return !m.resolved && !m.cancelled && m.uiState === 'live';
}

function isSoonRelevant(m: Market) {
  return !m.resolved && !m.cancelled && (m.uiState === 'cooldown' || m.uiState === 'expired');
}

function compareDistance(a: Market, b: Market) {
  const ad = a.distanceKm ?? Number.POSITIVE_INFINITY;
  const bd = b.distanceKm ?? Number.POSITIVE_INFINITY;
  if (ad === bd) return 0; // both unknown included (Inf - Inf is NaN)
  return ad - bd;
}

function compareRecency(a: Market, b: Market) {
  return Number(b.id - a.id);
}

// Browse order (2026-07-21): open signals near the user's saved place lead
// the page. Among open signals: nearest first; several signals on the same
// place tie-break by which resolves soonest, then position > followed as
// final tie-breakers. Everything not answerable sinks below the open block:
// places the user has a position in first (claims/cooldowns), then followed
// places, then soon-relevant over settled, newest first.
export function sortV5Markets(a: Market, b: Market) {
  const aLive = isLiveActionable(a);
  const bLive = isLiveActionable(b);
  if (aLive !== bLive) return aLive ? -1 : 1;

  if (aLive && bLive) {
    const distCmp = compareDistance(a, b);
    if (distCmp !== 0) return distCmp;

    if (a.timeToResolveSec !== b.timeToResolveSec) {
      return a.timeToResolveSec - b.timeToResolveSec;
    }

    if (a.userHasPosition !== b.userHasPosition) return a.userHasPosition ? -1 : 1;
    if (a.isFavorite !== b.isFavorite) return a.isFavorite ? -1 : 1;

    return compareRecency(a, b);
  }

  if (a.userHasPosition !== b.userHasPosition) return a.userHasPosition ? -1 : 1;
  if (a.isFavorite !== b.isFavorite) return a.isFavorite ? -1 : 1;

  const aSoon = isSoonRelevant(a);
  const bSoon = isSoonRelevant(b);
  if (aSoon !== bSoon) return aSoon ? -1 : 1;

  const aResolved = a.resolved || a.cancelled;
  const bResolved = b.resolved || b.cancelled;
  if (aResolved !== bResolved) return aResolved ? 1 : -1;

  return compareRecency(a, b);
}

export function useMarkets(
  location?: LocationContextValue | null,
  opts?: { maxMarkets?: number },
) {
  const { address } = useAccount();
  const maxMarkets = opts?.maxMarkets;
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);

  useEffect(() => {
    setFavoriteIds(readFavoriteIds());

    const onStorage = (e: StorageEvent) => {
      if (e.key === FAVORITES_STORAGE_KEY) {
        setFavoriteIds(readFavoriteIds());
      }
    };

    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const toggleFavorite = (marketId: bigint | string) => {
    const id = marketId.toString();
    setFavoriteIds((prev) => {
      const next = prev.includes(id)
        ? prev.filter((x) => x !== id)
        : [...prev, id];
      writeFavoriteIds(next);
      return next;
    });
  };

  const userCoords =
    location?.lat != null && location?.lon != null
      ? { lat: location.lat, lon: location.lon }
      : null;

  const countRead = useReadContract({
    address: CONTRACTS.CLIMATE_POOL,
    abi: climatePoolAbi,
    functionName: 'nextMarketId',
    query: {
      refetchInterval: PUBLIC_MARKET_REFETCH_MS,
      staleTime: PUBLIC_MARKET_STALE_MS,
      gcTime: PUBLIC_MARKET_GC_MS,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    },
  });

  const count = countRead.data ? Math.max(0, Number(countRead.data) - 1) : 0;

  // maxMarkets caps the read fan-out to the most-recent N market ids — used by
  // light surfaces (e.g. the landing's single live-question preview) so they
  // don't multicall every market through /api/Base Sepolia-rpc. Full surfaces
  // (browse, proximity sort) pass no cap and read all ids.
  const ids = useMemo(() => {
    const full = Array.from({ length: count }, (_, i) => BigInt(i + 1));
    return maxMarkets && full.length > maxMarkets ? full.slice(-maxMarkets) : full;
  }, [count, maxMarkets]);

  const marketContracts = useMemo(
    () =>
      ids.map((id) => ({
        address: CONTRACTS.CLIMATE_POOL,
        abi: climatePoolAbi,
        functionName: 'getMarketV5' as const,
        args: [id],
      })),
    [ids]
  );

  const statusContracts = useMemo(
    () =>
      ids.map((id) => ({
        address: CONTRACTS.CLIMATE_POOL,
        abi: climatePoolAbi,
        functionName: 'getMarketStatus' as const,
        args: [id],
      })),
    [ids]
  );

  const distributionContracts = useMemo(
    () =>
      ids.map((id) => ({
        address: CONTRACTS.CLIMATE_POOL,
        abi: climatePoolAbi,
        functionName: 'getOdds' as const,
        args: [id],
      })),
    [ids]
  );

  const participantContracts = useMemo(
    () =>
      ids.map((id) => ({
        address: CONTRACTS.CLIMATE_POOL,
        abi: climatePoolAbi,
        functionName: 'getParticipantCount' as const,
        args: [id],
      })),
    [ids]
  );

  const resolutionContracts = useMemo(
    () =>
      ids.map((id) => ({
        address: CONTRACTS.CLIMATE_POOL,
        abi: climatePoolAbi,
        functionName: 'getResolutionDetails' as const,
        args: [id],
      })),
    [ids]
  );

  const userPositionContracts = useMemo(() => {
    if (!address) return [];
    return ids.map((id) => ({
      address: CONTRACTS.CLIMATE_POOL,
      abi: climatePoolAbi,
      functionName: 'getUserPosition' as const,
      args: [id, address],
    }));
  }, [ids, address]);

  const marketsRead = useReadContracts({
    contracts: marketContracts,
    query: {
      enabled: marketContracts.length > 0,
      refetchInterval: PUBLIC_MARKET_REFETCH_MS,
      staleTime: PUBLIC_MARKET_STALE_MS,
      gcTime: PUBLIC_MARKET_GC_MS,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    },
  });

  const statusRead = useReadContracts({
    contracts: statusContracts,
    query: {
      enabled: statusContracts.length > 0,
      refetchInterval: PUBLIC_MARKET_REFETCH_MS,
      staleTime: PUBLIC_MARKET_STALE_MS,
      gcTime: PUBLIC_MARKET_GC_MS,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    },
  });

  const distributionRead = useReadContracts({
    contracts: distributionContracts,
    query: {
      enabled: distributionContracts.length > 0,
      refetchInterval: PUBLIC_MARKET_REFETCH_MS,
      staleTime: PUBLIC_MARKET_STALE_MS,
      gcTime: PUBLIC_MARKET_GC_MS,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    },
  });

  const participantsRead = useReadContracts({
    contracts: participantContracts,
    query: {
      enabled: participantContracts.length > 0,
      refetchInterval: PUBLIC_MARKET_REFETCH_MS,
      staleTime: PUBLIC_MARKET_STALE_MS,
      gcTime: PUBLIC_MARKET_GC_MS,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    },
  });

  const resolutionRead = useReadContracts({
    contracts: resolutionContracts,
    query: {
      enabled: resolutionContracts.length > 0,
      refetchInterval: PUBLIC_MARKET_REFETCH_MS,
      staleTime: PUBLIC_MARKET_STALE_MS,
      gcTime: PUBLIC_MARKET_GC_MS,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    },
  });

  const userPositionsRead = useReadContracts({
    contracts: userPositionContracts,
    query: {
      enabled: !!address && userPositionContracts.length > 0,
      refetchInterval: USER_POSITION_REFETCH_MS,
      staleTime: USER_POSITION_STALE_MS,
    },
  });

  const isLoading =
    countRead.isLoading ||
    marketsRead.isLoading ||
    statusRead.isLoading ||
    distributionRead.isLoading ||
    participantsRead.isLoading ||
    resolutionRead.isLoading ||
    userPositionsRead.isLoading;

  const markets = useMemo(() => {
    if (!ids.length) return [];

    const now = Math.floor(Date.now() / 1000);
    const out: Market[] = [];

    for (let i = 0; i < ids.length; i++) {
      const marketResult = marketsRead.data?.[i];
      const statusResult = statusRead.data?.[i];
      const distributionResult = distributionRead.data?.[i];
      const participantResult = participantsRead.data?.[i];
      const resolutionResult = resolutionRead.data?.[i];
      const userPositionResult = userPositionsRead.data?.[i];

      if (
        marketResult?.status !== 'success' ||
        statusResult?.status !== 'success' ||
        distributionResult?.status !== 'success' ||
        participantResult?.status !== 'success'
      ) {
        continue;
      }

      const id = ids[i];

      const [
        cityName,
        latRaw,
        lonRaw,
        marketTypeIdRaw,
        thresholdRaw,
        startTimeRaw,
        endTimeRaw,
        predictionDeadlineRaw,
      ] = marketResult.result as unknown as MarketV5Tuple;

      const [abovePool, belowPool, resolved, outcome, , cancelled] =
        statusResult.result as unknown as MarketStatusTuple;

      const [, , aboveMulRaw, belowMulRaw] =
        distributionResult.result as unknown as DistributionTuple;

      const participantCount = Number(participantResult.result ?? 0);

      let actualValue: number | null = null;
      if (resolutionResult?.status === 'success' && resolutionResult.result) {
        const [actualValueRaw] =
          resolutionResult.result as unknown as ResolutionDetailsTuple;
        actualValue = Number(actualValueRaw);
      }

      const marketTypeId = Number(marketTypeIdRaw);
      const metricKey = getMetricKey(marketTypeId);
      const isRainMarket = metricKey === 'rain';
      const unit = getUnitForType(marketTypeId);

      const lat = Number(latRaw) / 1e6;
      const lon = Number(lonRaw) / 1e6;
      const thresholdValue = Number(thresholdRaw);
      const startTime = Number(startTimeRaw);
      const endTime = Number(endTimeRaw);
      const predictionDeadline = Number(predictionDeadlineRaw);

      const abovePoolValue = Number(formatUnits(abovePool, TOKEN_DECIMALS));
      const belowPoolValue = Number(formatUnits(belowPool, TOKEN_DECIMALS));
      const totalPoolValue = abovePoolValue + belowPoolValue;

      const aboveCrowdPct =
        totalPoolValue > 0 ? round0((abovePoolValue / totalPoolValue) * 100) : 50;
      const belowCrowdPct = 100 - aboveCrowdPct;

      const aboveMultiplier = Number(aboveMulRaw) / 1e6;
      const belowMultiplier = Number(belowMulRaw) / 1e6;

      const aboveExampleReturn = round1(EXAMPLE_STAKE * aboveMultiplier);
      const belowExampleReturn = round1(EXAMPLE_STAKE * belowMultiplier);

      let popularSide: 'above' | 'below' | 'balanced' = 'balanced';
      if (abovePool > belowPool) popularSide = 'above';
      if (belowPool > abovePool) popularSide = 'below';

      let betterReturnSide: 'above' | 'below' | 'equal' = 'equal';
      if (aboveMultiplier > belowMultiplier) betterReturnSide = 'above';
      if (belowMultiplier > aboveMultiplier) betterReturnSide = 'below';

      let contrarianSide: 'above' | 'below' | 'none' = 'none';
      if (popularSide === 'above' && betterReturnSide === 'below') contrarianSide = 'below';
      if (popularSide === 'below' && betterReturnSide === 'above') contrarianSide = 'above';

      let userHasPosition = false;
      let userClaimed = false;
      let userPositionValue = 0;
      let userSide: 'above' | 'below' | null = null;
      let userWon = false;
      let userAboveRaw = 0n;
      let userBelowRaw = 0n;

      if (userPositionResult?.status === 'success' && userPositionResult.result) {
        const [userAbove, userBelow, claimed] =
          userPositionResult.result as unknown as UserPositionTuple;

        userAboveRaw = userAbove;
        userBelowRaw = userBelow;
        userClaimed = claimed;

        const aboveValue = Number(formatUnits(userAbove, TOKEN_DECIMALS));
        const belowValue = Number(formatUnits(userBelow, TOKEN_DECIMALS));

        userPositionValue = aboveValue + belowValue;
        userHasPosition = userPositionValue > 0 || userClaimed;

        if (aboveValue > 0 && belowValue === 0) userSide = 'above';
        else if (belowValue > 0 && aboveValue === 0) userSide = 'below';

        if (resolved && (userPositionValue > 0 || userClaimed)) {
          userWon = (outcome && aboveValue > 0) || (!outcome && belowValue > 0);
        }
      }

      const uiState = deriveMarketUiState({
        startTime,
        endTime,
        resolved,
        cancelled,
        now,
        predictionDeadline,
      });

      const distanceKm =
        userCoords != null ? round1(haversineKm(userCoords.lat, userCoords.lon, lat, lon)) : null;

      const marketIdString = id.toString();
      const placeLabel = formatPlaceLabel(cityName);

      out.push({
        id,
        cityName,
        displayCityName: placeLabel.shortName,
        cityPillName: placeLabel.pillName,
        regionCode: placeLabel.regionCode,
        countryCode: placeLabel.countryCode,
        lat,
        lon,

        marketTypeId,
        metricKey,
        isRainMarket,
        unit,

        thresholdValue,
        startTime,
        endTime,
        predictionDeadline,
        daysLeft: Math.max(0, Math.ceil((endTime - now) / 86400)),
        timeToResolveSec: Math.max(0, endTime - now),

        pool: totalPoolValue,
        abovePoolValue,
        belowPoolValue,

        aboveCrowdPct,
        belowCrowdPct,

        aboveMultiplier,
        belowMultiplier,

        aboveExampleReturn,
        belowExampleReturn,

        participantCount,

        resolved,
        cancelled,
        outcome,
        actualValue,

        popularSide,
        betterReturnSide,
        contrarianSide,

        regionKey: getRegionKey(cityName),
        distanceKm,

        userHasPosition,
        userClaimed,
        userPositionValue,
        userSide,
        userWon,
        userAboveRaw,
        userBelowRaw,

        isFavorite: favoriteIds.includes(marketIdString),

        uiState,
        uiStateLabel: getMarketStateLabel(uiState, userHasPosition),
      });
    }

    return out.sort(sortV5Markets);
  }, [
    count,
    ids,
    marketsRead.data,
    statusRead.data,
    distributionRead.data,
    participantsRead.data,
    resolutionRead.data,
    userPositionsRead.data,
    userCoords,
    favoriteIds,
  ]);

  const primaryMarket = useMemo(() => {
    if (!markets.length) return null;

    // markets is already sorted open-first / nearest-first, so the top of
    // the list IS the nearest open signal — the find is only a guard for
    // the all-settled case.
    const liveNearest = markets.find((m) => isLiveActionable(m));
    if (liveNearest) return liveNearest;

    return markets[0] ?? null;
  }, [markets]);

  const secondaryMarkets = useMemo(() => {
    if (!primaryMarket) return [];
    return markets.filter((m) => m.id !== primaryMarket.id).slice(0, 3);
  }, [markets, primaryMarket]);

  const remainingMarkets = useMemo(() => {
    if (!primaryMarket) return markets;
    const secondaryIds = new Set(secondaryMarkets.map((m) => m.id.toString()));
    return markets.filter(
      (m) =>
        m.id !== primaryMarket.id &&
        !secondaryIds.has(m.id.toString())
    );
  }, [markets, primaryMarket, secondaryMarkets]);

  async function refetchAll() {
    await Promise.all([
      countRead.refetch(),
      marketsRead.refetch(),
      statusRead.refetch(),
      distributionRead.refetch(),
      participantsRead.refetch(),
      resolutionRead.refetch(),
      userPositionsRead.refetch(),
    ]);
  }

  return {
    markets,
    primaryMarket,
    secondaryMarkets,
    remainingMarkets,
    favoriteIds,
    toggleFavorite,
    isLoading,
    refetchAll,
  };
}
