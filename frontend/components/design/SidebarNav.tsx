//kalma/frontend/components/design/SidebarNav.tsx
//
// Desktop sidebar navigation. Only visible at ≥1024px (controlled via
// CSS in layout.tsx — this component renders unconditionally, the
// `.k-sidebar` class on the outer container hides it on mobile).
//
// Mirrors BottomNav's items and translations exactly so a user moving
// between screen sizes never sees a different nav structure. The bottom
// nav handles <1024px; this handles ≥1024px. The two are mutually
// exclusive at any given viewport.

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useColors } from '@/hooks/useColors';
import { useTranslation } from '@/hooks/useTranslation';
import KalmaMarkRouteGlitch from '@/components/design/KalmaMarkRouteGlitch';

function navCopy(language: string) {
  const table: Record<string, Record<string, string>> = {
    en: {
      home: 'Today',
      signals: 'Signals',
      markets: 'Protections',
      positions: 'Positions',
      notifications: 'Alerts',
      profile: 'Profile',
      addCity: 'Add your city',
    },
    pt: {
      home: 'Hoje',
      signals: 'Sinais',
      markets: 'Proteções',
      positions: 'Posições',
      notifications: 'Alertas',
      profile: 'Perfil',
      addCity: 'Adicionar sua cidade',
    },
    es: {
      home: 'Hoy',
      signals: 'Señales',
      markets: 'Protecciones',
      positions: 'Posiciones',
      notifications: 'Alertas',
      profile: 'Perfil',
      addCity: 'Añade tu ciudad',
    },
    fr: {
      home: "Aujourd'hui",
      signals: 'Signaux',
      markets: 'Protections',
      positions: 'Positions',
      notifications: 'Alertes',
      profile: 'Profil',
      addCity: 'Ajouter ta ville',
    },
    de: {
      home: 'Heute',
      signals: 'Signale',
      markets: 'Schutz',
      positions: 'Positionen',
      notifications: 'Hinweise',
      profile: 'Profil',
      addCity: 'Stadt hinzufügen',
    },
    zh: {
      home: '今天',
      signals: '信号',
      markets: '保护',
      positions: '仓位',
      notifications: '提醒',
      profile: '我的',
      addCity: '添加你的城市',
    },
  };

  return table[language] ?? table.en;
}

export default function SidebarNav() {
  const pathname = usePathname();
  const { C, fonts, R, neu } = useColors();
  const { language } = useTranslation();
  const copy = navCopy(language);

  const items = [
    { href: '/today', label: copy.home, icon: <HomeIcon /> },
    { href: '/signals', label: copy.signals, icon: <SignalsIcon /> },
    { href: '/markets', label: copy.markets, icon: <MarketsIcon /> },
    { href: '/notifications', label: copy.notifications, icon: <NotificationsIcon /> },
    { href: '/profile', label: copy.profile, icon: <ProfileIcon /> },
  ];

  return (
    <aside
      className="k-sidebar"
      aria-label="Primary"
      style={{
        // The k-sidebar class controls the responsive hide/show. The
        // inline styles here are the visual shape that applies once
        // the class lets it show.
        position: 'sticky',
        top: 24,
        height: 'fit-content',
        padding: '20px 14px',
        ...neu.panelRaised,
        borderRadius: 20,
        background: C.surface,
      }}
    >
      {/* Brand mark at the top — landing/marketing pages get the same
          nav, so the logo serves as both visual anchor and home link. */}
      <Link
        href="/"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '6px 8px 18px',
          textDecoration: 'none',
          color: C.text,
        }}
      >
        <KalmaMarkRouteGlitch size={28} />
        <span
          style={{
            fontFamily: fonts.display,
            fontSize: 18,
            fontWeight: 700,
            letterSpacing: '-0.01em',
          }}
        >
          Kalma
        </span>
      </Link>

      <nav style={{ display: 'grid', gap: 4 }}>
        {items.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              style={{
                textDecoration: 'none',
                borderRadius: R.lg,
                padding: '10px 12px',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                background: active ? `${C.accent}14` : 'transparent',
                color: active ? C.text : C.textSoft,
                boxShadow: active
                  ? `inset 0 1px 0 rgba(255,255,255,0.05), 0 4px 14px ${C.shadowA}22`
                  : 'none',
                transition: 'background 120ms ease-out',
              }}
            >
              <span
                style={{
                  display: 'inline-flex',
                  color: active ? C.accent : C.textMutedStrong,
                }}
              >
                {item.icon}
              </span>
              <span
                style={{
                  fontFamily: fonts.sans,
                  fontSize: 14,
                  fontWeight: 600,
                  letterSpacing: 0.1,
                }}
              >
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>

      {/* +Add pill — same affordance as the mobile header right-action,
          surfaced on every desktop screen since real estate allows. */}
      <Link
        href="/create"
        style={{
          marginTop: 16,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          padding: '12px 14px',
          borderRadius: R.lg,
          background: C.dark,
          color: '#FFFDF8',
          textDecoration: 'none',
          fontFamily: fonts.sans,
          fontSize: 13,
          fontWeight: 700,
        }}
      >
        <svg
          viewBox="0 0 24 24"
          width={16}
          height={16}
          fill="none"
          stroke="currentColor"
          strokeWidth={2.2}
          strokeLinecap="round"
        >
          <path d="M12 5v14" />
          <path d="M5 12h14" />
        </svg>
        {copy.addCity}
      </Link>
    </aside>
  );
}

function iconStyle() {
  return {
    width: 18,
    height: 18,
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

function SignalsIcon() {
  return (
    <svg viewBox="0 0 24 24" style={iconStyle()}>
      <circle cx="12" cy="14" r="1.4" />
      <path d="M7.5 14a4.5 4.5 0 0 1 9 0" />
      <path d="M4.5 14a7.5 7.5 0 0 1 15 0" />
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
