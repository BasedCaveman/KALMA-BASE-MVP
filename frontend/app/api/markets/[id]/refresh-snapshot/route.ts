// kalma/frontend/app/api/markets/[id]/refresh-snapshot/route.ts
//
// RS-2d: after a user takes a position, keep browse/card surfaces consistent
// without calling the full leaderboard cron or re-reading every market. This
// route reads one market from Base Sepolia, upserts one public markets_snapshot row,
// and returns that canonical row so the active client cache can be replaced.

import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createPublicClient, http } from 'viem';
import { baseSepolia } from '@/lib/chain';
import { CHAIN, CONTRACTS, climatePoolAbi } from '@/lib/contracts';
import { checkIpThrottle, getClientIp, hashIp } from '@/lib/ip-rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 20;

const POOL = CONTRACTS.CLIMATE_POOL;

type MarketSnapshotRow = {
  market_id: number;
  pool_address: string;
  city_name: string;
  lat: number;
  lon: number;
  market_type_id: number;
  threshold_value: number;
  start_time: number;
  end_time: number;
  prediction_deadline: number;
  above_pool_wei: string;
  below_pool_wei: string;
  above_mul_e6: string;
  below_mul_e6: string;
  participant_count: number;
  resolved: boolean;
  cancelled: boolean;
  outcome: boolean;
  actual_value: number | null;
  resolved_at: number | null;
  updated_at: string;
};

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function publicClient() {
  return createPublicClient({
    chain: baseSepolia,
    transport: http(CHAIN.rpcUrl, { fetchOptions: { cache: 'no-store' } }),
  });
}

function isSameOrigin(req: NextRequest): boolean {
  const host = req.headers.get('host');
  if (!host) return true;

  const check = (value: string | null): boolean | null => {
    if (!value) return null;
    try {
      return new URL(value).host === host;
    } catch {
      return false;
    }
  };

  const byOrigin = check(req.headers.get('origin'));
  if (byOrigin !== null) return byOrigin;

  const byReferer = check(req.headers.get('referer'));
  if (byReferer !== null) return byReferer;

  return true;
}

function parseMarketId(value: string | undefined): number | null {
  if (!value || !/^\d+$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

async function readSnapshotRow(marketId: number): Promise<MarketSnapshotRow> {
  const client = publicClient();
  const id = BigInt(marketId);

  const [config, status, distribution, participantCount, resolution] = await Promise.all([
    client.readContract({
      address: POOL,
      abi: climatePoolAbi,
      functionName: 'getMarketV5',
      args: [id],
    }) as Promise<readonly [string, bigint, bigint, bigint, bigint, bigint, bigint, bigint]>,
    client.readContract({
      address: POOL,
      abi: climatePoolAbi,
      functionName: 'getMarketStatus',
      args: [id],
    }) as Promise<readonly [bigint, bigint, boolean, boolean, string, boolean, bigint]>,
    client.readContract({
      address: POOL,
      abi: climatePoolAbi,
      functionName: 'getOdds',
      args: [id],
    }) as Promise<readonly [bigint, bigint, bigint, bigint]>,
    client.readContract({
      address: POOL,
      abi: climatePoolAbi,
      functionName: 'getParticipantCount',
      args: [id],
    }) as Promise<bigint>,
    client
      .readContract({
        address: POOL,
        abi: climatePoolAbi,
        functionName: 'getResolutionDetails',
        args: [id],
      })
      .catch(() => null) as Promise<readonly [bigint, bigint, boolean, boolean] | null>,
  ]);

  const [cityName, latRaw, lonRaw, typeRaw, thresholdRaw, startRaw, endRaw, deadlineRaw] = config;
  const [abovePool, belowPool, resolved, outcome, , cancelled] = status;
  const [, , aboveMul, belowMul] = distribution;

  let actualValue: number | null = null;
  let resolvedAt: number | null = null;
  if (resolution) {
    actualValue = Number(resolution[0]);
    resolvedAt = Number(resolution[1]) || null;
  }

  return {
    market_id: marketId,
    // market_id is only unique WITHIN a pool (docs/V7_DEPLOY_RUNBOOK_2026-08-26.md);
    // lowercased to match the CHECK constraint on the column.
    pool_address: POOL.toLowerCase(),
    city_name: cityName,
    lat: Number(latRaw) / 1e6,
    lon: Number(lonRaw) / 1e6,
    market_type_id: Number(typeRaw),
    threshold_value: Number(thresholdRaw),
    start_time: Number(startRaw),
    end_time: Number(endRaw),
    prediction_deadline: Number(deadlineRaw),
    above_pool_wei: abovePool.toString(),
    below_pool_wei: belowPool.toString(),
    above_mul_e6: aboveMul.toString(),
    below_mul_e6: belowMul.toString(),
    participant_count: Number(participantCount),
    resolved,
    cancelled,
    outcome,
    actual_value: actualValue,
    resolved_at: resolved ? resolvedAt : null,
    updated_at: new Date().toISOString(),
  };
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  if (!isSameOrigin(req)) {
    return NextResponse.json({ error: 'Cross-origin requests are not permitted' }, { status: 403 });
  }

  const { id: rawId } = await context.params;
  const marketId = parseMarketId(rawId);
  if (!marketId) {
    return NextResponse.json({ error: 'Invalid market id' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase service role is not configured' }, { status: 500 });
  }

  const throttle = await checkIpThrottle(
    supabase,
    'market_snapshot_refresh',
    hashIp(getClientIp(req)),
    { limit: 90, windowMs: 60 * 1000 },
  );
  if (!throttle.allowed) {
    return NextResponse.json({ error: 'Too many refreshes' }, { status: 429 });
  }

  try {
    const row = await readSnapshotRow(marketId);
    const { error } = await supabase
      .from('markets_snapshot')
      .upsert(row, { onConflict: 'market_id,pool_address' });

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json(
      { ok: true, row },
      { headers: { 'cache-control': 'no-store' } },
    );
  } catch (error) {
    console.error('[markets/refresh-snapshot] failed:', error);
    return NextResponse.json({ error: 'Snapshot refresh failed' }, { status: 502 });
  }
}
