//kalma/frontend/components/signal/OpenProtectionsForPlace.tsx
//
// /places/[slug] only ever surfaced a market by way of a local_signal's own
// CTA (SignalActionCTA). A place whose live signals happen to all be one
// family (e.g. three straight rain-family signals, no heat/cold one) left
// its genuinely open, answerable temp_high/temp_low markets reachable only
// from /markets and /today. This section closes that gap: every open market
// within range of this place that no active signal already points to.
//
// A client island, same shape as SignalActionCTA already mounted on this
// same server-rendered page: market data needs wagmi/live reads, which a
// server component cannot do, so the boundary is drawn here, not by
// reaching into useMarketsSnapshot's internals from server code.
//
// Reuses CompactMarketGrid (components/market/MarketCard.tsx) rather than
// building new card markup, so this looks identical to the same market
// shown on /markets or /today, per Pedro's explicit ask that signals and
// protections share the same visual language.

'use client';

import { useMemo } from 'react';
import { useMarketsSnapshot } from '@/hooks/useMarketsSnapshot';
import { haversineKm } from '@/hooks/useMarkets';
import { findOrphanMarkets } from '@/lib/signal-engine/signal-action';
import { CompactMarketGrid } from '@/components/market/MarketCard';
import { useColors } from '@/hooks/useColors';
import { useTranslation } from '@/hooks/useTranslation';

const NEARBY_KM = 50; // matches signal-action.ts's own market-match radius
const CAP = 6;

type PlaceLike = { name: string; lat: number; lon: number };
type SignalLike = {
  signalTypeId: string;
  validFrom: string;
  validUntil: string;
};

function copyFor(language: string) {
  const t: Record<string, { header: string; body: string }> = {
    en: {
      header: 'Open protections without a signal yet',
      body: 'These have a real question you can answer right now, even though no risk signal called it out yet.',
    },
    pt: {
      header: 'Proteções abertas sem sinal ainda',
      body: 'Essas têm uma pergunta de verdade que você já pode responder, mesmo sem nenhum sinal de risco ter avisado ainda.',
    },
    es: {
      header: 'Protecciones abiertas sin señal todavía',
      body: 'Estas tienen una pregunta real que ya puedes responder, aunque ninguna señal de riesgo la haya anunciado todavía.',
    },
    fr: {
      header: 'Protections ouvertes sans signal pour l’instant',
      body: 'Celles-ci ont une vraie question à laquelle tu peux déjà répondre, même si aucun signal de risque ne l’a encore signalée.',
    },
    de: {
      header: 'Offene Absicherungen ohne eigenes Signal',
      body: 'Diese haben eine echte Frage, die du schon beantworten kannst, auch wenn noch kein Risiko-Signal sie angezeigt hat.',
    },
    zh: {
      header: '尚无信号的开放保护',
      body: '这些已经有一个真实的问题你可以现在回答，即使还没有风险信号提示过。',
    },
  };
  return t[language] ?? t.en;
}

export default function OpenProtectionsForPlace({
  place,
  signals,
}: {
  place: PlaceLike;
  signals: SignalLike[];
}) {
  const { C, fonts } = useColors();
  const { language } = useTranslation();
  const copy = copyFor(language);
  const { markets } = useMarketsSnapshot(null);

  const nearby = useMemo(
    () =>
      markets.filter(
        (m) => haversineKm(place.lat, place.lon, m.lat, m.lon) <= NEARBY_KM,
      ),
    [markets, place.lat, place.lon],
  );

  const placeSignals = useMemo(
    () => signals.map((s) => ({ ...s, place })),
    [signals, place],
  );

  const orphans = useMemo(
    () => findOrphanMarkets(placeSignals, nearby).slice(0, CAP),
    [placeSignals, nearby],
  );

  if (orphans.length === 0) return null;

  return (
    <div style={{ marginTop: 28 }}>
      <h2
        style={{
          fontFamily: fonts.mono,
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: 1.4,
          textTransform: 'uppercase',
          color: C.textMutedStrong,
          margin: '0 0 4px',
        }}
      >
        {copy.header}
      </h2>
      <p
        style={{
          fontFamily: fonts.sans,
          fontSize: 13,
          color: C.textSoft,
          lineHeight: 1.5,
          margin: '0 0 12px',
        }}
      >
        {copy.body}
      </p>
      <CompactMarketGrid markets={orphans} className="k-place-orphan-grid" />
    </div>
  );
}
