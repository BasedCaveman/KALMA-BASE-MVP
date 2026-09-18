'use client';

import type { QueryClient } from '@tanstack/react-query';
import {
  MARKETS_SNAPSHOT_QUERY_KEY,
  type SnapshotRow,
} from '@/hooks/useMarketsSnapshot';

const ODDS_SCALE = 1_000_000n;

function marketIdEquals(row: SnapshotRow, marketId: bigint) {
  return String(row.market_id) === marketId.toString();
}

function multiplier(total: bigint, sidePool: bigint) {
  return sidePool > 0n ? ((total * ODDS_SCALE) / sidePool).toString() : '0';
}

function replaceSnapshotRow(rows: SnapshotRow[] | undefined, row: SnapshotRow) {
  if (!rows) return rows;
  let replaced = false;
  const next = rows.map((existing) => {
    if (String(existing.market_id) !== String(row.market_id)) return existing;
    replaced = true;
    return row;
  });
  return replaced ? next : [row, ...next];
}

export function patchMarketSnapshotAfterPredict(params: {
  queryClient: QueryClient;
  marketId: bigint;
  side: 'above' | 'below';
  amountWei: bigint;
  hadUserPosition: boolean;
}) {
  const { queryClient, marketId, side, amountWei, hadUserPosition } = params;
  if (amountWei <= 0n) return;

  queryClient.setQueryData<SnapshotRow[] | undefined>(
    MARKETS_SNAPSHOT_QUERY_KEY,
    (rows) => {
      if (!rows) return rows;

      return rows.map((row) => {
        if (!marketIdEquals(row, marketId)) return row;

        const abovePool =
          BigInt(row.above_pool_wei || '0') + (side === 'above' ? amountWei : 0n);
        const belowPool =
          BigInt(row.below_pool_wei || '0') + (side === 'below' ? amountWei : 0n);
        const total = abovePool + belowPool;

        return {
          ...row,
          above_pool_wei: abovePool.toString(),
          below_pool_wei: belowPool.toString(),
          above_mul_e6: multiplier(total, abovePool),
          below_mul_e6: multiplier(total, belowPool),
          participant_count: Math.max(
            Number(row.participant_count ?? 0) + (hadUserPosition ? 0 : 1),
            0,
          ),
          updated_at: new Date().toISOString(),
        };
      });
    },
  );
}

export async function refreshMarketSnapshotAfterPredict(params: {
  queryClient: QueryClient;
  marketId: bigint;
}) {
  const { queryClient, marketId } = params;

  const response = await fetch(`/api/markets/${marketId.toString()}/refresh-snapshot`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`snapshot refresh failed (${response.status})`);
  }

  const payload = (await response.json()) as { row?: SnapshotRow };
  if (!payload.row) {
    await queryClient.invalidateQueries({ queryKey: MARKETS_SNAPSHOT_QUERY_KEY });
    return;
  }

  queryClient.setQueryData<SnapshotRow[] | undefined>(
    MARKETS_SNAPSHOT_QUERY_KEY,
    (rows) => replaceSnapshotRow(rows, payload.row!),
  );
}
