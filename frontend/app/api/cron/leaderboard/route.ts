// kalma/frontend/app/api/cron/leaderboard/route.ts
//
// Leaderboard indexer for the public testnet battle-test. Reads ClimatePool
// on-chain activity and rolls it up into public.competition_scores.
//
// Strategy: FULL RECOMPUTE each run. At testnet scale this is trivial and
// idempotent — head ~21M blocks but a topic-filtered getLogs over the whole
// range returns in <500ms, and there are only ~tens of markets. Recomputing
// from scratch avoids any incremental-cursor double-count risk.
//
// Terminology seam: this uses CANONICAL protocol terms (market, position,
// creator earnings, TVL, participant, claim). The /compete UI translates them
// into warmer labels via i18n; this indexer never changes.
//
// Auth + service-role client mirror app/api/cron/signal-engine/route.ts.

import { NextResponse, type NextRequest } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createPublicClient, http, parseAbiItem, type Address } from 'viem';
import { baseSepolia } from '@/lib/chain';
import { CHAIN, CONTRACTS, climatePoolAbi } from '@/lib/contracts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const POOL = CONTRACTS.CLIMATE_POOL;

const EV = {
  created: parseAbiItem(
    'event MarketCreated(uint256 indexed marketId, string cityName, address indexed creator, uint256 marketTypeId, uint256 startTime, uint256 endTime)',
  ),
  position: parseAbiItem(
    'event PositionTaken(uint256 indexed marketId, address indexed user, bool isAbove, uint256 amount)',
  ),
  claimed: parseAbiItem(
    'event Claimed(uint256 indexed marketId, address indexed user, uint256 netReturn)',
  ),
} as const;

// ── RS-1: competition scoring window + bounded scan ──────────────────────────
// Score only markets whose prediction window opens within the competition
// (Jul 25 → Aug 15, 2026 UTC), keyed off the market's on-chain startTime — no
// per-event block-timestamp lookups needed. This scope is always enforced so
// the public board never mixes pre-launch farming with the battle-test.
const COMPETITION_START_TS =
  Number(process.env.COMPETITION_START_TS || '') ||
  Math.floor(Date.parse('2026-07-25T00:00:00Z') / 1000);
const COMPETITION_END_TS =
  Number(process.env.COMPETITION_END_TS || '') ||
  Math.floor(Date.parse('2026-08-15T23:59:59Z') / 1000);

// Lower bound for the event scan. Defaults to genesis (current behavior); set
// LEADERBOARD_FROM_BLOCK to the competition-start block once known to keep the
// getLogs range bounded as history grows (the "incremental" cost control).
const LEADERBOARD_FROM_BLOCK = BigInt(process.env.LEADERBOARD_FROM_BLOCK || '0');

// ── Auth ─────────────────────────────────────────────────────────────────────
function isAuthorized(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return process.env.NODE_ENV !== 'production';
  const auth = req.headers.get('authorization') ?? '';
  if (auth === `Bearer ${expected}`) return true;
  return new URL(req.url).searchParams.get('secret') === expected;
}

function getSupabaseAdmin(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

function publicClient() {
  return createPublicClient({
    chain: baseSepolia,
    transport: http(CHAIN.rpcUrl, { fetchOptions: { cache: 'no-store' } }),
  });
}

// ── Per-address running aggregate (bigints; serialized to strings on upsert) ──
type Score = {
  markets_created: number;
  creator_revenue_wei: bigint;
  participants_attracted: number;
  tvl_attracted_wei: bigint;
  markets_predicted: number;
  volume_wei: bigint;
  correct_predictions: number;
  resolved_predictions: number;
  staked_wei: bigint;
  claimed_wei: bigint;
};
const emptyScore = (): Score => ({
  markets_created: 0,
  creator_revenue_wei: 0n,
  participants_attracted: 0,
  tvl_attracted_wei: 0n,
  markets_predicted: 0,
  volume_wei: 0n,
  correct_predictions: 0,
  resolved_predictions: 0,
  staked_wei: 0n,
  claimed_wei: 0n,
});

// RS-2: write the off-chain browse snapshot. Reuses statuses + participantCounts
// already fetched for the leaderboard; adds config/distribution/resolution multicalls.
// Mirrors the field shapes useMarkets reads on-chain so the client mapping is
// 1:1. Fail-soft: a snapshot error must never break the leaderboard rollup.
async function writeMarketsSnapshot(
  supabase: SupabaseClient,
  client: ReturnType<typeof publicClient>,
  marketIds: bigint[],
  statuses: readonly { status: string; result?: unknown }[],
  participantCounts: readonly { status: string; result?: unknown }[],
  configs: readonly { status: string; result?: unknown }[],
): Promise<number> {
  if (marketIds.length === 0) return 0;

  const mk = (functionName: 'getOdds' | 'getResolutionDetails') =>
    marketIds.map((id) => ({ address: POOL, abi: climatePoolAbi, functionName, args: [id] }) as const);

  // configs (getMarketV5) is passed in — already fetched for the window scope.
  const [distributions, resolutions] = await Promise.all([
    client.multicall({ allowFailure: true, contracts: mk('getOdds') }),
    client.multicall({ allowFailure: true, contracts: mk('getResolutionDetails') }),
  ]);

  const now = new Date().toISOString();
  const rows = marketIds
    .map((id, i) => {
      const cfg = configs[i];
      const st = statuses[i];
      if (cfg?.status !== 'success' || st?.status !== 'success') return null;

      const [cityName, latRaw, lonRaw, typeRaw, thrRaw, startRaw, endRaw, deadlineRaw] =
        cfg.result as readonly [string, bigint, bigint, bigint, bigint, bigint, bigint, bigint];
      const [abovePool, belowPool, resolved, outcome, , cancelled] =
        st.result as readonly [bigint, bigint, boolean, boolean, string, boolean, bigint];

      let aboveMul = '0';
      let belowMul = '0';
      const od = distributions[i];
      if (od?.status === 'success') {
        const o = od.result as readonly [bigint, bigint, bigint, bigint];
        aboveMul = o[2].toString();
        belowMul = o[3].toString();
      }

      let actualValue: number | null = null;
      let resolvedAt: number | null = null;
      const rd = resolutions[i];
      if (rd?.status === 'success') {
        const r = rd.result as readonly [bigint, bigint, boolean, boolean];
        actualValue = Number(r[0]);
        resolvedAt = Number(r[1]) || null;
      }

      const pc = participantCounts[i];

      return {
        market_id: Number(id),
        // market_id is only unique WITHIN a pool (docs/V7_DEPLOY_RUNBOOK_2026-08-26.md).
        pool_address: POOL.toLowerCase(),
        city_name: cityName,
        lat: Number(latRaw) / 1e6,
        lon: Number(lonRaw) / 1e6,
        market_type_id: Number(typeRaw),
        threshold_value: Number(thrRaw),
        start_time: Number(startRaw),
        end_time: Number(endRaw),
        prediction_deadline: Number(deadlineRaw),
        above_pool_wei: abovePool.toString(),
        below_pool_wei: belowPool.toString(),
        above_mul_e6: aboveMul,
        below_mul_e6: belowMul,
        participant_count: pc?.status === 'success' ? Number(pc.result as bigint) : 0,
        resolved,
        cancelled,
        outcome,
        actual_value: actualValue,
        resolved_at: resolved ? resolvedAt : null,
        updated_at: now,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  if (rows.length > 0) {
    const { error } = await supabase.from('markets_snapshot').upsert(rows, { onConflict: 'market_id,pool_address' });
    if (error) throw new Error(`upsert markets_snapshot: ${error.message}`);
  }
  return rows.length;
}

async function runIndex(supabase: SupabaseClient) {
  const startedAt = Date.now();
  const client = publicClient();
  const head = await client.getBlockNumber();

  // 1. Pull events (each a single wide getLogs — proven fast at this scale).
  // fromBlock is the bounded lower edge (RS-1): genesis by default, the
  // competition-start block once set.
  const [positions, claims] = await Promise.all([
    client.getLogs({ address: POOL, event: EV.position, fromBlock: LEADERBOARD_FROM_BLOCK, toBlock: head }),
    client.getLogs({ address: POOL, event: EV.claimed, fromBlock: LEADERBOARD_FROM_BLOCK, toBlock: head }),
  ]);

  // 2. Authoritative per-market state via multicall (chain has Multicall3).
  const nextId = (await client.readContract({
    address: POOL,
    abi: climatePoolAbi,
    functionName: 'nextMarketId',
  })) as bigint;
  const marketIds = Array.from({ length: Math.max(0, Number(nextId) - 1) }, (_, i) => BigInt(i + 1));

  // Fee config drives the creator-revenue computation below. getMarketStatus's
  // creatorEarnings field is the PENDING balance (zeroed when the creator calls
  // withdrawCreatorEarnings), so it undercounts anyone who already withdrew. We
  // instead compute earned revenue from the fee math, which is withdrawal- and
  // claim-timing-independent.
  const feeConfig = (await client.readContract({
    address: POOL,
    abi: climatePoolAbi,
    functionName: 'getFeeConfig',
  })) as readonly [bigint, bigint, bigint, bigint, Address, Address];
  const feeBps = feeConfig[0];
  const creatorShareBps = feeConfig[2];

  const [statuses, participantCounts, configs] = await Promise.all([
    client.multicall({
      allowFailure: true,
      contracts: marketIds.map((id) => ({ address: POOL, abi: climatePoolAbi, functionName: 'getMarketStatus', args: [id] }) as const),
    }),
    client.multicall({
      allowFailure: true,
      contracts: marketIds.map((id) => ({ address: POOL, abi: climatePoolAbi, functionName: 'getParticipantCount', args: [id] }) as const),
    }),
    // getMarketV5 → startTime (field 5) drives the competition-window scope.
    client.multicall({
      allowFailure: true,
      contracts: marketIds.map((id) => ({ address: POOL, abi: climatePoolAbi, functionName: 'getMarketV5', args: [id] }) as const),
    }),
  ]);

  // RS-1 window scope: the board stays empty before launch. Once active, only
  // markets whose startTime falls inside [start, end] count.
  const nowTs = Math.floor(Date.now() / 1000);
  const windowActive = nowTs >= COMPETITION_START_TS;
  const inWindow = (startTime: number): boolean =>
    windowActive && startTime >= COMPETITION_START_TS && startTime <= COMPETITION_END_TS;
  const startTimeOf = (i: number): number => {
    const cfg = configs[i];
    if (cfg?.status !== 'success') return 0;
    const t = (cfg.result as readonly [string, bigint, bigint, bigint, bigint, bigint, bigint, bigint])[5];
    return Number(t);
  };

  // Markets credited this run: not cancelled AND in the active window.
  const scoped = new Set<string>();

  const scores = new Map<string, Score>();
  const get = (addr: string) => {
    const a = addr.toLowerCase();
    let s = scores.get(a);
    if (!s) { s = emptyScore(); scores.set(a, s); }
    return s;
  };

  // Market-level rollup: builder credit + outcome/cancelled lookup for predictors.
  const cancelled = new Set<string>();
  const outcome = new Map<string, boolean>(); // resolved markets only; true = Above won

  marketIds.forEach((id, i) => {
    const st = statuses[i];
    if (st.status !== 'success') return;
    // 7th field (creatorEarnings) is intentionally NOT used — it's the pending
    // balance, zeroed on withdraw. Creator revenue is computed from the pools.
    const [abovePool, belowPool, resolved, mkOutcome, creator, isCancelled] =
      st.result as readonly [bigint, bigint, boolean, boolean, Address, boolean, bigint];
    const idStr = id.toString();
    if (isCancelled) { cancelled.add(idStr); return; } // cancelled → refunded; no credit
    if (!inWindow(startTimeOf(i))) return; // outside the competition window — no credit
    scoped.add(idStr);

    const s = get(creator);
    s.markets_created += 1;
    s.tvl_attracted_wei += abovePool + belowPool;
    if (resolved) {
      outcome.set(idStr, mkOutcome);
      // Total creator revenue this market earns = feeBps × creatorShareBps of
      // the LOSING pool. The contract takes feeBps of each winner's profit on
      // claim; summed over all winners, total profit == the losing pool. So
      // this equals the full creator fee once winners claim — and is unaffected
      // by withdrawal (unlike the on-chain creatorEarnings balance).
      const losingPool = mkOutcome ? belowPool : abovePool;
      s.creator_revenue_wei += (losingPool * feeBps * creatorShareBps) / 100000000n;
    }
    const pc = participantCounts[i];
    if (pc.status === 'success') s.participants_attracted += Number(pc.result as bigint);
  });

  // Predictor rollup: positions per (market,user) for accuracy; volume + staked.
  const pos = new Map<string, { above: bigint; below: bigint }>(); // key `${marketId}:${user}`
  for (const log of positions) {
    const { marketId, user, isAbove, amount } = log.args as { marketId: bigint; user: Address; isAbove: boolean; amount: bigint };
    const idStr = marketId.toString();
    if (!scoped.has(idStr)) continue; // out-of-window or cancelled
    const u = user.toLowerCase();
    const key = `${idStr}:${u}`;
    const p = pos.get(key) ?? { above: 0n, below: 0n };
    if (isAbove) p.above += amount; else p.below += amount;
    pos.set(key, p);
    const s = get(u);
    s.volume_wei += amount;
    s.staked_wei += amount;
  }

  const userMarkets = new Map<string, Set<string>>();
  for (const [key, p] of pos) {
    const sep = key.indexOf(':');
    const idStr = key.slice(0, sep);
    const u = key.slice(sep + 1);
    (userMarkets.get(u) ?? userMarkets.set(u, new Set()).get(u)!).add(idStr);
    if (outcome.has(idStr)) {
      const above = outcome.get(idStr)!;
      const s = get(u);
      s.resolved_predictions += 1;
      const predictedAbove = p.above > p.below;
      const predictedBelow = p.below > p.above;
      if ((above && predictedAbove) || (!above && predictedBelow)) s.correct_predictions += 1;
    }
  }
  for (const [u, set] of userMarkets) get(u).markets_predicted = set.size;

  // Claims → realized returns.
  for (const log of claims) {
    const { marketId, user, netReturn } = log.args as { marketId: bigint; user: Address; netReturn: bigint };
    if (!scoped.has(marketId.toString())) continue;
    get(user.toLowerCase()).claimed_wei += netReturn;
  }

  // 3. Upsert. first_seen is omitted so it's set once on insert and preserved.
  const now = new Date().toISOString();
  const rows = [...scores.entries()].map(([address, s]) => ({
    address,
    markets_created: s.markets_created,
    creator_revenue_wei: s.creator_revenue_wei.toString(),
    participants_attracted: s.participants_attracted,
    tvl_attracted_wei: s.tvl_attracted_wei.toString(),
    markets_predicted: s.markets_predicted,
    volume_wei: s.volume_wei.toString(),
    correct_predictions: s.correct_predictions,
    resolved_predictions: s.resolved_predictions,
    net_return_wei: (s.claimed_wei - s.staked_wei).toString(),
    updated_at: now,
  }));

  if (rows.length > 0) {
    const { error } = await supabase.from('competition_scores').upsert(rows, { onConflict: 'address' });
    if (error) throw new Error(`upsert competition_scores: ${error.message}`);
  }

  // RS-1 reconcile: the table must reflect ONLY current-scope scores. Rows just
  // written carry updated_at = now; anything older is an address that fell out
  // of scope this run (e.g. a battle-test address once the competition window
  // opens, or a market that got cancelled). Drop them so the board never mixes
  // stale and in-window scores. Fail-soft.
  const { error: reconcileError } = await supabase
    .from('competition_scores')
    .delete()
    .lt('updated_at', now);
  if (reconcileError) {
    console.error('[leaderboard] reconcile delete failed:', reconcileError.message);
  }

  await supabase
    .from('competition_meta')
    .update({
      competition_start: new Date(COMPETITION_START_TS * 1000).toISOString(),
      competition_end: new Date(COMPETITION_END_TS * 1000).toISOString(),
      last_indexed_block: head.toString(),
      updated_at: now,
    })
    .eq('id', 1);

  // RS-2: refresh the off-chain browse snapshot from the state we just read.
  // Fail-soft — never let a snapshot error fail the leaderboard run.
  let snapshotRows = 0;
  let snapshotError: string | null = null;
  try {
    snapshotRows = await writeMarketsSnapshot(supabase, client, marketIds, statuses, participantCounts, configs);
  } catch (e) {
    snapshotError = e instanceof Error ? e.message : String(e);
    console.error('[leaderboard] markets_snapshot write failed:', snapshotError);
  }

  return {
    head: head.toString(),
    from_block: LEADERBOARD_FROM_BLOCK.toString(),
    markets: marketIds.length,
    cancelled: cancelled.size,
    window_active: windowActive,
    window: `${COMPETITION_START_TS}..${COMPETITION_END_TS}`,
    scoped_markets: scoped.size,
    addresses: rows.length,
    positions: positions.length,
    claims: claims.length,
    snapshot_rows: snapshotRows,
    snapshot_error: snapshotError,
    elapsed_ms: Date.now() - startedAt,
  };
}

async function handle(req: NextRequest) {
  if (!isAuthorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: 'supabase_not_configured' }, { status: 503 });
  try {
    const summary = await runIndex(supabase);
    return NextResponse.json({ ok: true, ...summary });
  } catch (e) {
    console.error('[leaderboard] index error:', e);
    return NextResponse.json({ error: 'index_failed', message: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
