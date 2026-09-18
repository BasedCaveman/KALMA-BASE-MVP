//frontend/darkPalette.ts
import { CSSProperties } from 'react';

export const D = {
  bg: '#0D1710',
  bgGrid: '#141E17',

  surface: '#162019',
  surfaceSoft: '#1A261E',
  surfaceDeep: '#101A13',
  surfaceHigh: '#1E2D24',
  surfacePressed: '#0E1611',

  text: '#E8E2D4',
  textSoft: '#B5AE9D',
  // Muted tiers must hold >=4.5:1 (WCAG AA) on every surface they sit on —
  // primary device is a phone in direct sunlight. Ratios vs surfaceHigh
  // #1E2D24 (worst case): textMuted 4.59, textMutedStrong 5.60.
  textMuted: '#98917E',
  textMutedStrong: '#A8A18E',

  label: '#C8A84A',
  accent: '#D4A84A',
  accentSoft: '#3D3520',
  accentGlow: '#E0B850',

  above: '#5AAF72',
  aboveSoft: '#1A2E20',

  below: '#C86B52',
  belowSoft: '#2A1A16',

  temp: '#8A9CAE',
  tempSoft: '#1A2028',

  divider: '#243028',
  dividerStrong: '#2E3C32',

  shadowA: '#060A08',
  shadowB: '#1E2D24',

  dark: '#E8E2D4',
  darkSoft: '#D4CEC0',

  // Semantic aliases for newer UI surfaces
  bgSoft: '#1E2D24',
  accentText: '#E8E2D4',
  shadowStrong: '#060A08',
} as const;

export const neuDark = {
  panelRaised: {
    background: `linear-gradient(180deg, ${D.surfaceSoft} 0%, ${D.surface} 100%)`,
    boxShadow: `7px 7px 18px ${D.shadowA}CC, -7px -7px 18px ${D.shadowB}44, inset 0 1px 0 ${D.surfaceHigh}40`,
    overflow: 'hidden' as const,
  } satisfies CSSProperties,

  controlRaised: {
    background: `linear-gradient(180deg, ${D.surfaceHigh} 0%, ${D.surface} 100%)`,
    boxShadow: `5px 5px 12px ${D.shadowA}AA, -5px -5px 12px ${D.shadowB}38, inset 0 1px 0 ${D.surfaceHigh}50`,
  } satisfies CSSProperties,

  controlPressed: {
    background: `linear-gradient(180deg, ${D.surfacePressed} 0%, ${D.surfaceDeep} 100%)`,
    boxShadow: `inset 4px 4px 10px ${D.shadowA}CC, inset -3px -3px 9px ${D.shadowB}28`,
  } satisfies CSSProperties,

  subtle: {
    background: D.surface,
    boxShadow: `2px 2px 6px ${D.shadowA}88, -2px -2px 6px ${D.shadowB}28`,
  } satisfies CSSProperties,
};
