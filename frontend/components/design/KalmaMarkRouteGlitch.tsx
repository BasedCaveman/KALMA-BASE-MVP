//frontend/components/design/KalmaMarkRouteGlitch.tsx
//
// The Kalma mark for the persistent chrome (AppHeader / SidebarNav). Idle it is
// the exact static reticle from KalmaMark. On a route change it plays a
// barely-there moment — one quick chromatic jolt, then a calm wireframe-globe
// spin (meridians sweeping), then back to the static iris. Form follows
// function: the motion only appears while you're moving between pages.
//
// Pure CSS/SVG, no library. Disabled under prefers-reduced-motion, and it never
// plays on the first mount (only on navigation).

'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { BRAND_GOLD } from '@/components/design/KalmaMark';

const STROKE = 'var(--k-text)';
// Fixed brand gold (not var(--k-accent), which was undefined → black pupil,
// invisible on the dark theme). Shared with KalmaMark / icon / favicon / OG.
const ACCENT = BRAND_GOLD;

const FIBERS = Array.from({ length: 24 }).map((_, i) => {
  const rad = ((i * 360) / 24) * (Math.PI / 180);
  return {
    x1: (32 + Math.cos(rad) * 12).toFixed(2),
    y1: (32 + Math.sin(rad) * 12).toFixed(2),
    x2: (32 + Math.cos(rad) * 24).toFixed(2),
    y2: (32 + Math.sin(rad) * 24).toFixed(2),
  };
});

export default function KalmaMarkRouteGlitch({ size = 32 }: { size?: number }) {
  const pathname = usePathname();
  const [playing, setPlaying] = useState(false);
  const first = useRef(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (first.current) {
      first.current = false; // don't glitch on initial load — only on navigation
      return;
    }
    if (
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    ) {
      return;
    }
    setPlaying(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setPlaying(false), 1300);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [pathname]);

  return (
    <span style={{ display: 'inline-flex', lineHeight: 0 }}>
      <style>{`
        .kmrg-svg.is-play { animation: kmrg-jolt .3s ease-out 1; }
        .kmrg-ghost { opacity: 0; }
        .kmrg-svg.is-play .kmrg-ghost { animation: kmrg-ghost .32s ease-out 1; }
        .kmrg-mer { transform-box: fill-box; transform-origin: center; }
        .kmrg-svg.is-play .kmrg-mer1 { animation: kmrg-spin 2.6s linear infinite; }
        .kmrg-svg.is-play .kmrg-mer2 { animation: kmrg-spin 2.6s linear infinite; animation-delay: -1.3s; }
        @keyframes kmrg-jolt { 0%{transform:translateX(0)} 35%{transform:translateX(-1.4px)} 70%{transform:translateX(1.2px)} 100%{transform:translateX(0)} }
        @keyframes kmrg-ghost { 0%{opacity:0;transform:translateX(0)} 25%{opacity:.5;transform:translateX(-2px)} 100%{opacity:0;transform:translateX(1px)} }
        @keyframes kmrg-spin { 0%{transform:scaleX(1)} 50%{transform:scaleX(-1)} 100%{transform:scaleX(1)} }
        @media (prefers-reduced-motion: reduce){ .kmrg-svg, .kmrg-svg * { animation: none !important; } }
      `}</style>
      <svg
        className={`kmrg-svg ${playing ? 'is-play' : ''}`}
        width={size}
        height={size}
        viewBox="0 0 64 64"
        style={{ display: 'block', overflow: 'visible' }}
        aria-hidden="true"
      >
        {/* Chromatic ghost — one coral flash during the jolt only. */}
        <circle className="kmrg-ghost" cx="32" cy="32" r="26" fill="none" stroke="#C86B52" strokeWidth="1.4" />

        {/* Outer reticle ring + crosshairs (always). */}
        <circle cx="32" cy="32" r="26" fill="none" stroke={STROKE} strokeWidth="1.4" opacity="0.9" />
        <g stroke={STROKE} strokeWidth="1.2" opacity="0.8" strokeLinecap="round">
          <line x1="32" y1="2" x2="32" y2="10" />
          <line x1="32" y1="54" x2="32" y2="62" />
          <line x1="2" y1="32" x2="10" y2="32" />
          <line x1="54" y1="32" x2="62" y2="32" />
        </g>

        {playing ? (
          /* Spinning wireframe globe — latitudes static, meridians sweep. */
          <g fill="none" stroke={STROKE} strokeLinecap="round">
            <ellipse cx="32" cy="32" rx="26" ry="8" strokeWidth="1" opacity="0.5" />
            <ellipse cx="32" cy="20" rx="20.5" ry="4.5" strokeWidth="0.9" opacity="0.4" />
            <ellipse cx="32" cy="44" rx="20.5" ry="4.5" strokeWidth="0.9" opacity="0.4" />
            <g className="kmrg-mer kmrg-mer1"><ellipse cx="32" cy="32" rx="18" ry="26" strokeWidth="1" opacity="0.55" /></g>
            <g className="kmrg-mer kmrg-mer2"><ellipse cx="32" cy="32" rx="9" ry="26" strokeWidth="1" opacity="0.45" /></g>
          </g>
        ) : (
          /* Idle iris fibres — identical to the static KalmaMark. */
          <g stroke={STROKE} strokeWidth="0.7" opacity="0.55" strokeLinecap="round" fill="none">
            {FIBERS.map((f, i) => (
              <line key={i} x1={f.x1} y1={f.y1} x2={f.x2} y2={f.y2} />
            ))}
          </g>
        )}

        {/* Accent pupil (always). */}
        <circle cx="32" cy="32" r="6.5" fill={ACCENT} />
      </svg>
    </span>
  );
}
