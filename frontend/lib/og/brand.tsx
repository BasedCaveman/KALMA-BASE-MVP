// kalma/frontend/lib/og/brand.tsx
//
// Satori-safe copy of the Kalma brand mark (components/design/KalmaMark.tsx)
// for use inside Open Graph ImageResponse renders. KalmaMark itself can't be
// reused here: it colours with CSS vars (var(--k-text)/var(--k-accent)) and
// uses mixBlendMode, neither of which satori supports. This reproduces the
// same reticle geometry with explicit colours so the shared poster carries
// the real logo, matching the header / landing / sidebar.

import React from 'react';

const INK = '#ecead0';
const GOLD = '#C8943A';

export function OgMark({ size = 46 }: { size?: number }) {
  const fibers = Array.from({ length: 24 }).map((_, i) => {
    const rad = ((i * 360) / 24) * (Math.PI / 180);
    return {
      x1: (32 + Math.cos(rad) * 12).toFixed(2),
      y1: (32 + Math.sin(rad) * 12).toFixed(2),
      x2: (32 + Math.cos(rad) * 24).toFixed(2),
      y2: (32 + Math.sin(rad) * 24).toFixed(2),
    };
  });

  return (
    <svg width={size} height={size} viewBox="0 0 64 64" style={{ display: 'flex' }}>
      {/* Outer reticle ring */}
      <circle cx="32" cy="32" r="26" fill="none" stroke={INK} strokeWidth="1.6" opacity="0.9" />
      {/* Crosshairs */}
      <g stroke={INK} strokeWidth="1.4" opacity="0.85" strokeLinecap="round">
        <line x1="32" y1="2" x2="32" y2="11" />
        <line x1="32" y1="53" x2="32" y2="62" />
        <line x1="2" y1="32" x2="11" y2="32" />
        <line x1="53" y1="32" x2="62" y2="32" />
      </g>
      {/* Iris fibres */}
      <g stroke={INK} strokeWidth="0.8" opacity="0.5" strokeLinecap="round" fill="none">
        {fibers.map((f, i) => (
          <line key={i} x1={f.x1} y1={f.y1} x2={f.x2} y2={f.y2} />
        ))}
      </g>
      {/* Accent pupil */}
      <circle cx="32" cy="32" r="7" fill={GOLD} />
    </svg>
  );
}

// The full lockup used top-left on every poster: mark + "Kalma" wordmark +
// a flavor-specific sub-line (the "tagline" that changes per card flavor).
export function OgBrand({ tagline, size = 46 }: { tagline: string; size?: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
      <OgMark size={size} />
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', fontSize: 28, fontWeight: 700, letterSpacing: -0.5, color: INK }}>
          Kalma
        </div>
        <div style={{ display: 'flex', fontSize: 13, letterSpacing: 2, textTransform: 'uppercase', color: '#9aa898', marginTop: 3 }}>
          {tagline}
        </div>
      </div>
    </div>
  );
}
