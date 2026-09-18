// kalma/frontend/lib/server/market-read.ts
//
// Server-side single-market read for share surfaces (OG image + route
// metadata). Reads directly from carrot RPC (not the browser proxy) like the
// leaderboard cron, so it never touches the per-IP browser-RPC budget.
//
// Kept deliberately small — just the fields a WhatsApp/Telegram link preview
// needs: the question, the community split, the deadline, the city. All reads
// are wrapped so a crawler hit can never error the page; callers fall back to
// a branded card when this returns null.

import { createPublicClient, http, formatUnits } from 'viem';
import { baseSepolia } from '@/lib/chain';
import { CHAIN, CONTRACTS, climatePoolAbi } from '@/lib/contracts';

const UNIT_BY_TYPE: Record<number, string> = {
  1: 'mm', 2: '°C', 3: '°C', 4: 'cm', 5: '°C', 6: 'mm', 7: '°C', 8: 'mm',
};

export type MarketShareData = {
  id: number;
  cityName: string;
  marketTypeId: number;
  thresholdValue: number;
  unit: string;
  startTime: number;
  endTime: number;
  abovePct: number;
  belowPct: number;
  participantCount: number;
  resolved: boolean;
  daysLeft: number;
  // Set once resolved: the winning side and the measured value.
  outcome: 'above' | 'below' | null;
  actualValue: number | null;
};

export async function readMarketForShare(id: number): Promise<MarketShareData | null> {
  if (!Number.isInteger(id) || id < 1) return null;

  try {
    const client = createPublicClient({
      chain: baseSepolia,
      transport: http(CHAIN.rpcUrl, { fetchOptions: { cache: 'no-store' } }),
    });
    const marketId = BigInt(id);

    const [market, status, participants, resolution] = await Promise.all([
      client.readContract({
        address: CONTRACTS.CLIMATE_POOL, abi: climatePoolAbi,
        functionName: 'getMarketV5', args: [marketId],
      }) as Promise<readonly [string, bigint, bigint, bigint, bigint, bigint, bigint, bigint]>,
      client.readContract({
        address: CONTRACTS.CLIMATE_POOL, abi: climatePoolAbi,
        functionName: 'getMarketStatus', args: [marketId],
      }) as Promise<readonly [bigint, bigint, boolean, boolean, string, boolean, bigint]>,
      client.readContract({
        address: CONTRACTS.CLIMATE_POOL, abi: climatePoolAbi,
        functionName: 'getParticipantCount', args: [marketId],
      }) as Promise<bigint>,
      client.readContract({
        address: CONTRACTS.CLIMATE_POOL, abi: climatePoolAbi,
        functionName: 'getResolutionDetails', args: [marketId],
      }).catch(() => null) as Promise<readonly [bigint, bigint, boolean, boolean] | null>,
    ]);

    const [cityName, , , marketTypeIdRaw, thresholdRaw, startRaw, endRaw] = market;
    const [abovePool, belowPool, resolved, outcomeBool] = status;

    const marketTypeId = Number(marketTypeIdRaw);
    const above = Number(formatUnits(abovePool, 18));
    const below = Number(formatUnits(belowPool, 18));
    const total = above + below;
    const abovePct = total > 0 ? Math.round((above / total) * 100) : 50;
    const endTime = Number(endRaw);
    const daysLeft = Math.max(0, Math.ceil((endTime - Date.now() / 1000) / 86400));

    return {
      id,
      cityName,
      marketTypeId,
      thresholdValue: Number(thresholdRaw),
      unit: UNIT_BY_TYPE[marketTypeId] ?? '',
      startTime: Number(startRaw),
      endTime,
      abovePct,
      belowPct: 100 - abovePct,
      participantCount: Number(participants),
      resolved,
      daysLeft,
      outcome: resolved ? (outcomeBool ? 'above' : 'below') : null,
      actualValue:
        resolved && resolution && resolution[2] ? Number(resolution[0]) : null,
    };
  } catch {
    return null;
  }
}
