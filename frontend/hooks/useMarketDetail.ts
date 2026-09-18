'use client';

import { useAccount } from '@/hooks/useWallet';
import { useReadContract } from 'wagmi';
import { formatUnits } from 'viem';
import { CONTRACTS, climatePoolAbi } from '@/lib/contracts';

export type MarketDetailData = {
  id: bigint;
  cityName: string;
  lat: number;
  lon: number;
  isRain: boolean;
  threshold: number;
  unit: string;
  startTime: number;
  endTime: number;
  daysLeft: number;

  abovePool: bigint;
  belowPool: bigint;
  abovePoolValue: number;
  belowPoolValue: number;
  totalPoolValue: number;

  aboveCrowdPct: number;
  belowCrowdPct: number;

  aboveMultiplier: number;
  belowMultiplier: number;

  aboveExampleReturn: number;
  belowExampleReturn: number;

  participantCount: number;

  resolved: boolean;
  outcome: boolean;
  creator: string;
  cancelled: boolean;
  actualValue: number | null;

  popularSide: 'above' | 'below' | 'balanced';
  betterReturnSide: 'above' | 'below' | 'equal';
  contrarianSide: 'above' | 'below' | 'none';
  oneSideEmpty: boolean;
  pricingText: string;

  // Sprint 1+2: user position + outcome
  userHasPosition: boolean;
  userSide: 'above' | 'below' | null;
  userWon: boolean;
  userAboveAmount: bigint;
  userBelowAmount: bigint;
  userPositionValue: number;
};

function round1(value: number) {
  return Math.round(value * 10) / 10;
}

function round0(value: number) {
  return Math.round(value);
}

const EXAMPLE_STAKE = 10;

export function useMarketDetail(marketId: bigint) {
  const { address } = useAccount();

  const infoRead = useReadContract({
    address: CONTRACTS.CLIMATE_POOL,
    abi: climatePoolAbi,
    functionName: 'getMarket',
    args: [marketId],
  });

  const statusRead = useReadContract({
    address: CONTRACTS.CLIMATE_POOL,
    abi: climatePoolAbi,
    functionName: 'getMarketStatus',
    args: [marketId],
  });

  const distributionRead = useReadContract({
    address: CONTRACTS.CLIMATE_POOL,
    abi: climatePoolAbi,
    functionName: 'getOdds',
    args: [marketId],
  });

  const participantsRead = useReadContract({
    address: CONTRACTS.CLIMATE_POOL,
    abi: climatePoolAbi,
    functionName: 'getParticipantCount',
    args: [marketId],
  });

  const resolutionRead = useReadContract({
    address: CONTRACTS.CLIMATE_POOL,
    abi: climatePoolAbi,
    functionName: 'getResolutionDetails',
    args: [marketId],
  });

  const userPositionRead = useReadContract({
    address: CONTRACTS.CLIMATE_POOL,
    abi: climatePoolAbi,
    functionName: 'getUserPosition',
    args: address ? [marketId, address] : undefined,
    query: { enabled: !!address },
  });

  const isLoading =
    infoRead.isLoading ||
    statusRead.isLoading ||
    distributionRead.isLoading ||
    participantsRead.isLoading;

  const hasAllData =
    !!infoRead.data && !!statusRead.data && !!distributionRead.data;

  let market: MarketDetailData | null = null;

  if (hasAllData) {
    const [cityName, latRaw, lonRaw, isRain, historicalAvg, startTime, endTime] =
      infoRead.data as [string, bigint, bigint, boolean, bigint, bigint, bigint];

    const [abovePool, belowPool, resolved, outcome, creator, cancelled] =
      statusRead.data as [bigint, bigint, boolean, boolean, string, boolean, bigint];

    const [, , aboveMulRaw, belowMulRaw] =
      distributionRead.data as [bigint, bigint, bigint, bigint];

    const participantCount = participantsRead.data
      ? Number(participantsRead.data)
      : 0;

    // Resolution details
    let actualValue: number | null = null;
    if (resolutionRead.data) {
      const [actualRaw] = resolutionRead.data as [bigint, bigint, boolean, boolean];
      const val = Number(actualRaw);
      if (val > 0 || resolved) actualValue = val;
    }

    // User position
    let userAboveAmount = 0n;
    let userBelowAmount = 0n;
    let userHasPosition = false;
    let userSide: 'above' | 'below' | null = null;
    let userWon = false;
    let userPositionValue = 0;

    if (userPositionRead.data) {
      const [uAbove, uBelow] = userPositionRead.data as [bigint, bigint, boolean];
      userAboveAmount = uAbove;
      userBelowAmount = uBelow;
      const aboveVal = Number(formatUnits(uAbove, 18));
      const belowVal = Number(formatUnits(uBelow, 18));
      userPositionValue = aboveVal + belowVal;
      userHasPosition = userPositionValue > 0;
      if (aboveVal > 0) userSide = 'above';
      else if (belowVal > 0) userSide = 'below';
      if (resolved && userHasPosition) {
        userWon = (outcome && userSide === 'above') || (!outcome && userSide === 'below');
      }
    }

    const lat = Number(latRaw) / 1e6;
    const lon = Number(lonRaw) / 1e6;
    const threshold = Number(historicalAvg);
    const unit = isRain ? 'mm' : '°C';

    const abovePoolValue = Number(formatUnits(abovePool, 18));
    const belowPoolValue = Number(formatUnits(belowPool, 18));
    const totalPoolValue = Number(formatUnits(abovePool + belowPool, 18));

    const aboveCrowdPct =
      totalPoolValue > 0 ? round0((abovePoolValue / totalPoolValue) * 100) : 50;
    const belowCrowdPct = 100 - aboveCrowdPct;

    const aboveMultiplier = Number(aboveMulRaw) / 1e6;
    const belowMultiplier = Number(belowMulRaw) / 1e6;

    const aboveExampleReturn = round1(EXAMPLE_STAKE * aboveMultiplier);
    const belowExampleReturn = round1(EXAMPLE_STAKE * belowMultiplier);

    const now = Math.floor(Date.now() / 1000);
    const endSec = Number(endTime);
    const daysLeft = Math.max(0, Math.ceil((endSec - now) / 86400));

    let popularSide: 'above' | 'below' | 'balanced' = 'balanced';
    if (abovePool > belowPool) popularSide = 'above';
    if (belowPool > abovePool) popularSide = 'below';

    let betterReturnSide: 'above' | 'below' | 'equal' = 'equal';
    if (aboveMultiplier > belowMultiplier) betterReturnSide = 'above';
    if (belowMultiplier > aboveMultiplier) betterReturnSide = 'below';

    let contrarianSide: 'above' | 'below' | 'none' = 'none';
    if (popularSide === 'above' && betterReturnSide === 'below') contrarianSide = 'below';
    if (popularSide === 'below' && betterReturnSide === 'above') contrarianSide = 'above';

    const oneSideEmpty =
      (abovePoolValue === 0 && belowPoolValue > 0) ||
      (belowPoolValue === 0 && abovePoolValue > 0);

    let pricingText = 'Both sides are priced similarly right now.';
    if (oneSideEmpty) {
      pricingText =
        'Only one side has money right now. If someone opens the other side, that side could pay more if it wins.';
    } else if (contrarianSide !== 'none') {
      pricingText = `${contrarianSide === 'above' ? 'Above' : 'Below'} pays more because fewer people chose it.`;
    }

    market = {
      id: marketId,
      cityName,
      lat,
      lon,
      isRain,
      threshold,
      unit,
      startTime: Number(startTime),
      endTime: endSec,
      daysLeft,

      abovePool,
      belowPool,
      abovePoolValue,
      belowPoolValue,
      totalPoolValue,

      aboveCrowdPct,
      belowCrowdPct,

      aboveMultiplier,
      belowMultiplier,

      aboveExampleReturn,
      belowExampleReturn,

      participantCount,

      resolved,
      outcome,
      creator,
      cancelled,
      actualValue,

      popularSide,
      betterReturnSide,
      contrarianSide,
      oneSideEmpty,
      pricingText,

      userHasPosition,
      userSide,
      userWon,
      userAboveAmount,
      userBelowAmount,
      userPositionValue,
    };
  }

  async function refetchAll() {
    await Promise.all([
      infoRead.refetch(),
      statusRead.refetch(),
      distributionRead.refetch(),
      participantsRead.refetch(),
      resolutionRead.refetch(),
      userPositionRead.refetch(),
    ]);
  }

  return {
    market,
    isLoading,
    refetchAll,
    reads: {
      infoRead,
      statusRead,
      distributionRead,
      participantsRead,
      resolutionRead,
      userPositionRead,
    },
  };
}
