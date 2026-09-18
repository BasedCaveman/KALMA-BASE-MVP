// kalma/frontend/components/shared/ShareQuestionButton.tsx
//
// CO-3: the entry point to the branded share poster. Tapping it opens
// ShareCardModal (preview image + Save / Copy / Share), rather than firing a
// bare native share — so what lands in the group is the Kalma-branded card,
// in its weather voice. The default message stitches the question + the live
// split + a "what do you say?" nudge.

'use client';

import { useState } from 'react';
import { useColors } from '@/hooks/useColors';
import { useTranslation } from '@/hooks/useTranslation';
import ShareCardModal, { type ShareVariant } from '@/components/shared/ShareCardModal';

function shareCopy(language: string) {
  const t: Record<string, { share: string; join: string }> = {
    en: { share: 'Share this question', join: 'What do you say — Yes or No?' },
    pt: { share: 'Compartilhar esta pergunta', join: 'O que você acha — Sim ou Não?' },
    es: { share: 'Compartir esta pregunta', join: '¿Qué dices — Sí o No?' },
    fr: { share: 'Partager cette question', join: 'Ton avis — Oui ou Non ?' },
    de: { share: 'Diese Frage teilen', join: 'Was sagst du — Ja oder Nein?' },
    zh: { share: '分享这个问题', join: '你怎么看——是还是否？' },
  };
  return t[language] ?? t.en;
}

export default function ShareQuestionButton({
  marketId,
  question,
  split,
  variant = 'signal',
  compact = false,
  hero = false,
}: {
  marketId: number | string;
  question: string;
  /** Optional one-line community-split summary woven into the message. */
  split?: string;
  variant?: ShareVariant;
  compact?: boolean;
  /** Full-width accent styling — the primary CTA on the create success screen. */
  hero?: boolean;
}) {
  const { C, neu, fonts, R } = useColors();
  const { language } = useTranslation();
  const copy = shareCopy(language);
  const [open, setOpen] = useState(false);

  // Keep the typed text short — the link unfurls into the branded OG card which
  // already shows the split, people and days, so we don't repeat them here.
  // `split` is kept as a prop for callers/analytics but no longer dumped into
  // the message blob.
  void split;
  const defaultMessage = [question, copy.join].filter(Boolean).join('\n');

  const heroStyle = {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 9,
    width: '100%',
    minHeight: 54,
    padding: '14px 18px',
    borderRadius: R.md,
    border: 'none',
    cursor: 'pointer',
    fontFamily: fonts.sans,
    fontSize: 16,
    fontWeight: 800,
    letterSpacing: '0.01em',
    color: C.bg,
    background: `linear-gradient(180deg, rgba(255,255,255,0.16) 0%, rgba(255,255,255,0) 42%), ${C.accent}`,
    boxShadow: `0 8px 22px ${C.accent}44, inset 0 1px 0 rgba(255,255,255,0.28)`,
  } as const;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={copy.share}
        style={
          hero
            ? heroStyle
            : {
                ...neu.controlRaised,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 7,
                minHeight: 48,
                padding: compact ? '8px 12px' : '9px 14px',
                borderRadius: R.md,
                border: 'none',
                cursor: 'pointer',
                fontFamily: fonts.sans,
                fontSize: 13,
                fontWeight: 700,
                color: C.text,
                background: C.surface,
              }
        }
      >
        <svg width={hero ? 18 : 16} height={hero ? 18 : 16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="18" cy="5" r="3" />
          <circle cx="6" cy="12" r="3" />
          <circle cx="18" cy="19" r="3" />
          <line x1="8.6" y1="13.5" x2="15.4" y2="17.5" />
          <line x1="15.4" y1="6.5" x2="8.6" y2="10.5" />
        </svg>
        {compact ? copy.share.split(' ')[0] : copy.share}
      </button>

      <ShareCardModal
        open={open}
        onClose={() => setOpen(false)}
        marketId={marketId}
        question={question}
        defaultMessage={defaultMessage}
        variant={variant}
      />
    </>
  );
}
