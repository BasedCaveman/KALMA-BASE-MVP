'use client';

import { useEffect, useMemo, useState } from 'react';
import { useColors } from '@/hooks/useColors';
import { useTranslation } from '@/hooks/useTranslation';
import { useUnits } from '@/lib/units-context';
import { cToF, mmToIn, cmToIn, type UnitSystem } from '@/lib/units';
import { CHAIN, CONTRACTS, MARKET_TYPES, decodeColdLine } from '@/lib/contracts';
import { supabase } from '@/lib/supabase';

type EvidenceRow = {
  market_id: number;
  resolved_source: string | null;
  resolved_source_url: string | null;
  resolved_observed_value: number | null;
  resolved_actual_value: number | null;
  resolved_raw_values: number[] | null;
  resolved_tx_hash: string | null;
  resolved_at: string | null;
  review_source: string | null;
  review_source_url: string | null;
  review_observed_value: number | null;
  review_actual_value: number | null;
  review_raw_values: number[] | null;
  review_tx_hash: string | null;
  reviewed_at: string | null;
  historical_avg: number | null;
  current_outcome: boolean | null;
  reviewed_outcome: boolean | null;
  challenge_upheld: boolean | null;
};

function panelCopy(language: string) {
  const table: Record<string, Record<string, string>> = {
    en: {
      title: 'Resolution evidence',
      body:
        'These are the public weather sources and on-chain actions used to settle this signal.',
      primary: 'Primary source',
      review: 'Review source',
      observed: 'Observed',
      threshold: 'Threshold',
      decision: 'Decision',
      upheld: 'Challenge upheld',
      rejected: 'Challenge rejected',
      openData: 'Open source data',
      openTx: 'View transaction',
      rawValues: 'Daily values',
    },
    pt: {
      title: 'Evidência da resolução',
      body:
        'Estas são as fontes públicas de clima e as ações on-chain usadas para resolver este sinal.',
      primary: 'Fonte primária',
      review: 'Fonte de revisão',
      observed: 'Observado',
      threshold: 'Limite',
      decision: 'Decisão',
      upheld: 'Contestação aceita',
      rejected: 'Contestação rejeitada',
      openData: 'Abrir dados da fonte',
      openTx: 'Ver transação',
      rawValues: 'Valores diários',
    },
    es: {
      title: 'Evidencia de resolución',
      body:
        'Estas son las fuentes meteorológicas públicas y acciones on-chain usadas para resolver esta señal.',
      primary: 'Fuente primaria',
      review: 'Fuente de revisión',
      observed: 'Observado',
      threshold: 'Umbral',
      decision: 'Decisión',
      upheld: 'Impugnación aceptada',
      rejected: 'Impugnación rechazada',
      openData: 'Abrir datos fuente',
      openTx: 'Ver transacción',
      rawValues: 'Valores diarios',
    },
    fr: {
      title: 'Preuves de résolution',
      body:
        'Voici les sources météo publiques et les actions on-chain utilisées pour régler ce signal.',
      primary: 'Source principale',
      review: 'Source de révision',
      observed: 'Observé',
      threshold: 'Seuil',
      decision: 'Décision',
      upheld: 'Contestation acceptée',
      rejected: 'Contestation rejetée',
      openData: 'Ouvrir les données',
      openTx: 'Voir la transaction',
      rawValues: 'Valeurs quotidiennes',
    },
    de: {
      title: 'Auflösungsnachweis',
      body:
        'Dies sind die öffentlichen Wetterquellen und On-chain-Aktionen, mit denen dieses Signal entschieden wurde.',
      primary: 'Primäre Quelle',
      review: 'Prüfquelle',
      observed: 'Beobachtet',
      threshold: 'Schwelle',
      decision: 'Entscheidung',
      upheld: 'Anfechtung akzeptiert',
      rejected: 'Anfechtung abgelehnt',
      openData: 'Quelldaten öffnen',
      openTx: 'Transaktion ansehen',
      rawValues: 'Tageswerte',
    },
    zh: {
      title: '结算证据',
      body: '这里展示用于结算该信号的公开天气来源和链上操作。',
      primary: '主要来源',
      review: '复核来源',
      observed: '观测值',
      threshold: '阈值',
      decision: '决定',
      upheld: '异议成立',
      rejected: '异议驳回',
      openData: '打开来源数据',
      openTx: '查看交易',
      rawValues: '每日数值',
    },
  };

  return table[language] ?? table.en;
}

export function ResolutionEvidencePanel({
  marketId,
  marketTypeId,
  unit,
}: {
  marketId: bigint;
  marketTypeId: number;
  unit?: string;
}) {
  const { C, fonts, neu, R } = useColors();
  const { language } = useTranslation();
  const { system } = useUnits();
  const copy = panelCopy(language);
  const [row, setRow] = useState<EvidenceRow | null>(null);

  useEffect(() => {
    let live = true;
    void supabase
      .from('resolution_evidence')
      .select('*')
      // market_id is only unique WITHIN a pool (docs/V7_DEPLOY_RUNBOOK_2026-08-26.md);
      // without this, a V5 and a V7 market sharing an id makes .maybeSingle() throw.
      .eq('market_id', Number(marketId))
      .eq('pool_address', CONTRACTS.CLIMATE_POOL.toLowerCase())
      .maybeSingle()
      .then(({ data, error }) => {
        if (!live || error) return;
        setRow((data as EvidenceRow | null) ?? null);
      });
    return () => {
      live = false;
    };
  }, [marketId]);

  const threshold = useMemo(
    () => formatEvidenceValue(row?.historical_avg ?? null, marketTypeId, unit, system, true),
    [marketTypeId, row?.historical_avg, unit, system],
  );

  if (!row || (!row.resolved_source && !row.review_source)) return null;

  return (
    <div
      style={{
        ...neu.controlPressed,
        borderRadius: R.lg,
        padding: '14px 16px',
        display: 'grid',
        gap: 12,
      }}
    >
      <div>
        <div style={sectionTitle(fonts, C)}>{copy.title}</div>
        <div
          style={{
            fontFamily: fonts.sans,
            fontSize: 13,
            color: C.textSoft,
            lineHeight: 1.45,
            marginTop: 4,
          }}
        >
          {copy.body}
        </div>
      </div>

      {row.resolved_source ? (
        <EvidenceSource
          title={copy.primary}
          source={sourceLabel(row.resolved_source)}
          observed={formatEvidenceValue(row.resolved_observed_value, marketTypeId, unit, system)}
          threshold={threshold}
          rawValues={row.resolved_raw_values}
          sourceUrl={row.resolved_source_url}
          txHash={row.resolved_tx_hash}
          copy={copy}
          fonts={fonts}
          C={C}
          R={R}
        />
      ) : null}

      {row.review_source ? (
        <EvidenceSource
          title={copy.review}
          source={sourceLabel(row.review_source)}
          observed={formatEvidenceValue(row.review_observed_value, marketTypeId, unit, system)}
          threshold={threshold}
          rawValues={row.review_raw_values}
          sourceUrl={row.review_source_url}
          txHash={row.review_tx_hash}
          decision={
            row.challenge_upheld == null
              ? null
              : row.challenge_upheld
                ? copy.upheld
                : copy.rejected
          }
          decisionColor={row.challenge_upheld ? C.above : C.below}
          copy={copy}
          fonts={fonts}
          C={C}
          R={R}
        />
      ) : null}
    </div>
  );
}

function EvidenceSource({
  title,
  source,
  observed,
  threshold,
  rawValues,
  sourceUrl,
  txHash,
  decision,
  decisionColor,
  copy,
  fonts,
  C,
  R,
}: any) {
  return (
    <div
      style={{
        borderRadius: R.md,
        border: `1px solid ${C.divider}`,
        background: C.surface,
        padding: '12px 14px',
        display: 'grid',
        gap: 10,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          gap: 10,
        }}
      >
        <div>
          <div style={miniLabel(fonts, C)}>{title}</div>
          <div
            style={{
              fontFamily: fonts.sans,
              color: C.text,
              fontWeight: 800,
              fontSize: 15,
              marginTop: 2,
            }}
          >
            {source}
          </div>
        </div>
        {decision ? (
          <div
            style={{
              fontFamily: fonts.sans,
              fontSize: 13,
              color: decisionColor,
              fontWeight: 800,
              textAlign: 'right',
            }}
          >
            {decision}
          </div>
        ) : null}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <Stat label={copy.observed} value={observed} fonts={fonts} C={C} />
        <Stat label={copy.threshold} value={threshold} fonts={fonts} C={C} />
      </div>

      {Array.isArray(rawValues) && rawValues.length ? (
        <div
          style={{
            fontFamily: fonts.sans,
            fontSize: 12,
            color: C.textMuted,
            lineHeight: 1.45,
            overflowWrap: 'anywhere',
          }}
        >
          <strong style={{ color: C.textSoft }}>{copy.rawValues}:</strong>{' '}
          {rawValues.map((v: number) => Number(v).toFixed(2).replace(/\.00$/, '')).join(', ')}
        </div>
      ) : null}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {sourceUrl ? (
          <a href={sourceUrl} target="_blank" rel="noopener noreferrer" style={linkBtn(C, fonts, R)}>
            {copy.openData}
          </a>
        ) : null}
        {txHash ? (
          <a
            href={`${CHAIN.blockExplorer}/tx/${txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            style={linkBtn(C, fonts, R)}
          >
            {copy.openTx}
          </a>
        ) : null}
      </div>
    </div>
  );
}

function Stat({ label, value, fonts, C }: any) {
  return (
    <div>
      <div style={miniLabel(fonts, C)}>{label}</div>
      <div
        style={{
          fontFamily: fonts.sans,
          color: C.text,
          fontSize: 14,
          fontWeight: 800,
          marginTop: 3,
        }}
      >
        {value}
      </div>
    </div>
  );
}

// Evidence values are what the oracle actually measured, so they keep two
// decimals through the unit conversion — a resolution can turn on 0.3 of a
// degree, and rounding to whole °F here would hide why a signal resolved as
// it did. (convertThreshold rounds, which is right for a threshold, wrong
// here.)
function formatEvidenceValue(
  value: number | null,
  marketTypeId: number,
  unit?: string,
  system: UnitSystem = 'metric',
  // historical_avg (the threshold) is stored ENCODED — decodeColdLine it.
  // resolved_observed_value / review_observed_value are NOT: watchdog.mjs
  // writes `observedFloat` (the plain Celsius reading) to those columns,
  // reserving the encoded `observedInt` for a separate actual_value column
  // this panel never reads. Verified against resolution_evidence 2026-08-06
  // (14.8, 2.8, 21.6... — plausible temperatures, not 9800-range encoded
  // ints). Decoding an already-plain value would have been off by ~9900°C.
  isThreshold = false,
) {
  if (value == null || !Number.isFinite(Number(value))) return '—';
  const n = Number(value);
  const dp2 = (x: number) => Number(x.toFixed(2));
  const temp = (celsius: number) =>
    system === 'imperial' ? `${dp2(cToF(celsius))}°F` : `${dp2(celsius)}°C`;

  if (marketTypeId === MARKET_TYPES.COLD_SPELL || marketTypeId === MARKET_TYPES.FROST_RISK) {
    return temp(isThreshold ? decodeColdLine(n) : n);
  }
  if (marketTypeId === MARKET_TYPES.DRY_STRETCH) {
    return `${dp2(n)} dry ${Math.round(n) === 1 ? 'day' : 'days'}`;
  }
  if (
    marketTypeId === MARKET_TYPES.RAIN ||
    marketTypeId === MARKET_TYPES.HEAVY_RAIN ||
    marketTypeId === MARKET_TYPES.SNOW
  ) {
    const u = unit || 'mm';
    if (system === 'imperial') {
      return `${dp2(u === 'cm' ? cmToIn(n) : mmToIn(n))} in`;
    }
    return `${dp2(n)}${u}`;
  }
  return temp(n);
}

function sourceLabel(source: string) {
  if (source === 'open-meteo') return 'Open-Meteo';
  if (source === 'nasa-power') return 'NASA POWER';
  return source;
}

function sectionTitle(fonts: any, C: any): React.CSSProperties {
  return {
    fontFamily: fonts.mono,
    fontSize: 10,
    fontWeight: 800,
    color: C.textMutedStrong,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  };
}

function miniLabel(fonts: any, C: any): React.CSSProperties {
  return {
    fontFamily: fonts.mono,
    fontSize: 9,
    fontWeight: 800,
    color: C.textMuted,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  };
}

function linkBtn(C: any, fonts: any, R: any): React.CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 34,
    padding: '8px 11px',
    borderRadius: R.sm,
    background: C.surfaceDeep,
    border: `1px solid ${C.divider}`,
    fontFamily: fonts.sans,
    fontSize: 12,
    fontWeight: 800,
    color: C.accent,
    textDecoration: 'none',
  };
}
