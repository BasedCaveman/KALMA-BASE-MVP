//kalma/frontend/components/shared/StartButton.tsx
'use client';

import { CSSProperties, useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { useColors } from '@/hooks/useColors';
import { useTranslation } from '@/hooks/useTranslation';

type StartButtonProps = {
  fullWidth?: boolean;
  label?: string;
  useExistingLabel?: string;
  tone?: 'primary' | 'soft';
};

function getCopy(language: string) {
  const table: Record<string, { start: string; useExisting: string; connecting: string }> = {
    en: { start: 'Start', useExisting: 'Use an existing account', connecting: 'Signing in…' },
    pt: { start: 'Começar', useExisting: 'Usar uma conta existente', connecting: 'Entrando…' },
    es: { start: 'Empezar', useExisting: 'Usar una cuenta existente', connecting: 'Iniciando sesión…' },
    fr: { start: 'Commencer', useExisting: 'Utiliser un compte existant', connecting: 'Connexion…' },
    de: { start: 'Start', useExisting: 'Ein bestehendes Konto verwenden', connecting: 'Anmelden…' },
    zh: { start: '开始', useExisting: '使用已有账户', connecting: '登录中…' },
  };
  return table[language] ?? table.en;
}

export default function StartButton({
  fullWidth = false,
  label,
  useExistingLabel,
  tone = 'primary',
}: StartButtonProps) {
  const { login, authenticated, ready } = usePrivy();
  const { C, fonts, R } = useColors();
  const { language } = useTranslation();
  const [busy, setBusy] = useState(false);
  const copy = getCopy(language);

  // When Privy already has a session, calling login() throws "user is already
  // logged in" and does nothing — the wagmi reconnect is handled by
  // PrivyWagmiBridge. Only open the login modal for genuinely-new sessions.
  const openLogin = () => {
    if (!ready || authenticated) return;
    login();
  };

  const handleStart = async () => {
    setBusy(true);
    try {
      openLogin();
    } catch (err) {
      console.warn('[Kalma] login failed:', err);
    } finally {
      setBusy(false);
    }
  };

  const handleExistingWallet = async () => {
    try {
      openLogin();
    } catch (err) {
      console.warn('[Kalma] Existing wallet modal failed to open:', err);
    }
  };

  const baseStyle: CSSProperties = {
    border: 'none',
    cursor: busy ? 'default' : 'pointer',
    opacity: busy ? 0.7 : 1,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    width: fullWidth ? '100%' : 'auto',
    minWidth: 0,
    minHeight: 48,
    padding: '0 22px',
    borderRadius: R.md,
    fontFamily: fonts.sans,
    fontSize: 18,
    fontWeight: 700,
    letterSpacing: -0.2,
    boxSizing: 'border-box',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    transition: 'transform 160ms ease, box-shadow 160ms ease, opacity 160ms ease',
    background: 'rgba(126, 181, 141, 0.72)',
    color: C.dark,
    boxShadow: `4px 4px 14px ${C.shadowA}42, -4px -4px 12px ${C.shadowB}34, inset 1px 1px 0 rgba(255,255,255,0.18)`,
  };

  return (
    <div
      style={{
        padding: 6,
        borderRadius: R.lg,
        background: tone === 'primary' ? C.accent : `${C.surfaceSoft}E6`,
        boxShadow:
          tone === 'primary'
            ? `inset 4px 4px 14px ${C.shadowA}28, inset -4px -4px 12px ${C.shadowB}24`
            : `inset 3px 3px 10px ${C.shadowA}18, inset -3px -3px 10px ${C.shadowB}18`,
        display: 'grid',
        gap: 6,
        width: fullWidth ? '100%' : 'auto',
        justifyItems: 'stretch',
        boxSizing: 'border-box',
        minWidth: 0,
      }}
    >
      <button type="button" onClick={handleStart} disabled={busy} style={baseStyle}>
        {busy ? copy.connecting : (label ?? copy.start)}
      </button>
      <button
        type="button"
        onClick={handleExistingWallet}
        style={{
          width: '100%',
          minWidth: 0,
          minHeight: 48,
          borderRadius: R.md,
          background: tone === 'primary' ? 'rgba(126, 181, 141, 0.48)' : `${C.surfaceDeep}B8`,
          border: 'none',
          color: tone === 'primary' ? C.dark : C.text,
          fontFamily: fonts.sans,
          fontSize: 14,
          fontWeight: 600,
          cursor: 'pointer',
          padding: '0 14px',
          textDecoration: 'none',
          boxShadow: `inset 4px 4px 12px ${C.shadowA}30, inset -4px -4px 10px ${C.shadowB}22`,
          position: 'relative',
          zIndex: 1,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {useExistingLabel ?? copy.useExisting}
      </button>
    </div>
  );
}
