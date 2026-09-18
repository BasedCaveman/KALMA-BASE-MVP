'use client'

import { useTheme } from '@/hooks/useTheme'

/**
 * Injects a <style> block that switches body-level colors
 * based on [data-theme] attribute set by ThemeProvider.
 * This handles elements that can't use useColors() (like server components).
 */
export default function ThemeStyles() {
  useTheme() // ensure context is active

  return (
    <style dangerouslySetInnerHTML={{ __html: `
      :root, [data-theme="light"] {
        --k-bg: #EDE8DF;
        --k-bg-grid: #D4CCBC10;
        --k-surface: #E4DED4;
        --k-text: #1E1A12;
        --k-dark-btn: #1E1A12;
        --k-dark-btn-text: #FFFDF8;
        color-scheme: light;
      }
      [data-theme="dark"] {
        --k-bg: #0D1710;
        --k-bg-grid: #1E2D2410;
        --k-surface: #162019;
        --k-text: #E8E2D4;
        --k-dark-btn: #E8E2D4;
        --k-dark-btn-text: #0D1710;
        color-scheme: dark;
      }
      /* Motion tokens. The built-in CSS easings are too weak to read as
         intentional; these are the stronger variants. ease-in is deliberately
         absent: it delays the first movement, which is the exact moment the
         reader is watching, so it makes the interface feel sluggish. */
      :root {
        --k-ease-out: cubic-bezier(0.23, 1, 0.32, 1);
        --k-ease-in-out: cubic-bezier(0.77, 0, 0.175, 1);
      }
      body {
        background: var(--k-bg) !important;
        color: var(--k-text);
        transition: background 0.3s ease, color 0.3s ease;
      }

      /* Entrance used by the landing's live block. Never from scale(0):
         nothing in the real world appears out of nothing. */
      @keyframes k-rise {
        from { opacity: 0; transform: translateY(8px); }
        to   { opacity: 1; transform: translateY(0); }
      }
      .k-rise > * {
        opacity: 0;
        animation: k-rise 260ms var(--k-ease-out) forwards;
      }
      .k-rise > *:nth-child(1) { animation-delay: 0ms; }
      .k-rise > *:nth-child(2) { animation-delay: 50ms; }
      .k-rise > *:nth-child(3) { animation-delay: 100ms; }
      .k-rise > *:nth-child(4) { animation-delay: 150ms; }
      .k-rise > *:nth-child(5) { animation-delay: 200ms; }

      /* ── Landing composition ────────────────────────────────────────
         The home was designed at 375px and then stretched to a ~990px desktop
         column, which is where the emptiness came from: a label pinned left
         and its value pinned right across a metre of nothing, and prose
         running past 140 characters a line. Space only reads as breathing
         when something is holding it. */

      /* Reading measure. Body copy stops at 62ch no matter how wide the
         column gets. */
      .k-measure { max-width: 62ch; }

      /* Panels keep their own width instead of inheriting the column's. The
         card is a card, not a banner. */
      .k-panel-narrow { max-width: 620px; }

      /* The home's paired panels: the deviation (what the data says) beside
         the daily question (what you can add). Single column on phones, side
         by side once there is room for two reading measures. Capped so the
         pair stays a composition instead of stretching across the viewport. */
      .k-duo { display: grid; gap: 16px; max-width: 980px; }
      @media (min-width: 900px) {
        .k-duo {
          grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr);
          align-items: start;
        }
      }

      /* One consistent vertical rhythm, so blocks read as a sequence rather
         than as things that happen to be stacked. */
      .k-flow > * + * { margin-top: clamp(28px, 4vw, 44px); }

      /* The deviation bar. scaleX rather than width so it runs on the GPU and
         never triggers layout. Left origin: the bar grows out of the axis it
         is measured from, not out of its own middle. */
      @keyframes k-grow-bar {
        from { transform: scaleX(0.02); }
        to   { transform: scaleX(1); }
      }
      .k-grow { will-change: transform; }

      /* Pressable feedback. The design system ships controlPressed and until
         now nothing ever entered that state. */
      .k-press { transition: transform 160ms var(--k-ease-out); }
      .k-press:active { transform: scale(0.97); }

      /* Reduced motion means fewer and gentler animations, not zero: opacity
         still aids comprehension, movement is what causes sickness. */
      @media (prefers-reduced-motion: reduce) {
        .k-rise > * { animation-duration: 1ms; animation-delay: 0ms !important; opacity: 1; }
        .k-press:active { transform: none; }
        .k-grow { transition: none !important; }
      }
      /* Wallet modal inherits the active Kalma theme. */
      [data-theme="dark"] w3m-modal {
        --w3m-accent-color: #D4A84A;
      }
    ` }} />
  )
}
