// kalma/frontend/components/landing/LandingQuestionPreview.tsx
//
// Revamp-5: a real, answerable question on the landing page — so a first-time
// visitor sees Kalma's core loop (a live weather question + the crowd split +
// two plain answers) before reading a word of explanation. Tapping a side goes
// to the question's page and the VL-1 flow makes answering one tap.
//
// Client island: it does the chain reads (useMarkets, no location → the first
// live actionable market). Renders nothing when there's no live market, so the
// landing stays clean for crawlers / cold states.

'use client';

import { useMarketsSnapshot } from '@/hooks/useMarketsSnapshot';
import { useColors } from '@/hooks/useColors';
import { useTranslation } from '@/hooks/useTranslation';
import SignalQuestionCard from '@/components/market/SignalQuestionCard';

function labelFor(language: string): string {
  return (
    ({
      en: 'A live question right now',
      pt: 'Uma pergunta ativa agora',
      es: 'Una pregunta activa ahora',
      fr: 'Une question en direct maintenant',
      de: 'Eine aktive Frage gerade jetzt',
      zh: '此刻的一个实时问题',
    } as Record<string, string>)[language] ?? 'A live question right now'
  );
}

export default function LandingQuestionPreview() {
  // RS-2b: the landing is the highest-traffic page — read the live question from
  // the off-chain snapshot (zero chain reads for anonymous visitors) instead of
  // multicalling markets through /api/Base Sepolia-rpc.
  const { primaryMarket } = useMarketsSnapshot();
  const { C, fonts } = useColors();
  const { language } = useTranslation();

  if (!primaryMarket) return null;

  return (
    <section style={{ marginBottom: 32 }}>
      <div
        style={{
          fontFamily: fonts.mono,
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: 1.4,
          textTransform: 'uppercase',
          color: C.textMutedStrong,
          marginBottom: 12,
        }}
      >
        {labelFor(language)}
      </div>
      <SignalQuestionCard m={primaryMarket} />
    </section>
  );
}
