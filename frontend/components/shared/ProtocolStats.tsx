//frontend/components/shared/ProtocolStats.tsx
'use client'

import { useMemo } from 'react'
import { useReadContract, useReadContracts } from 'wagmi';
import { formatUnits } from 'viem'
import { useColors } from '@/hooks/useColors'
import { useTranslation } from '@/hooks/useTranslation'
import { useCurrencyContext } from '@/lib/currency-context'
import { CONTRACTS, climatePoolAbi, USDM_DECIMALS } from '@/lib/contracts'

const PROTOCOL_STATS_STALE_MS = 5 * 60 * 1000;
const PROTOCOL_STATS_GC_MS = 60 * 60 * 1000;
const protocolStatsQuery = {
  staleTime: PROTOCOL_STATS_STALE_MS,
  gcTime: PROTOCOL_STATS_GC_MS,
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
};

function statsCopy(language: string) {
  const table: Record<string, Record<string, string>> = {
    en: {
      title: 'Protocol activity',
      markets: 'Markets',
      resolved: 'resolved',
      volume: 'Total volume',
      climateFund: 'Climate fund',
      accumulated: 'generated',
      creatorEarnings: 'Creator earnings',
      distributed: 'generated',
      footer: 'Every position contributes to the climate adaptation fund.',
    },
    pt: {
      title: 'Atividade do protocolo',
      markets: 'Mercados',
      resolved: 'resolvidos',
      volume: 'Volume total',
      climateFund: 'Fundo climático',
      accumulated: 'gerado',
      creatorEarnings: 'Ganhos do criador',
      distributed: 'gerados',
      footer: 'Cada posição contribui para o fundo de adaptação climática.',
    },
    es: {
      title: 'Actividad del protocolo',
      markets: 'Mercados',
      resolved: 'resueltos',
      volume: 'Volumen total',
      climateFund: 'Fondo climático',
      accumulated: 'generado',
      creatorEarnings: 'Ganancias del creador',
      distributed: 'generadas',
      footer: 'Cada posición contribuye al fondo de adaptación climática.',
    },
    fr: {
      title: 'Activité du protocole',
      markets: 'Marchés',
      resolved: 'résolus',
      volume: 'Volume total',
      climateFund: 'Fonds climat',
      accumulated: 'généré',
      creatorEarnings: 'Revenus créateur',
      distributed: 'générés',
      footer: 'Chaque position contribue au fonds d\'adaptation climatique.',
    },
    de: {
      title: 'Protokoll-Aktivität',
      markets: 'Märkte',
      resolved: 'aufgelöst',
      volume: 'Gesamtvolumen',
      climateFund: 'Klimafonds',
      accumulated: 'generiert',
      creatorEarnings: 'Ersteller-Erträge',
      distributed: 'generiert',
      footer: 'Jede Position trägt zum Klimaanpassungsfonds bei.',
    },
    zh: {
      title: '协议活动',
      markets: '市场',
      resolved: '已结算',
      volume: '总交易量',
      climateFund: '气候基金',
      accumulated: '已产生',
      creatorEarnings: '创建者收益',
      distributed: '已产生',
      footer: '每一笔参与都会为气候适应基金做出贡献。',
    },
  }

  return table[language] ?? table.en
}

export function ProtocolStats({ compact = false }: { compact?: boolean } = {}) {
  const { C, fonts, neu, R } = useColors()
  const { language } = useTranslation()
  const { formatLocal } = useCurrencyContext()
  const copy = statsCopy(language)

  const { data: nextId } = useReadContract({
    address: CONTRACTS.CLIMATE_POOL,
    abi: climatePoolAbi,
    functionName: 'nextMarketId',
    query: protocolStatsQuery,
  })

  const { data: feeConfig } = useReadContract({
    address: CONTRACTS.CLIMATE_POOL,
    abi: climatePoolAbi,
    functionName: 'getFeeConfig',
    query: protocolStatsQuery,
  })

  const marketCount = nextId ? Math.max(0, Number(nextId) - 1) : 0
  const ids = useMemo(() => Array.from({ length: marketCount }, (_, i) => BigInt(i + 1)), [marketCount])

  const statusContracts = useMemo(() =>
    ids.map(id => ({
      address: CONTRACTS.CLIMATE_POOL,
      abi: climatePoolAbi,
      functionName: 'getMarketStatus' as const,
      args: [id],
    })),
  [ids])

  const { data: statuses } = useReadContracts({
    contracts: statusContracts,
    query: {
      enabled: statusContracts.length > 0,
      ...protocolStatsQuery,
    },
  })

  const { totalVolume, resolvedCount, creatorRevenueGenerated, climateFundGenerated } = useMemo(() => {
    let vol = 0
    let resolved = 0
    let creatorRevenueWei = 0n
    let climateFundWei = 0n
    const feeBps = feeConfig?.[0] ?? 0n
    const creatorShareBps = feeConfig?.[2] ?? 0n
    const climateShareBps = feeConfig?.[3] ?? 0n
    if (!statuses) {
      return {
        totalVolume: 0,
        resolvedCount: 0,
        creatorRevenueGenerated: 0,
        climateFundGenerated: 0,
      }
    }

    for (const s of statuses) {
      if (s?.status !== 'success') continue
      const [abovePool, belowPool, isResolved] =
        s.result as [bigint, bigint, boolean, boolean, string, boolean, bigint]
      vol += Number(formatUnits(abovePool + belowPool, USDM_DECIMALS))
      if (isResolved) {
        resolved++
        // Do not use getMarketStatus.creatorEarnings here: it is the pending
        // withdrawable balance and is zeroed after withdrawCreatorEarnings.
        // Generated creator revenue is feeBps * creatorShareBps of the losing
        // pool, matching the leaderboard's withdrawal-independent math.
        const [, , , outcome, , cancelled] =
          s.result as [bigint, bigint, boolean, boolean, string, boolean, bigint]
        if (!cancelled) {
          const losingPool = outcome ? belowPool : abovePool
          creatorRevenueWei += (losingPool * feeBps * creatorShareBps) / 100000000n
          climateFundWei += (losingPool * feeBps * climateShareBps) / 100000000n
        }
      }
    }
    return {
      totalVolume: vol,
      resolvedCount: resolved,
      creatorRevenueGenerated: Number(formatUnits(creatorRevenueWei, USDM_DECIMALS)),
      climateFundGenerated: Number(formatUnits(climateFundWei, USDM_DECIMALS)),
    }
  }, [feeConfig, statuses])

  if (marketCount === 0) return null

  // Compact mode — used inside the /markets dash strip. Four stats as
  // small inline chips with mono label + accent value. No title, no
  // footer, no panel chrome. Designed to slot next to a search input
  // and a location pill in a single horizontal row.
  if (compact) {
    return (
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 14,
          alignItems: 'baseline',
        }}
      >
        <MiniStat
          label={copy.markets}
          value={String(marketCount)}
          C={C}
          fonts={fonts}
        />
        <MiniStat
          label={copy.volume}
          value={formatLocal(totalVolume)}
          C={C}
          fonts={fonts}
        />
        <MiniStat
          label={copy.climateFund}
          value={formatLocal(climateFundGenerated)}
          C={C}
          fonts={fonts}
          accent
        />
        <MiniStat
          label={copy.creatorEarnings}
          value={formatLocal(creatorRevenueGenerated)}
          C={C}
          fonts={fonts}
          accent
        />
      </div>
    )
  }

  return (
    <div style={{
      ...neu.panelRaised,
      borderRadius: R.xl,
      padding: '18px 16px 14px',
    }}>
      <div style={{
        fontFamily: fonts.mono, fontSize: 10, fontWeight: 700,
        color: C.textMutedStrong, letterSpacing: 1.5, textTransform: 'uppercase',
        marginBottom: 14,
      }}>
        {copy.title}
      </div>

      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr',
        gap: 10,
      }}>
        <StatBox
          label={copy.markets}
          value={String(marketCount)}
          sub={`${resolvedCount} ${copy.resolved}`}
          C={C} fonts={fonts} neu={neu} R={R}
        />
        <StatBox
          label={copy.volume}
          value={formatLocal(totalVolume)}
          sub=""
          C={C} fonts={fonts} neu={neu} R={R}
        />
        <StatBox
          label={copy.climateFund}
          value={formatLocal(climateFundGenerated)}
          sub={copy.accumulated}
          accent
          C={C} fonts={fonts} neu={neu} R={R}
        />
        <StatBox
          label={copy.creatorEarnings}
          value={formatLocal(creatorRevenueGenerated)}
          sub={copy.distributed}
          accent
          C={C} fonts={fonts} neu={neu} R={R}
        />
      </div>

      <div style={{
        marginTop: 12, fontFamily: fonts.sans, fontSize: 12,
        color: C.textMuted, lineHeight: 1.5, textAlign: 'center',
      }}>
        {copy.footer}
      </div>
    </div>
  )
}

// Mini chip used by the compact dash variant. Tight typography that
// still reads at a glance — mono label, display-font value.
function MiniStat({
  label,
  value,
  accent,
  C,
  fonts,
}: {
  label: string
  value: string
  accent?: boolean
  C: any
  fonts: any
}) {
  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', minWidth: 0 }}>
      <span
        style={{
          fontFamily: fonts.mono,
          fontSize: 9,
          fontWeight: 600,
          letterSpacing: 1,
          textTransform: 'uppercase',
          color: C.textMuted,
          marginBottom: 2,
          whiteSpace: 'nowrap',
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontFamily: fonts.display,
          fontSize: 16,
          fontWeight: 700,
          color: accent ? C.accent : C.text,
          lineHeight: 1,
          whiteSpace: 'nowrap',
        }}
      >
        {value}
      </span>
    </div>
  )
}

function StatBox({ label, value, sub, accent, C, fonts, neu, R }: {
  label: string; value: string; sub: string; accent?: boolean
  C: any; fonts: any; neu: any; R: any
}) {
  return (
    <div style={{
      ...neu.controlPressed,
      borderRadius: R.md,
      padding: '12px 14px',
    }}>
      <div style={{
        fontFamily: fonts.mono, fontSize: 9, fontWeight: 600,
        color: C.textMuted, letterSpacing: 1, textTransform: 'uppercase',
        marginBottom: 4,
      }}>
        {label}
      </div>
      <div style={{
        fontFamily: fonts.display, fontSize: 22, fontWeight: 700,
        color: accent ? C.accent : C.text, lineHeight: 1,
        marginBottom: 2,
      }}>
        {value}
      </div>
      {sub ? (
        <div style={{
          fontFamily: fonts.mono, fontSize: 10, color: C.textMuted,
        }}>
          {sub}
        </div>
      ) : null}
    </div>
  )
}
