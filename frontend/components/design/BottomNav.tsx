//frontend/components/design/BottomNav.tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useColors } from '@/hooks/useColors';
import { useTranslation } from '@/hooks/useTranslation';

function navCopy(language: string) {
  const table: Record<string, Record<string, string>> = {
    en: {
      home: 'Today',
      signals: 'Signals',
      markets: 'Protections',
      marketsShort: 'Protect',
      positions: 'Positions',
      positionsShort: 'Pos.',
      notifications: 'Alerts',
      notificationsShort: 'Alerts',
      profile: 'Profile',
    },
    pt: {
      home: 'Hoje',
      signals: 'Sinais',
      markets: 'Proteções',
      marketsShort: 'Prot.',
      positions: 'Posições',
      positionsShort: 'Pos.',
      notifications: 'Alertas',
      notificationsShort: 'Alertas',
      profile: 'Perfil',
    },
    es: {
      home: 'Hoy',
      signals: 'Señales',
      markets: 'Protecciones',
      marketsShort: 'Prot.',
      positions: 'Posiciones',
      positionsShort: 'Pos.',
      notifications: 'Alertas',
      notificationsShort: 'Alertas',
      profile: 'Perfil',
    },
    fr: {
      home: "Aujourd'hui",
      signals: 'Signaux',
      markets: 'Protections',
      marketsShort: 'Prot.',
      positions: 'Positions',
      positionsShort: 'Pos.',
      notifications: 'Alertes',
      notificationsShort: 'Alertes',
      profile: 'Profil',
    },
    de: {
      home: 'Heute',
      signals: 'Signale',
      markets: 'Schutz',
      marketsShort: 'Schutz',
      positions: 'Positionen',
      positionsShort: 'Pos.',
      notifications: 'Hinweise',
      notificationsShort: 'Hinw.',
      profile: 'Profil',
    },
    zh: {
      home: '今天',
      signals: '信号',
      markets: '保护',
      marketsShort: '保护',
      positions: '仓位',
      positionsShort: '仓位',
      notifications: '提醒',
      notificationsShort: '提醒',
      profile: '我的',
    },
  };

  return table[language] ?? table.en;
}

const NAV_HEIGHT = 86;

export default function BottomNav() {
  const pathname = usePathname();
  const { C, fonts, R, neu } = useColors();
  const { language } = useTranslation();
  const copy = navCopy(language);

  // Add-your-city moved off the bottom nav into a header pill on Today /
  // Signals / Protections — it's an occasional action, not a daily one. The
  // daily habit loop lives on Today + Signals.
  // Note: "Today" used to live at `/`, but `/` is now the public landing
  // page (SSR'd, citable by AI crawlers). The dapp home moved to /today.
  const items = [
    { href: '/today', label: copy.home, icon: <HomeIcon /> },
    { href: '/signals', label: copy.signals, icon: <SignalsIcon /> },
    { href: '/markets', label: copy.markets, shortLabel: copy.marketsShort ?? copy.markets, icon: <MarketsIcon /> },
    { href: '/notifications', label: copy.notifications, shortLabel: copy.notificationsShort ?? copy.notifications, icon: <NotificationsIcon /> },
    { href: '/profile', label: copy.profile, icon: <ProfileIcon /> },
  ];

  const activeIndex = items.findIndex(
    (it) => pathname === it.href || pathname.startsWith(`${it.href}/`),
  );

  // The gliding indicator sits behind the active cell. Columns are equal
  // (repeat(5, 1fr)) with a fixed 6px gap and 10px nav padding, so the exact
  // cell geometry is calc-able — the pill lands dead-center on every icon
  // without measuring the DOM. Motion is transform/left only and disabled
  // under prefers-reduced-motion.
  const COLS = items.length;
  const cellW = `((100% - 20px - ${(COLS - 1) * 6}px) / ${COLS})`;

  return (
    <div
      className="k-bottom-nav-wrap"
      style={{
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 80,
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          maxWidth: 760,
          margin: '0 auto',
          padding: '0 12px 12px',
          pointerEvents: 'auto',
        }}
      >
        <style>{`
          .k-nav-indicator { transition: left .34s cubic-bezier(.34,1.2,.5,1); }
          .k-nav-icon { transition: transform .34s cubic-bezier(.34,1.2,.5,1); }
          .k-bottom-nav-link { gap: 5px; padding: 8px 4px; }
          .k-bottom-nav-label { font-size: 10px; letter-spacing: 0.6px; }
          .k-bottom-nav-label-short { display: none; }
          @media (max-width: 390px) {
            .k-bottom-nav-link { gap: 4px; padding: 7px 2px; }
            .k-bottom-nav-label { font-size: 9px; letter-spacing: 0.35px; }
            .k-bottom-nav-label-full[data-has-short="true"] { display: none; }
            .k-bottom-nav-label-short[data-has-short="true"] { display: inline; }
          }
          @media (prefers-reduced-motion: reduce) {
            .k-nav-indicator, .k-nav-icon { transition: none; }
          }
        `}</style>
        <nav
          aria-label="Primary"
          style={{
            ...neu.panelRaised,
            position: 'relative',
            height: NAV_HEIGHT,
            borderRadius: 24,
            padding: '10px 10px calc(10px + env(safe-area-inset-bottom, 0px))',
            display: 'grid',
            gridTemplateColumns: 'repeat(5, 1fr)',
            alignItems: 'stretch',
            gap: 6,
            boxSizing: 'border-box',
            background: C.surface,
            backdropFilter: 'blur(10px)',
          }}
        >
          {/* Gliding active indicator — anchored to the active cell. */}
          <div
            aria-hidden="true"
            className="k-nav-indicator"
            style={{
              position: 'absolute',
              top: 10,
              bottom: 'calc(10px + env(safe-area-inset-bottom, 0px))',
              left: `calc(10px + ${activeIndex < 0 ? 0 : activeIndex} * (${cellW} + 6px))`,
              width: `calc(${cellW})`,
              borderRadius: R.lg,
              background: `${C.accent}14`,
              boxShadow: `inset 0 1px 0 rgba(255,255,255,0.05), 0 4px 14px ${C.shadowA}22`,
              opacity: activeIndex < 0 ? 0 : 1,
              zIndex: 0,
              pointerEvents: 'none',
            }}
          />
          {items.map((item) => {
            const active =
              item.href === '/'
                ? pathname === '/'
                : pathname === item.href || pathname.startsWith(`${item.href}/`);

            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                aria-label={item.label}
                style={{
                  position: 'relative',
                  zIndex: 1,
                  textDecoration: 'none',
                  borderRadius: R.lg,
                  display: 'grid',
                  alignItems: 'center',
                  justifyItems: 'center',
                  minWidth: 0,
                  background: 'transparent',
                  color: active ? C.text : C.textSoft,
                }}
                className="k-bottom-nav-link"
              >
                <span
                  className="k-nav-icon"
                  style={{
                    display: 'inline-flex',
                    color: active ? C.accent : C.textMutedStrong,
                    transform: active ? 'translateY(-1px) scale(1.08)' : 'none',
                  }}
                >
                  {item.icon}
                </span>
                <span
                  className="k-bottom-nav-label k-bottom-nav-label-full"
                  data-has-short={item.shortLabel && item.shortLabel !== item.label ? 'true' : 'false'}
                  style={{
                    fontFamily: fonts.mono,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    maxWidth: '100%',
                  }}
                >
                  {item.label}
                </span>
                <span
                  className="k-bottom-nav-label k-bottom-nav-label-short"
                  data-has-short={item.shortLabel && item.shortLabel !== item.label ? 'true' : 'false'}
                  style={{
                    fontFamily: fonts.mono,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    maxWidth: '100%',
                  }}
                >
                  {item.shortLabel ?? item.label}
                </span>
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}

function iconStyle() {
  return {
    width: 20,
    height: 20,
    stroke: 'currentColor',
    fill: 'none',
    strokeWidth: 1.9,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
}

function HomeIcon() {
  return (
    <svg viewBox="0 0 24 24" style={iconStyle()}>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V21h14V9.5" />
    </svg>
  );
}

function MarketsIcon() {
  return (
    <svg viewBox="0 0 24 24" style={iconStyle()}>
      <path d="M4 6h16" />
      <path d="M4 12h16" />
      <path d="M4 18h10" />
    </svg>
  );
}

function CreateIcon() {
  return (
    <svg viewBox="0 0 24 24" style={iconStyle()}>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );
}

// Concentric arcs evoke "a signal radiating out from a place" — distinct
// from the bar-chart Markets icon and softer than a bell-style alert.
function SignalsIcon() {
  return (
    <svg viewBox="0 0 24 24" style={iconStyle()}>
      <circle cx="12" cy="14" r="1.4" />
      <path d="M7.5 14a4.5 4.5 0 0 1 9 0" />
      <path d="M4.5 14a7.5 7.5 0 0 1 15 0" />
    </svg>
  );
}

function ProfileIcon() {
  return (
    <svg viewBox="0 0 24 24" style={iconStyle()}>
      <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" />
      <path d="M5 20a7 7 0 0 1 14 0" />
    </svg>
  );
}

function NotificationsIcon() {
  return (
    <svg viewBox="0 0 24 24" style={iconStyle()}>
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
      <path d="M10 21h4" />
    </svg>
  );
}
