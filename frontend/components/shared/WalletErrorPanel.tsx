// kalma/frontend/components/shared/WalletErrorPanel.tsx
//
// One panel for every wallet-error surface in the dapp. Takes a raw
// error (object, string, anything), classifies it via
// lib/wallet-errors, and renders:
//   - a calm, human-readable explanation
//   - the right recovery affordance for the error kind
//   - a collapsible "technical details" disclosure for support tickets
//
// All four user-facing surfaces (/create, /positions, /profile,
// /markets/[id]) plus the shared panels that mount inside them
// (CreatorEarnings, Challenge, Faucet, MarketCard
// QuickPredictSheet) share this component so the UX is identical
// across the app.

'use client';

import { useState } from 'react';
import { useColors } from '@/hooks/useColors';
import { useTranslation } from '@/hooks/useTranslation';
import {
  classifyWalletError,
  type ClassifiedWalletError,
  type WalletErrorKind,
} from '@/lib/wallet-errors';

// Localised friendly messages keyed by the classifier's stable kind.
// The classifier itself stays EN-only (it's a non-React pure fn); the
// panel maps kind → message here so the copy follows the user's
// language. The 'unknown' kind falls back to classified.raw (which
// embeds the original error text) instead of a fixed string.
const WALLET_ERR_COPY: Record<string, Record<WalletErrorKind, string>> = {
  en: {
    stale_session_key: 'Your account session needs to be refreshed before this action can go through. This is a one-time reset — your funds stay in place.',
    wallet_timeout: 'Your account took too long to respond. Refresh the page and try once more.',
    user_cancelled: 'Action cancelled. You can try again anytime.',
    insufficient_balance: 'Not enough test funds for this action. Check your account balance on /profile.',
    network_mismatch: 'Your account is on the wrong network. Switch to Base Sepolia testnet to continue.',
    unknown: 'Something went wrong. Please try again.',
  },
  pt: {
    stale_session_key: 'Sua sessão da conta precisa ser renovada antes desta ação. É um reset único — seus fundos permanecem.',
    wallet_timeout: 'Sua conta demorou demais para responder. Atualize a página e tente mais uma vez.',
    user_cancelled: 'Ação cancelada. Você pode tentar de novo quando quiser.',
    insufficient_balance: 'Fundos de teste insuficientes para esta ação. Verifique o saldo da conta em /profile.',
    network_mismatch: 'Sua conta está na rede errada. Mude para a testnet Base Sepolia para continuar.',
    unknown: 'Algo deu errado. Tente novamente.',
  },
  es: {
    stale_session_key: 'Tu sesión de wallet necesita renovarse antes de esta transacción. Es un reinicio único — tus fondos y aprobaciones se mantienen.',
    wallet_timeout: 'Tu wallet social tardó demasiado en responder. Actualiza la página e inténtalo una vez más.',
    user_cancelled: 'Acción cancelada. Puedes intentarlo cuando quieras.',
    insufficient_balance: 'Saldo insuficiente en esta wallet para la acción. Revisa tus fondos de prueba y gas en /profile.',
    network_mismatch: 'Tu wallet está en la red equivocada. Cambia a la testnet Base Sepolia para continuar.',
    unknown: 'Algo salió mal. Inténtalo de nuevo.',
  },
  fr: {
    stale_session_key: 'Ta session de wallet doit être rafraîchie avant cette transaction. C’est une réinitialisation unique — tes fonds et autorisations restent en place.',
    wallet_timeout: 'Ton wallet social a mis trop de temps à répondre. Actualise la page et réessaie une fois.',
    user_cancelled: 'Action annulée. Tu peux réessayer quand tu veux.',
    insufficient_balance: 'Solde insuffisant dans ce wallet pour l’action. Vérifie tes fonds de test et ton gas sur /profile.',
    network_mismatch: 'Ton wallet est sur le mauvais réseau. Passe au testnet Base Sepolia pour continuer.',
    unknown: 'Une erreur est survenue. Réessaie.',
  },
  de: {
    stale_session_key: 'Deine Wallet-Sitzung muss vor dieser Transaktion erneuert werden. Ein einmaliger Reset — deine Mittel und Freigaben bleiben erhalten.',
    wallet_timeout: 'Dein Social Wallet hat zu lange gebraucht. Lade die Seite neu und versuche es noch einmal.',
    user_cancelled: 'Aktion abgebrochen. Du kannst es jederzeit erneut versuchen.',
    insufficient_balance: 'Nicht genug Guthaben in diesem Wallet für die Aktion. Prüfe dein Test-Guthaben und Gas auf /profile.',
    network_mismatch: 'Dein Wallet ist im falschen Netzwerk. Wechsle zum Base Sepolia-Testnet, um fortzufahren.',
    unknown: 'Etwas ist schiefgelaufen. Bitte versuche es erneut.',
  },
  zh: {
    stale_session_key: '在这笔交易前需要刷新你的钱包会话。这是一次性重置 — 你的资金和授权保持不变。',
    wallet_timeout: '社交钱包响应时间过长。请刷新页面后再试一次。',
    user_cancelled: '操作已取消。你可以随时重试。',
    insufficient_balance: '此钱包余额不足以完成操作。请在 /profile 查看你的测试资金和 gas。',
    network_mismatch: '你的钱包处于错误的网络。请切换到 Base Sepolia 测试网以继续。',
    unknown: '出了点问题。请重试。',
  },
};

const WALLET_PANEL_UI: Record<string, { refreshing: string; refresh: string; details: string }> = {
  en: { refreshing: 'Refreshing account session…', refresh: 'Refresh account session', details: 'Show technical details' },
  pt: { refreshing: 'Renovando sessão da conta…', refresh: 'Renovar sessão da conta', details: 'Mostrar detalhes técnicos' },
  es: { refreshing: 'Renovando sesión de wallet…', refresh: 'Renovar sesión de wallet', details: 'Mostrar detalles técnicos' },
  fr: { refreshing: 'Rafraîchissement de la session…', refresh: 'Rafraîchir la session du wallet', details: 'Afficher les détails techniques' },
  de: { refreshing: 'Wallet-Sitzung wird erneuert…', refresh: 'Wallet-Sitzung erneuern', details: 'Technische Details anzeigen' },
  zh: { refreshing: '正在刷新钱包会话…', refresh: '刷新钱包会话', details: '显示技术细节' },
};

type Props = {
  /** Whatever the wallet hook handed back. null / undefined hides the panel. */
  error: unknown;
  /**
   * Called after a successful revoke + grant cycle so the calling
   * surface can clear its local error state. Typically the `reset`
   * function from useWriteContract or usePredictWithApproval.
   */
  onAfterReset?: () => void;
  /**
   * Tighter visual treatment for surfaces with little room
   * (FaucetBanner, MarketCard QuickPredictSheet). Default is the
   * full panel used on /markets/[id] and /create.
   */
  compact?: boolean;
  /**
   * Optional class applied to the outer wrapper so callers can
   * inject layout-specific overrides (margins, etc.).
   */
  className?: string;
};

export default function WalletErrorPanel({
  error,
  onAfterReset,
  compact = false,
  className,
}: Props) {
  const { C, fonts, R } = useColors();
  const { language } = useTranslation();
  const [resetting, setResetting] = useState(false);

  if (!error) return null;

  const classified: ClassifiedWalletError = classifyWalletError(error);
  const errCopy = WALLET_ERR_COPY[language] ?? WALLET_ERR_COPY.en;
  const ui = WALLET_PANEL_UI[language] ?? WALLET_PANEL_UI.en;
  // Localised message for known kinds; for 'unknown' fall back to the
  // classifier's raw text (which carries the original error detail).
  const friendly =
    classified.kind === 'unknown'
      ? classified.friendly
      : errCopy[classified.kind] ?? classified.friendly;

  const handleReset = async () => {
    if (resetting) return;
    setResetting(true);
    try {
      onAfterReset?.();
    } finally {
      setResetting(false);
    }
  };

  const pad = compact ? '10px 12px' : '12px 14px';
  const titleSize = compact ? 13 : 14;

  return (
    <div
      className={className}
      style={{
        padding: pad,
        borderRadius: R.lg,
        border: `1px solid ${C.below}40`,
        background: `${C.below}10`,
      }}
    >
      <div
        style={{
          color: C.below,
          fontFamily: fonts.sans,
          fontSize: titleSize,
          lineHeight: 1.5,
          marginBottom: classified.action === 'reset_session' ? 10 : 0,
        }}
      >
        {friendly}
      </div>

      {classified.action === 'reset_session' ? (
        <button
          type="button"
          onClick={() => void handleReset()}
          disabled={resetting}
          style={{
            border: 'none',
            borderRadius: R.md,
            padding: compact ? '8px 12px' : '10px 14px',
            background: C.dark,
            color: '#FFFDF8',
            fontFamily: fonts.sans,
            fontSize: compact ? 12 : 13,
            fontWeight: 700,
            cursor: resetting ? 'default' : 'pointer',
            opacity: resetting ? 0.7 : 1,
          }}
        >
          {resetting ? ui.refreshing : ui.refresh}
        </button>
      ) : null}

      {/* Power-user disclosure — copy the raw validator output to share
          with support without exposing it by default. */}
      <details
        style={{
          marginTop: 8,
          fontFamily: fonts.mono,
          fontSize: 10,
          color: C.textMuted,
        }}
      >
        <summary style={{ cursor: 'pointer', letterSpacing: 0.4 }}>
          {ui.details}
        </summary>
        <div
          style={{
            marginTop: 6,
            padding: '6px 8px',
            background: C.surfaceDeep,
            borderRadius: R.md,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {classified.raw}
        </div>
      </details>
    </div>
  );
}
