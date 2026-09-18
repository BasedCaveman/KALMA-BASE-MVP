// kalma/frontend/components/shared/ShareButton.tsx
//
// Share affordance. Uses the native Web Share API where available
// (mobile Safari, Android Chrome, Edge, modern Firefox on Android) so
// the platform picker pops with WhatsApp, Telegram, Mail, Messages,
// etc. Falls back to copying the URL to clipboard on desktop browsers
// that don't expose navigator.share.
//
// Rich previews on WhatsApp / Telegram / Twitter come from the page's
// OpenGraph meta + dynamic OG image — see the per-page
// opengraph-image.tsx files. This button just hands the URL over.

'use client';

import { useState } from 'react';
import { useColors } from '@/hooks/useColors';
import { useTranslation } from '@/hooks/useTranslation';

const SHARE_COPY: Record<string, { share: string; copied: string; copyPrompt: string }> = {
  en: { share: 'Share', copied: 'Link copied', copyPrompt: 'Copy this link:' },
  pt: { share: 'Compartilhar', copied: 'Link copiado', copyPrompt: 'Copie este link:' },
  es: { share: 'Compartir', copied: 'Enlace copiado', copyPrompt: 'Copia este enlace:' },
  fr: { share: 'Partager', copied: 'Lien copié', copyPrompt: 'Copie ce lien :' },
  de: { share: 'Teilen', copied: 'Link kopiert', copyPrompt: 'Diesen Link kopieren:' },
  zh: { share: '分享', copied: '链接已复制', copyPrompt: '复制此链接：' },
};

type Props = {
  /** Absolute or relative URL. We resolve relative URLs against the current origin. */
  url: string;
  /** Used as `title` in Web Share + as the toast affordance. */
  title: string;
  /** Optional description passed to Web Share. */
  text?: string;
  size?: 'sm' | 'md';
  /** Optional label override. Defaults to the localised "Share". */
  label?: string;
};

export default function ShareButton({
  url,
  title,
  text,
  size = 'md',
  label,
}: Props) {
  const { C, fonts, R } = useColors();
  const { language } = useTranslation();
  const copy = SHARE_COPY[language] ?? SHARE_COPY.en;
  const resolvedLabel = label ?? copy.share;
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleClick() {
    if (busy) return;
    setBusy(true);

    // Normalise the URL: if relative, resolve against current origin
    // so what we hand to navigator.share / clipboard is always absolute.
    let absolute = url;
    if (typeof window !== 'undefined' && !/^https?:/.test(url)) {
      absolute = `${window.location.origin}${url.startsWith('/') ? '' : '/'}${url}`;
    }

    try {
      if (
        typeof navigator !== 'undefined' &&
        'share' in navigator &&
        typeof navigator.share === 'function'
      ) {
        await navigator.share({ title, text, url: absolute });
      } else if (
        typeof navigator !== 'undefined' &&
        navigator.clipboard &&
        navigator.clipboard.writeText
      ) {
        await navigator.clipboard.writeText(absolute);
        setCopied(true);
        // Reset the "copied" state after a moment.
        window.setTimeout(() => setCopied(false), 1800);
      } else {
        // Last-resort fallback: prompt with the URL so users can
        // copy by hand. Rare in 2026 but harmless.
        window.prompt(copy.copyPrompt, absolute);
      }
    } catch (err) {
      // User cancelled the share sheet → no-op. Don't surface as error.
      if (
        err &&
        typeof err === 'object' &&
        'name' in err &&
        (err as { name: string }).name === 'AbortError'
      ) {
        // ignore
      } else {
        console.warn('[Kalma] share failed:', err);
      }
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
        border:
          '1px solid color-mix(in srgb, var(--k-text) 18%, transparent)',
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
        {/* iOS-style share glyph — square with up arrow. Universally
            understood across mobile platforms. */}
        <path d="M12 3v13" />
        <path d="M7 8l5-5 5 5" />
        <path d="M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5" />
      </svg>
      <span>{copied ? copy.copied : resolvedLabel}</span>
    </button>
  );
}
