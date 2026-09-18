//frontend/components/market/ReturnSummary.tsx
'use client';

import { type CSSProperties } from 'react';
import { formatUnits } from 'viem';
import { useReadContract } from 'wagmi';
import { CONTRACTS, climatePoolAbi, USDM_DECIMALS } from '@/lib/contracts';
import { useColors } from '@/hooks/useColors';
import { useTranslation } from '@/hooks/useTranslation';

function returnCopy(language: string) {
  const table: Record<string, Record<string, string>> = {
    en: {
      title: 'Collectable returns',
      gross: 'Gross',
      net: 'Net',
      fee: 'Fee',
      stake: 'Stake',
      profit: 'Net P/L',
      notReady: 'Returns will appear after resolution.',
      noWin: 'This position did not finish in the winning side.',
      claimed: 'Already claimed',
    },
    pt: {
      title: 'Retorno',
      gross: 'Bruto',
      net: 'Líquido',
      fee: 'Taxa',
      stake: 'Aporte',
      profit: 'P/L líquido',
      notReady: 'O retorno aparecerá após a resolução.',
      noWin: 'Esta posição não terminou do lado vencedor.',
      claimed: 'Já coletado',
    },
    es: {
      title: 'Retorno',
      gross: 'Bruto',
      net: 'Neto',
      fee: 'Comisión',
      stake: 'Aporte',
      profit: 'P/L neto',
      notReady: 'El retorno aparecerá después de la resolución.',
      noWin: 'Esta posición no terminó del lado ganador.',
      claimed: 'Ya cobrado',
    },
    fr: {
      title: 'Retour',
      gross: 'Brut',
      net: 'Net',
      fee: 'Frais',
      stake: 'Mise',
      profit: 'P/L net',
      notReady: 'Le retour apparaîtra après la résolution.',
      noWin: 'Cette position n’a pas terminé du côté gagnant.',
      claimed: 'Déjà récupéré',
    },
    de: {
      title: 'Sammelbarer Rückfluss',
      gross: 'Brutto',
      net: 'Netto',
      fee: 'Gebühr',
      stake: 'Einsatz',
      profit: 'Netto P/L',
      notReady: 'Der Rückfluss erscheint nach der Auflösung.',
      noWin: 'Diese Position lag nicht auf der Gewinnerseite.',
      claimed: 'Bereits gesammelt',
    },
    zh: {
      title: '回报',
      gross: '总额',
      net: '净额',
      fee: '费用',
      stake: '本金',
      profit: '净 P/L',
      notReady: '结算后会显示回报。',
      noWin: '该头寸没有处于获胜一侧。',
      claimed: '已领取',
    },
  };

  return table[language] ?? table.en;
}

function formatMoney(value: number) {
  if (!Number.isFinite(value)) return '0';
  if (Math.abs(value) >= 1000) return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return value.toFixed(2);
}

export function ReturnSummary({
  marketId,
  isAbove,
  amount,
  resolved = false,
  userWon = true,
  claimed = false,
}: {
  marketId: bigint;
  isAbove: boolean;
  amount: bigint;
  resolved?: boolean;
  userWon?: boolean;
  claimed?: boolean;
}) {
  const { C, fonts, neu, R } = useColors();
  const { language } = useTranslation();
  const copy = returnCopy(language);

  const {
    data: returnData,
    isLoading,
  } = useReadContract({
    address: CONTRACTS.CLIMATE_POOL,
    abi: climatePoolAbi,
    functionName: 'calculatePayout',
    args: [marketId, isAbove, amount],
    query: {
      enabled: resolved && userWon && amount > 0n && !claimed,
    },
  });

  const stakeValue = Number(formatUnits(amount, USDM_DECIMALS));

  let gross = 0;
  let net = 0;

  if (returnData && Array.isArray(returnData) && returnData.length >= 2) {
    gross = Number(formatUnits(returnData[0] as bigint, USDM_DECIMALS));
    net = Number(formatUnits(returnData[1] as bigint, USDM_DECIMALS));
  }

  const fee = Math.max(0, gross - net);
  const profit = net - stakeValue;

  if (!resolved) {
    return (
      <div style={panelStyle(neu, R, C)}>
        <Header title={copy.title} fonts={fonts} C={C} />
        <MutedLine text={copy.notReady} fonts={fonts} C={C} />
      </div>
    );
  }

  if (!userWon) {
    return (
      <div style={panelStyle(neu, R, C)}>
        <Header title={copy.title} fonts={fonts} C={C} />
        <MutedLine text={copy.noWin} fonts={fonts} C={C} />
        <MetricRow label={copy.stake} value={`$${formatMoney(stakeValue)}`} fonts={fonts} C={C} />
        <MetricRow label={copy.profit} value={`-$${formatMoney(stakeValue)}`} fonts={fonts} C={C} tone="negative" />
      </div>
    );
  }

  if (claimed) {
    return (
      <div style={panelStyle(neu, R, C)}>
        <Header title={copy.title} fonts={fonts} C={C} />
        <MutedLine text={copy.claimed} fonts={fonts} C={C} />
        <MetricRow label={copy.stake} value={`$${formatMoney(stakeValue)}`} fonts={fonts} C={C} />
        <MetricRow label={copy.net} value={`$${formatMoney(net || gross)}`} fonts={fonts} C={C} tone="positive" />
      </div>
    );
  }

  return (
    <div style={panelStyle(neu, R, C)}>
      <Header title={copy.title} fonts={fonts} C={C} />

      {isLoading ? (
        <MutedLine text="..." fonts={fonts} C={C} />
      ) : (
        <>
          <MetricRow label={copy.stake} value={`$${formatMoney(stakeValue)}`} fonts={fonts} C={C} />
          <MetricRow label={copy.gross} value={`$${formatMoney(gross)}`} fonts={fonts} C={C} />
          <MetricRow label={copy.net} value={`$${formatMoney(net)}`} fonts={fonts} C={C} tone="positive" />
          <MetricRow label={copy.fee} value={`$${formatMoney(fee)}`} fonts={fonts} C={C} />
          <MetricRow
            label={copy.profit}
            value={`${profit >= 0 ? '+' : '-'}$${formatMoney(Math.abs(profit))}`}
            fonts={fonts}
            C={C}
            tone={profit >= 0 ? 'positive' : 'negative'}
          />
        </>
      )}
    </div>
  );
}

function panelStyle(neu: any, R: any, C: any): CSSProperties {
  return {
    ...neu.controlPressed,
    borderRadius: R.lg,
    padding: '12px 14px',
    border: `1px solid ${C.divider}`,
  };
}

function Header({
  title,
  fonts,
  C,
}: {
  title: string;
  fonts: any;
  C: any;
}) {
  return (
    <div
      style={{
        fontFamily: fonts.mono,
        fontSize: 11,
        fontWeight: 700,
        color: C.textMutedStrong,
        letterSpacing: 1.4,
        textTransform: 'uppercase',
        marginBottom: 10,
      }}
    >
      {title}
    </div>
  );
}

function MutedLine({
  text,
  fonts,
  C,
}: {
  text: string;
  fonts: any;
  C: any;
}) {
  return (
    <div
      style={{
        fontFamily: fonts.sans,
        fontSize: 14,
        color: C.textSoft,
        lineHeight: 1.45,
      }}
    >
      {text}
    </div>
  );
}

function MetricRow({
  label,
  value,
  fonts,
  C,
  tone = 'default',
}: {
  label: string;
  value: string;
  fonts: any;
  C: any;
  tone?: 'default' | 'positive' | 'negative';
}) {
  const color =
    tone === 'positive' ? C.above : tone === 'negative' ? C.below : C.text;

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        gap: 12,
        marginBottom: 8,
      }}
    >
      <span
        style={{
          fontFamily: fonts.mono,
          fontSize: 11,
          fontWeight: 700,
          color: C.textMutedStrong,
          letterSpacing: 1.2,
          textTransform: 'uppercase',
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontFamily: fonts.sans,
          fontSize: 14,
          fontWeight: 700,
          color,
          textAlign: 'right',
        }}
      >
        {value}
      </span>
    </div>
  );
}
