//frontend/components/shared/CreatorEarningsPanel.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  useReadContract,
  useReadContracts,
  useWaitForTransactionReceipt,
} from 'wagmi';
import { useAccount } from '@/hooks/useWallet';
import { useWriteContract } from '@/hooks/useWriteContract';
import { formatUnits } from 'viem';
import { useColors } from '@/hooks/useColors';
import { useTranslation } from '@/hooks/useTranslation';
import { useCurrencyContext } from '@/lib/currency-context';
import { CONTRACTS, climatePoolAbi, USDM_DECIMALS } from '@/lib/contracts';
import WalletErrorPanel from '@/components/shared/WalletErrorPanel';
import ShareQuestionButton from '@/components/shared/ShareQuestionButton';

// Some API rows arrive as JS numbers (Supabase int8/numeric serialization).
// Values > 2^53 stringify as scientific notation (e.g. "1.355e+21"), which
// BigInt() rejects. Normalize to a plain decimal string before parsing so a
// large attracted-TVL value never crashes the page.
function safeBigInt(v: unknown): bigint {
  if (typeof v === 'bigint') return v;
  if (v == null) return 0n;
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return 0n;
    return BigInt(Math.trunc(v).toLocaleString('fullwide', { useGrouping: false }));
  }
  const s = String(v).trim();
  if (!s) return 0n;
  if (/e/i.test(s)) {
    const n = Number(s);
    if (!Number.isFinite(n)) return 0n;
    return BigInt(Math.trunc(n).toLocaleString('fullwide', { useGrouping: false }));
  }
  try { return BigInt(s.split('.')[0]); } catch { return 0n; }
}

function earningsCopy(language: string) {
  const table: Record<string, Record<string, string>> = {
    en: {
      title: 'Risk signals you added',
      total: 'Total creator earnings',
      market: 'signal',
      markets: 'signals',
      pool: 'Total',
      earnings: 'Earnings',
      collectAll: 'Collect all',
      resolved: 'Resolved',
      cancelled: 'Cancelled',
      active: 'Active',
      collecting: 'Collecting...',
      collect: 'Collect',
      success: 'Creator earnings collected.',
      error: 'Could not collect earnings.',
      previous: 'Previous',
      next: 'Next',
      peopleDrawn: 'people drawn in',
      liqAttracted: 'liquidity attracted',
      mgmNudge: 'Your creator share grows with everyone your signals bring in.',
    },
    pt: {
      title: 'Sinais de risco que você adicionou',
      total: 'Total de ganhos do criador',
      market: 'sinal',
      markets: 'sinais',
      pool: 'Total',
      earnings: 'Ganhos',
      collectAll: 'Coletar tudo',
      resolved: 'Resolvido',
      cancelled: 'Cancelado',
      active: 'Ativo',
      collecting: 'Coletando...',
      collect: 'Coletar',
      success: 'Ganhos do criador coletados.',
      error: 'Não foi possível coletar os ganhos.',
      previous: 'Anterior',
      next: 'Próxima',
      peopleDrawn: 'pessoas atraídas',
      liqAttracted: 'liquidez atraída',
      mgmNudge: 'Sua parte de criador cresce com cada pessoa que seus sinais trazem.',
    },
    es: {
      title: 'Señales de riesgo que agregaste',
      total: 'Ganancias totales del creador',
      market: 'mercado',
      markets: 'mercados',
      pool: 'Total',
      earnings: 'Ganancias',
      collectAll: 'Cobrar todo',
      resolved: 'Resuelto',
      cancelled: 'Cancelado',
      active: 'Activo',
      collecting: 'Cobrando...',
      collect: 'Cobrar',
      success: 'Ganancias del creador cobradas.',
      error: 'No se pudieron cobrar las ganancias.',
      previous: 'Anterior',
      next: 'Siguiente',
      peopleDrawn: 'personas atraídas',
      liqAttracted: 'liquidez atraída',
      mgmNudge: 'Tu parte de creador crece con cada persona que tus señales atraen.',
    },
    fr: {
      title: 'Signaux de risque ajoutés',
      total: 'Gains totaux du créateur',
      market: 'marché',
      markets: 'marchés',
      pool: 'Total',
      earnings: 'Gains',
      collectAll: 'Tout récupérer',
      resolved: 'Résolu',
      cancelled: 'Annulé',
      active: 'Actif',
      collecting: 'Collecte...',
      collect: 'Collecter',
      success: 'Gains du créateur collectés.',
      error: 'Impossible de collecter les gains.',
      previous: 'Précédent',
      next: 'Suivant',
      peopleDrawn: 'personnes attirées',
      liqAttracted: 'liquidité attirée',
      mgmNudge: 'Ta part de créateur grandit avec chaque personne que tes signaux attirent.',
    },
    de: {
      title: 'Von dir hinzugefügte Risiko-Signale',
      total: 'Gesamte Ersteller-Einnahmen',
      market: 'Markt',
      markets: 'Märkte',
      pool: 'Total',
      earnings: 'Einnahmen',
      collectAll: 'Alle einsammeln',
      resolved: 'Aufgelöst',
      cancelled: 'Abgesagt',
      active: 'Aktiv',
      collecting: 'Wird gesammelt...',
      collect: 'Sammeln',
      success: 'Ersteller-Einnahmen gesammelt.',
      error: 'Einnahmen konnten nicht gesammelt werden.',
      previous: 'Zurück',
      next: 'Weiter',
      peopleDrawn: 'angezogene Personen',
      liqAttracted: 'angezogene Liquidität',
      mgmNudge: 'Dein Creator-Anteil wächst mit jeder Person, die deine Signale anziehen.',
    },
    zh: {
      title: '你添加的风险信号',
      total: '创作者总收益',
      market: '个市场',
      markets: '个市场',
      pool: '总额',
      earnings: '收益',
      collectAll: '全部领取',
      resolved: '已结算',
      cancelled: '已取消',
      active: '进行中',
      collecting: '领取中...',
      collect: '领取',
      success: '创作者收益已领取。',
      error: '无法领取创作者收益。',
      previous: '上一页',
      next: '下一页',
      peopleDrawn: '吸引的人数',
      liqAttracted: '吸引的流动性',
      mgmNudge: '每为你的信号带来一个人，你的创建者分成就会增长。',
    },
  };

  return table[language] ?? table.en;
}

export function CreatorEarningsPanel() {
  const { address } = useAccount();
  const { t, language } = useTranslation();
  const { formatLocal, currencyCode } = useCurrencyContext();
  const { C, fonts, neu, R } = useColors();
  const copy = earningsCopy(language);
  const [page, setPage] = useState(0);
  const [collectingAll, setCollectingAll] = useState(false);

  const { data: nextId } = useReadContract({
    address: CONTRACTS.CLIMATE_POOL,
    abi: climatePoolAbi,
    functionName: 'nextMarketId',
    query: { enabled: !!address },
  });

  const count = nextId ? Math.max(0, Number(nextId) - 1) : 0;
  const ids = useMemo(() => Array.from({ length: count }, (_, i) => BigInt(i + 1)), [count]);

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

  const infoContracts = useMemo(
    () =>
      ids.map((id) => ({
        address: CONTRACTS.CLIMATE_POOL,
        abi: climatePoolAbi,
        functionName: 'getMarket' as const,
        args: [id],
      })),
    [ids]
  );

  const { data: statuses } = useReadContracts({
    contracts: statusContracts,
    query: { enabled: statusContracts.length > 0 },
  });

  const { data: infos } = useReadContracts({
    contracts: infoContracts,
    query: { enabled: infoContracts.length > 0 },
  });

  const {
    writeContract,
    data: txHash,
    isPending,
    error: writeError,
    reset: resetWrite,
  } = useWriteContract();

  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash: txHash,
    query: { enabled: !!txHash },
  });

  const myCreatedMarkets = useMemo(() => {
    if (!address || !statuses || !infos) return [];

    const out: Array<{
      id: bigint;
      cityName: string;
      resolved: boolean;
      cancelled: boolean;
      pool: number;
      earnings: number;
    }> = [];

    for (let i = 0; i < ids.length; i++) {
      const status = statuses[i];
      const info = infos[i];
      if (status?.status !== 'success' || info?.status !== 'success') continue;

      const [abovePool, belowPool, resolved, , creator, cancelled, creatorEarnings] =
        status.result as [bigint, bigint, boolean, boolean, string, boolean, bigint];

      if (creator.toLowerCase() !== address.toLowerCase()) continue;

      const [cityName] = info.result as [string, bigint, bigint, boolean, bigint, bigint, bigint];
      const pool = Number(formatUnits(abovePool + belowPool, USDM_DECIMALS));
      const earnings = Number(formatUnits(creatorEarnings, USDM_DECIMALS));

      out.push({ id: ids[i], cityName, resolved, cancelled, pool, earnings });
    }

    return out;
  }, [address, ids, statuses, infos]);

  const totalEarnings = myCreatedMarkets.reduce((sum, m) => sum + m.earnings, 0);

  // VL-2: pull the creator's attraction credit from the same indexed scores the
  // /compete Builders board uses, so the numbers match across surfaces.
  const [attracted, setAttracted] = useState<{ participants: number; tvlWei: string } | null>(null);
  useEffect(() => {
    if (!address) return;
    let live = true;
    fetch('/api/leaderboard')
      .then((r) => r.json())
      .then((d) => {
        if (!live) return;
        const row = (d?.builders ?? []).find(
          (b: { address?: string }) => b.address?.toLowerCase() === address.toLowerCase(),
        );
        if (row) {
          setAttracted({
            participants: Number(row.participants_attracted ?? 0),
            tvlWei: String(row.tvl_attracted_wei ?? '0'),
          });
        }
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [address]);
  const attractedTvl = attracted
    ? Number(formatUnits(safeBigInt(attracted.tvlWei), USDM_DECIMALS))
    : 0;
  const withdrawable = myCreatedMarkets.filter((m) => m.earnings > 0 && m.resolved && !m.cancelled);
  const isUSD = currencyCode === 'USD';
  const pageSize = 10;
  const pageCount = Math.max(1, Math.ceil(myCreatedMarkets.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const visibleMarkets = myCreatedMarkets.slice(safePage * pageSize, safePage * pageSize + pageSize);

  function handleWithdraw(marketId: bigint) {
    writeContract({
      address: CONTRACTS.CLIMATE_POOL,
      abi: climatePoolAbi,
      functionName: 'withdrawCreatorEarnings',
      args: [marketId],
    });
  }

  // Collect every pending market in one tap. The contract has no batch withdraw,
  // so we sequence them — submit-only (no receipt polling) and spaced ~1.5s, so
  // the same-origin RPC-proxy footprint stays small and doesn't trip the IP
  // rate limit (the burst that got flagged before).
  async function handleCollectAll() {
    if (collectingAll || withdrawable.length === 0) return;
    setCollectingAll(true);
    for (const m of withdrawable) {
      try {
        await writeContract({
          address: CONTRACTS.CLIMATE_POOL,
          abi: climatePoolAbi,
          functionName: 'withdrawCreatorEarnings',
          args: [m.id],
          waitForReceipt: false,
        });
        await new Promise((r) => setTimeout(r, 1500));
      } catch {
        /* one failed withdraw shouldn't stop the rest */
      }
    }
    setCollectingAll(false);
  }

  if (!address) return null;
  if (myCreatedMarkets.length === 0) return null;

  return (
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
          fontFamily: fonts.mono,
          fontSize: 11,
          fontWeight: 700,
          color: C.textMutedStrong,
          letterSpacing: 1.4,
          textTransform: 'uppercase',
          marginBottom: 12,
        }}
      >
        {copy.title}
      </div>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          marginBottom: 14,
          padding: '10px 12px',
          borderRadius: R.sm,
          background: totalEarnings > 0 ? `${C.accent}10` : C.surfaceDeep,
        }}
      >
        <div>
          <div
            style={{
              fontFamily: fonts.mono,
              fontSize: 9,
              color: C.textMuted,
              letterSpacing: 1,
              textTransform: 'uppercase',
              marginBottom: 2,
            }}
          >
            {copy.total}
          </div>
          <span
            style={{
              fontFamily: fonts.display,
              fontSize: 24,
              fontWeight: 700,
              color: totalEarnings > 0 ? C.accent : C.textSoft,
            }}
          >
            {totalEarnings.toFixed(1)}
          </span>
          <span
            style={{
              fontFamily: fonts.mono,
              fontSize: 12,
              color: C.textMuted,
              marginLeft: 4,
            }}
          >
            USDC
          </span>
          {!isUSD && totalEarnings > 0 ? (
            <div
              style={{
                marginTop: 4,
                fontFamily: fonts.mono,
                fontSize: 11,
                color: C.textMuted,
              }}
            >
              ≈ {formatLocal(totalEarnings)}
            </div>
          ) : null}
        </div>

        <span
          style={{
            fontFamily: fonts.mono,
            fontSize: 11,
            color: C.textMuted,
          }}
        >
          {myCreatedMarkets.length} {myCreatedMarkets.length === 1 ? copy.market : copy.markets}
        </span>
      </div>

      {/* VL-2: the member-get-member credit — the people + liquidity your
          signals pulled in (same numbers as the /compete Builders board).
          This is the reason to keep sharing. */}
      {attracted && (attracted.participants > 0 || attractedTvl > 0) ? (
        <div
          style={{
            marginBottom: 14,
            padding: '10px 12px',
            borderRadius: R.sm,
            background: `${C.above}10`,
          }}
        >
          <div style={{ fontFamily: fonts.sans, fontSize: 14, color: C.text, fontWeight: 600 }}>
            <span style={{ color: C.above, fontWeight: 800 }}>{attracted.participants}</span>{' '}
            {copy.peopleDrawn} ·{' '}
            <span style={{ color: C.above, fontWeight: 800 }}>
              {attractedTvl.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </span>{' '}
            USDC {copy.liqAttracted}
          </div>
          <div style={{ fontFamily: fonts.sans, fontSize: 12, color: C.textSoft, marginTop: 4, lineHeight: 1.4 }}>
            {copy.mgmNudge}
          </div>
        </div>
      ) : null}

      {withdrawable.length >= 2 ? (
        <button
          onClick={handleCollectAll}
          disabled={collectingAll}
          style={{ ...neu.controlRaised, borderRadius: R.sm, padding: '10px 14px', marginBottom: 12, cursor: collectingAll ? 'default' : 'pointer', color: C.accent, fontFamily: fonts.sans, fontWeight: 700, fontSize: 13.5, border: `1px solid ${C.accent}66`, width: '100%' }}
        >
          {collectingAll ? `${copy.collectAll}…` : `${copy.collectAll} (${withdrawable.length})`}
        </button>
      ) : null}

      {visibleMarkets.map((m) => (
        <div
          key={m.id.toString()}
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 12,
            padding: '10px 0',
            borderBottom: `1px solid ${C.divider}40`,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontFamily: fonts.sans,
                fontSize: 14,
                fontWeight: 600,
                color: C.text,
              }}
            >
              {m.cityName}
            </div>
            <div
              style={{
                fontFamily: fonts.mono,
                fontSize: 11,
                color: C.textMuted,
                marginTop: 2,
                lineHeight: 1.4,
              }}
            >
              {copy.pool}: {m.pool.toFixed(0)} · {copy.earnings}: {m.earnings.toFixed(2)}
              {!isUSD && m.earnings > 0 ? ` (${formatLocal(m.earnings)})` : ''}
              {m.resolved ? ` · ${copy.resolved}` : m.cancelled ? ` · ${copy.cancelled}` : ` · ${copy.active}`}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            {/* CO-6: creators share their own signal's link to pull people in
                (and grow their creator share). The poster carries the real
                question; the creator-framed copy lives in the modal. */}
            {!m.cancelled ? (
              <ShareQuestionButton
                marketId={m.id.toString()}
                variant="creator"
                question={m.cityName}
                compact
              />
            ) : null}

            {m.earnings > 0 && m.resolved ? (
              <button
                onClick={() => handleWithdraw(m.id)}
                disabled={isPending || isConfirming}
                style={{
                  padding: '8px 14px',
                  borderRadius: R.sm,
                  border: 'none',
                  background: C.accent,
                  color: C.bg,
                  fontFamily: fonts.sans,
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                  opacity: isPending || isConfirming ? 0.6 : 1,
                }}
              >
                {isPending || isConfirming ? copy.collecting : copy.collect}
              </button>
            ) : null}
          </div>
        </div>
      ))}

      {pageCount > 1 ? (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 10,
            marginTop: 12,
          }}
        >
          <button
            type="button"
            onClick={() => setPage((current) => Math.max(0, current - 1))}
            disabled={safePage === 0}
            style={{
              padding: '8px 12px',
              borderRadius: R.sm,
              border: `1px solid ${C.divider}`,
              background: C.surface,
              color: C.text,
              fontFamily: fonts.sans,
              fontSize: 12,
              fontWeight: 700,
              cursor: safePage === 0 ? 'default' : 'pointer',
              opacity: safePage === 0 ? 0.45 : 1,
            }}
          >
            {copy.previous}
          </button>
          <div
            style={{
              fontFamily: fonts.mono,
              fontSize: 11,
              color: C.textMuted,
            }}
          >
            {safePage + 1} / {pageCount}
          </div>
          <button
            type="button"
            onClick={() => setPage((current) => Math.min(pageCount - 1, current + 1))}
            disabled={safePage >= pageCount - 1}
            style={{
              padding: '8px 12px',
              borderRadius: R.sm,
              border: `1px solid ${C.divider}`,
              background: C.surface,
              color: C.text,
              fontFamily: fonts.sans,
              fontSize: 12,
              fontWeight: 700,
              cursor: safePage >= pageCount - 1 ? 'default' : 'pointer',
              opacity: safePage >= pageCount - 1 ? 0.45 : 1,
            }}
          >
            {copy.next}
          </button>
        </div>
      ) : null}

      {isSuccess ? (
        <div
          style={{
            marginTop: 10,
            fontFamily: fonts.sans,
            fontSize: 14,
            color: C.above,
          }}
        >
          {copy.success}
        </div>
      ) : null}

      {writeError ? (
        <div style={{ marginTop: 10 }}>
          <WalletErrorPanel
            error={writeError}
            onAfterReset={resetWrite}
            compact
          />
        </div>
      ) : null}
    </div>
  );
}
