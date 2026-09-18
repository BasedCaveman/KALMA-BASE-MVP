// kalma/frontend/components/shared/StickyActionBar.tsx
//
// Sticky primary CTA bar for mobile screens. Sits just above BottomNav
// and stays in view as the user scrolls long forms / market detail
// pages, so the "Confirm prediction" / "Add this city" button is
// always one tap away — they don't have to scroll down hunting for it.
//
// Visibility:
//   <1024px (mobile + tablet): visible, fixed above BottomNav
//   ≥1024px (desktop sidebar): hidden — the inline button already
//                              sits in a sticky predict column or
//                              within the visible viewport, and
//                              there's no BottomNav.
//
// Pages that mount this should also wrap their INLINE primary CTA
// in <span className="k-action-inline-desktop-only"> so it disappears
// on mobile (avoiding two buttons doing the same thing). Both classes
// are defined in app/layout.tsx alongside the other responsive rules.

'use client';

import type { CSSProperties, ReactNode } from 'react';
import { useColors } from '@/hooks/useColors';

type Props = {
  /** Label rendered inside the button. Mirrors the inline CTA's text. */
  label: string;
  /** Click handler. Same one the inline button uses. */
  onClick: () => void;
  /** Disable state — mirrors the inline button's disabled prop so a
   *  user can't bypass validation by tapping the sticky version. */
  disabled?: boolean;
  /** Optional supporting text shown above the button (e.g. estimated
   *  return or a required-step hint). Kept short — anything longer
   *  belongs inline. */
  hint?: ReactNode;
  /** Override the background colour. Defaults to accent. Pass null to
   *  use the neumorphic dark button used by /today's main CTA. */
  variant?: 'accent' | 'dark';
  /** Hide without unmounting the page's inline desktop CTA. Useful while
   *  mobile keyboard/search controls need the bottom viewport. */
  hidden?: boolean;
};

export default function StickyActionBar({
  label,
  onClick,
  disabled = false,
  hint,
  variant = 'accent',
  hidden = false,
}: Props) {
  const { C, fonts, R } = useColors();

  if (hidden) return null;

  const buttonStyle: CSSProperties = {
    width: '100%',
    maxWidth: 460,
    padding: '15px 20px',
    borderRadius: R.lg,
    border: 'none',
    background:
      variant === 'dark'
        ? C.dark
        : disabled
          ? `${C.accent}55`
          : C.accent,
    color: variant === 'dark' ? '#FFFDF8' : C.dark,
    fontFamily: fonts.sans,
    fontSize: 16,
    fontWeight: 800,
    letterSpacing: -0.2,
    cursor: disabled ? 'default' : 'pointer',
    pointerEvents: 'auto',
    boxShadow: disabled
      ? 'none'
      : `0 12px 28px ${C.shadowA}66, 0 2px 6px ${C.shadowA}40`,
    opacity: disabled ? 0.7 : 1,
    transition: 'background 120ms ease-out, opacity 120ms ease-out',
  };

  return (
    <div
      className="k-sticky-action-bar"
      style={{
        position: 'fixed',
        left: 0,
        right: 0,
        // BottomNav is ~86px tall (NAV_HEIGHT + padding) and sits at
        // bottom: 0. Add the safe-area inset for iOS home-indicator
        // devices plus a 12px breathing gap.
        bottom: 'calc(86px + env(safe-area-inset-bottom, 0px) + 12px)',
        zIndex: 70,
        padding: '0 16px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 8,
        // Wrapper itself ignores clicks so taps outside the button
        // fall through to the content underneath.
        pointerEvents: 'none',
      }}
    >
      {hint ? (
        <div
          style={{
            pointerEvents: 'auto',
            maxWidth: 460,
            padding: '6px 12px',
            borderRadius: R.pill,
            background: `${C.bg}EE`,
            border: `1px solid ${C.divider}`,
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            fontFamily: fonts.mono,
            fontSize: 10,
            letterSpacing: 0.6,
            color: C.textMuted,
            textAlign: 'center',
          }}
        >
          {hint}
        </div>
      ) : null}
      <button type="button" onClick={onClick} disabled={disabled} style={buttonStyle}>
        {label}
      </button>
    </div>
  );
}
