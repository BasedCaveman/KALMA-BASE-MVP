//kalma/frontend/components/shared/AppHeader.tsx
'use client';

import Link from 'next/link';
import { useState, useRef, useEffect, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { useColors } from '@/hooks/useColors';
import { useTranslation, LANGUAGE_META } from '@/hooks/useTranslation';
import { useTheme, type ThemeMode } from '@/hooks/useTheme';
import KalmaMarkRouteGlitch from '@/components/design/KalmaMarkRouteGlitch';

function headerCopy(language: string) {
  const table: Record<string, Record<string, string>> = {
    en: {
      menu: 'Menu',
      close: 'Close',
      home: 'Home',
      markets: 'Protections',
      signals: 'Signals',
      compete: 'Compete',
      create: 'Create',
      addCity: 'Add your city',
      positions: 'Positions',
      notifications: 'Notifications',
      profile: 'Profile',
      simulator: 'Protection Simulator',
      language: 'Language',
      theme: 'Theme',
      light: 'Light',
      dark: 'Dark',
      system: 'System',
    },
    pt: {
      menu: 'Menu',
      close: 'Fechar',
      home: 'Início',
      markets: 'Proteções',
      signals: 'Sinais',
      compete: 'Competir',
      create: 'Criar',
      addCity: 'Adicionar sua cidade',
      positions: 'Posições',
      notifications: 'Notificações',
      profile: 'Perfil',
      simulator: 'Simulador de Proteção',
      language: 'Idioma',
      theme: 'Tema',
      light: 'Claro',
      dark: 'Escuro',
      system: 'Sistema',
    },
    es: {
      menu: 'Menú',
      close: 'Cerrar',
      home: 'Inicio',
      markets: 'Protecciones',
      signals: 'Señales',
      compete: 'Competir',
      create: 'Crear',
      addCity: 'Añade tu ciudad',
      positions: 'Posiciones',
      notifications: 'Notificaciones',
      profile: 'Perfil',
      simulator: 'Simulador de Protección',
      language: 'Idioma',
      theme: 'Tema',
      light: 'Claro',
      dark: 'Oscuro',
      system: 'Sistema',
    },
    fr: {
      menu: 'Menu',
      close: 'Fermer',
      home: 'Accueil',
      markets: 'Protections',
      signals: 'Signaux',
      compete: 'Compétition',
      create: 'Créer',
      addCity: 'Ajouter ta ville',
      positions: 'Positions',
      notifications: 'Notifications',
      profile: 'Profil',
      simulator: 'Simulateur de Protection',
      language: 'Langue',
      theme: 'Thème',
      light: 'Clair',
      dark: 'Sombre',
      system: 'Système',
    },
    de: {
      menu: 'Menü',
      close: 'Schließen',
      home: 'Start',
      markets: 'Schutz',
      signals: 'Signale',
      compete: 'Wettbewerb',
      create: 'Erstellen',
      addCity: 'Stadt hinzufügen',
      positions: 'Positionen',
      notifications: 'Benachrichtigungen',
      profile: 'Profil',
      simulator: 'Schutz-Simulator',
      language: 'Sprache',
      theme: 'Design',
      light: 'Hell',
      dark: 'Dunkel',
      system: 'System',
    },
    zh: {
      menu: '菜单',
      close: '关闭',
      home: '首页',
      markets: '保护',
      signals: '信号',
      compete: '竞赛',
      create: '创建',
      addCity: '添加你的城市',
      positions: '仓位',
      notifications: '通知',
      profile: '我的',
      simulator: '保护模拟器',
      language: '语言',
      theme: '主题',
      light: '浅色',
      dark: '深色',
      system: '系统',
    },
  };

  return table[language] ?? table.en;
}

export default function AppHeader({
  section,
  rightAction,
}: {
  section?: string;
  rightAction?: ReactNode;
}) {
  const { C, fonts, neu, R } = useColors();
  const { language, changeLanguage } = useTranslation();
  const { mode, setMode } = useTheme();
  const copy = headerCopy(language);
  const pathname = usePathname();

  const [menuOpen, setMenuOpen] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const langRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Lock the page behind the menu so touch-scroll stays inside the menu panel
  // (and reaches the language section at the bottom) instead of scrolling the
  // page underneath. Restore on close/unmount.
  useEffect(() => {
    if (!menuOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [menuOpen]);

  // Dialog keyboard contract for the menu: focus lands inside on open,
  // Tab cycles within the panel, Escape dismisses.
  useEffect(() => {
    if (!menuOpen) return;
    menuRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
      if (e.key === 'Tab') {
        const panel = menuRef.current;
        if (!panel) return;
        const focusables = panel.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select, [tabindex]:not([tabindex="-1"])',
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = document.activeElement as HTMLElement | null;
        if (e.shiftKey && (active === first || active === panel)) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  useEffect(() => {
    if (!langOpen) return;

    function handleClick(e: MouseEvent) {
      if (langRef.current && !langRef.current.contains(e.target as Node)) {
        setLangOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [langOpen]);

  const links = [
    { href: '/', label: copy.home },
    { href: '/signals', label: copy.signals },
    { href: '/compete', label: copy.compete },
    { href: '/markets', label: copy.markets },
    { href: '/create', label: copy.addCity },
    { href: '/positions', label: copy.positions },
    { href: '/notifications', label: copy.notifications },
    { href: '/profile', label: copy.profile },
    { href: '/protection-simulator', label: copy.simulator },
  ];

  const languages = Object.entries(LANGUAGE_META);
  const themeOptions: Array<{ key: ThemeMode; label: string }> = [
    { key: 'light', label: copy.light },
    { key: 'dark', label: copy.dark },
    { key: 'system', label: copy.system },
  ];
  const showAddCity = pathname !== '/create';

  return (
    <>
      <style
        dangerouslySetInnerHTML={{
          __html: `
            @media (max-width: 767px) {
              .k-header-desktop-only { display: none !important; }
            }
            @media (min-width: 768px) {
              .k-header-mobile-only { display: none !important; }
            }
          `,
        }}
      />
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 60,
          padding: '0 16px 12px',
          background: 'transparent',
        }}
      >
        <div
          style={{
            maxWidth: 1120,
            margin: '0 auto',
            padding: '14px 16px 14px',
            borderBottomLeftRadius: 24,
            borderBottomRightRadius: 24,
            background: `${C.bg}E8`,
            backdropFilter: 'blur(10px)',
            boxShadow: `0 8px 24px ${C.shadowA}20`,
            border: `1px solid ${C.divider}`,
            borderTop: 'none',
            overflow: 'visible',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <Link
            href="/"
            style={{
              textDecoration: 'none',
              color: C.text,
              minWidth: 0,
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              gap: 10,
            }}
          >
            {/* Brand mark — kept consistent with SidebarNav so the
                logo doesn't appear / disappear between mobile and
                desktop or between dapp pages and the landing. */}
            <KalmaMarkRouteGlitch size={32} />

            <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
              <div
                style={{
                  fontFamily: fonts.display,
                  fontSize: 26,
                  fontWeight: 700,
                  lineHeight: 1,
                  color: C.text,
                }}
              >
                Kalma
              </div>

              {section ? (
                <div
                  style={{
                    marginTop: 4,
                    fontFamily: fonts.mono,
                    fontSize: 10,
                    fontWeight: 700,
                    color: C.textMutedStrong,
                    letterSpacing: 1.2,
                    textTransform: 'uppercase',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    maxWidth: 220,
                  }}
                >
                  {section}
                </div>
              ) : null}
            </div>
          </Link>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              flexShrink: 0,
            }}
          >
            <div className="k-header-desktop-only">
              {showAddCity ? (
                <HeaderAddCityButton C={C} fonts={fonts} neu={neu} R={R} label={copy.addCity} />
              ) : rightAction ? (
                <div>{rightAction}</div>
              ) : null}
            </div>

            <div className="k-header-desktop-only">
              <ThemeModeControl
                C={C}
                fonts={fonts}
                R={R}
                mode={mode}
                setMode={setMode}
                options={themeOptions}
              />
            </div>

            <div ref={langRef} className="k-header-desktop-only" style={{ position: 'relative' }}>
              <button
                type="button"
                aria-haspopup="menu"
                aria-expanded={langOpen}
                onClick={() => {
                  setLangOpen((v) => !v);
                  setMenuOpen(false);
                }}
                style={{
                  ...neu.controlRaised,
                  borderRadius: R.lg,
                  height: 46,
                  paddingLeft: 10,
                  paddingRight: 10,
                  border: 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  cursor: 'pointer',
                  color: C.text,
                  fontFamily: fonts.mono,
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: 0.8,
                }}
              >
                <GlobeIcon />
                <span>{LANGUAGE_META[language]?.label ?? language.toUpperCase()}</span>
                <ChevronIcon open={langOpen} />
              </button>

              {langOpen ? (
                <div
                  style={{
                    position: 'absolute',
                    top: 'calc(100% + 8px)',
                    right: 0,
                    zIndex: 200,
                    ...neu.panelRaised,
                    borderRadius: 18,
                    padding: 8,
                    minWidth: 170,
                    boxShadow: `0 16px 40px ${C.shadowA}50`,
                  }}
                >
                  {languages.map(([code, meta]) => {
                    const active = code === language;

                    return (
                      <button
                        key={code}
                        type="button"
                        onClick={() => {
                          changeLanguage(code);
                          setLangOpen(false);
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          width: '100%',
                          padding: '10px 12px',
                          border: 'none',
                          borderRadius: 12,
                          background: active ? `${C.accent}18` : 'transparent',
                          color: active ? C.accent : C.text,
                          cursor: 'pointer',
                          textAlign: 'left',
                        }}
                      >
                        <span
                          style={{
                            fontFamily: fonts.mono,
                            fontSize: 11,
                            fontWeight: 700,
                            letterSpacing: 0.8,
                            minWidth: 22,
                          }}
                        >
                          {meta.label}
                        </span>
                        <span
                          style={{
                            fontFamily: fonts.sans,
                            fontSize: 14,
                            flex: 1,
                          }}
                        >
                          {meta.native}
                        </span>
                        {active ? <span style={{ color: C.accent, fontSize: 12 }}>✓</span> : null}
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>

            <button
              type="button"
              aria-label={copy.menu}
              aria-haspopup="dialog"
              aria-expanded={menuOpen}
              onClick={() => {
                setMenuOpen(true);
                setLangOpen(false);
              }}
              style={{
                ...neu.controlRaised,
                borderRadius: R.lg,
                width: 46,
                height: 46,
                border: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                color: C.text,
                flexShrink: 0,
              }}
            >
              <BurgerIcon />
            </button>
          </div>
        </div>
      </header>

      {menuOpen ? (
        <div
          onClick={() => setMenuOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.28)',
            zIndex: 95,
            padding: 16,
            // The backdrop itself scrolls if the menu is taller than the
            // viewport; overscroll-behavior keeps the gesture from chaining to
            // the page behind it.
            overflowY: 'auto',
            overscrollBehavior: 'contain',
            WebkitOverflowScrolling: 'touch',
          }}
        >
          <div
            ref={menuRef}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={copy.menu}
            tabIndex={-1}
            style={{
              ...neu.panelRaised,
              maxWidth: 420,
              margin: '12px auto 0',
              borderRadius: 26,
              padding: 18,
              // Panel scrolls internally so the language section at the bottom
              // is always reachable on short screens.
              maxHeight: 'calc(100dvh - 32px)',
              overflowY: 'auto',
              overscrollBehavior: 'contain',
              WebkitOverflowScrolling: 'touch',
              outline: 'none',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 14,
              }}
            >
              <div
                style={{
                  fontFamily: fonts.mono,
                  fontSize: 11,
                  fontWeight: 700,
                  color: C.textMutedStrong,
                  letterSpacing: 1.4,
                  textTransform: 'uppercase',
                }}
              >
                {copy.menu}
              </div>

              <button
                type="button"
                onClick={() => setMenuOpen(false)}
                style={{
                  border: 'none',
                  background: 'transparent',
                  color: C.textSoft,
                  fontFamily: fonts.sans,
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: 'pointer',
                  // 48px touch target without shifting the header row.
                  minWidth: 48,
                  minHeight: 48,
                  padding: '12px 10px',
                  margin: '-12px -10px',
                }}
              >
                {copy.close}
              </button>
            </div>

            <div style={{ display: 'grid', gap: 8 }}>
              {links.map((link) => {
                const active =
                  link.href === '/'
                    ? pathname === '/'
                    : pathname === link.href || pathname.startsWith(`${link.href}/`);

                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setMenuOpen(false)}
                    style={{
                      ...neu.subtle,
                      textDecoration: 'none',
                      borderRadius: R.lg,
                      padding: '14px 14px',
                      color: active ? C.accent : C.text,
                      background: active ? `${C.accent}12` : C.surface,
                      fontFamily: fonts.sans,
                      fontSize: 15,
                      fontWeight: 700,
                    }}
                  >
                    {link.label}
                  </Link>
                );
              })}
            </div>

            <div
              style={{
                marginTop: 16,
                paddingTop: 14,
                borderTop: `1px solid ${C.divider}`,
              }}
            >
              <div
                style={{
                  fontFamily: fonts.mono,
                  fontSize: 10,
                  fontWeight: 700,
                  color: C.textMutedStrong,
                  letterSpacing: 1.4,
                  textTransform: 'uppercase',
                  marginBottom: 10,
                }}
              >
                {copy.language}
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {languages.map(([code, meta]) => {
                  const active = code === language;

                  return (
                    <button
                      key={code}
                      type="button"
                      onClick={() => changeLanguage(code)}
                      style={{
                        ...neu.subtle,
                        border: active ? `1px solid ${C.accent}` : `1px solid transparent`,
                        borderRadius: R.md,
                        padding: '8px 12px',
                        background: active ? `${C.accent}12` : C.surface,
                        color: active ? C.accent : C.textSoft,
                        fontFamily: fonts.mono,
                        fontSize: 11,
                        fontWeight: 700,
                        letterSpacing: 0.8,
                        cursor: 'pointer',
                      }}
                    >
                      {meta.label} · {meta.native}
                    </button>
                  );
                })}
              </div>
            </div>

            <div
              style={{
                marginTop: 16,
                paddingTop: 14,
                borderTop: `1px solid ${C.divider}`,
              }}
            >
              <div
                style={{
                  fontFamily: fonts.mono,
                  fontSize: 10,
                  fontWeight: 700,
                  color: C.textMutedStrong,
                  letterSpacing: 1.4,
                  textTransform: 'uppercase',
                  marginBottom: 10,
                }}
              >
                {copy.theme}
              </div>

              <ThemeModeControl
                C={C}
                fonts={fonts}
                R={R}
                mode={mode}
                setMode={setMode}
                options={themeOptions}
                fullWidth
              />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function HeaderAddCityButton({
  label,
  C,
  fonts,
  neu,
  R,
}: {
  label: string;
  C: any;
  fonts: any;
  neu: any;
  R: any;
}) {
  return (
    <Link
      href="/create"
      aria-label={label}
      title={label}
      style={{
        ...neu.controlRaised,
        height: 46,
        borderRadius: R.lg,
        padding: '0 14px',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        color: C.text,
        textDecoration: 'none',
        fontFamily: fonts.sans,
        fontSize: 13,
        fontWeight: 800,
        whiteSpace: 'nowrap',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          color: C.accent,
          fontSize: 19,
          lineHeight: 1,
          marginTop: -1,
        }}
      >
        +
      </span>
      <span>{label}</span>
    </Link>
  );
}

function ThemeModeControl({
  C,
  fonts,
  R,
  mode,
  setMode,
  options,
  fullWidth = false,
}: {
  C: any;
  fonts: any;
  R: any;
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  options: Array<{ key: ThemeMode; label: string }>;
  fullWidth?: boolean;
}) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
        gap: 4,
        width: fullWidth ? '100%' : 204,
        padding: 4,
        borderRadius: R.lg,
        border: `1px solid ${C.divider}`,
        background: `${C.surfaceHigh}AA`,
        boxSizing: 'border-box',
      }}
    >
      {options.map((option) => {
        const active = mode === option.key;

        return (
          <button
            key={option.key}
            type="button"
            onClick={() => setMode(option.key)}
            style={{
              minHeight: 36,
              minWidth: 56,
              border: 'none',
              borderRadius: R.md,
              background: active ? `${C.accent}22` : 'transparent',
              color: active ? C.accent : C.textSoft,
              cursor: 'pointer',
              fontFamily: fonts.sans,
              fontSize: 12,
              fontWeight: 800,
              padding: '0 8px',
            }}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function BurgerIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      style={{
        width: 20,
        height: 20,
        stroke: 'currentColor',
        fill: 'none',
        strokeWidth: 2,
        strokeLinecap: 'round',
      }}
    >
      <path d="M4 7h16" />
      <path d="M4 12h16" />
      <path d="M4 17h16" />
    </svg>
  );
}

function GlobeIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      style={{
        width: 15,
        height: 15,
        stroke: 'currentColor',
        fill: 'none',
        strokeWidth: 2,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        flexShrink: 0,
      }}
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3c-2.5 3-4 5.5-4 9s1.5 6 4 9" />
      <path d="M12 3c2.5 3 4 5.5 4 9s-1.5 6-4 9" />
      <path d="M3 12h18" />
    </svg>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      style={{
        width: 12,
        height: 12,
        stroke: 'currentColor',
        fill: 'none',
        strokeWidth: 2.5,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        transition: 'transform 0.2s',
        transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
        flexShrink: 0,
      }}
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}
