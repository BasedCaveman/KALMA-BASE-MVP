// kalma/frontend/components/design/KalmaMark.tsx
//
// The Kalma brand mark — single source of truth. Use this anywhere
// the iris glyph should appear: the dapp header, the desktop sidebar
// nav, the landing page, the loading splash, etc. Pairs naturally
// with the "Kalma" wordmark in Playfair Display.
//
// Visual reference: a calm reticle. Cream outer ring with light
// crosshairs extending past it, fine radiating iris fibers, a small
// pupil of accent yellow at the centre. Tone is observational, not
// brand-shouty — matches Kalma's "infrastructure, not casino" voice.
//
// Implementation notes:
//   - Renders as inline SVG so it scales crisp at any size and stays
//     in the design system (no external image fetches, no broken
//     <img> in dark mode).
//   - Line colour comes from var(--k-text) so it inverts with the
//     light / dark theme switch (dark ink on cream, cream ink on
//     forest-green).
//   - The pupil is a FIXED brand gold (BRAND_GOLD), theme-independent —
//     it anchors brand recognition on either background and must read
//     the same as the icon / favicon / logo assets. It used to fill with
//     var(--k-accent), which was never defined → the pupil computed to
//     black and vanished on the dark background. Hardcoded so it can
//     never silently break again.
//   - If you want to swap the inline art for a final illustrated
//     SVG, replace the <g> contents below. The component contract
//     (size, accent, ariaHidden) stays the same.

import React from 'react';

// Canonical Kalma brand gold — single value for the pupil everywhere it
// appears: this mark, the favicon / PWA icons (generated from this geometry by
// scripts/gen-brand-assets.mjs), the brand SVGs, and the OG posters. NB: the
// retired docs/KalmaLogos/* and public/brand/* art are a different (crosshair)
// geometry — only the gold value is shared, not the shape.
export const BRAND_GOLD = '#C8943A';

type Props = {
  /** Pixel size of the rendered square. Default 28. */
  size?: number;
  /** Override the centre pupil colour. Defaults to BRAND_GOLD (the fixed,
   *  theme-independent brand gold). */
  accentColor?: string;
  /** Override the line colour. Defaults to var(--k-text). */
  lineColor?: string;
  /** Decorative by default — paired with the "Kalma" wordmark in the
   *  same parent, the wordmark carries the accessible name. */
  ariaHidden?: boolean;
  /** Optional title for the rare case where the mark sits without
   *  the wordmark and needs its own accessible label. */
  title?: string;
};

export default function KalmaMark({
  size = 28,
  accentColor,
  lineColor,
  ariaHidden = true,
  title,
}: Props) {
  const stroke = lineColor ?? 'var(--k-text)';
  const fill = accentColor ?? BRAND_GOLD;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role={ariaHidden ? undefined : 'img'}
      aria-hidden={ariaHidden ? true : undefined}
      aria-label={ariaHidden ? undefined : title ?? 'Kalma'}
      style={{ display: 'block', flexShrink: 0 }}
    >
      {title && !ariaHidden ? <title>{title}</title> : null}

      {/* Outer reticle ring */}
      <circle
        cx="32"
        cy="32"
        r="26"
        fill="none"
        stroke={stroke}
        strokeWidth="1.4"
        opacity="0.9"
      />

      {/* Reticle crosshairs — extend slightly past the ring on each axis */}
      <g stroke={stroke} strokeWidth="1.2" opacity="0.8" strokeLinecap="round">
        <line x1="32" y1="2" x2="32" y2="10" />
        <line x1="32" y1="54" x2="32" y2="62" />
        <line x1="2" y1="32" x2="10" y2="32" />
        <line x1="54" y1="32" x2="62" y2="32" />
      </g>

      {/* Iris fibres — radial strokes suggesting the iris pattern. A
          minimal set (16) carries the idea without going pixel-by-pixel
          on the full illustration; swap in the final art when ready. */}
      <g
        stroke={stroke}
        strokeWidth="0.7"
        opacity="0.55"
        strokeLinecap="round"
        fill="none"
      >
        {Array.from({ length: 24 }).map((_, i) => {
          const angle = (i * 360) / 24;
          const rad = (angle * Math.PI) / 180;
          const x1 = 32 + Math.cos(rad) * 12;
          const y1 = 32 + Math.sin(rad) * 12;
          const x2 = 32 + Math.cos(rad) * 24;
          const y2 = 32 + Math.sin(rad) * 24;
          return (
            <line
              key={i}
              x1={x1.toFixed(2)}
              y1={y1.toFixed(2)}
              x2={x2.toFixed(2)}
              y2={y2.toFixed(2)}
            />
          );
        })}
      </g>

      {/* Pupil — the accent yellow at the centre */}
      <circle cx="32" cy="32" r="6.5" fill={fill} />

      {/* Subtle highlight inside the pupil to keep it from looking flat */}
      <circle
        cx="29.5"
        cy="30"
        r="2.2"
        fill={fill}
        opacity="0.45"
        style={{ mixBlendMode: 'screen' }}
      />
    </svg>
  );
}
