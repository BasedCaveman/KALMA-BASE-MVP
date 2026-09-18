// kalma/frontend/components/shared/ShareCardButton.tsx
//
// "Share card" affordance for place pages. Fetches the place's 1:1
// climate-intelligence card (app/api/og/place/[slug]/route.tsx) as a PNG
// in the user's current language and hands the FILE to the native share
// sheet (Web Share API Level 2) — so it lands directly in WhatsApp /
// Instagram as an image, not a link.
//
// Fallback ladder:
//   1. navigator.share({ files }) — Android Chrome, iOS Safari, Edge
//   2. plain download of the PNG — desktop browsers without file share
// Safari only allows share() during transient user activation; if the
// card fetch outlives that window the call throws NotAllowedError and
// we fall through to the download path rather than surfacing an error.
//
// Visual: same pill styling as ShareButton so the action row reads as
// one family; the image glyph distinguishes card-share from link-share.

'use client';

import { useState } from 'react';
import { useColors } from '@/hooks/useColors';
import { useTranslation } from '@/hooks/useTranslation';

const CARD_COPY: Record<string, { label: string; generating: string; downloaded: string }> = {
  en: { label: 'Share card', generating: 'Generating…', downloaded: 'Downloaded' },
  pt: { label: 'Compartilhar card', generating: 'Gerando…', downloaded: 'Baixado' },
  es: { label: 'Compartir tarjeta', generating: 'Generando…', downloaded: 'Descargada' },
  fr: { label: 'Partager la carte', generating: 'Génération…', downloaded: 'Téléchargée' },
  de: { label: 'Karte teilen', generating: 'Wird erstellt…', downloaded: 'Heruntergeladen' },
  zh: { label: '分享卡片', generating: '生成中…', downloaded: '已下载' },
};

type Props = {
  slug: string;
  placeName: string;
  size?: 'sm' | 'md';
};

export default function ShareCardButton({ slug, placeName, size = 'md' }: Props) {
  const { C, fonts, R } = useColors();
  const { language } = useTranslation();
  const copy = CARD_COPY[language] ?? CARD_COPY.en;
  const [busy, setBusy] = useState(false);
  const [downloaded, setDownloaded] = useState(false);

  async function handleClick() {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/og/place/${slug}?lang=${language}`);
      if (!res.ok) throw new Error(`card fetch ${res.status}`);
      const blob = await res.blob();
      const file = new File([blob], `kalma-${slug}.png`, { type: 'image/png' });

      const canShareFile =
        typeof navigator !== 'undefined' &&
        typeof navigator.share === 'function' &&
        typeof navigator.canShare === 'function' &&
        navigator.canShare({ files: [file] });

      if (canShareFile) {
        try {
          await navigator.share({ files: [file], title: placeName });
          return;
        } catch (err) {
          const name =
            err && typeof err === 'object' && 'name' in err
              ? (err as { name: string }).name
              : '';
          // User closed the sheet → done, silently.
          if (name === 'AbortError') return;
          // NotAllowedError etc. (lost user-activation) → download instead.
        }
      }

      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = `kalma-${slug}.png`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(objectUrl);
      setDownloaded(true);
      window.setTimeout(() => setDownloaded(false), 1800);
    } catch (err) {
      console.warn('[Kalma] share card failed:', err);
    } finally {
      setBusy(false);
    }
  }

  const iconSize = size === 'sm' ? 14 : 16;
  const padding = size === 'sm' ? '6px 10px' : '9px 14px';

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={busy}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        minHeight: 48,
        padding,
        borderRadius: R.pill,
        background: 'transparent',
        border: '1px solid color-mix(in srgb, var(--k-text) 18%, transparent)',
        color: C.text,
        fontFamily: fonts.sans,
        fontSize: size === 'sm' ? 12 : 13,
        fontWeight: 600,
        cursor: busy ? 'default' : 'pointer',
        opacity: busy ? 0.7 : 1,
        transition: 'background 120ms ease-out, border-color 120ms ease-out',
      }}
    >
      <svg
        viewBox="0 0 24 24"
        width={iconSize}
        height={iconSize}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.9}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {/* Image/card glyph — frame with sun + horizon. */}
        <rect x="3" y="4" width="18" height="16" rx="2.5" />
        <circle cx="9" cy="10" r="1.6" />
        <path d="M3.5 17l5-4.5 4 3.5 4.5-4 3.5 3" />
      </svg>
      <span>{busy ? copy.generating : downloaded ? copy.downloaded : copy.label}</span>
    </button>
  );
}
