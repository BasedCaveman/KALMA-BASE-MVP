// frontend/hooks/useMarketsSnapshot.ts
//
// RS-2b: off-chain BROWSE read. Returns the same shape as useMarkets but sources
// market state from the public markets_snapshot table (written by the leaderboard
// cron every 15 min) instead of multicalling 5–6 reads × every market through
// /api/Base Sepolia-rpc on every visit — the fan-out that tripped Vercel's edge
// mitigation. Live chain reads stay only on the detail page + predict.
//
// Anonymous visitors (the bulk of traffic) do ZERO chain reads here. Logged-in
// users get a single getUserPosition multicall overlay so their "your answer"
// badges + float-to-top still work (6×N → 1×N).
//
// Renders cards identically to useMarkets by reusing its exported helpers.

'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useReadContracts } from 'wagmi';
import { formatUnits } from 'viem';
import { useAccount } from '@/hooks/useWallet';
import { supabase } from '@/lib/supabase';
import { CONTRACTS, climatePoolAbi } from '@/lib/contracts';
import { deriveMarketUiState, getMarketStateLabel, getRegionKey } from '@/lib/market-state';
import { formatPlaceLabel } from '@/lib/place-format';
import type { LocationContextValue } from '@/lib/location';
import {
  EXAMPLE_STAKE,
  FAVORITES_STORAGE_KEY,
  TOKEN_DECIMALS,
  getMetricKey,
  getUnitForType,
  haversineKm,
  isLiveActionable,
  readFavoriteIds,
  round0,
  round1,
  sortV5Markets,
  writeFavoriteIds,
  type Market,
} from '@/hooks/useMarkets';

// Resolved/cancelled markets older than this drop off the browse surfaces — a
// daily user doesn't need last month's settled signals (they stay reachable by
// direct link / positions). The "relevance" half of the read strategy.
const BROWSE_MAX_RESOLVED_AGE_S = 7 * 24 * 60 * 60;
const SNAPSHOT_STALE_MS = 2 * 60 * 1000;
const SNAPSHOT_REFETCH_MS = 5 * 60 * 1000;
const USER_POSITION_REFETCH_MS = 15 * 1000;

export const MARKETS_SNAPSHOT_QUERY_KEY = ['markets_snapshot'] as const;

export type SnapshotRow = {
  market_id: number | string;
  city_name: string;
  lat: number | null;
  lon: number | null;
  market_type_id: number;
  threshold_value: number | string | null;
  start_time: number | string | null;
  end_time: number | string | null;
  prediction_deadline: number | string | null;
  above_pool_wei: string;
  below_pool_wei: string;
  above_mul_e6: string;
  below_mul_e6: string;
  participant_count: number;
  resolved: boolean;
  cancelled: boolean;
  outcome: boolean;
  actual_value: number | null;
  resolved_at: number | string | null;
  updated_at?: string | null;
};

type UserPositionTuple = [bigint, bigint, boolean];

async function fetchSnapshot(): Promise<SnapshotRow[]> {
  // Scoped to the live pool. market_id is only unique WITHIN a pool
  // (docs/V7_DEPLOY_RUNBOOK_2026-08-26.md) — an unscoped read would surface
  // V5's wound-down markets alongside V7's live ones, at possibly-colliding
  // ids, pointed at a contract this hook's write paths no longer use.
  const { data, error } = await supabase
    .from('markets_snapshot')
    .select('*')
    .eq('pool_address', CONTRACTS.CLIMATE_POOL.toLowerCase())
    .order('market_id', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as SnapshotRow[];
}

export function useMarketsSnapshot(location?: LocationContextValue | null) {
  const { address } = useAccount();
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);

  useEffect(() => {
    setFavoriteIds(readFavoriteIds());
    const onStorage = (e: StorageEvent) => {
      if (e.key === FAVORITES_STORAGE_KEY) setFavoriteIds(readFavoriteIds());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const toggleFavorite = (marketId: bigint | string) => {
    const id = marketId.toString();
    setFavoriteIds((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      writeFavoriteIds(next);
      return next;
    });
  };

  const {
    data: rows,
    isLoading: snapshotLoading,
    refetch: refetchSnapshot,
  } = useQuery({
    queryKey: MARKETS_SNAPSHOT_QUERY_KEY,
    queryFn: fetchSnapshot,
    staleTime: SNAPSHOT_STALE_MS,
    refetchInterval: SNAPSHOT_REFETCH_MS,
    refetchOnWindowFocus: false,
  });

  const snapshotRows = useMemo(() => rows ?? [], [rows]);

  // Logged-in overlay: one getUserPosition multicall over the snapshot's ids, so
  // browse still shows the user's positions. Anonymous users skip this entirely.
  const userPositionContracts = useMemo(() => {
    if (!address) return [];
    return snapshotRows.map((r) => ({
      address: CONTRACTS.CLIMATE_POOL,
      abi: climatePoolAbi,
      functionName: 'getUserPosition' as const,
      args: [BigInt(r.market_id), address],
    }));
  }, [address, snapshotRows]);

  const userPositionsRead = useReadContracts({
    contracts: userPositionContracts,
    query: {
      enabled: !!address && userPositionContracts.length > 0,
      refetchInterval: USER_POSITION_REFETCH_MS,
      staleTime: 5_000,
    },
  });

  const userCoords =
    location?.lat != null && location?.lon != null
      ? { lat: location.lat, lon: location.lon }
      : null;

  const markets = useMemo(() => {
    if (snapshotRows.length === 0) return [] as Market[];
    const now = Math.floor(Date.now() / 1000);
    const out: Market[] = [];

    snapshotRows.forEach((r, i) => {
      const id = BigInt(r.market_id);
      const marketTypeId = Number(r.market_type_id);
      const metricKey = getMetricKey(marketTypeId);
      const unit = getUnitForType(marketTypeId);

      const lat = r.lat ?? 0;
      const lon = r.lon ?? 0;
      const thresholdValue = Number(r.threshold_value ?? 0);
      const startTime = Number(r.start_time ?? 0);
      const endTime = Number(r.end_time ?? 0);
      const predictionDeadline = Number(r.prediction_deadline ?? 0);

      const abovePool = BigInt(r.above_pool_wei || '0');
      const belowPool = BigInt(r.below_pool_wei || '0');
      const abovePoolValue = Number(formatUnits(abovePool, TOKEN_DECIMALS));
      const belowPoolValue = Number(formatUnits(belowPool, TOKEN_DECIMALS));
      const totalPoolValue = abovePoolValue + belowPoolValue;

      const aboveCrowdPct = totalPoolValue > 0 ? round0((abovePoolValue / totalPoolValue) * 100) : 50;
      const belowCrowdPct = 100 - aboveCrowdPct;

      const aboveMultiplier = Number(r.above_mul_e6 || '0') / 1e6;
      const belowMultiplier = Number(r.below_mul_e6 || '0') / 1e6;
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

      const resolved = !!r.resolved;
      const cancelled = !!r.cancelled;
      const outcome = !!r.outcome;
      const actualValue = resolved && typeof r.actual_value === 'number' ? r.actual_value : null;

      // Relevance filter: drop settled markets older than the browse window.
      if ((resolved || cancelled) && endTime > 0 && now - endTime > BROWSE_MAX_RESOLVED_AGE_S) {
        return;
      }

      let userHasPosition = false;
      let userClaimed = false;
      let userPositionValue = 0;
      let userSide: 'above' | 'below' | null = null;
      let userWon = false;
      let userAboveRaw = 0n;
      let userBelowRaw = 0n;

      const upr = userPositionsRead.data?.[i];
      if (upr?.status === 'success' && upr.result) {
        const [userAbove, userBelow, claimed] = upr.result as unknown as UserPositionTuple;
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
      const placeLabel = formatPlaceLabel(r.city_name);

      out.push({
        id,
        cityName: r.city_name,
        displayCityName: placeLabel.shortName,
        cityPillName: placeLabel.pillName,
        regionCode: placeLabel.regionCode,
        countryCode: placeLabel.countryCode,
        lat,
        lon,
        marketTypeId,
        metricKey,
        isRainMarket: metricKey === 'rain',
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
        participantCount: Number(r.participant_count ?? 0),
        resolved,
        cancelled,
        outcome,
        actualValue,
        popularSide,
        betterReturnSide,
        contrarianSide,
        regionKey: getRegionKey(r.city_name),
        distanceKm,
        userHasPosition,
        userClaimed,
        userPositionValue,
        userSide,
        userWon,
        userAboveRaw,
        userBelowRaw,
        isFavorite: favoriteIds.includes(id.toString()),
        uiState,
        uiStateLabel: getMarketStateLabel(uiState, userHasPosition),
      });
    });

    return out.sort(sortV5Markets);
  }, [snapshotRows, userPositionsRead.data, userCoords, favoriteIds]);

  const primaryMarket = useMemo(() => {
    if (!markets.length) return null;
    // Sorted open-first / nearest-first — the top of the list is the
    // nearest open signal; the find only guards the all-settled case.
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
      (m) => m.id !== primaryMarket.id && !secondaryIds.has(m.id.toString()),
    );
  }, [markets, primaryMarket, secondaryMarkets]);

  return {
    markets,
    primaryMarket,
    secondaryMarkets,
    remainingMarkets,
    isLoading: snapshotLoading,
    favoriteIds,
    toggleFavorite,
    refetchAll: refetchSnapshot,
  };
}
