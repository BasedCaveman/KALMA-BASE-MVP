// kalma/frontend/components/market/CommunityPulse.tsx
//
// Revamp-4 (Read → Sense → Act): the crowd's read, weighted ABOVE the ▲/▼
// action on the market detail page. A visual split bar + one plain line
// ("62% say yes · 41 people · 4d left") so a farmer can sense where the crowd
// leans before deciding — not a buried "Crowd split: 62% / 38%" row.
//
// Presentational only. Plain-language side words come from the shared
// sideLabels() so the detail page and the lead card agree.

'use client';

import { useColors } from '@/hooks/useColors';
import { useTranslation } from '@/hooks/useTranslation';
import { sideLabels } from '@/lib/side-labels';

function pulseCopy(language: string) {
  const t: Record<string, { say: string; person: string; people: string; daysLeft: (n: number) => string; beFirst: string }> = {
    en: { say: 'say', person: 'person', people: 'people', daysLeft: (n) => `${n}d left`, beFirst: 'No answers yet — be the first to read this one.' },
    pt: { say: 'escolheram', person: 'pessoa', people: 'pessoas', daysLeft: (n) => `faltam ${n}d`, beFirst: 'Ainda sem respostas — seja o primeiro.' },
    es: { say: 'eligen', person: 'persona', people: 'personas', daysLeft: (n) => `quedan ${n}d`, beFirst: 'Aún sin respuestas — sé el primero.' },
    fr: { say: 'penchent', person: 'personne', people: 'personnes', daysLeft: (n) => `${n}j restants`, beFirst: 'Pas encore de réponses — sois le premier.' },
    de: { say: 'tippen', person: 'Person', people: 'Personen', daysLeft: (n) => `${n}T übrig`, beFirst: 'Noch keine Antworten — sei die erste.' },
    zh: { say: '选择', person: '人', people: '人', daysLeft: (n) => `剩 ${n} 天`, beFirst: '还没有答案——成为第一个。' },
  };
  return t[language] ?? t.en;
}

export default function CommunityPulse({
  marketTypeId,
  aboveCrowdPct,
  belowCrowdPct,
  participantCount,
  daysLeft,
}: {
  marketTypeId: number;
  aboveCrowdPct: number;
  belowCrowdPct: number;
  participantCount: number;
  daysLeft: number;
}) {
  const { C, neu, fonts, R } = useColors();
  const { language } = useTranslation();
  const copy = pulseCopy(language);
  const labels = sideLabels(marketTypeId, language);

  const hasSplit = participantCount > 0;
  const majAbove = aboveCrowdPct >= belowCrowdPct;
  const majPct = Math.max(aboveCrowdPct, belowCrowdPct);
  const peopleWord = participantCount === 1 ? copy.person : copy.people;

  return (
    <div style={{ ...neu.panelRaised, borderRadius: R.xl, padding: '14px 16px' }}>
      <div
        style={{
          display: 'flex',
          height: 10,
          borderRadius: 999,
          overflow: 'hidden',
          background: C.surfaceDeep,
          marginBottom: 9,
        }}
      >
        <div style={{ width: `${aboveCrowdPct}%`, background: C.above }} />
        <div style={{ width: `${belowCrowdPct}%`, background: C.below }} />
      </div>
      <div style={{ fontFamily: fonts.sans, fontSize: 14, color: C.textSoft }}>
        {hasSplit
          ? `${majPct}% ${copy.say} ${(majAbove ? labels.above : labels.below).toLowerCase()} · ${participantCount} ${peopleWord} · ${copy.daysLeft(daysLeft)}`
          : copy.beFirst}
      </div>
    </div>
  );
}
