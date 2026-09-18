// kalma/frontend/components/shared/FavoriteButton.tsx
//
// Toggleable "follow this place" button. Bookmark-style icon (not a
// heart — Kalma's tone isn't sentimental; a saved bookmark fits the
// calm-practical voice). Driven by useFavorites localStorage hook.

'use client';

import { useFavorites } from '@/hooks/useFavorites';
import { useColors } from '@/hooks/useColors';
import { useTranslation } from '@/hooks/useTranslation';

type Props = {
  slug: string;
  /** Optional literal label to render alongside the icon. Omit for icon-only. */
  label?: { saved: string; save: string };
  /** Optional translation keys — resolved reactively via useTranslation so
   *  the label localizes with the visitor's language. Takes precedence
   *  over `label` when provided. */
  labelKeys?: { saved: string; save: string };
  /** Adjust size. Default 'md'. */
  size?: 'sm' | 'md';
};

export default function FavoriteButton({ slug, label, labelKeys, size = 'md' }: Props) {
  const { isFavorited, toggle, hydrated } = useFavorites();
  const { C, fonts, R } = useColors();
  const { t } = useTranslation();

  const resolvedLabel = labelKeys
    ? { saved: t(labelKeys.saved), save: t(labelKeys.save) }
    : label;

  // Until localStorage is read (hydrated), render the inactive shape to
  // avoid a flash-of-active-state. After hydration, the real value
  // takes over.
  const active = hydrated && isFavorited(slug);

  const iconSize = size === 'sm' ? 14 : 16;
  const padding = size === 'sm' ? '6px 10px' : '9px 14px';

  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={() => toggle(slug)}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        minHeight: 48,
        padding,
        borderRadius: R.pill,
        background: active ? `${C.accent}1A` : 'transparent',
        border: `1px solid ${active ? `${C.accent}66` : 'color-mix(in srgb, var(--k-text) 18%, transparent)'}`,
        color: active ? C.accent : C.text,
        fontFamily: fonts.sans,
        fontSize: size === 'sm' ? 12 : 13,
        fontWeight: 600,
        cursor: 'pointer',
        transition: 'background 120ms ease-out, border-color 120ms ease-out',
      }}
    >
      <svg
        viewBox="0 0 24 24"
        width={iconSize}
        height={iconSize}
        fill={active ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth={1.9}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {/* Bookmark glyph. Filled when active. */}
        <path d="M19 21l-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
      </svg>
      {resolvedLabel ? <span>{active ? resolvedLabel.saved : resolvedLabel.save}</span> : null}
    </button>
  );
}
