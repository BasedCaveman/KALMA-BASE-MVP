//frontend/palette.ts
import { CSSProperties } from 'react';

export const C = {
  bg: '#EDE8DF',
  bgGrid: '#DDD5C8',

  surface: '#E4DED4',
  surfaceSoft: '#E8E2D8',
  surfaceDeep: '#D8D0C4',
  surfaceHigh: '#F2EEE7',
  surfacePressed: '#D7CFC2',

  text: '#1E1A12',
  textSoft: '#5C5344',
  // Muted tiers must hold >=4.5:1 (WCAG AA) on every surface they sit on —
  // primary device is a phone in direct sunlight. Ratios vs surface #E4DED4:
  // textMuted 4.57, textMutedStrong 5.41.
  textMuted: '#6A6150',
  textMutedStrong: '#5F5645',

  label: '#A68536',
  accent: '#C8943A',
  accentSoft: '#E6D19B',
  accentGlow: '#D4A84A',

  above: '#3D7A52',
  aboveSoft: '#E7F0E9',

  below: '#A8452E',
  belowSoft: '#F3E3DE',

  temp: '#6E7E90',
  tempSoft: '#E7EBF0',

  divider: '#D4CCBC',
  dividerStrong: '#CBBEAB',

  shadowA: '#C2B8A5',
  shadowB: '#F7F3EC',

  dark: '#1E1A12',
  darkSoft: '#2A2318',

  // Semantic aliases for newer UI surfaces
  bgSoft: '#F2EEE7',
  accentText: '#1E1A12',
  shadowStrong: '#C2B8A5',
} as const;

export const neu = {
  panelRaised: {
    background: `linear-gradient(180deg, ${C.surfaceSoft} 0%, ${C.surface} 100%)`,
    boxShadow: `7px 7px 18px ${C.shadowA}A6, -7px -7px 18px ${C.shadowB}CC, inset 0 1px 0 ${C.surfaceHigh}`,
    overflow: 'hidden' as const,
  } satisfies CSSProperties,

  controlRaised: {
    background: `linear-gradient(180deg, ${C.surfaceHigh} 0%, ${C.surface} 100%)`,
    boxShadow: `5px 5px 12px ${C.shadowA}94, -5px -5px 12px ${C.shadowB}C8, inset 0 1px 0 ${C.surfaceHigh}`,
  } satisfies CSSProperties,

  controlPressed: {
    background: `linear-gradient(180deg, ${C.surfacePressed} 0%, ${C.surfaceDeep} 100%)`,
    boxShadow: `inset 4px 4px 10px ${C.shadowA}A0, inset -3px -3px 9px ${C.shadowB}B8`,
  } satisfies CSSProperties,

  subtle: {
    background: C.surface,
    boxShadow: `2px 2px 6px ${C.shadowA}78, -2px -2px 6px ${C.shadowB}88`,
  } satisfies CSSProperties,

  // Backward-compatible aliases
  raised: {
    background: `linear-gradient(180deg, ${C.surfaceSoft} 0%, ${C.surface} 100%)`,
    boxShadow: `7px 7px 18px ${C.shadowA}A6, -7px -7px 18px ${C.shadowB}CC, inset 0 1px 0 ${C.surfaceHigh}`,
    overflow: 'hidden' as const,
  } satisfies CSSProperties,

  pressed: {
    background: `linear-gradient(180deg, ${C.surfacePressed} 0%, ${C.surfaceDeep} 100%)`,
    boxShadow: `inset 4px 4px 10px ${C.shadowA}A0, inset -3px -3px 9px ${C.shadowB}B8`,
  } satisfies CSSProperties,
};

export const R = {
  xs: 10,
  sm: 13,
  md: 15,
  lg: 18,
  xl: 24,
  pill: 999,
} as const;

export const fonts = {
  display: "var(--font-display), 'Playfair Display', serif",
  sans: "var(--font-sans), 'DM Sans', system-ui, sans-serif",
  mono: "var(--font-mono), 'JetBrains Mono', monospace",
};
