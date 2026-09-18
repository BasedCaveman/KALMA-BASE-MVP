// kalma/frontend/components/signal/SignalActionCTA.tsx
//
// "Now what?" affordance under every signal card. Bridges the gap
// between observing the signal and acting on it:
//
//   1. If a live risk signal for this place with a compatible market type
//      already exists, link to it: "Answer this risk question →"
//   2. Otherwise, deeplink to /create pre-filled with the place's
//      lat/lon, the suggested market type, the signal's start date,
//      and the right window length: "Open a risk signal for this place →"
//
// Runs entirely client-side because it depends on useMarkets (which
// pulls on-chain reads via wagmi). Renders a small placeholder while
// markets load, then resolves to one of the two CTAs.

'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { useColors } from '@/hooks/useColors';
import { useTranslation } from '@/hooks/useTranslation';
import { useMarketsSnapshot } from '@/hooks/useMarketsSnapshot';
import { useLocationContext } from '@/hooks/useLocationContext';
import {
  buildCreateLink,
  getSignalAction,
  type MarketLike,
} from '@/lib/signal-engine/signal-action';

type Props = {
  signal: {
    signalTypeId: string;
    validFrom: string;
    validUntil: string;
    place: { name: string; lat: number; lon: number };
  };
};

function ctaCopy(language: string) {
  const table: Record<string, Record<string, string>> = {
    en: {
      looking: 'Looking for a risk signal here…',
      liveHeadline: 'A risk signal for this place is already live',
      noneHeadline: 'No risk signal for this place yet',
      liveBody: 'Answer Yes or No with test credits on the live question.',
      noneBody: "Only open one if this exact place and risk don't already have a signal.",
      open: 'Answer this risk question →',
      openNew: 'Open a risk signal for this place →',
      observeHeadline: 'Answering closed for this place',
      observeBody: 'The weather window is running — follow it for the outcome.',
      observe: 'Watch the outcome →',
      above: 'Yes',
      below: 'No',
    },
    pt: {
      looking: 'Procurando um sinal de risco aqui…',
      liveHeadline: 'Já existe um sinal de risco ativo para este lugar',
      noneHeadline: 'Ainda não há um sinal de risco para este lugar',
      liveBody: 'Abra para responder Sim ou Não com dinheiro de teste.',
      noneBody: 'Abra um novo apenas se este lugar e risco ainda não tiverem um sinal.',
      open: 'Abrir este sinal de risco →',
      openNew: 'Abrir um sinal de risco para este lugar →',
      observeHeadline: 'Respostas encerradas para este lugar',
      observeBody: 'A janela climática está em andamento — acompanhe o resultado.',
      observe: 'Acompanhar o resultado →',
      above: 'Sim',
      below: 'Não',
    },
    es: {
      looking: 'Buscando una señal de riesgo aquí…',
      liveHeadline: 'Ya hay una señal de riesgo activa para este lugar',
      noneHeadline: 'Aún no hay una señal de riesgo para este lugar',
      liveBody: 'Ábrela para responder Sí o No con fondos de prueba.',
      noneBody: 'Abre una nueva solo si este lugar y riesgo aún no tienen una señal.',
      open: 'Abrir esta señal de riesgo →',
      openNew: 'Abrir una señal de riesgo para este lugar →',
      observeHeadline: 'Respuestas cerradas para este lugar',
      observeBody: 'La ventana climática está en curso — sigue el resultado.',
      observe: 'Seguir el resultado →',
      above: 'Sí',
      below: 'No',
    },
    fr: {
      looking: 'Recherche d’un signal de risque ici…',
      liveHeadline: 'Un signal de risque pour ce lieu est déjà actif',
      noneHeadline: 'Pas encore de signal de risque pour ce lieu',
      liveBody: 'Ouvre-le pour répondre Oui ou Non avec des fonds de test.',
      noneBody: "N'en ouvre un nouveau que si ce lieu et ce risque n'ont pas encore de signal.",
      open: 'Ouvrir ce signal de risque →',
      openNew: 'Ouvrir un signal de risque pour ce lieu →',
      observeHeadline: 'Réponses fermées pour ce lieu',
      observeBody: 'La fenêtre météo est en cours — suis le résultat.',
      observe: 'Suivre le résultat →',
      above: 'Oui',
      below: 'Non',
    },
    de: {
      looking: 'Suche hier nach einem Risiko-Signal…',
      liveHeadline: 'Für diesen Ort ist bereits ein Risiko-Signal aktiv',
      noneHeadline: 'Noch kein Risiko-Signal für diesen Ort',
      liveBody: 'Öffne es, um mit Test-Cash mit Ja oder Nein zu antworten.',
      noneBody: 'Öffne nur ein neues, wenn für diesen Ort und dieses Risiko noch kein Signal existiert.',
      open: 'Dieses Risiko-Signal öffnen →',
      openNew: 'Ein Risiko-Signal für diesen Ort öffnen →',
      observeHeadline: 'Antworten für diesen Ort geschlossen',
      observeBody: 'Das Wetterfenster läuft — verfolge das Ergebnis.',
      observe: 'Ergebnis verfolgen →',
      above: 'Ja',
      below: 'Nein',
    },
    zh: {
      looking: '正在查找这里的风险信号…',
      liveHeadline: '此地点已有一个活跃的风险信号',
      noneHeadline: '此地点还没有风险信号',
      liveBody: '打开后用测试资金回答“是”或“否”。',
      noneBody: '仅当此地点和风险尚无信号时才开通新的。',
      open: '打开此风险信号 →',
      openNew: '为此地点开通一个风险信号 →',
      observeHeadline: '此地点已停止回答',
      observeBody: '天气窗口进行中 — 关注结果。',
      observe: '关注结果 →',
      above: '是',
      below: '否',
    },
  };
  return table[language] ?? table.en;
}

export default function SignalActionCTA({ signal }: Props) {
  const { C, fonts, R } = useColors();
  const { language } = useTranslation();
  const copy = ctaCopy(language);
  const { location } = useLocationContext();
  const { markets, isLoading } = useMarketsSnapshot(location);

  const action = useMemo(() => {
    if (isLoading) return null;
    const liteMarkets: MarketLike[] = markets.map((m) => ({
      id: m.id,
      marketTypeId: m.marketTypeId,
      lat: m.lat,
      lon: m.lon,
      startTime: m.startTime,
      endTime: m.endTime,
      predictionDeadline: m.predictionDeadline,
      resolved: m.resolved,
      cancelled: m.cancelled,
    }));
    return getSignalAction(signal, liteMarkets);
  }, [isLoading, markets, signal]);

  if (isLoading || !action) {
    // Subtle placeholder — matches the final layout height so the CTA
    // doesn't shift the rest of the card when it resolves.
    return (
      <div
        style={{
          marginTop: 10,
          padding: '9px 12px',
          borderRadius: R.lg,
          background: 'color-mix(in srgb, var(--k-text) 5%, transparent)',
          border:
            '1px solid color-mix(in srgb, var(--k-text) 6%, transparent)',
          fontFamily: fonts.mono,
          fontSize: 10,
          letterSpacing: 0.6,
          textTransform: 'uppercase',
          opacity: 0.45,
          color: C.text,
        }}
      >
        {copy.looking}
      </div>
    );
  }

  // Three states: answerable (accent CTA + Yes/No), observe-only (calmer,
  // answering closed but the window is running), and open-new (no market yet).
  const isMarket = action.kind === 'open-market';
  const answerable = isMarket && action.answerable;
  const observe = isMarket && !action.answerable;

  const href = isMarket
    ? `/markets/${action.marketId}`
    : buildCreateLink(action.params);
  const headline = observe
    ? copy.observeHeadline
    : isMarket
      ? copy.liveHeadline
      : copy.noneHeadline;
  const body = observe
    ? copy.observeBody
    : isMarket
      ? copy.liveBody
      : copy.noneBody;
  const cta = observe ? copy.observe : isMarket ? copy.open : copy.openNew;

  return (
    <Link
      href={href}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        marginTop: 12,
        padding: '12px 14px',
        borderRadius: R.lg,
        // Observe-only is intentionally quieter — it's not an answer CTA.
        background: observe ? C.surfaceSoft : `${C.accent}1A`,
        border: `1px solid ${observe ? C.divider : `${C.accent}55`}`,
        color: C.text,
        textDecoration: 'none',
        transition: 'background 120ms ease-out, border-color 120ms ease-out',
      }}
    >
      <span
        style={{
          fontFamily: fonts.mono,
          fontSize: 10,
          letterSpacing: 1,
          textTransform: 'uppercase',
          opacity: 0.7,
        }}
      >
        {headline}
      </span>
      <span
        style={{
          fontFamily: fonts.sans,
          fontSize: 13,
          color: C.textSoft,
          lineHeight: 1.35,
        }}
      >
        {body}
      </span>
      {answerable ? (
        <span
          style={{
            display: 'flex',
            gap: 6,
            flexWrap: 'wrap',
            marginTop: 2,
          }}
        >
          {[copy.above, copy.below].map((side) => (
            <span
              key={side}
              style={{
                borderRadius: R.pill,
                border: `1px solid ${C.divider}`,
                padding: '3px 8px',
                fontFamily: fonts.mono,
                fontSize: 10,
                letterSpacing: 0.8,
                textTransform: 'uppercase',
                color: C.textMutedStrong,
              }}
            >
              {side}
            </span>
          ))}
        </span>
      ) : null}
      <span
        style={{
          fontFamily: fonts.sans,
          fontSize: 14,
          fontWeight: 700,
          color: observe ? C.textSoft : C.accent,
          marginTop: 2,
        }}
      >
        {cta}
      </span>
    </Link>
  );
}
