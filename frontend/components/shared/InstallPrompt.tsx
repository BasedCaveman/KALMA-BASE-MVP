// kalma/frontend/components/shared/InstallPrompt.tsx
//
// Quiet, contextual "Add Kalma to your home screen" prompt. Intentionally
// low-key per the roadmap ("keep install prompts quiet and contextual"):
//   - mobile only — installing to a home screen is a phone gesture, so we
//     don't surface it on desktop widths;
//   - only on the daily-habit surfaces (`/` and `/today`), never mid-task;
//   - at most ONCE per browser session, and never again after dismiss/install;
//   - never shows in an already-installed standalone window;
//   - waits a few seconds so it doesn't interrupt first paint.
// Two variants, since only Chromium exposes a native install trigger:
//   - 'chrome': Android/desktop Chrome fired `beforeinstallprompt` — one tap
//     runs the real OS install sheet.
//   - 'ios': Safari on iOS/iPadOS has no such event and never will (Apple
//     does not implement it), so we show the two-step manual instructions
//     instead (Share → Add to Home Screen). Chrome/Firefox/Edge on iOS all
//     run on WebKit under the hood and their share-sheet flow differs enough
//     from Safari's that we don't guess at it — only Safari gets this variant.

'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useColors } from '@/hooks/useColors';
import { useTranslation } from '@/hooks/useTranslation';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

const DISMISS_KEY = 'kalma_pwa_install_dismissed'; // permanent (dismiss / install)
const SEEN_KEY = 'kalma_pwa_install_seen'; // per browser session
// Only the daily-habit surfaces.
const ALLOWED_PATHS = new Set(['/', '/today']);

const CHROME_COPY: Record<string, { title: string; body: string; install: string; later: string }> = {
  en: { title: 'Add Kalma to your home screen', body: 'Open your local signals in one tap, like an app.', install: 'Add', later: 'Not now' },
  pt: { title: 'Adicione o Kalma à tela inicial', body: 'Abra os sinais locais com um toque, como um app.', install: 'Adicionar', later: 'Agora não' },
  es: { title: 'Añade Kalma a tu pantalla de inicio', body: 'Abre tus señales locales con un toque, como una app.', install: 'Añadir', later: 'Ahora no' },
  fr: { title: "Ajoutez Kalma à votre écran d'accueil", body: 'Ouvrez vos signaux locaux en un geste, comme une app.', install: 'Ajouter', later: 'Plus tard' },
  de: { title: 'Kalma zum Startbildschirm hinzufügen', body: 'Öffne deine lokalen Signale mit einem Tipp, wie eine App.', install: 'Hinzufügen', later: 'Später' },
  zh: { title: '将 Kalma 添加到主屏幕', body: '一键打开本地天气信号，像应用一样。', install: '添加', later: '以后再说' },
};

const IOS_COPY: Record<string, { title: string; before: string; after: string; gotIt: string }> = {
  en: { title: 'Add Kalma to your home screen', before: 'Tap', after: "in Safari, then ‘Add to Home Screen’.", gotIt: 'Got it' },
  pt: { title: 'Adicione o Kalma à tela inicial', before: 'Toque em', after: "no Safari e depois em ‘Adicionar à Tela de Início’.", gotIt: 'Entendi' },
  es: { title: 'Añade Kalma a tu pantalla de inicio', before: 'Toca', after: "en Safari y luego en ‘Añadir a pantalla de inicio’.", gotIt: 'Entendido' },
  fr: { title: "Ajoutez Kalma à votre écran d'accueil", before: 'Appuyez sur', after: "dans Safari, puis sur « Sur l’écran d’accueil ».", gotIt: 'Compris' },
  de: { title: 'Kalma zum Startbildschirm hinzufügen', before: 'Tippe in Safari auf', after: 'und dann auf „Zum Home-Bildschirm“.', gotIt: 'Verstanden' },
  zh: { title: '将 Kalma 添加到主屏幕', before: '在 Safari 中点按', after: '，然后选择"添加到主屏幕"。', gotIt: '知道了' },
};

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    // iOS Safari
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

// Mobile = below the app's desktop breakpoint (matches the BottomNav cutoff).
function isMobile(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(max-width: 1023px)').matches ?? false;
}

function isIOSDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  const classicUA = /iPad|iPhone|iPod/.test(ua) && !(window as unknown as { MSStream?: unknown }).MSStream;
  // iPadOS 13+ reports as a Mac unless the user changed the request-desktop-site
  // setting; a touch-capable "Mac" is the only reliable tell.
  const iPadOS13Up = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  return classicUA || iPadOS13Up;
}

// Safari only: Chrome/Firefox/Edge/Opera on iOS all identify themselves in
// the UA string even though they render with WebKit underneath.
function isIOSSafari(): boolean {
  if (!isIOSDevice()) return false;
  return !/CriOS|FxiOS|EdgiOS|OPiOS|mercury/i.test(navigator.userAgent);
}

function ShareIcon({ color }: { color: string }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ display: 'inline-block', verticalAlign: '-2px', margin: '0 3px' }}
      aria-hidden="true"
    >
      <path d="M12 2v13" />
      <path d="M8 6l4-4 4 4" />
      <rect x="4" y="10" width="16" height="12" rx="2" />
    </svg>
  );
}

export default function InstallPrompt() {
  const { C, fonts, R } = useColors();
  const { language } = useTranslation();
  const chromeCopy = CHROME_COPY[language] ?? CHROME_COPY.en;
  const iosCopy = IOS_COPY[language] ?? IOS_COPY.en;
  const pathname = usePathname();
  const onAllowedPath = ALLOWED_PATHS.has(pathname);

  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [variant, setVariant] = useState<'chrome' | 'ios' | null>(null);

  // Capture the install event whenever it fires (it can arrive on any route);
  // display is gated separately so we never miss it.
  useEffect(() => {
    if (isStandalone()) return;
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);

  // Decide whether to surface it, and which variant: install available
  // (Chromium) beats manual instructions (iOS Safari) if somehow both were
  // true. Gated on mobile + on / or /today + not permanently dismissed +
  // not already shown this session. Marks the session as seen the moment it
  // appears, so it shows at most once per session.
  useEffect(() => {
    if (isStandalone() || !onAllowedPath || !isMobile()) return;
    const next: 'chrome' | 'ios' | null = deferred ? 'chrome' : isIOSSafari() ? 'ios' : null;
    if (!next) return;
    try {
      if (localStorage.getItem(DISMISS_KEY) === '1') return;
      if (sessionStorage.getItem(SEEN_KEY) === '1') return;
    } catch {
      // storage blocked (private mode / embedded) → allow it through once
    }
    const t = window.setTimeout(() => {
      setVariant(next);
      try {
        sessionStorage.setItem(SEEN_KEY, '1');
      } catch {
        /* ignore */
      }
    }, 3500);
    return () => window.clearTimeout(t);
  }, [deferred, onAllowedPath]);

  function remember() {
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* ignore */
    }
  }

  async function handleInstall() {
    if (!deferred) return;
    setVariant(null);
    try {
      await deferred.prompt();
      await deferred.userChoice;
    } catch {
      /* user dismissed the native sheet — fine */
    }
    setDeferred(null);
    remember(); // don't re-show regardless of outcome
  }

  function handleDismiss() {
    setVariant(null);
    setDeferred(null);
    remember();
  }

  if (!variant || !onAllowedPath) return null;

  const isIos = variant === 'ios';

  return (
    <div
      role="dialog"
      aria-label={isIos ? iosCopy.title : chromeCopy.title}
      style={{
        position: 'fixed',
        left: '50%',
        transform: 'translateX(-50%)',
        bottom: 'calc(var(--k-mobile-bottom-clearance, 16px) + 8px)',
        width: 'calc(100% - 24px)',
        maxWidth: 412,
        zIndex: 60,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '12px 14px',
        boxSizing: 'border-box',
        borderRadius: R.lg ?? 16,
        background: C.surfaceHigh ?? C.surface,
        border: '1px solid color-mix(in srgb, var(--k-text) 12%, transparent)',
        boxShadow: '0 8px 28px rgba(0,0,0,0.32)',
        fontFamily: fonts.sans,
      }}
    >
      <img src="/icons/icon-192.png" alt="" width={40} height={40} style={{ borderRadius: 10, flexShrink: 0 }} />
      <div style={{ minWidth: 0, flex: 1 }}>
        {isIos ? (
          <>
            <div style={{ color: C.text, fontSize: 14, fontWeight: 700, lineHeight: 1.2 }}>{iosCopy.title}</div>
            <div style={{ color: C.textMuted, fontSize: 12, marginTop: 2, lineHeight: 1.3 }}>
              {iosCopy.before}
              <ShareIcon color={C.text} />
              {iosCopy.after}
            </div>
          </>
        ) : (
          <>
            <div style={{ color: C.text, fontSize: 14, fontWeight: 700, lineHeight: 1.2 }}>{chromeCopy.title}</div>
            <div style={{ color: C.textMuted, fontSize: 12, marginTop: 2, lineHeight: 1.3 }}>{chromeCopy.body}</div>
          </>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
        {!isIos && (
          <button
            type="button"
            onClick={handleDismiss}
            style={{
              font: 'inherit',
              fontSize: 12,
              fontWeight: 600,
              color: C.textMuted,
              background: 'transparent',
              border: 0,
              padding: '8px 8px',
              cursor: 'pointer',
            }}
          >
            {chromeCopy.later}
          </button>
        )}
        <button
          type="button"
          onClick={isIos ? handleDismiss : handleInstall}
          style={{
            font: 'inherit',
            fontSize: 13,
            fontWeight: 700,
            color: '#0D1710',
            background: C.accent ?? C.above,
            border: 0,
            borderRadius: R.pill ?? 999,
            padding: '9px 16px',
            minHeight: 40,
            cursor: 'pointer',
          }}
        >
          {isIos ? iosCopy.gotIt : chromeCopy.install}
        </button>
      </div>
    </div>
  );
}
