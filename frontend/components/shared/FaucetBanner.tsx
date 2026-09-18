//kalma/frontend/components/shared/FaucetBanner.tsx
// USDC-only faucet UI. On testnet, Kalma can drip starter gas before claiming.
'use client';

import { useMemo } from 'react';
import { useColors } from '@/hooks/useColors';
import { useTranslation } from '@/hooks/useTranslation';
import { useFaucet } from '@/hooks/useFaucet';
import WalletErrorPanel from '@/components/shared/WalletErrorPanel';
import { classifyWalletError } from '@/lib/wallet-errors';
import { CHAIN } from '@/lib/contracts';

function faucetCopy(language: string) {
  const table: Record<string, Record<string, string>> = {
    en: {
      title: 'Test cash',
      needCash: 'You may need test credits',
      getUsdm: 'Get USDC from Kalma to test the full market flow.',
      testCashLabel: 'Test cash',
      getting: 'Getting test credits...',
      addingGas: 'Preparing test credits...',
      getCash: 'Get test credits',
      cooldown: 'Faucet cooldown active. Try again in about',
      success: 'Test cash received.',
      errRejected: 'You cancelled the request.',
      errGeneric: 'Could not get test credits right now.',
    },
    pt: {
      title: 'Dinheiro de teste',
      needCash: 'Você pode precisar de dinheiro de teste',
      getUsdm: 'Receba USDC do Kalma para testar todo o fluxo de mercado.',
      testCashLabel: 'Dinheiro de teste',
      getting: 'Depositando dinheiro de teste...',
      addingGas: 'Preparando dinheiro de teste...',
      getCash: 'Depositar dinheiro de teste',
      cooldown: 'Faucet em espera. Tente novamente em cerca de',
      success: 'Dinheiro de teste depositado.',
      errRejected: 'Você cancelou a solicitação.',
      errGeneric: 'Não foi possível depositar dinheiro de teste agora.',
    },
    es: {
      title: 'Fondos de prueba',
      needCash: 'Puede que necesites fondos de prueba',
      getUsdm: 'Obtén USDC de Kalma para probar todo el flujo de mercado.',
      testCashLabel: 'Fondos de prueba',
      getting: 'Obteniendo fondos de prueba...',
      addingGas: 'Preparando fondos de prueba...',
      getCash: 'Obtener fondos de prueba',
      cooldown: 'Faucet en espera. Inténtalo de nuevo en unos',
      success: 'Fondos de prueba recibidos.',
      errRejected: 'Cancelaste la solicitud.',
      errGeneric: 'No se pudieron obtener fondos de prueba ahora.',
    },
    fr: {
      title: 'Fonds de test',
      needCash: 'Vous pourriez avoir besoin de fonds de test',
      getUsdm: 'Obtenez des USDC de Kalma pour tester le flux complet.',
      testCashLabel: 'Fonds de test',
      getting: 'Réception des fonds de test...',
      addingGas: 'Préparation des fonds de test...',
      getCash: 'Obtenir des fonds de test',
      cooldown: 'Faucet en pause. Réessayez dans environ',
      success: 'Fonds de test reçus.',
      errRejected: 'Vous avez annulé la demande.',
      errGeneric: "Impossible d'obtenir des fonds de test pour le moment.",
    },
    de: {
      title: 'Testguthaben',
      needCash: 'Du benötigst möglicherweise Testguthaben',
      getUsdm: 'Hole USDC von Kalma, um den gesamten Marktfluss zu testen.',
      testCashLabel: 'Testguthaben',
      getting: 'Testguthaben wird empfangen...',
      addingGas: 'Testguthaben wird vorbereitet...',
      getCash: 'Testguthaben erhalten',
      cooldown: 'Faucet-Pause aktiv. Versuche es erneut in etwa',
      success: 'Testguthaben erhalten.',
      errRejected: 'Du hast die Anfrage abgebrochen.',
      errGeneric: 'Testguthaben konnte gerade nicht empfangen werden.',
    },
    zh: {
      title: '测试资金',
      needCash: '你可能需要测试资金',
      getUsdm: '从 Kalma 获取 USDC 来测试完整的市场流程。',
      testCashLabel: '测试资金',
      getting: '正在获取测试资金...',
      addingGas: '正在准备测试资金...',
      getCash: '获取测试资金',
      cooldown: '水龙头冷却中。请在约',
      success: '测试资金已收到。',
      errRejected: '你取消了请求。',
      errGeneric: '现在无法获取测试资金。',
    },
  };
  return table[language] ?? table.en;
}

function formatTokenBalance(balance: bigint, decimals = 18, fractionDigits = 1) {
  const divisor = 10 ** fractionDigits;
  const scaled = Number(balance / 10n ** BigInt(decimals - fractionDigits)) / divisor;
  return scaled.toFixed(fractionDigits);
}

function getFriendlyErrorKey(error: unknown): string {
  if (!error) return '';
  const raw =
    typeof error === 'string'
      ? error.toLowerCase()
      : typeof error === 'object' && error !== null
        ? [
            'message' in error ? String((error as { message?: unknown }).message ?? '') : '',
            'shortMessage' in error
              ? String((error as { shortMessage?: unknown }).shortMessage ?? '')
              : '',
          ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase()
        : '';

  if (raw.includes('user rejected') || raw.includes('cancelled')) return 'errRejected';
  return 'errGeneric';
}

export default function FaucetBanner() {
  const { C, fonts, neu, R } = useColors();
  const { language } = useTranslation();
  const copy = faucetCopy(language);

  const {
    showBanner,
    onCooldown,
    cooldownSeconds,
    claimFaucet,
    isPending,
    isGasDripping,
    isConfirming,
    isSuccess,
    stage,
    error,
    reset: resetFaucet,
    usdmBalance,
    testCashTxHash,
  } = useFaucet();

  // For the stale-session-key case we surface the full WalletErrorPanel
  // (friendly text + Refresh wallet session button). For everything else
  // we fall back to the legacy friendlyError message — shorter and fits
  // the banner footprint better than the panel.
  const errorKind = useMemo(
    () => (error ? classifyWalletError(error).kind : null),
    [error],
  );
  const friendlyError = useMemo(() => {
    if (errorKind === 'stale_session_key') return '';
    const key = getFriendlyErrorKey(error);
    return key ? copy[key] ?? '' : '';
  }, [error, copy, errorKind]);

  const needsAnything = showBanner || onCooldown;
  if (!needsAnything) return null;

  const busy =
    isGasDripping ||
    isPending ||
    isConfirming ||
    ['checking_gas', 'signing_gas', 'waiting_gas', 'requesting_cash', 'refreshing_cash'].includes(stage);

  function formatCooldown(seconds: number) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  }

  const primaryButton: React.CSSProperties = {
    width: '100%',
    padding: '15px 16px',
    borderRadius: R.lg,
    border: 'none',
    background: C.dark,
    color: '#FFFDF8',
    fontFamily: fonts.sans,
    fontSize: 15,
    fontWeight: 700,
    cursor: 'pointer',
    boxShadow: `0 8px 24px ${C.dark}30, inset 0 1px 0 ${C.darkSoft}`,
  };

  const statusBox: React.CSSProperties = {
    ...neu.controlPressed,
    borderRadius: R.lg,
    padding: '12px 14px',
    fontFamily: fonts.sans,
    fontSize: 14,
    color: C.textSoft,
    lineHeight: 1.45,
  };

  const feedbackText: React.CSSProperties = {
    marginTop: 10,
    fontFamily: fonts.sans,
    fontSize: 14,
    lineHeight: 1.45,
  };

  return (
    <div
      style={{
        ...neu.panelRaised,
        borderRadius: R.xl,
        padding: '16px 16px 14px',
        marginBottom: 16,
      }}
    >
      <div
        style={{
          fontFamily: fonts.mono,
          fontSize: 11,
          fontWeight: 700,
          color: C.label,
          letterSpacing: 1.4,
          textTransform: 'uppercase',
          marginBottom: 8,
        }}
      >
        {copy.title}
      </div>

      <div
        style={{
          fontFamily: fonts.sans,
          fontSize: 16,
          fontWeight: 700,
          color: C.text,
          marginBottom: 6,
        }}
      >
        {copy.needCash}
      </div>

      <div
        style={{
          fontFamily: fonts.sans,
          fontSize: 14,
          color: C.textSoft,
          lineHeight: 1.5,
          marginBottom: 12,
        }}
      >
        {copy.getUsdm}
      </div>

      <div
        style={{
          ...neu.controlPressed,
          borderRadius: R.lg,
          padding: '14px 14px 12px',
          marginBottom: 12,
        }}
      >
        <div
          style={{
            fontFamily: fonts.mono,
            fontSize: 10,
            fontWeight: 700,
            color: C.textMutedStrong,
            letterSpacing: 1.5,
            textTransform: 'uppercase',
            marginBottom: 8,
          }}
        >
          {copy.testCashLabel}
        </div>
        <div
          style={{
            fontFamily: fonts.sans,
            fontSize: 15,
            fontWeight: 700,
            color: C.text,
          }}
        >
          {`${formatTokenBalance(usdmBalance)} USDC`}
        </div>
      </div>

      {showBanner && !onCooldown ? (
        <button
          type="button"
          onClick={claimFaucet}
          disabled={busy}
          style={primaryButton}
        >
          {isGasDripping || stage === 'checking_gas' || stage === 'signing_gas' || stage === 'waiting_gas'
            ? copy.addingGas
            : isPending || isConfirming || stage === 'requesting_cash' || stage === 'refreshing_cash'
              ? copy.getting
              : copy.getCash}
        </button>
      ) : null}

      {onCooldown ? (
        <div style={{ ...statusBox, marginTop: 10 }}>
          {copy.cooldown} {formatCooldown(cooldownSeconds)}.
        </div>
      ) : null}

      {isSuccess ? (
        <div style={{ ...feedbackText, color: C.above }}>
          {copy.success}
        </div>
      ) : null}

      {friendlyError ? (
        <div style={{ ...feedbackText, color: C.below }}>
          {friendlyError}
        </div>
      ) : null}

      {testCashTxHash ? (
        <div style={{ ...feedbackText, color: C.textSoft }}>
          <a
            href={`${CHAIN.blockExplorer}/tx/${testCashTxHash}`}
            target="_blank"
            rel="noreferrer"
            style={{ color: 'inherit', textDecoration: 'underline' }}
          >
            {`Tx ${testCashTxHash.slice(0, 8)}...${testCashTxHash.slice(-6)}`}
          </a>
        </div>
      ) : null}

      {errorKind === 'stale_session_key' && error ? (
        <div style={{ marginTop: 10 }}>
          <WalletErrorPanel
            error={error}
            onAfterReset={resetFaucet}
            compact
          />
        </div>
      ) : null}
    </div>
  );
}
