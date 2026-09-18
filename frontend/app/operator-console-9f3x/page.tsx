'use client';

import { useMemo, useState } from 'react';
import { useAccount } from '@/hooks/useWallet';
import { useWriteContract } from '@/hooks/useWriteContract';
import { useReadContract, useReadContracts, useWaitForTransactionReceipt } from 'wagmi';
import { C, fonts, neu, R } from '@/components/design/palette';
import AppHeader from '@/components/shared/AppHeader';
import BottomNav from '@/components/design/BottomNav';
import { CONTRACTS, climatePoolAbi, climateOracleAbi } from '@/lib/contracts';
import { RECEIPT_POLL_INTERVAL_MS } from '@/lib/chain';

type MarketRow = {
  id: bigint;
  cityName: string;
  lat: number;
  lon: number;
  marketTypeId: number;
  startTime: number;
  endTime: number;
  resolved: boolean;
  cancelled: boolean;
};

const MARKET_TYPES = {
  RAIN: 1,
  TEMP_HIGH: 2,
  TEMP_LOW: 3,
  SNOW: 4,
  COLD_SPELL: 5,
  DRY_STRETCH: 6,
  FROST_RISK: 7,
  HEAVY_RAIN: 8,
} as const;

function marketTypeLabel(marketTypeId: number) {
  switch (marketTypeId) {
    case MARKET_TYPES.RAIN:
      return 'Rain';
    case MARKET_TYPES.TEMP_HIGH:
      return 'High temp';
    case MARKET_TYPES.TEMP_LOW:
      return 'Low temp';
    case MARKET_TYPES.SNOW:
      return 'Snow';
    case MARKET_TYPES.COLD_SPELL:
      return 'Cold spell';
    case MARKET_TYPES.DRY_STRETCH:
      return 'Dry stretch';
    case MARKET_TYPES.FROST_RISK:
      return 'Frost risk';
    case MARKET_TYPES.HEAVY_RAIN:
      return 'Heavy rain';
    default:
      return `Type ${marketTypeId}`;
  }
}

function unixToDateString(unixSeconds: number) {
  const d = new Date(unixSeconds * 1000);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function getDailyVariableForMarketType(marketTypeId: number) {
  switch (marketTypeId) {
    case MARKET_TYPES.RAIN:
    case MARKET_TYPES.DRY_STRETCH:
    case MARKET_TYPES.HEAVY_RAIN:
      return 'precipitation_sum';
    case MARKET_TYPES.TEMP_HIGH:
      return 'temperature_2m_max';
    case MARKET_TYPES.TEMP_LOW:
    case MARKET_TYPES.COLD_SPELL:
    case MARKET_TYPES.FROST_RISK:
      return 'temperature_2m_min';
    case MARKET_TYPES.SNOW:
      return 'snowfall_sum';
    default:
      throw new Error(`Unsupported market type ${marketTypeId}`);
  }
}

function longestRun(values: number[], predicate: (value: number) => boolean) {
  let best = 0;
  let current = 0;
  for (const value of values) {
    if (predicate(value)) {
      current += 1;
      best = Math.max(best, current);
    } else {
      current = 0;
    }
  }
  return best;
}

async function fetchObservedValue(m: MarketRow) {
  const startDate = unixToDateString(m.startTime);
  const endDate = unixToDateString(m.endTime);
  const dailyField = getDailyVariableForMarketType(m.marketTypeId);

  const url =
    `https://archive-api.open-meteo.com/v1/archive?latitude=${m.lat}&longitude=${m.lon}` +
    `&start_date=${startDate}&end_date=${endDate}` +
    `&daily=${dailyField}&timezone=UTC`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Open-Meteo failed with ${res.status}`);

  const data = await res.json();
  const values = Array.isArray(data?.daily?.[dailyField])
    ? data.daily[dailyField].map(Number).filter((n: number) => Number.isFinite(n))
    : [];

  if (!values.length) throw new Error('No weather values returned');

  if (m.marketTypeId === MARKET_TYPES.RAIN || m.marketTypeId === MARKET_TYPES.SNOW) {
    const total = values.reduce((sum: number, value: number) => sum + value, 0);
    return Math.max(0, Math.min(10_000, Math.round(total)));
  }

  if (m.marketTypeId === MARKET_TYPES.TEMP_HIGH || m.marketTypeId === MARKET_TYPES.TEMP_LOW) {
    const avg = values.reduce((sum: number, value: number) => sum + value, 0) / values.length;
    return Math.max(0, Math.min(10_000, Math.round(avg)));
  }

  if (m.marketTypeId === MARKET_TYPES.COLD_SPELL || m.marketTypeId === MARKET_TYPES.FROST_RISK) {
    // Inverted encoding: contract >= means the coldest night was below the
    // threshold. Must match watchdog.mjs / lib/oracle-cre/derive.ts exactly,
    // or a manual resolution here compares against historicalAvg in the
    // wrong scale and resolves the market wrong regardless of the real
    // weather.
    return Math.max(0, Math.min(10_000, 10_000 - Math.round(Math.min(...values) + 100)));
  }

  if (m.marketTypeId === MARKET_TYPES.DRY_STRETCH) {
    return longestRun(values, (value) => value <= 1);
  }

  if (m.marketTypeId === MARKET_TYPES.HEAVY_RAIN) {
    return Math.max(0, Math.min(10_000, Math.round(Math.max(...values))));
  }

  throw new Error(`Unsupported market type ${m.marketTypeId}`);
}

export default function OperatorConsolePage() {
  const { address } = useAccount();
  const [statusText, setStatusText] = useState('');
  const [workingId, setWorkingId] = useState<string | null>(null);

  const { data: owner } = useReadContract({
    address: CONTRACTS.CLIMATE_ORACLE,
    abi: climateOracleAbi,
    functionName: 'owner',
  });

  const isAuthorized =
    !!address &&
    !!owner &&
    address.toLowerCase() === String(owner).toLowerCase();

  const { data: nextMarketId } = useReadContract({
    address: CONTRACTS.CLIMATE_POOL,
    abi: climatePoolAbi,
    functionName: 'nextMarketId',
  });

  const ids = useMemo(() => {
    const count = nextMarketId ? Math.max(0, Number(nextMarketId) - 1) : 0;
    return Array.from({ length: count }, (_, i) => BigInt(i + 1));
  }, [nextMarketId]);

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

  const marketsRead = useReadContracts({
    contracts: marketContracts,
    query: { enabled: marketContracts.length > 0 },
  });

  const statusesRead = useReadContracts({
    contracts: statusContracts,
    query: { enabled: statusContracts.length > 0 },
  });

  const { writeContract, data: txHash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash: txHash,
    pollingInterval: RECEIPT_POLL_INTERVAL_MS,
    query: { enabled: !!txHash },
  });

  const rows = useMemo(() => {
    const now = Math.floor(Date.now() / 1000);
    const out: MarketRow[] = [];

    for (let i = 0; i < ids.length; i++) {
      const marketRes = marketsRead.data?.[i];
      const statusRes = statusesRead.data?.[i];
      if (marketRes?.status !== 'success' || statusRes?.status !== 'success') continue;

      const [cityName, latRaw, lonRaw, marketTypeId, _historicalAvg, startTime, endTime] =
        marketRes.result as [string, bigint, bigint, bigint, bigint, bigint, bigint, bigint];

      const [abovePool, belowPool, resolved, outcome, creator, cancelled] =
        statusRes.result as [bigint, bigint, boolean, boolean, string, boolean, bigint];

      if (resolved || cancelled || now < Number(endTime)) continue;

      out.push({
        id: ids[i],
        cityName,
        lat: Number(latRaw) / 1e6,
        lon: Number(lonRaw) / 1e6,
        marketTypeId: Number(marketTypeId),
        startTime: Number(startTime),
        endTime: Number(endTime),
        resolved,
        cancelled,
      });
    }

    return out;
  }, [ids, marketsRead.data, statusesRead.data]);

  async function handleResolve(m: MarketRow) {
    try {
      setWorkingId(m.id.toString());
      setStatusText(`Fetching weather for market ${m.id.toString()}...`);
      const actualValue = await fetchObservedValue(m);

      setStatusText(`Signing resolution for market ${m.id.toString()}...`);
      writeContract({
        address: CONTRACTS.CLIMATE_ORACLE,
        abi: climateOracleAbi,
        functionName: 'resolve',
        args: [m.id, BigInt(actualValue)],
      });
    } catch (err) {
      console.error(err);
      setStatusText('Could not resolve market.');
      setWorkingId(null);
    }
  }

  return (
    <div style={{ paddingBottom: 'var(--k-mobile-bottom-clearance)' }}>
      <AppHeader section="Operator" />

      <div style={{ padding: '0 16px 24px' }}>
        <div
          style={{
            ...neu.panelRaised,
            borderRadius: R.xl,
            padding: 16,
            marginBottom: 14,
          }}
        >
          <div
            style={{
              fontFamily: fonts.sans,
              fontSize: 16,
              fontWeight: 700,
              color: C.text,
              marginBottom: 6,
            }}
          >
            Operator wallet
          </div>

          <div
            style={{
              fontFamily: fonts.sans,
              fontSize: 14,
              color: C.textSoft,
              lineHeight: 1.5,
            }}
          >
            {address || 'Connect your operator wallet first.'}
          </div>

          <div
            style={{
              marginTop: 10,
              fontFamily: fonts.sans,
              fontSize: 14,
              color: isAuthorized ? C.above : C.below,
            }}
          >
            {isAuthorized
              ? 'Authorized oracle owner.'
              : 'Unauthorized operator wallet.'}
          </div>
        </div>

        {!isAuthorized ? (
          <div
            style={{
              ...neu.panelRaised,
              borderRadius: R.xl,
              padding: 16,
            }}
          >
            <div
              style={{
                fontFamily: fonts.sans,
                fontSize: 15,
                color: C.textSoft,
                lineHeight: 1.55,
              }}
            >
              This page only works for the wallet that currently owns the oracle contract.
            </div>
          </div>
        ) : rows.length === 0 ? (
          <div
            style={{
              ...neu.panelRaised,
              borderRadius: R.xl,
              padding: 16,
            }}
          >
            <div
              style={{
                fontFamily: fonts.sans,
                fontSize: 15,
                color: C.textSoft,
              }}
            >
              No expired unresolved markets right now.
            </div>
          </div>
        ) : (
          rows.map((m) => (
            <div
              key={m.id.toString()}
              style={{
                ...neu.panelRaised,
                borderRadius: R.xl,
                padding: 16,
                marginBottom: 12,
              }}
            >
              <div
                style={{
                  fontFamily: fonts.sans,
                  fontSize: 17,
                  fontWeight: 700,
                  color: C.text,
                }}
              >
                {m.cityName}
              </div>

              <div
                style={{
                  marginTop: 4,
                  fontFamily: fonts.sans,
                  fontSize: 14,
                  color: C.textSoft,
                }}
              >
                {marketTypeLabel(m.marketTypeId)} · ended{' '}
                {new Date(m.endTime * 1000).toLocaleString()}
              </div>

              <button
                type="button"
                onClick={() => void handleResolve(m)}
                disabled={isPending || isConfirming}
                style={{
                  marginTop: 12,
                  width: '100%',
                  padding: '15px 16px',
                  borderRadius: R.lg,
                  border: 'none',
                  background: C.dark,
                  color: '#FFFDF8',
                  fontFamily: fonts.sans,
                  fontSize: 15,
                  fontWeight: 700,
                  cursor: 'pointer',
                  boxShadow: `0 8px 24px ${C.dark}30, inset 0 1px 0 ${C.darkSoft}`,
                }}
              >
                {workingId === m.id.toString() && (isPending || isConfirming)
                  ? 'Resolving...'
                  : 'Resolve market'}
              </button>
            </div>
          ))
        )}

        {statusText ? (
          <div
            style={{
              marginTop: 12,
              fontFamily: fonts.sans,
              fontSize: 14,
              color: C.textSoft,
            }}
          >
            {statusText}
          </div>
        ) : null}

        {isSuccess ? (
          <div
            style={{
              marginTop: 12,
              fontFamily: fonts.sans,
              fontSize: 14,
              color: C.above,
            }}
          >
            Resolution submitted successfully.
          </div>
        ) : null}

        {error ? (
          <div
            style={{
              marginTop: 12,
              fontFamily: fonts.sans,
              fontSize: 14,
              color: C.below,
            }}
          >
            {'message' in error ? error.message : 'Could not resolve market.'}
          </div>
        ) : null}
      </div>

      <BottomNav />
    </div>
  );
}
