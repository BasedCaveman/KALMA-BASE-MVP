// kalma/frontend/components/landing/LandingPrefs.tsx
//
// Theme and language, top right of the landing.
//
// WHY NOT AppHeader. Every other route mounts AppHeader, which already carries
// both controls, but it also draws its own wordmark and a burger menu. The
// landing draws its own 44px wordmark as the first thing on the page, so
// mounting AppHeader here would put two Kalma marks on one screen and add a
// nav that competes with the single primary action. This is the same two
// controls, sharing the SAME hooks and the same persisted state (useTheme,
// useTranslation, LANGUAGE_META), so nothing can drift between the landing and
// the app: change the language here and every other route is already changed.
//
// Deliberately quiet. Per the landing art direction, one focus per fold, and
// these are not it: they are settings a person reaches for once, not an
// invitation. Ghost buttons, mono type, muted until touched.

'use client';

import { useEffect, useRef, useState } from 'react';
import { useColors } from '@/hooks/useColors';
import { useTheme, type ThemeMode } from '@/hooks/useTheme';
import { useTranslation, LANGUAGE_META } from '@/hooks/useTranslation';

const LABEL: Record<string, { theme: string; language: string; light: string; dark: string; system: string }> = {
  en: { theme: 'Theme', language: 'Language', light: 'Light', dark: 'Dark', system: 'System' },
  pt: { theme: 'Tema', language: 'Idioma', light: 'Claro', dark: 'Escuro', system: 'Sistema' },
  es: { theme: 'Tema', language: 'Idioma', light: 'Claro', dark: 'Oscuro', system: 'Sistema' },
  fr: { theme: 'Thème', language: 'Langue', light: 'Clair', dark: 'Sombre', system: 'Système' },
  de: { theme: 'Design', language: 'Sprache', light: 'Hell', dark: 'Dunkel', system: 'System' },
  zh: { theme: '主题', language: '语言', light: '浅色', dark: '深色', system: '跟随系统' },
};

export default function LandingPrefs() {
  const { C, fonts, R } = useColors();
  const { mode, setMode } = useTheme();
  const { language, changeLanguage } = useTranslation();
  const copy = LABEL[language] ?? LABEL.en;

  const [open, setOpen] = useState<'none' | 'theme' | 'lang'>('none');
  const wrap = useRef<HTMLDivElement>(null);

  // Close on outside click and on Escape. A menu that can only be dismissed by
  // choosing something is a trap, and these are both optional choices.
  useEffect(() => {
    if (open === 'none') return;
    const onDown = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen('none');
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen('none');
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const trigger = {
    minHeight: 44,
    padding: '6px 10px',
    borderRadius: R.pill,
    border: `1px solid ${C.divider}`,
    background: 'transparent',
    color: C.textMutedStrong,
    fontFamily: fonts.mono,
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 0.6,
    textTransform: 'uppercase' as const,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
  };

  const menu = {
    position: 'absolute' as const,
    top: 'calc(100% + 6px)',
    right: 0,
    zIndex: 40,
    minWidth: 150,
    padding: 6,
    borderRadius: R.md,
    border: `1px solid ${C.divider}`,
    background: C.surfaceHigh,
    boxShadow: `0 12px 30px ${C.shadowA}55`,
    display: 'grid',
    gap: 2,
  };

  const item = (active: boolean) => ({
    textAlign: 'left' as const,
    minHeight: 44,
    padding: '8px 10px',
    borderRadius: R.sm ?? 8,
    border: 'none',
    background: active ? `${C.accent}1F` : 'transparent',
    color: active ? C.text : C.textSoft,
    fontFamily: fonts.sans,
    fontSize: 13,
    fontWeight: active ? 800 : 600,
    cursor: 'pointer',
    width: '100%',
  });

  const themeOptions: Array<{ key: ThemeMode; label: string }> = [
    { key: 'light', label: copy.light },
    { key: 'dark', label: copy.dark },
    { key: 'system', label: copy.system },
  ];

  return (
    <div ref={wrap} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      {/* Language */}
      <div style={{ position: 'relative' }}>
        <button
          type="button"
          className="k-press"
          onClick={() => setOpen(open === 'lang' ? 'none' : 'lang')}
          aria-haspopup="menu"
          aria-expanded={open === 'lang'}
          aria-label={copy.language}
          style={trigger}
        >
          {LANGUAGE_META[language]?.label ?? 'EN'}
        </button>
        {open === 'lang' ? (
          <div role="menu" style={menu}>
            {Object.entries(LANGUAGE_META).map(([code, meta]) => (
              <button
                key={code}
                role="menuitem"
                type="button"
                onClick={() => {
                  changeLanguage(code);
                  setOpen('none');
                }}
                style={item(code === language)}
              >
                {meta.native}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {/* Theme */}
      <div style={{ position: 'relative' }}>
        <button
          type="button"
          className="k-press"
          onClick={() => setOpen(open === 'theme' ? 'none' : 'theme')}
          aria-haspopup="menu"
          aria-expanded={open === 'theme'}
          aria-label={copy.theme}
          style={trigger}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            {mode === 'light' ? (
              <>
                <circle cx="12" cy="12" r="4.5" />
                <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4" />
              </>
            ) : mode === 'dark' ? (
              <path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a6.6 6.6 0 0 0 10.5 10.5Z" />
            ) : (
              <>
                <circle cx="12" cy="12" r="8.5" />
                <path d="M12 3.5v17" />
              </>
            )}
          </svg>
        </button>
        {open === 'theme' ? (
          <div role="menu" style={menu}>
            {themeOptions.map((o) => (
              <button
                key={o.key}
                role="menuitem"
                type="button"
                onClick={() => {
                  setMode(o.key);
                  setOpen('none');
                }}
                style={item(o.key === mode)}
              >
                {o.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
