//frontend/app/positions/page.tsx
'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useReadContracts, useWaitForTransactionReceipt } from 'wagmi';
import { useAccount } from '@/hooks/useWallet';
import { useWriteContract } from '@/hooks/useWriteContract';
import WalletErrorPanel from '@/components/shared/WalletErrorPanel';
import { formatUnits } from 'viem';
import { useColors } from '@/hooks/useColors';
import { useTranslation } from '@/hooks/useTranslation';
import { useCurrencyContext } from '@/lib/currency-context';
import { useUnits } from '@/lib/units-context';
import { formatThreshold, thresholdTemp, type UnitSystem } from '@/lib/units';
import BottomNav from '@/components/design/BottomNav';
import AppHeader from '@/components/shared/AppHeader';
import { ClockIcon, TypeIcon } from '@/components/shared/icons';
import { ReturnSummary } from '@/components/market/ReturnSummary';
import { useMarkets } from '@/hooks/useMarkets';
import { useLocationContext } from '@/hooks/useLocationContext';
import { CONTRACTS, climateOracleAbi, climatePoolAbi, MARKET_TYPES, USDM_DECIMALS, decodeColdLine } from '@/lib/contracts';
import { RECEIPT_POLL_INTERVAL_MS } from '@/lib/chain';

type PositionState =
  | 'active'
  | 'waiting'
  | 'review'
  | 'claimable'
  | 'claimed'
  | 'lost'
  | 'refund';

type PositionItem = {
  market: any;
  above: bigint;
  below: bigint;
  claimed: boolean;
  total: number;
  side: string;
  sideDetail: string;
  isAbove: boolean;
  returnIsAbove: boolean;
  returnAmount: bigint;
  state: PositionState;
  won: boolean;
  claimability: { ok: boolean; reason: string };
};

function pageCopy(language: string) {
  const table: Record<string, Record<string, string>> = {
    en: {
      intro: 'Your weather positions, waiting cities, and returns ready to collect.',
      emptyLoggedOut: 'Start to see your active positions, waiting results, and claimable returns.',
      emptyConnected: 'No positions yet. Answer Yes or No on any live risk signal to see it here.',
      loading: 'Loading your positions...',
      empty: 'You do not have positions yet.',
      ready: 'Ready now',
      review: 'Under review',
      waiting: 'Waiting for result',
      active: 'Active',
      done: 'Done',
      nothingReady: 'Nothing ready to collect yet.',
      rain: 'Rain',
      temperature: 'High temp',
      lowTemp: 'Low temp',
      snow: 'Snow',
      coldSpell: 'Cold spell',
      dryStretch: 'Dry stretch',
      frostRisk: 'Frost risk',
      heavyRain: 'Heavy rain',
      heavyRainWindow: '{days}-day heavy-rain check',
      dryStretchWindow: '{days} dry days',
      dryStretchWindowOne: '1 dry day',
      threshold: 'Threshold',
      collectingReturn: 'Collecting return...',
      collectingRefund: 'Collecting refund...',
      collectReturn: 'Collect return',
      collectRefund: 'Collect refund',
      viewMarket: 'View details',
      claimed: 'Claimed',
      lost: 'Lost',
      claimable: 'Claimable',
      claimAll: 'Collect all',
      refund: 'Refund',
      waitingBadge: 'Waiting',
      reviewBadge: 'Review',
      claimSuccess: 'Return collected.',
      refundSuccess: 'Refund collected.',
      claimError: 'Could not complete this action.',
    },
    pt: {
      intro: 'Suas posições climáticas, cidades aguardando resultado e retornos prontos para coletar.',
      emptyLoggedOut: 'Comece para ver suas posições ativas, resultados pendentes e retornos resgatáveis.',
      emptyConnected: 'Nenhuma posição ainda. Responda Sim ou Não em qualquer sinal de risco ativo para ver isso aqui.',
      loading: 'Carregando suas posições...',
      empty: 'Você ainda não tem posições.',
      ready: 'Pronto agora',
      review: 'Em revisão',
      waiting: 'Aguardando resultado',
      active: 'Ativas',
      done: 'Finalizadas',
      nothingReady: 'Nada pronto para coletar ainda.',
      rain: 'Chuva',
      temperature: 'Temp. alta',
      lowTemp: 'Temp. baixa',
      snow: 'Neve',
      coldSpell: 'Frio prolongado',
      dryStretch: 'Estiagem',
      frostRisk: 'Risco de geada',
      heavyRain: 'Chuva forte',
      heavyRainWindow: 'Checagem de chuva forte em {days} dias',
      dryStretchWindow: '{days} dias secos',
      dryStretchWindowOne: '1 dia seco',
      threshold: 'Limite',
      collectingReturn: 'Coletando retorno...',
      collectingRefund: 'Coletando reembolso...',
      collectReturn: 'Coletar retorno',
      collectRefund: 'Coletar reembolso',
      viewMarket: 'Ver detalhes',
      claimed: 'Coletado',
      lost: 'Perdeu',
      claimable: 'Coletável',
      claimAll: 'Coletar tudo',
      refund: 'Reembolso',
      waitingBadge: 'Aguardando',
      reviewBadge: 'Revisão',
      claimSuccess: 'Retorno coletado.',
      refundSuccess: 'Reembolso coletado.',
      claimError: 'Não foi possível concluir esta ação.',
    },
    es: {
      intro: 'Tus posiciones climáticas, ciudades en espera y retornos listos para cobrar.',
      emptyLoggedOut: 'Empieza para ver tus posiciones activas, resultados pendientes y retornos cobrables.',
      emptyConnected: 'Todavía no tienes posiciones. Responde Sí o No en cualquier señal de riesgo activa para verla aquí.',
      loading: 'Cargando tus posiciones...',
      empty: 'Todavía no tienes posiciones.',
      ready: 'Listo ahora',
      review: 'En revisión',
      waiting: 'Esperando resultado',
      active: 'Activas',
      done: 'Finalizadas',
      nothingReady: 'Nada listo para cobrar todavía.',
      rain: 'Lluvia',
      temperature: 'Temp. alta',
      lowTemp: 'Temp. baja',
      snow: 'Nieve',
      coldSpell: 'Frío prolongado',
      dryStretch: 'Sequía',
      frostRisk: 'Riesgo de helada',
      heavyRain: 'Lluvia fuerte',
      heavyRainWindow: 'Revisión de lluvia fuerte en {days} días',
      dryStretchWindow: '{days} días secos',
      dryStretchWindowOne: '1 día seco',
      threshold: 'Umbral',
      collectingReturn: 'Cobrando retorno...',
      collectingRefund: 'Cobrando reembolso...',
      collectReturn: 'Cobrar retorno',
      collectRefund: 'Cobrar reembolso',
      viewMarket: 'Ver detalles',
      claimed: 'Cobrado',
      lost: 'Perdido',
      claimable: 'Cobrable',
      claimAll: 'Cobrar todo',
      refund: 'Reembolso',
      waitingBadge: 'En espera',
      reviewBadge: 'Revisión',
      claimSuccess: 'Retorno cobrado.',
      refundSuccess: 'Reembolso cobrado.',
      claimError: 'No se pudo completar esta acción.',
    },
    fr: {
      intro: 'Vos positions météo, les villes en attente et les retours prêts à être récupérés.',
      emptyLoggedOut: 'Commencez pour voir vos positions actives, résultats en attente et retours récupérables.',
      emptyConnected: "Vous n'avez pas encore de positions. Répondez Oui ou Non sur un signal de risque en direct pour le voir ici.",
      loading: 'Chargement de vos positions...',
      empty: 'Vous n\'avez pas encore de positions.',
      ready: 'Prêt maintenant',
      review: 'En revue',
      waiting: 'En attente du résultat',
      active: 'Actives',
      done: 'Terminées',
      nothingReady: 'Rien à récupérer pour le moment.',
      rain: 'Pluie',
      temperature: 'Temp. haute',
      lowTemp: 'Temp. basse',
      snow: 'Neige',
      coldSpell: 'Vague de froid',
      dryStretch: 'Sécheresse',
      frostRisk: 'Risque de gel',
      heavyRain: 'Forte pluie',
      heavyRainWindow: 'Vérification forte pluie sur {days} jours',
      dryStretchWindow: '{days} jours secs',
      dryStretchWindowOne: '1 jour sec',
      threshold: 'Seuil',
      collectingReturn: 'Récupération du retour...',
      collectingRefund: 'Récupération du remboursement...',
      collectReturn: 'Récupérer le retour',
      collectRefund: 'Récupérer le remboursement',
      viewMarket: 'Voir les détails',
      claimed: 'Récupéré',
      lost: 'Perdu',
      claimable: 'À récupérer',
      claimAll: 'Tout récupérer',
      refund: 'Remboursement',
      waitingBadge: 'En attente',
      reviewBadge: 'Revue',
      claimSuccess: 'Retour récupéré.',
      refundSuccess: 'Remboursement récupéré.',
      claimError: 'Impossible de terminer cette action.',
    },
    de: {
      intro: 'Deine Wetterpositionen, wartende Städte und auszahlbare Rückflüsse.',
      emptyLoggedOut: 'Starte, um deine aktiven Positionen, wartenden Ergebnisse und auszahlbaren Rückflüsse zu sehen.',
      emptyConnected: 'Du hast noch keine Positionen. Antworte mit Ja oder Nein bei einem Live-Risikosignal, damit sie hier erscheint.',
      loading: 'Deine Positionen werden geladen...',
      empty: 'Du hast noch keine Positionen.',
      ready: 'Jetzt bereit',
      review: 'In Prüfung',
      waiting: 'Wartet auf Ergebnis',
      active: 'Aktiv',
      done: 'Abgeschlossen',
      nothingReady: 'Noch nichts zum Auszahlen bereit.',
      rain: 'Regen',
      temperature: 'Hohe Temp.',
      lowTemp: 'Niedrige Temp.',
      snow: 'Schnee',
      coldSpell: 'Kältephase',
      dryStretch: 'Trockenphase',
      frostRisk: 'Frostrisiko',
      heavyRain: 'Starkregen',
      heavyRainWindow: 'Starkregen-Prüfung über {days} Tage',
      dryStretchWindow: '{days} trockene Tage',
      dryStretchWindowOne: '1 trockener Tag',
      threshold: 'Schwelle',
      collectingReturn: 'Rückfluss wird ausgezahlt...',
      collectingRefund: 'Rückerstattung wird ausgezahlt...',
      collectReturn: 'Rückfluss auszahlen',
      collectRefund: 'Rückerstattung auszahlen',
      viewMarket: 'Details ansehen',
      claimed: 'Ausgezahlt',
      lost: 'Verloren',
      claimable: 'Auszahlbar',
      claimAll: 'Alle einsammeln',
      refund: 'Rückerstattung',
      waitingBadge: 'Wartend',
      reviewBadge: 'Prüfung',
      claimSuccess: 'Rückfluss ausgezahlt.',
      refundSuccess: 'Rückerstattung ausgezahlt.',
      claimError: 'Diese Aktion konnte nicht abgeschlossen werden.',
    },
    zh: {
      intro: '你的天气头寸、等待中的城市，以及可领取的回报。',
      emptyLoggedOut: '开始后即可查看你的活跃头寸、待结果城市和可领取回报。',
      emptyConnected: '你还没有头寸。在任何实时风险信号中选择一侧后，就会显示在这里。',
      loading: '正在加载你的头寸...',
      empty: '你还没有头寸。',
      ready: '现在可领取',
      review: '审核中',
      waiting: '等待结果',
      active: '进行中',
      done: '已完成',
      nothingReady: '暂时没有可领取内容。',
      rain: '降雨',
      temperature: '高温',
      lowTemp: '低温',
      snow: '降雪',
      coldSpell: '寒潮',
      dryStretch: '连续干旱',
      frostRisk: '霜冻风险',
      heavyRain: '强降雨',
      heavyRainWindow: '{days} 天强降雨检查',
      dryStretchWindow: '{days} 个干燥日',
      dryStretchWindowOne: '1 个干燥日',
      threshold: '阈值',
      collectingReturn: '正在领取回报...',
      collectingRefund: '正在领取退款...',
      collectReturn: '领取回报',
      collectRefund: '领取退款',
      viewMarket: '查看详情',
      claimed: '已领取',
      lost: '已亏损',
      claimable: '可领取',
      claimAll: '全部领取',
      refund: '退款',
      waitingBadge: '等待中',
      reviewBadge: '审核',
      claimSuccess: '回报已领取。',
      refundSuccess: '退款已领取。',
      claimError: '无法完成此操作。',
    },
  };

  return table[language] ?? table.en;
}

function getMarketTypeLabel(marketTypeId: number, copy: Record<string, string>) {
  if (marketTypeId === MARKET_TYPES.RAIN) return copy.rain;
  if (marketTypeId === MARKET_TYPES.TEMP_LOW) return copy.lowTemp;
  if (marketTypeId === MARKET_TYPES.SNOW) return copy.snow;
  if (marketTypeId === MARKET_TYPES.COLD_SPELL) return copy.coldSpell;
  if (marketTypeId === MARKET_TYPES.DRY_STRETCH) return copy.dryStretch;
  if (marketTypeId === MARKET_TYPES.FROST_RISK) return copy.frostRisk;
  if (marketTypeId === MARKET_TYPES.HEAVY_RAIN) return copy.heavyRain;
  return copy.temperature;
}

function getThresholdDisplay(
  market: any,
  copy: Record<string, string>,
  system: UnitSystem = 'metric',
) {
  const threshold = Number(market.thresholdValue ?? 0);
  const days = Math.max(1, Math.round(Math.max(86400, market.endTime - market.startTime) / 86400));

  if (market.marketTypeId === MARKET_TYPES.HEAVY_RAIN) {
    return copy.heavyRainWindow.replace('{days}', String(days));
  }
  if (market.marketTypeId === MARKET_TYPES.DRY_STRETCH) {
    return (days === 1 ? copy.dryStretchWindowOne : copy.dryStretchWindow).replace('{days}', String(days));
  }
  if (market.marketTypeId === MARKET_TYPES.COLD_SPELL) {
    return thresholdTemp(decodeColdLine(threshold), system);
  }
  if (market.marketTypeId === MARKET_TYPES.FROST_RISK) {
    return `Below ${thresholdTemp(2, system)}`;
  }
  return formatThreshold(threshold, market.unit, system);
}

export default function PositionsPage() {
  const { C, fonts, neu, R } = useColors();
  const { language, t } = useTranslation();
  const { formatLocal } = useCurrencyContext();
  const copy = pageCopy(language);

  const { address, isReady, isConnecting, isReconnecting } = useAccount();
  const { location } = useLocationContext();
  const { markets, isLoading, refetchAll } = useMarkets(location);

  const [actionKind, setActionKind] = useState<'claim' | 'refund' | null>(null);
  const [actionTargetId, setActionTargetId] = useState<string | null>(null);
  const [optimisticClaimed, setOptimisticClaimed] = useState<Record<string, boolean>>({});
  const [claimAllIds, setClaimAllIds] = useState<string[]>([]);
  const [lastSuccessId, setLastSuccessId] = useState<string | null>(null);

  const myMarkets = useMemo(() => markets.filter((m) => m.userHasPosition), [markets]);

  const positionContracts = useMemo(() => {
    if (!address) return [];
    return myMarkets.map((m) => ({
      address: CONTRACTS.CLIMATE_POOL,
      abi: climatePoolAbi,
      functionName: 'getUserPosition' as const,
      args: [m.id, address],
    }));
  }, [myMarkets, address]);

  const claimabilityContracts = useMemo(() => {
    return myMarkets
      .filter((m) => m.resolved && !m.cancelled)
      .map((m) => ({
        address: CONTRACTS.CLIMATE_ORACLE,
        abi: climateOracleAbi,
        functionName: 'canClaim' as const,
        args: [m.id],
      }));
  }, [myMarkets]);

  const positionsRead = useReadContracts({
    contracts: positionContracts,
    query: {
      enabled: !!address && positionContracts.length > 0,
      refetchInterval: 15000,
    },
  });

  const claimabilityRead = useReadContracts({
    contracts: claimabilityContracts,
    query: {
      enabled: claimabilityContracts.length > 0,
      refetchInterval: 15000,
    },
  });

  const {
    writeContract,
    data: actionHash,
    isPending: isActionPending,
    error: actionError,
    reset: resetAction,
  } = useWriteContract();

  const { isLoading: isActionConfirming, isSuccess: isActionSuccess } =
    useWaitForTransactionReceipt({
      hash: actionHash,
      pollingInterval: RECEIPT_POLL_INTERVAL_MS,
      query: { enabled: !!actionHash },
    });

  // Ref so the effect below can call the LATEST refetch/reset callbacks
  // without listing them as deps. wagmi/React Query hand back a new object
  // reference for positionsRead/claimabilityRead on every render, and
  // refetchAll isn't memoized in useMarkets — putting them in the dep array
  // made this effect re-fire on every render while isActionSuccess stayed
  // true, and each re-fire's cleanup cancelled the pending reset timer and
  // rescheduled it, so the 1200ms reset never landed. The result was an
  // unbounded refetch storm against /api/Base Sepolia-rpc after every claim,
  // which is what tripped Vercel's edge DDoS mitigation in production.
  const latestActionEffectRef = useRef({
    claimAllIds,
    refetchAll,
    positionsRead,
    claimabilityRead,
    resetAction,
  });
  latestActionEffectRef.current = {
    claimAllIds,
    refetchAll,
    positionsRead,
    claimabilityRead,
    resetAction,
  };

  useEffect(() => {
    if (!isActionSuccess || !actionTargetId) return;

    const { claimAllIds, refetchAll, positionsRead, claimabilityRead, resetAction } =
      latestActionEffectRef.current;

    setOptimisticClaimed((prev) => {
      if (actionTargetId === 'all') {
        const next = { ...prev };
        for (const cid of claimAllIds) next[cid] = true;
        return next;
      }
      return { ...prev, [actionTargetId]: true };
    });
    setLastSuccessId(actionTargetId);

    void Promise.all([refetchAll(), positionsRead.refetch(), claimabilityRead.refetch()]);

    const resetTimer = setTimeout(() => {
      resetAction();
      setActionKind(null);
      setActionTargetId(null);
    }, 1200);

    const clearTimer = setTimeout(() => {
      setLastSuccessId(null);
    }, 3500);

    return () => {
      clearTimeout(resetTimer);
      clearTimeout(clearTimer);
    };
  }, [isActionSuccess, actionTargetId]);

  const claimabilityMap = useMemo(() => {
    const map = new Map<string, { ok: boolean; reason: string }>();

    let resolvedIndex = 0;
    for (const market of myMarkets) {
      if (market.resolved && !market.cancelled) {
        const result = claimabilityRead.data?.[resolvedIndex];
        if (result?.status === 'success' && result.result) {
          const [ok, reason] = result.result as [boolean, string];
          map.set(market.id.toString(), { ok, reason });
        } else {
          map.set(market.id.toString(), { ok: false, reason: copy.waiting });
        }
        resolvedIndex += 1;
      }
    }

    return map;
  }, [myMarkets, claimabilityRead.data, copy.waiting]);

  const enriched = useMemo<PositionItem[]>(() => {
    return myMarkets.map((market, index) => {
      const result = positionsRead.data?.[index];
      let above = 0n;
      let below = 0n;
      let claimed = !!market.userClaimed || !!optimisticClaimed[market.id.toString()];

      if (result?.status === 'success' && result.result) {
        const raw = result.result as [bigint, bigint, boolean];
        above = raw[0];
        below = raw[1];
        claimed = raw[2] || !!optimisticClaimed[market.id.toString()];
      }

      const aboveValue = Number(formatUnits(above, USDM_DECIMALS));
      const belowValue = Number(formatUnits(below, USDM_DECIMALS));
      const total = aboveValue + belowValue;
      const isAbove = aboveValue > 0 && belowValue === 0;
      const side = isAbove ? t('predict.above') : t('predict.below');
      const sideParts: string[] = [];
      if (aboveValue > 0) sideParts.push(`▲ ${t('predict.above')} ${formatLocal(aboveValue)}`);
      if (belowValue > 0) sideParts.push(`▼ ${t('predict.below')} ${formatLocal(belowValue)}`);
      const sideDetail = sideParts.join(' · ');

      const won =
        market.resolved &&
        ((market.outcome && aboveValue > 0) || (!market.outcome && belowValue > 0));

      const returnIsAbove = market.resolved ? !!market.outcome : isAbove;
      const returnAmount =
        market.resolved && won
          ? market.outcome
            ? above
            : below
          : above > 0n
            ? above
            : below;

      const claimability = claimabilityMap.get(market.id.toString()) ?? {
        ok: false,
        reason: copy.waiting,
      };

      let state: PositionState = 'active';

      const isLiveMarket = !market.resolved && !market.cancelled;
      const isWaitingMarket =
        !market.resolved &&
        !market.cancelled &&
        (market.uiState === 'cooldown' || market.uiState === 'expired');

      if (isLiveMarket) {
        state = isWaitingMarket ? 'waiting' : 'active';
      } else if (market.cancelled) {
        state = claimed ? 'claimed' : 'refund';
      } else if (market.resolved) {
        if (claimed) state = 'claimed';
        else if (won) state = claimability.ok ? 'claimable' : 'review';
        else state = 'lost';
      }

      return {
        market,
        above,
        below,
        claimed,
        total,
        side,
        sideDetail,
        isAbove,
        returnIsAbove,
        returnAmount,
        state,
        won,
        claimability,
      };
    });
  }, [myMarkets, positionsRead.data, claimabilityMap, optimisticClaimed, t, formatLocal, copy.waiting]);

  const grouped = useMemo(() => {
    const claimable = enriched.filter((x) => x.state === 'claimable' || x.state === 'refund');
    const review = enriched.filter((x) => x.state === 'review');
    const waiting = enriched.filter((x) => x.state === 'waiting');
    const active = enriched.filter((x) => x.state === 'active');
    const done = enriched.filter((x) => x.state === 'claimed' || x.state === 'lost');
    return { claimable, review, waiting, active, done };
  }, [enriched]);

  function handleClaim(marketId: bigint) {
    const id = marketId.toString();
    setActionKind('claim');
    setActionTargetId(id);
    writeContract({
      address: CONTRACTS.CLIMATE_POOL,
      abi: climatePoolAbi,
      functionName: 'claim',
      args: [marketId],
    });
  }

  function handleRefund(marketId: bigint) {
    const id = marketId.toString();
    setActionKind('refund');
    setActionTargetId(id);
    writeContract({
      address: CONTRACTS.CLIMATE_POOL,
      abi: climatePoolAbi,
      functionName: 'claimRefund',
      args: [marketId],
    });
  }

  // Claim every winning position in a SINGLE transaction (claimMultiple). One
  // tx instead of N — far fewer RPC-proxy requests, so it won't trip the IP
  // rate limit, and it's one tap for the user. (Refunds stay per-market: the
  // contract has no batch refund, and they're rare.)
  function handleClaimAll() {
    const wins = grouped.claimable.filter((x) => x.state === 'claimable');
    if (wins.length === 0) return;
    const ids = wins.map((x) => x.market.id);
    setClaimAllIds(ids.map((b) => b.toString()));
    setActionKind('claim');
    setActionTargetId('all');
    writeContract({
      address: CONTRACTS.CLIMATE_POOL,
      abi: climatePoolAbi,
      functionName: 'claimMultiple',
      args: [ids],
    });
  }

  if (!address && (!isReady || isConnecting || isReconnecting)) {
    return (
      <div style={{ paddingBottom: 'var(--k-mobile-bottom-clearance)' }}>
        <AppHeader section={t('positions.title')} />
        <div style={{ padding: '0 16px' }}>
          <div style={emptyCard(neu, R, fonts, C)}>{copy.loading}</div>
        </div>
        <BottomNav />
      </div>
    );
  }

  if (!address) {
    return (
      <div style={{ paddingBottom: 'var(--k-mobile-bottom-clearance)' }}>
        <AppHeader section={t('positions.title')} />
        <div style={{ padding: '0 16px' }}>
          <div style={emptyCard(neu, R, fonts, C)}>{copy.emptyLoggedOut}</div>
        </div>
        <BottomNav />
      </div>
    );
  }

  return (
    <div style={{ paddingBottom: 'var(--k-mobile-bottom-clearance)' }}>
      <style
        dangerouslySetInnerHTML={{
          __html: `
            /* Positions cards — masonry packing at desktop. Position
               cards vary in height (resolved vs. active vs. claimable
               render different bodies); columns pack them tight. */
            @media (min-width: 1024px) {
              .k-positions-page { max-width: 1140px; margin: 0 auto; }
              .k-positions-grid {
                column-count: 2;
                column-gap: 12px;
              }
              .k-positions-grid > * {
                break-inside: avoid;
                -webkit-column-break-inside: avoid;
                page-break-inside: avoid;
                margin: 0 0 12px 0 !important;
              }
            }
            @media (min-width: 1400px) {
              .k-positions-grid { column-count: 3; }
            }
          `,
        }}
      />
      <AppHeader section={t('positions.title')} />

      <div className="k-positions-page" style={{ padding: '0 16px 24px' }}>
        <div
          style={{
            marginBottom: 16,
            paddingLeft: 16,
            paddingRight: 16,
            fontFamily: fonts.sans,
            fontSize: 16,
            color: C.textSoft,
            lineHeight: 1.55,
          }}
        >
          {copy.intro}
        </div>

        {isLoading || positionsRead.isLoading || claimabilityRead.isLoading ? (
          <div style={emptyCard(neu, R, fonts, C)}>{copy.loading}</div>
        ) : enriched.length === 0 ? (
          <div style={emptyCard(neu, R, fonts, C)}>{copy.emptyConnected ?? copy.empty}</div>
        ) : (
          <>
            <PositionAnchors
              groups={[
                { id: 'pos-ready', label: copy.ready, count: grouped.claimable.length },
                { id: 'pos-review', label: copy.review, count: grouped.review.length },
                { id: 'pos-waiting', label: copy.waiting, count: grouped.waiting.length },
                { id: 'pos-active', label: copy.active, count: grouped.active.length },
                { id: 'pos-done', label: copy.done, count: grouped.done.length },
              ]}
              copy={copy}
              C={C}
              fonts={fonts}
              R={R}
            />

            {grouped.claimable.length > 0 ? (
              <>
            <Section anchor="pos-ready" title={copy.ready} count={grouped.claimable.length} fonts={fonts} C={C} />
              {grouped.claimable.filter((x) => x.state === 'claimable').length >= 2 ? (
                <button
                  onClick={handleClaimAll}
                  disabled={actionTargetId === 'all' && (isActionPending || isActionConfirming)}
                  style={{ ...neu.controlRaised, borderRadius: R.lg, minHeight: 48, padding: '12px 16px', marginBottom: 10, cursor: 'pointer', color: C.accent, fontFamily: fonts.sans, fontWeight: 700, fontSize: 14.5, border: `1px solid ${C.accent}66`, width: '100%' }}
                >
                  {actionTargetId === 'all' && (isActionPending || isActionConfirming)
                    ? copy.collectingReturn
                    : `${copy.claimAll} (${grouped.claimable.filter((x) => x.state === 'claimable').length})`}
                </button>
              ) : null}
              <div className="k-positions-grid">
              {grouped.claimable.map((item) => (
                <PositionCard
                  key={item.market.id.toString()}
                  item={item}
                  busy={(isActionPending || isActionConfirming) && actionTargetId === item.market.id.toString()}
                  success={lastSuccessId === item.market.id.toString()}
                  actionError={actionTargetId === item.market.id.toString() ? actionError : null}
                  actionKind={actionTargetId === item.market.id.toString() ? actionKind : null}
                  onClaim={handleClaim}
                  onRefund={handleRefund}
                  onResetAction={resetAction}
                  copy={copy}
                  C={C}
                  fonts={fonts}
                  neu={neu}
                  R={R}
                  formatLocal={formatLocal}
                />
              ))}
              </div>
              </>
            ) : null}

            {/* When NOTHING is across-the-board claimable but the user
                still has positions in other states, surface a single
                muted line so the page doesn't feel empty. The chip
                strip above shows the user where their positions are. */}
            {grouped.claimable.length === 0 &&
              (grouped.review.length + grouped.waiting.length + grouped.active.length + grouped.done.length) > 0 ? (
              <div style={emptySubtle(neu, R, fonts, C)}>{copy.nothingReady}</div>
            ) : null}

            {grouped.review.length > 0 ? (
              <>
                <Section anchor="pos-review" title={copy.review} count={grouped.review.length} fonts={fonts} C={C} />
                <div className="k-positions-grid">
                {grouped.review.map((item) => (
                  <PositionCard
                    key={item.market.id.toString()}
                    item={item}
                    busy={false}
                    success={false}
                    actionError={null}
                    actionKind={null}
                    onClaim={handleClaim}
                    onRefund={handleRefund}
                    copy={copy}
                    C={C}
                    fonts={fonts}
                    neu={neu}
                    R={R}
                    formatLocal={formatLocal}
                  />
                ))}
                </div>
              </>
            ) : null}

            {grouped.waiting.length > 0 ? (
              <>
                <Section anchor="pos-waiting" title={copy.waiting} count={grouped.waiting.length} fonts={fonts} C={C} />
                <div className="k-positions-grid">
                {grouped.waiting.map((item) => (
                  <PositionCard
                    key={item.market.id.toString()}
                    item={item}
                    busy={false}
                    success={false}
                    actionError={null}
                    actionKind={null}
                    onClaim={handleClaim}
                    onRefund={handleRefund}
                    copy={copy}
                    C={C}
                    fonts={fonts}
                    neu={neu}
                    R={R}
                    formatLocal={formatLocal}
                  />
                ))}
                </div>
              </>
            ) : null}

            {grouped.active.length > 0 ? (
              <>
                <Section anchor="pos-active" title={copy.active} count={grouped.active.length} fonts={fonts} C={C} />
                <div className="k-positions-grid">
                {grouped.active.map((item) => (
                  <PositionCard
                    key={item.market.id.toString()}
                    item={item}
                    busy={false}
                    success={false}
                    actionError={null}
                    actionKind={null}
                    onClaim={handleClaim}
                    onRefund={handleRefund}
                    copy={copy}
                    C={C}
                    fonts={fonts}
                    neu={neu}
                    R={R}
                    formatLocal={formatLocal}
                  />
                ))}
                </div>
              </>
            ) : null}

            {grouped.done.length > 0 ? (
              <>
                <Section anchor="pos-done" title={copy.done} count={grouped.done.length} fonts={fonts} C={C} />
                <div className="k-positions-grid">
                {grouped.done.map((item) => (
                  <PositionCard
                    key={item.market.id.toString()}
                    item={item}
                    busy={false}
                    success={false}
                    actionError={null}
                    actionKind={null}
                    onClaim={handleClaim}
                    onRefund={handleRefund}
                    copy={copy}
                    C={C}
                    fonts={fonts}
                    neu={neu}
                    R={R}
                    formatLocal={formatLocal}
                  />
                ))}
                </div>
              </>
            ) : null}
          </>
        )}
      </div>

      <BottomNav />
    </div>
  );
}

function Section({
  title,
  count,
  fonts,
  C,
  anchor,
}: {
  title: string;
  count: number;
  fonts: any;
  C: any;
  /** Optional anchor id so the section can be jumped to from the
   *  top chip strip (UX-7). */
  anchor?: string;
}) {
  return (
    <div
      id={anchor}
      style={{
        margin: '18px 0 10px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        scrollMarginTop: 72,
      }}
    >
      <span
        style={{
          fontFamily: fonts.mono,
          fontSize: 11,
          fontWeight: 700,
          color: C.textMutedStrong,
          letterSpacing: 1.4,
          textTransform: 'uppercase',
        }}
      >
        {title}
      </span>
      <span style={{ fontFamily: fonts.mono, fontSize: 11, color: C.textMutedStrong }}>{count}</span>
    </div>
  );
}

/**
 * Top-of-page anchor chips for /positions (UX-7).
 *
 * Five sections (ready, review, waiting, active, done) can stack
 * deep on accounts with many positions. The chip strip gives a
 * one-tap jump to any non-empty section + a count, so the user
 * doesn't have to scroll the whole page hunting for what's
 * claimable. Empty sections are hidden so the chip strip never
 * shows a "(0)" dead-end.
 *
 * Sections also get scroll-margin-top so the anchor lands them
 * below the sticky AppHeader instead of half-covered.
 */
function PositionAnchors({
  groups,
  copy,
  C,
  fonts,
  R,
}: {
  groups: Array<{ id: string; label: string; count: number }>;
  copy: Record<string, string>;
  C: any;
  fonts: any;
  R: any;
}) {
  const visible = groups.filter((g) => g.count > 0);
  if (visible.length === 0) return null;
  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 8,
        marginBottom: 16,
      }}
    >
      {visible.map((g) => (
        <a
          key={g.id}
          href={`#${g.id}`}
          style={{
            display: 'inline-flex',
            alignItems: 'baseline',
            gap: 8,
            padding: '7px 12px',
            borderRadius: R.pill,
            background: `${C.accent}14`,
            border: `1px solid ${C.accent}44`,
            color: C.text,
            textDecoration: 'none',
            fontFamily: fonts.sans,
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          {g.label}
          <span
            style={{
              fontFamily: fonts.mono,
              fontSize: 11,
              color: C.textMuted,
            }}
          >
            {g.count}
          </span>
        </a>
      ))}
    </div>
  );
}

function PositionCard({
  item,
  busy,
  success,
  actionError,
  actionKind,
  onClaim,
  onRefund,
  onResetAction,
  copy,
  C,
  fonts,
  neu,
  R,
  formatLocal,
}: {
  item: PositionItem;
  busy: boolean;
  success: boolean;
  actionError: any;
  actionKind: 'claim' | 'refund' | null;
  onClaim: (marketId: bigint) => void;
  onRefund: (marketId: bigint) => void;
  /** Called after a session-reset cycle so the page-level useWriteContract
   *  state is cleared and the user sees a fresh action button. */
  onResetAction?: () => void;
  copy: Record<string, string>;
  C: any;
  fonts: any;
  neu: any;
  R: any;
  formatLocal: (value: number) => string;
}) {
  const { system } = useUnits();
  const { market, total, sideDetail, returnIsAbove, returnAmount, state, won, claimability } = item;

  const badgeColor =
    state === 'claimable'
      ? C.above
      : state === 'refund'
        ? C.accent
        : state === 'review' || state === 'waiting'
          ? C.label
          : state === 'lost'
            ? C.below
            : C.textMutedStrong;

  const badgeBg =
    state === 'claimable'
      ? `${C.above}16`
      : state === 'refund'
        ? `${C.accent}18`
        : state === 'review'
          ? `${C.accent}16`
          : state === 'waiting'
            ? `${C.accent}14`
            : state === 'lost'
              ? `${C.below}12`
              : `${C.textMuted}18`;

  const pendingLabel =
    actionKind === 'refund' ? copy.collectingRefund : copy.collectingReturn;

  const showReturn =
    state === 'claimable' || state === 'lost' || state === 'claimed';

  // 'active' positions don't render a badge — the section header already
  // groups them. Bug fix: previously the fall-through returned copy.claimed
  // for every non-matched state, including 'active', so live markets
  // displayed "CLAIMED" in the top-right corner of the card.
  const badgeLabel =
    state === 'claimable'
      ? copy.claimable
      : state === 'refund'
        ? copy.refund
        : state === 'review'
          ? copy.reviewBadge
          : state === 'waiting'
            ? copy.waitingBadge
            : state === 'lost'
              ? copy.lost
              : state === 'claimed'
                ? copy.claimed
                : null;

  return (
    <div
      style={{
        ...neu.panelRaised,
        borderRadius: R.xl,
        padding: '16px 16px 14px',
        marginBottom: 12,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 10,
          marginBottom: 10,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontFamily: fonts.sans,
              fontSize: 17,
              fontWeight: 700,
              color: C.text,
              lineHeight: 1.25,
            }}
          >
            {market.displayCityName ?? market.cityName}
          </div>

          <div
            style={{
              marginTop: 4,
              fontFamily: fonts.sans,
              fontSize: 14,
              color: C.textSoft,
            }}
          >
            {getMarketTypeLabel(market.marketTypeId, copy)} · {sideDetail || formatLocal(total)}
          </div>
        </div>

        {badgeLabel && (
          <span
            style={{
              padding: '6px 10px',
              borderRadius: R.pill,
              background: badgeBg,
              color: badgeColor,
              fontFamily: fonts.mono,
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: 1,
              textTransform: 'uppercase',
              whiteSpace: 'nowrap',
            }}
          >
            {badgeLabel}
          </span>
        )}
      </div>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: 12,
          marginBottom: 12,
          fontFamily: fonts.sans,
          color: C.textSoft,
          fontSize: 14,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <TypeIcon
            type={
              market.marketTypeId === MARKET_TYPES.RAIN
                ? 'rain'
                : market.marketTypeId === MARKET_TYPES.SNOW
                  ? 'snow'
                  : 'temp'
            }
          />
          {copy.threshold} {getThresholdDisplay(market, copy, system)}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <ClockIcon />
          {market.daysLeft}d
        </div>
      </div>

      {state === 'review' ? (
        <div
          style={{
            ...neu.controlPressed,
            borderRadius: R.lg,
            padding: '12px 14px',
            marginBottom: 12,
            fontFamily: fonts.sans,
            fontSize: 14,
            color: C.textSoft,
            lineHeight: 1.45,
          }}
        >
          {claimability.reason}
        </div>
      ) : null}

      {showReturn ? (
        <div style={{ marginBottom: 12 }}>
          <ReturnSummary
            marketId={market.id}
            isAbove={returnIsAbove}
            amount={returnAmount}
            resolved={market.resolved}
            userWon={won}
          />
        </div>
      ) : null}

      {success ? (
        <div
          style={{
            marginBottom: 10,
            fontFamily: fonts.sans,
            fontSize: 14,
            color: C.above,
          }}
        >
          {actionKind === 'refund' ? copy.refundSuccess : copy.claimSuccess}
        </div>
      ) : null}

      {actionError ? (
        <div style={{ marginBottom: 10 }}>
          <WalletErrorPanel
            error={actionError}
            onAfterReset={onResetAction}
            compact
          />
        </div>
      ) : null}

      {state === 'claimable' ? (
        <button
          type="button"
          onClick={() => onClaim(market.id)}
          disabled={busy}
          style={primaryBtn(C, fonts, R, busy)}
        >
          {busy ? pendingLabel : copy.collectReturn}
        </button>
      ) : state === 'refund' ? (
        <button
          type="button"
          onClick={() => onRefund(market.id)}
          disabled={busy}
          style={primaryBtn(C, fonts, R, busy)}
        >
          {busy ? pendingLabel : copy.collectRefund}
        </button>
      ) : (
        <LinkButton href={`/markets/${market.id}`} label={copy.viewMarket} C={C} fonts={fonts} R={R} />
      )}
    </div>
  );
}

function LinkButton({ href, label, C, fonts, R }: any) {
  return (
    <Link
      href={href}
      style={{
        display: 'block',
        textDecoration: 'none',
        width: '100%',
        maxWidth: '100%',
        minWidth: 0,
        boxSizing: 'border-box',
        padding: '16px 18px',
        borderRadius: R.lg,
        background: C.surfaceHigh,
        color: C.text,
        fontFamily: fonts.sans,
        fontSize: 16,
        fontWeight: 700,
        textAlign: 'center',
        boxShadow: `4px 4px 10px ${C.shadowA}76, -4px -4px 10px ${C.shadowB}96`,
      }}
    >
      {label}
    </Link>
  );
}

function primaryBtn(C: any, fonts: any, R: any, disabled = false): CSSProperties {
  return {
    display: 'block',
    width: '100%',
    maxWidth: '100%',
    minWidth: 0,
    boxSizing: 'border-box',
    padding: '16px 18px',
    borderRadius: R.lg,
    border: 'none',
    background: C.dark,
    color: '#FFFDF8',
    fontFamily: fonts.sans,
    fontSize: 16,
    fontWeight: 700,
    cursor: disabled ? 'default' : 'pointer',
    opacity: disabled ? 0.72 : 1,
    boxShadow: `0 8px 24px ${C.dark}30, inset 0 1px 0 ${C.darkSoft}`,
  };
}

function emptyCard(neu: any, R: any, fonts: any, C: any): CSSProperties {
  return {
    ...neu.panelRaised,
    borderRadius: R.xl,
    padding: 18,
    fontFamily: fonts.sans,
    fontSize: 15,
    color: C.textSoft,
    lineHeight: 1.5,
  };
}

function emptySubtle(neu: any, R: any, fonts: any, C: any): CSSProperties {
  return {
    ...neu.controlPressed,
    borderRadius: R.lg,
    padding: '12px 14px',
    marginBottom: 12,
    fontFamily: fonts.sans,
    fontSize: 14,
    color: C.textSoft,
  };
}
