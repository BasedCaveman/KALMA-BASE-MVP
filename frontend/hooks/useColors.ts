//frontend/hooks/useColors.ts
'use client';

import { useMemo } from 'react';
import { useTheme } from '@/hooks/useTheme';

const L = {
  bg: '#EDE8DF',
  bgGrid: '#DDD5C8',
  surface: '#E4DED4',
  surfaceSoft: '#E8E2D8',
  surfaceDeep: '#D8D0C4',
  surfaceHigh: '#F2EEE7',
  surfacePressed: '#D7CFC2',
  text: '#1F1A14',
  textSoft: '#5C5348',
  textMuted: '#7C7266',
  textMutedStrong: '#4E463C',
  divider: '#CFC6B8',
  dividerStrong: '#B8AE9F',
  shadowA: '#C8BFB2',
  shadowB: '#FFFDF8',
  accent: '#6FA07B',
  accentSoft: '#DCEBDD',
  above: '#5E9E74',
  below: '#C96D5A',
  label: '#2A2318',
  pill: '#EFE9E0',
  cardGlow: 'rgba(255,255,255,0.45)',
  overlay: 'rgba(31,26,20,0.08)',
  dark: '#1F1A14',
  darkSoft: '#2A2318',
} as const;

const Dk = {
  bg: '#0D1710',
  bgGrid: '#141E17',
  surface: '#162019',
  surfaceSoft: '#1A261E',
  surfaceDeep: '#101A13',
  surfaceHigh: '#1E2D24',
  surfacePressed: '#162019',
  text: '#E9E2D6',
  textSoft: '#BFB6A8',
  textMuted: '#948B7D',
  textMutedStrong: '#D5CCBF',
  divider: '#2A392F',
  dividerStrong: '#385142',
  shadowA: '#08100B',
  shadowB: '#223328',
  accent: '#7DB88E',
  accentSoft: '#203328',
  above: '#7CCB96',
  below: '#E08A78',
  label: '#F3ECE1',
  pill: '#1A261E',
  cardGlow: 'rgba(125,184,142,0.06)',
  overlay: 'rgba(0,0,0,0.24)',
  dark: '#173126',
  darkSoft: '#214234',
} as const;

type Palette = {
  bg: string;
  bgGrid: string;
  surface: string;
  surfaceSoft: string;
  surfaceDeep: string;
  surfaceHigh: string;
  surfacePressed: string;
  text: string;
  textSoft: string;
  textMuted: string;
  textMutedStrong: string;
  divider: string;
  dividerStrong: string;
  shadowA: string;
  shadowB: string;
  accent: string;
  accentSoft: string;
  above: string;
  below: string;
  label: string;
  pill: string;
  cardGlow: string;
  overlay: string;
  dark: string;
  darkSoft: string;
};

function buildNeu(C: Palette) {
  return {
    panelRaised: {
      background: C.surface,
      boxShadow: `8px 8px 18px ${C.shadowA}88, -8px -8px 18px ${C.shadowB}CC`,
      border: `1px solid ${C.divider}`,
    } satisfies React.CSSProperties,

    controlRaised: {
      background: C.surface,
      boxShadow: `6px 6px 14px ${C.shadowA}7A, -6px -6px 14px ${C.shadowB}B8`,
      border: `1px solid ${C.divider}`,
    } satisfies React.CSSProperties,

    controlPressed: {
      background: C.surfaceDeep,
      boxShadow: `inset 4px 4px 10px ${C.shadowA}88, inset -4px -4px 10px ${C.shadowB}66`,
      border: `1px solid ${C.divider}`,
    } satisfies React.CSSProperties,

    subtle: {
      background: C.surfaceSoft,
      boxShadow: `3px 3px 8px ${C.shadowA}55, -3px -3px 8px ${C.shadowB}88`,
      border: `1px solid ${C.divider}`,
    } satisfies React.CSSProperties,
  };
}

const lightNeu = buildNeu(L);

const darkNeu = {
  panelRaised: {
    background: `linear-gradient(180deg, ${Dk.surfaceSoft} 0%, ${Dk.surface} 100%)`,
    boxShadow: `5px 5px 12px ${Dk.shadowA}B0, -3px -3px 8px ${Dk.shadowB}22, inset 0 1px 0 rgba(255,255,255,0.03)`,
    border: `1px solid ${Dk.dividerStrong}`,
  } satisfies React.CSSProperties,

  controlRaised: {
    background: `linear-gradient(180deg, ${Dk.surfaceHigh} 0%, ${Dk.surface} 100%)`,
    boxShadow: `4px 4px 10px ${Dk.shadowA}A6, -2px -2px 6px ${Dk.shadowB}1E, inset 0 1px 0 rgba(255,255,255,0.025)`,
    border: `1px solid ${Dk.divider}`,
  } satisfies React.CSSProperties,

  controlPressed: {
    background: `linear-gradient(180deg, ${Dk.surfaceDeep} 0%, ${Dk.surface} 100%)`,
    boxShadow: `inset 3px 3px 8px ${Dk.shadowA}C0, inset -2px -2px 6px ${Dk.shadowB}18`,
    border: `1px solid ${Dk.divider}`,
  } satisfies React.CSSProperties,

  subtle: {
    background: Dk.surface,
    boxShadow: `2px 2px 6px ${Dk.shadowA}8A, -1px -1px 4px ${Dk.shadowB}16`,
    border: `1px solid ${Dk.divider}`,
  } satisfies React.CSSProperties,
};

// ── Fonts resolve through the next/font CSS variables set in layout.tsx ──
export const fonts = {
  display: "var(--font-display), 'Playfair Display', serif",
  sans: "var(--font-sans), 'DM Sans', system-ui, sans-serif",
  mono: "var(--font-mono), 'JetBrains Mono', monospace",
} as const;

export const radii = {
  sm: 10,
  md: 14,
  lg: 18,
  xl: 24,
  pill: 999,
} as const;

export function useColors() {
  const { theme } = useTheme();

  return useMemo(() => {
    const C = (theme === 'dark' ? Dk : L) as Palette;
    const neu = theme === 'dark' ? darkNeu : lightNeu;

    return {
      theme,
      C,
      neu,
      fonts,
      R: radii,
    };
  }, [theme]);
}
