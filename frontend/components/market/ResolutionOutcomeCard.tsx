// kalma/frontend/components/market/ResolutionOutcomeCard.tsx
//
// CO-4: resolution as an event. When a signal resolves, this is the moment
// everyone who answered shares an emotion at once — so make it a card worth
// sharing, not a quiet "resolved" tag. It says what the weather did, whether
// the crowd called it or got surprised, the viewer's own result, and offers
// one tap to share the outcome back into the group that answered it.

'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useColors } from '@/hooks/useColors';
import { useTranslation } from '@/hooks/useTranslation';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useCountUp } from '@/hooks/useCountUp';
import type { Market } from '@/hooks/useMarkets';
import ShareQuestionButton from '@/components/shared/ShareQuestionButton';

// Scoped reveal motion for the resolution card — a calm staggered rise, never a
// bounce. Fully disabled under prefers-reduced-motion (base state is visible:
// items sit at their natural opacity/position, the animation only plays the
// entrance), so nothing depends on the animation running.
const revealCSS = `
  @keyframes kalmaRevealRise {
    from { opacity: 0; transform: translateY(8px); }
    to   { opacity: 1; transform: none; }
  }
  @keyframes kalmaBadgePop {
    0%   { opacity: 0; transform: scale(0.82); }
    70%  { transform: scale(1.05); }
    100% { opacity: 1; transform: scale(1); }
  }
  .kalma-reveal-item { animation: kalmaRevealRise 520ms cubic-bezier(0.22,0.7,0.2,1) both; }
  .kalma-reveal-badge { animation: kalmaBadgePop 460ms cubic-bezier(0.22,0.7,0.2,1) both; }
  @media (prefers-reduced-motion: reduce) {
    .kalma-reveal-item, .kalma-reveal-badge { animation: none; }
  }
`;

function outcomeCopy(language: string) {
  const t: Record<string, {
    weatherAnswered: string;
    above: string;
    below: string;
    calledIt: (pct: number, side: string) => string;
    surprise: (pct: number, side: string) => string;
    youCalledIt: string;
    youMissed: string;
    youDidntPlay: string;
    answered: (n: number) => string;
    observedThreshold: (actual: string, threshold: string) => string;
    shareJoin: string;
    openNext: (place: string) => string;
  }> = {
    en: {
      weatherAnswered: 'The weather answered',
      above: 'Yes', below: 'No',
      calledIt: (p, s) => `The crowd called it — ${p}% leaned ${s}, and the weather agreed.`,
      surprise: (p, s) => `A surprise — only ${p}% leaned ${s}, but that's where the weather went.`,
      youCalledIt: 'You called it.',
      youMissed: 'Your answer missed this time.',
      youDidntPlay: "You didn't answer this one.",
      answered: (n) => `${n} ${n === 1 ? 'person' : 'people'} answered`,
      observedThreshold: (actual, threshold) => `Observed ${actual} · threshold ${threshold}`,
      shareJoin: 'See how it turned out 👇',
      openNext: (place) => `Open the next question for ${place} →`,
    },
    pt: {
      weatherAnswered: 'O tempo respondeu',
      above: 'Sim', below: 'Não',
      calledIt: (p, s) => `A galera acertou — ${p}% foram em ${s}, e o tempo concordou.`,
      surprise: (p, s) => `Surpresa — só ${p}% foram em ${s}, mas foi pra lá que o tempo foi.`,
      youCalledIt: 'Você acertou.',
      youMissed: 'Sua resposta não pegou desta vez.',
      youDidntPlay: 'Você não respondeu esta.',
      answered: (n) => `${n} ${n === 1 ? 'pessoa respondeu' : 'pessoas responderam'}`,
      observedThreshold: (actual, threshold) => `Observado ${actual} · limite ${threshold}`,
      shareJoin: 'Veja como ficou 👇',
      openNext: (place) => `Abra a próxima pergunta para ${place} →`,
    },
    es: {
      weatherAnswered: 'El tiempo respondió',
      above: 'Sí', below: 'No',
      calledIt: (p, s) => `La gente acertó — ${p}% se fue por ${s}, y el tiempo coincidió.`,
      surprise: (p, s) => `Sorpresa — solo ${p}% se fue por ${s}, pero ahí fue el tiempo.`,
      youCalledIt: 'Acertaste.',
      youMissed: 'Tu respuesta no acertó esta vez.',
      youDidntPlay: 'No respondiste esta.',
      answered: (n) => `${n} ${n === 1 ? 'persona respondió' : 'personas respondieron'}`,
      observedThreshold: (actual, threshold) => `Observado ${actual} · umbral ${threshold}`,
      shareJoin: 'Mira cómo quedó 👇',
      openNext: (place) => `Abre la próxima pregunta para ${place} →`,
    },
    fr: {
      weatherAnswered: 'La météo a répondu',
      above: 'Oui', below: 'Non',
      calledIt: (p, s) => `Le groupe avait vu juste — ${p}% penchaient ${s}, et la météo a suivi.`,
      surprise: (p, s) => `Surprise — seuls ${p}% penchaient ${s}, mais c'est là que la météo est allée.`,
      youCalledIt: 'Tu avais vu juste.',
      youMissed: 'Ta réponse est passée à côté cette fois.',
      youDidntPlay: "Tu n'as pas répondu à celle-ci.",
      answered: (n) => `${n} ${n === 1 ? 'personne a répondu' : 'personnes ont répondu'}`,
      observedThreshold: (actual, threshold) => `Observé ${actual} · seuil ${threshold}`,
      shareJoin: 'Regarde le résultat 👇',
      openNext: (place) => `Ouvre la prochaine question pour ${place} →`,
    },
    de: {
      weatherAnswered: 'Das Wetter hat geantwortet',
      above: 'Ja', below: 'Nein',
      calledIt: (p, s) => `Die Menge lag richtig — ${p}% tippten auf ${s}, und das Wetter stimmte zu.`,
      surprise: (p, s) => `Überraschung — nur ${p}% tippten auf ${s}, aber dorthin ging das Wetter.`,
      youCalledIt: 'Du lagst richtig.',
      youMissed: 'Deine Antwort lag diesmal daneben.',
      youDidntPlay: 'Diese hast du nicht beantwortet.',
      answered: (n) => `${n} ${n === 1 ? 'Person hat' : 'Personen haben'} geantwortet`,
      observedThreshold: (actual, threshold) => `Gemessen ${actual} · Schwelle ${threshold}`,
      shareJoin: 'Sieh dir das Ergebnis an 👇',
      openNext: (place) => `Öffne die nächste Frage für ${place} →`,
    },
    zh: {
      weatherAnswered: '天气给出了答案',
      above: '是', below: '否',
      calledIt: (p, s) => `大家猜对了——${p}% 倾向${s}，天气也是如此。`,
      surprise: (p, s) => `意外——只有 ${p}% 倾向${s}，但天气就往那走了。`,
      youCalledIt: '你猜对了。',
      youMissed: '你这次的答案没猜中。',
      youDidntPlay: '你没有回答这个。',
      answered: (n) => `${n} 人已回答`,
      observedThreshold: (actual, threshold) => `观测值 ${actual} · 阈值 ${threshold}`,
      shareJoin: '来看看结果 👇',
      openNext: (place) => `为 ${place} 开启下一个问题 →`,
    },
  };
  return t[language] ?? t.en;
}

export default function ResolutionOutcomeCard({
  m,
  question,
}: {
  m: Market;
  question: string;
}) {
  const { C, neu, fonts, R } = useColors();
  const { language } = useTranslation();
  const copy = outcomeCopy(language);
  const reduced = useReducedMotion();

  // Inject the reveal keyframes once (head <style>, idempotent) — avoids
  // dangerouslySetInnerHTML and a global stylesheet. The @media reduced-motion
  // guard inside revealCSS disables the animation; the base state is visible.
  useEffect(() => {
    const id = 'kalma-reveal-keyframes';
    if (document.getElementById(id)) return;
    const el = document.createElement('style');
    el.id = id;
    el.textContent = revealCSS;
    document.head.appendChild(el);
  }, []);

  const winningSide: 'above' | 'below' = m.outcome ? 'above' : 'below';
  const winColor = winningSide === 'above' ? C.above : C.below;
  const winLabel = winningSide === 'above' ? copy.above : copy.below;
  const winArrow = winningSide === 'above' ? '▲' : '▼';
  const winningCrowdPct = winningSide === 'above' ? m.aboveCrowdPct : m.belowCrowdPct;
  const crowdCalledIt = winningCrowdPct >= 50;

  const actualNum = typeof m.actualValue === 'number' ? m.actualValue : null;
  const decimals = actualNum != null && !Number.isInteger(actualNum) ? 1 : 0;
  // Count the reveal value up from 0 (skipped under reduced motion). The exact
  // value is preserved — the ramp lands on actualNum and formats to its decimals.
  const counted = useCountUp(actualNum ?? 0, { enabled: !reduced && actualNum != null });
  const actual =
    actualNum != null ? `${counted.toFixed(decimals)}${m.unit ?? ''}` : null;
  const sharedActual =
    actualNum != null ? `${actualNum}${m.unit ?? ''}` : null;
  const threshold =
    typeof m.thresholdValue === 'number' ? `${m.thresholdValue}${m.unit ?? ''}` : null;

  const userLine = m.userHasPosition
    ? m.userWon
      ? copy.youCalledIt
      : copy.youMissed
    : null;

  return (
    <div
      style={{
        ...neu.panelRaised,
        borderRadius: R.lg,
        padding: '18px 18px 16px',
        marginBottom: 12,
        borderTop: `3px solid ${winColor}`,
      }}
    >
      {/* The weather answered: <value> */}
      <div
        className="kalma-reveal-item"
        style={{
          fontFamily: fonts.mono,
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: 1.4,
          textTransform: 'uppercase',
          color: C.textMutedStrong,
          marginBottom: 6,
        }}
      >
        {copy.weatherAnswered}
      </div>

      <div
        className="kalma-reveal-item"
        style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 8, animationDelay: '70ms' }}
      >
        {actual ? (
          <span style={{ fontFamily: fonts.display, fontSize: 'clamp(34px, 10vw, 40px)', fontWeight: 700, color: C.text, lineHeight: 1, fontVariantNumeric: 'tabular-nums', maxWidth: '100%', overflowWrap: 'anywhere' }}>
            {actual}
          </span>
        ) : null}
        <span
          className="kalma-reveal-badge"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            padding: '4px 10px',
            borderRadius: 999,
            background: `${winColor}1A`,
            color: winColor,
            fontFamily: fonts.sans,
            fontSize: 14,
            fontWeight: 800,
            animationDelay: '200ms',
          }}
        >
          {winArrow} {winLabel}
        </span>
      </div>

      {actual && threshold ? (
        <div
          className="kalma-reveal-item"
          style={{
            fontFamily: fonts.mono,
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: 0.8,
            textTransform: 'uppercase',
            color: C.textMuted,
            marginBottom: 12,
            animationDelay: '100ms',
          }}
        >
          {copy.observedThreshold(actual, threshold)}
        </div>
      ) : null}

      {/* Did the crowd call it? */}
      <div
        className="kalma-reveal-item"
        style={{ fontFamily: fonts.sans, fontSize: 14, color: C.textSoft, lineHeight: 1.45, marginBottom: 10, animationDelay: '160ms' }}
      >
        {crowdCalledIt
          ? copy.calledIt(winningCrowdPct, winLabel)
          : copy.surprise(winningCrowdPct, winLabel)}
      </div>

      {/* Your own result */}
      {userLine ? (
        <div
          className="kalma-reveal-item"
          style={{
            display: 'inline-block',
            padding: '6px 12px',
            borderRadius: R.md,
            marginBottom: 14,
            background: m.userWon ? `${C.above}14` : `${C.below}10`,
            color: m.userWon ? C.above : C.below,
            fontFamily: fonts.sans,
            fontSize: 14,
            fontWeight: 700,
            animationDelay: '240ms',
          }}
        >
          {userLine}
        </div>
      ) : null}

      <div
        className="kalma-reveal-item"
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', animationDelay: '320ms' }}
      >
        <span style={{ fontFamily: fonts.mono, fontSize: 12, color: C.textMuted }}>
          {copy.answered(m.participantCount)}
        </span>
        <ShareQuestionButton
          marketId={m.id.toString()}
          variant="resolution"
          question={`${question} — ${copy.weatherAnswered}: ${sharedActual ?? `${winArrow} ${winLabel}`}`}
          split={
            crowdCalledIt
              ? copy.calledIt(winningCrowdPct, winLabel)
              : copy.surprise(winningCrowdPct, winLabel)
          }
          compact
        />
      </div>

      {/* CO-6: this question is done — keep the city alive, open the next one. */}
      <Link
        className="kalma-reveal-item"
        href={(() => {
          // cityName is the on-chain "City, Region, Country" label — carry
          // region/country into the quick-launch link so the next signal
          // keeps the canonical label without a geocoding round-trip.
          const parts = m.cityName.split(',').map((p) => p.trim());
          const usp = new URLSearchParams({
            name: parts[0],
            lat: String(m.lat),
            lon: String(m.lon),
            type: String(m.marketTypeId),
          });
          if (parts.length >= 3) {
            usp.set('region', parts[1]);
            usp.set('country', parts[parts.length - 1]);
          } else if (parts.length === 2) {
            usp.set('country', parts[1]);
          }
          return `/create?${usp.toString()}`;
        })()}
        style={{
          display: 'inline-block',
          marginTop: 14,
          animationDelay: '400ms',
          fontFamily: fonts.sans,
          fontSize: 13,
          fontWeight: 700,
          color: C.accent,
          textDecoration: 'none',
        }}
      >
        {copy.openNext(m.cityName.split(',')[0].trim())}
      </Link>
    </div>
  );
}
