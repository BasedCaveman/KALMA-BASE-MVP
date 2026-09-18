// kalma/frontend/components/market/SignalQuestionCard.tsx
//
// The simplified, mockup-matching lead card: one plain question, the community
// split, and two stable answer buttons ("Yes" / "No"). The question carries
// the weather semantics, so people don't need to reinterpret the buttons for
// each risk type. Tapping a side opens the question's page, where the VL-1
// flow makes answering one tap. Read → Sense → Act.
//
// Presentational only (no chain writes). Distinct from MarketCard, which is the
// dense browse card; this is the calm hero.

'use client';

import Link from 'next/link';
import { useColors } from '@/hooks/useColors';
import { useTranslation } from '@/hooks/useTranslation';
import type { Market } from '@/hooks/useMarkets';
import { marketQuestion } from '@/lib/market-question';
import { useUnits } from '@/lib/units-context';
import { formatPlaceLabel } from '@/lib/place-format';
import { sideLabels } from '@/lib/side-labels';

function cardCopy(language: string) {
  const t: Record<string, { say: string; person: string; people: string; daysLeft: (n: number) => string; helper: string; beFirst: string }> = {
    en: { say: 'say', person: 'person', people: 'people', daysLeft: (n) => `${n}d left`, helper: 'Tap to answer — set up for you, nothing to configure', beFirst: 'Be the first to answer this one.' },
    pt: { say: 'escolheram', person: 'pessoa', people: 'pessoas', daysLeft: (n) => `faltam ${n}d`, helper: 'Toque para responder — já deixamos tudo pronto, sem configurar', beFirst: 'Seja o primeiro a responder.' },
    es: { say: 'eligen', person: 'persona', people: 'personas', daysLeft: (n) => `quedan ${n}d`, helper: 'Toca para responder — todo listo, sin configurar', beFirst: 'Sé el primero en responder.' },
    fr: { say: 'penchent', person: 'personne', people: 'personnes', daysLeft: (n) => `${n}j restants`, helper: 'Touche pour répondre — déjà prêt, rien à configurer', beFirst: 'Sois le premier à répondre.' },
    de: { say: 'tippen', person: 'Person', people: 'Personen', daysLeft: (n) => `${n}T übrig`, helper: 'Tippen zum Antworten — alles vorbereitet, nichts einzurichten', beFirst: 'Beantworte diese als Erster.' },
    zh: { say: '选择', person: '人', people: '人', daysLeft: (n) => `剩 ${n} 天`, helper: '点击作答——已为你准备好，无需设置', beFirst: '成为第一个回答的人。' },
  };
  return t[language] ?? t.en;
}

export default function SignalQuestionCard({
  m,
  muted = false,
}: {
  m: Market;
  muted?: boolean;
}) {
  const { C, neu, fonts, R } = useColors();
  const { language } = useTranslation();
  const { system } = useUnits();
  const copy = cardCopy(language);
  const labels = sideLabels(m.marketTypeId, language);

  const question = marketQuestion(language, {
    marketTypeId: m.marketTypeId,
    thresholdValue: m.thresholdValue ?? 0,
    unit: m.unit ?? '',
    startTime: m.startTime,
    endTime: m.endTime,
  }, system);

  const placeParts = formatPlaceLabel(m.cityName);
  const placeLabel = [placeParts.city, placeParts.region, placeParts.country].filter(Boolean).join(', ') || m.cityName;

  const hasSplit = m.abovePoolValue + m.belowPoolValue > 0 && m.participantCount > 0;
  const majAbove = m.aboveCrowdPct >= m.belowCrowdPct;
  const majPct = Math.max(m.aboveCrowdPct, m.belowCrowdPct);
  const peopleWord = m.participantCount === 1 ? copy.person : copy.people;
  const href = `/markets/${m.id.toString()}`;

  const sideBtn = (side: 'above' | 'below') => {
    const label = side === 'above' ? labels.above : labels.below;
    const color = side === 'above' ? C.above : C.below;
    const arrow = side === 'above' ? '▲' : '▼';
    return (
      <Link
        href={`${href}?side=${side}`}
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 3,
          width: '100%',
          minWidth: 0,
          boxSizing: 'border-box',
          minHeight: 64,
          padding: '12px 8px',
          borderRadius: R.lg,
          background: muted ? `${color}30` : color,
          color: muted ? C.text : C.bg,
          textDecoration: 'none',
          fontFamily: fonts.sans,
          fontSize: 16,
          fontWeight: 800,
          border: muted ? `1px solid ${color}45` : 'none',
          boxShadow: muted ? `inset 1px 1px 0 ${C.shadowB}20` : undefined,
        }}
      >
        <span style={{ fontSize: 16, lineHeight: 1, color: muted ? color : undefined }}>{arrow}</span>
        {label}
      </Link>
    );
  };

  return (
    <div
      className="k-signal-question-card"
      style={{
        ...neu.panelRaised,
        width: '100%',
        maxWidth: '100%',
        minWidth: 0,
        boxSizing: 'border-box',
        overflow: 'hidden',
        borderRadius: R.xl,
        padding: '18px 16px 16px',
        background: muted ? `${C.surfaceSoft}F0` : C.surface,
        opacity: muted ? 0.9 : 1,
      }}
    >
      <style>{`
        @media (max-width: 360px) {
          .k-signal-question-sides {
            grid-template-columns: 1fr !important;
          }
          .k-signal-question-place {
            width: 100%;
            min-width: 0;
          }
        }
      `}</style>
      {/* Place name up top — make it explicit where this signal is. */}
      <div
        className="k-signal-question-place"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          width: '100%',
          minWidth: 0,
          fontFamily: fonts.mono,
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: 1.3,
          textTransform: 'uppercase',
          color: C.textMutedStrong,
          marginBottom: 10,
        }}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
          <path d="M12 21s-6-5.3-6-10a6 6 0 0 1 12 0c0 4.7-6 10-6 10Z" />
          <circle cx="12" cy="11" r="2" />
        </svg>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
          {placeLabel}
        </span>
      </div>

      <div
        style={{
          fontFamily: fonts.display,
          fontSize: 23,
          fontWeight: 700,
          lineHeight: 1.18,
          color: C.text,
          marginBottom: 14,
          overflowWrap: 'anywhere',
        }}
      >
        {question}
      </div>

      <div
        style={{
          display: 'flex',
          height: 8,
          borderRadius: 999,
          overflow: 'hidden',
          background: C.surfaceDeep,
          marginBottom: 7,
        }}
      >
        <div style={{ width: `${m.aboveCrowdPct}%`, background: C.above }} />
        <div style={{ width: `${m.belowCrowdPct}%`, background: C.below }} />
      </div>
      <div style={{ fontFamily: fonts.sans, fontSize: 13, color: C.textSoft, marginBottom: 16 }}>
        {hasSplit
          ? `${majPct}% ${copy.say} ${majAbove ? labels.above.toLowerCase() : labels.below.toLowerCase()} · ${m.participantCount} ${peopleWord} · ${copy.daysLeft(m.daysLeft)}`
          : copy.beFirst}
      </div>

      <div className="k-signal-question-sides" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, minWidth: 0 }}>
        {sideBtn('above')}
        {sideBtn('below')}
      </div>

      <div style={{ textAlign: 'center', fontFamily: fonts.sans, fontSize: 12, color: C.textMuted, marginTop: 11 }}>
        {copy.helper}
      </div>
    </div>
  );
}
