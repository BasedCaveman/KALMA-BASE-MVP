//frontend/components/shared/ChallengeStatusPanel.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAccount } from '@/hooks/useWallet';
import { useWriteContract } from '@/hooks/useWriteContract';
import WalletErrorPanel from '@/components/shared/WalletErrorPanel';
import { useReadContract, useWaitForTransactionReceipt } from 'wagmi';
import { formatUnits } from 'viem';
import { useColors } from '@/hooks/useColors';
import { useTranslation } from '@/hooks/useTranslation';
import { useUnits } from '@/lib/units-context';
import { formatThreshold, thresholdTemp, thresholdPrecip, type UnitSystem } from '@/lib/units';
import {
  CONTRACTS,
  climateOracleAbi,
  usdcAbi,
  USDM_DECIMALS,
  MARKET_TYPES,
  decodeColdLine,
} from '@/lib/contracts';

type ChallengeState =
  | 'window-open'
  | 'challenged'
  | 'frozen'
  | 'claims-open'
  | 'not-resolved';

type ChallengeFlowPhase =
  | 'idle'
  | 'approving'
  | 'challenging'
  | 'success';

function panelCopy(language: string) {
  const table: Record<string, Record<string, string>> = {
    en: {
      title: 'Resolution review',
      reported: 'Reported',
      threshold: 'Threshold',
      verify: 'Verify on Open-Meteo ↗',
      challengeWindowOpen: 'Challenge window open',
      challengeWindowDesc:
        'Anyone can challenge this resolution by posting a bond.',
      challenged: 'Resolution challenged',
      challengedDesc:
        'A user posted a bond challenging this resolution. Claims stay paused until review is complete.',
      frozen: 'Resolution frozen',
      frozenDesc:
        'A guardian flagged this resolution for review. Claims are paused.',
      claimsOpen: 'Review complete - claims open',
      claimsOpenDesc:
        'The challenge window passed. Returns are ready to collect.',
      challengePrompt:
        'Think this resolution is wrong? Challenge it by posting a bond. If you are right, your bond is returned. If wrong, it goes to the climate fund.',
      approveBond: 'Approve bond',
      approving: 'Approving...',
      challenge: 'Challenge',
      challenging: 'Challenging...',
      approvalConfirmed: 'Bond approved. Sending challenge...',
      challengeSubmitted: 'Challenge submitted. Waiting for chain confirmation...',
      guardianActions: 'Guardian actions',
      freezeResolution: 'Freeze resolution',
      freezing: 'Freezing...',
      confirmReject: 'Confirm (reject challenge - slash bond)',
      confirmUnfreeze: 'Confirm resolution (unfreeze)',
      confirming: 'Confirming...',
      correctedValue: 'Corrected value',
      correctedPlaceholder: 'e.g. 42',
      reresolveReturnBond: 'Re-resolve (return bond)',
      reresolve: 'Re-resolve',
      challenger: 'Challenger',
      you: 'you',
      bond: 'bond',
      actionCompleted: 'Action completed.',
      actionFailed: 'Action failed.',
    },
    pt: {
      title: 'Revisão da resolução',
      reported: 'Reportado',
      threshold: 'Limite',
      verify: 'Verificar no Open-Meteo ↗',
      challengeWindowOpen: 'Janela de contestação aberta',
      challengeWindowDesc:
        'Qualquer pessoa pode contestar esta resolução ao depositar um bond.',
      challenged: 'Resolução contestada',
      challengedDesc:
        'Um usuário depositou um bond para contestar esta resolução. Os claims ficam pausados até a revisão terminar.',
      frozen: 'Resolução congelada',
      frozenDesc:
        'Um guardião sinalizou esta resolução para revisão. Os claims estão pausados.',
      claimsOpen: 'Revisão concluída - claims abertos',
      claimsOpenDesc:
        'A janela de contestação terminou. Os retornos já podem ser coletados.',
      challengePrompt:
        'Acha que esta resolução está errada? Conteste com um bond. Se você estiver certo, o bond volta. Se estiver errado, ele vai para o fundo climático.',
      approveBond: 'Aprovar bond',
      approving: 'Aprovando...',
      challenge: 'Contestar',
      challenging: 'Contestando...',
      approvalConfirmed: 'Bond aprovado. Enviando contestação...',
      challengeSubmitted: 'Contestação enviada. Aguardando confirmação na rede...',
      guardianActions: 'Ações do guardião',
      freezeResolution: 'Congelar resolução',
      freezing: 'Congelando...',
      confirmReject: 'Confirmar (rejeitar contestação - cortar bond)',
      confirmUnfreeze: 'Confirmar resolução (descongelar)',
      confirming: 'Confirmando...',
      correctedValue: 'Valor corrigido',
      correctedPlaceholder: 'ex: 42',
      reresolveReturnBond: 'Re-resolver (devolver bond)',
      reresolve: 'Re-resolver',
      challenger: 'Contestante',
      you: 'você',
      bond: 'bond',
      actionCompleted: 'Ação concluída.',
      actionFailed: 'A ação falhou.',
    },
    es: {
      title: 'Revisión de la resolución',
      reported: 'Reportado',
      threshold: 'Umbral',
      verify: 'Verificar en Open-Meteo ↗',
      challengeWindowOpen: 'Ventana de impugnación abierta',
      challengeWindowDesc:
        'Cualquiera puede impugnar esta resolución depositando un bond.',
      challenged: 'Resolución impugnada',
      challengedDesc:
        'Un usuario depositó un bond impugnando esta resolución. Los claims quedan en pausa hasta que termine la revisión.',
      frozen: 'Resolución congelada',
      frozenDesc:
        'Un guardián marcó esta resolución para revisión. Los claims están en pausa.',
      claimsOpen: 'Revisión completa - claims abiertos',
      claimsOpenDesc:
        'La ventana de impugnación cerró. Los retornos ya se pueden cobrar.',
      challengePrompt:
        '¿Crees que esta resolución está equivocada? Impúgnala depositando un bond. Si tienes razón, recuperas el bond. Si no, va al fondo climático.',
      approveBond: 'Aprobar bond',
      approving: 'Aprobando...',
      challenge: 'Impugnar',
      challenging: 'Impugnando...',
      approvalConfirmed: 'Bond aprobado. Enviando impugnación...',
      challengeSubmitted: 'Impugnación enviada. Esperando confirmación en la red...',
      guardianActions: 'Acciones de guardián',
      freezeResolution: 'Congelar resolución',
      freezing: 'Congelando...',
      confirmReject: 'Confirmar (rechazar impugnación - cortar bond)',
      confirmUnfreeze: 'Confirmar resolución (descongelar)',
      confirming: 'Confirmando...',
      correctedValue: 'Valor corregido',
      correctedPlaceholder: 'ej: 42',
      reresolveReturnBond: 'Re-resolver (devolver bond)',
      reresolve: 'Re-resolver',
      challenger: 'Impugnante',
      you: 'tú',
      bond: 'bond',
      actionCompleted: 'Acción completada.',
      actionFailed: 'La acción falló.',
    },
    fr: {
      title: 'Examen de la résolution',
      reported: 'Rapporté',
      threshold: 'Seuil',
      verify: 'Vérifier sur Open-Meteo ↗',
      challengeWindowOpen: 'Fenêtre de contestation ouverte',
      challengeWindowDesc:
        "N'importe qui peut contester cette résolution en déposant un bond.",
      challenged: 'Résolution contestée',
      challengedDesc:
        "Un utilisateur a déposé un bond contestant cette résolution. Les claims sont en pause jusqu'à la fin de l'examen.",
      frozen: 'Résolution gelée',
      frozenDesc:
        'Un gardien a signalé cette résolution pour examen. Les claims sont en pause.',
      claimsOpen: 'Examen terminé - claims ouverts',
      claimsOpenDesc:
        'La fenêtre de contestation est passée. Les retours peuvent être collectés.',
      challengePrompt:
        'Tu penses que cette résolution est fausse ? Conteste-la en déposant un bond. Si tu as raison, ton bond est rendu. Sinon, il part au fonds climat.',
      approveBond: 'Approuver le bond',
      approving: 'Approbation...',
      challenge: 'Contester',
      challenging: 'Contestation...',
      approvalConfirmed: 'Bond approuvé. Envoi de la contestation...',
      challengeSubmitted: 'Contestation envoyée. En attente de confirmation on-chain...',
      guardianActions: 'Actions du gardien',
      freezeResolution: 'Geler la résolution',
      freezing: 'Gel en cours...',
      confirmReject: 'Confirmer (rejeter la contestation - slash bond)',
      confirmUnfreeze: 'Confirmer la résolution (dégeler)',
      confirming: 'Confirmation...',
      correctedValue: 'Valeur corrigée',
      correctedPlaceholder: 'ex: 42',
      reresolveReturnBond: 'Re-résoudre (rendre le bond)',
      reresolve: 'Re-résoudre',
      challenger: 'Contesteur',
      you: 'toi',
      bond: 'bond',
      actionCompleted: 'Action effectuée.',
      actionFailed: "L'action a échoué.",
    },
    de: {
      title: 'Resolutions-Prüfung',
      reported: 'Gemeldet',
      threshold: 'Schwelle',
      verify: 'Auf Open-Meteo prüfen ↗',
      challengeWindowOpen: 'Anfechtungs-Fenster offen',
      challengeWindowDesc:
        'Jede:r kann diese Resolution anfechten, indem ein Bond hinterlegt wird.',
      challenged: 'Resolution angefochten',
      challengedDesc:
        'Ein:e Nutzer:in hat ein Bond hinterlegt und diese Resolution angefochten. Claims pausieren bis zum Abschluss der Prüfung.',
      frozen: 'Resolution eingefroren',
      frozenDesc:
        'Ein:e Guardian hat diese Resolution zur Prüfung markiert. Claims sind pausiert.',
      claimsOpen: 'Prüfung abgeschlossen - Claims offen',
      claimsOpenDesc:
        'Das Anfechtungs-Fenster ist beendet. Rückzahlungen können abgeholt werden.',
      challengePrompt:
        'Du denkst, diese Resolution ist falsch? Fechte sie mit einem Bond an. Wenn du Recht hast, bekommst du dein Bond zurück. Wenn nicht, geht es in den Klimafonds.',
      approveBond: 'Bond freigeben',
      approving: 'Freigabe...',
      challenge: 'Anfechten',
      challenging: 'Anfechtung...',
      approvalConfirmed: 'Bond freigegeben. Anfechtung wird gesendet...',
      challengeSubmitted: 'Anfechtung gesendet. Warte auf Bestätigung auf der Chain...',
      guardianActions: 'Guardian-Aktionen',
      freezeResolution: 'Resolution einfrieren',
      freezing: 'Einfrieren...',
      confirmReject: 'Bestätigen (Anfechtung ablehnen - Bond slashen)',
      confirmUnfreeze: 'Resolution bestätigen (auftauen)',
      confirming: 'Bestätigung...',
      correctedValue: 'Korrigierter Wert',
      correctedPlaceholder: 'z. B. 42',
      reresolveReturnBond: 'Neu auflösen (Bond zurück)',
      reresolve: 'Neu auflösen',
      challenger: 'Anfechter:in',
      you: 'du',
      bond: 'bond',
      actionCompleted: 'Aktion abgeschlossen.',
      actionFailed: 'Aktion fehlgeschlagen.',
    },
    zh: {
      title: '结算审查',
      reported: '已报告',
      threshold: '阈值',
      verify: '在 Open-Meteo 上验证 ↗',
      challengeWindowOpen: '异议窗口开放中',
      challengeWindowDesc: '任何人都可以通过缴纳保证金对此结算提出异议。',
      challenged: '结算已被异议',
      challengedDesc: '有用户缴纳保证金对此结算提出异议。在审查完成前 claims 暂停。',
      frozen: '结算已冻结',
      frozenDesc: '一位守护者已将此结算标记为待审查。Claims 已暂停。',
      claimsOpen: '审查完成 - Claims 已开放',
      claimsOpenDesc: '异议窗口已结束。收益可以领取了。',
      challengePrompt:
        '认为这个结算有误？缴纳保证金即可发起异议。如果你是对的，保证金会退回。如果错了，保证金将进入气候基金。',
      approveBond: '批准保证金',
      approving: '批准中...',
      challenge: '提出异议',
      challenging: '提出异议中...',
      approvalConfirmed: '保证金已批准，正在提交异议...',
      challengeSubmitted: '异议已提交，等待链上确认...',
      guardianActions: '守护者操作',
      freezeResolution: '冻结结算',
      freezing: '冻结中...',
      confirmReject: '确认（驳回异议 - 没收保证金）',
      confirmUnfreeze: '确认结算（解冻）',
      confirming: '确认中...',
      correctedValue: '修正后的值',
      correctedPlaceholder: '例如 42',
      reresolveReturnBond: '重新结算（退还保证金）',
      reresolve: '重新结算',
      challenger: '异议人',
      you: '你',
      bond: '保证金',
      actionCompleted: '操作已完成。',
      actionFailed: '操作失败。',
    },
  };

  return table[language] ?? table.en;
}

export function ChallengeStatusPanel({
  marketId,
  market,
}: {
  marketId: bigint;
  market: {
    resolved: boolean;
    cancelled: boolean;
    marketTypeId?: number;
    lat?: number;
    lon?: number;
    startTime?: number;
    endTime?: number;
    actualValue?: number | null;
    thresholdValue?: number;
    unit?: string;
  };
}) {
  const { C, fonts, neu, R } = useColors();
  const { language } = useTranslation();
  const { system } = useUnits();
  const copy = panelCopy(language);
  const queryClient = useQueryClient();

  const { address } = useAccount();
  const [now, setNow] = useState(Math.floor(Date.now() / 1000));
  const [correctedValue, setCorrectedValue] = useState('');
  const [phase, setPhase] = useState<ChallengeFlowPhase>('idle');
  const [handledHash, setHandledHash] = useState<`0x${string}` | undefined>(undefined);

  useEffect(() => {
    const timer = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(timer);
  }, []);

  const { data: resolvedAtRaw } = useReadContract({
    address: CONTRACTS.CLIMATE_ORACLE,
    abi: climateOracleAbi,
    functionName: 'resolvedAt',
    args: [marketId],
    query: { enabled: market.resolved, refetchInterval: 10000 },
  });

  const { data: isFrozen, refetch: refetchFrozen } = useReadContract({
    address: CONTRACTS.CLIMATE_ORACLE,
    abi: climateOracleAbi,
    functionName: 'frozen',
    args: [marketId],
    query: { enabled: market.resolved, refetchInterval: 10000 },
  });

  const { data: challengeWindowRaw } = useReadContract({
    address: CONTRACTS.CLIMATE_ORACLE,
    abi: climateOracleAbi,
    functionName: 'CHALLENGE_WINDOW',
    query: { enabled: market.resolved },
  });

  const { data: challengeBondRaw } = useReadContract({
    address: CONTRACTS.CLIMATE_ORACLE,
    abi: climateOracleAbi,
    functionName: 'CHALLENGE_BOND',
    query: { enabled: market.resolved },
  });

  const { data: challengerAddr, refetch: refetchChallenger } = useReadContract({
    address: CONTRACTS.CLIMATE_ORACLE,
    abi: climateOracleAbi,
    functionName: 'challenger',
    args: [marketId],
    query: { enabled: market.resolved, refetchInterval: 10000 },
  });

  const { data: guardianAddr } = useReadContract({
    address: CONTRACTS.CLIMATE_ORACLE,
    abi: climateOracleAbi,
    functionName: 'guardian',
  });

  const { data: operatorAddr } = useReadContract({
    address: CONTRACTS.CLIMATE_ORACLE,
    abi: climateOracleAbi,
    functionName: 'operator',
  });

  const { data: allowanceRaw, refetch: refetchAllowance } = useReadContract({
    address: CONTRACTS.USDC,
    abi: usdcAbi,
    functionName: 'allowance',
    args: address ? [address, CONTRACTS.CLIMATE_ORACLE] : undefined,
    query: { enabled: !!address },
  });

  const {
    writeContract,
    data: txHash,
    isPending,
    error: writeError,
    reset,
  } = useWriteContract();

  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash: txHash,
    query: { enabled: !!txHash },
  });

  useEffect(() => {
    if (!isSuccess || !txHash || handledHash === txHash) return;

    setHandledHash(txHash);
    void queryClient.invalidateQueries();
    void refetchFrozen();
    void refetchChallenger();
    void refetchAllowance();

    if (phase === 'approving') {
      setPhase('challenging');
      writeContract({
        address: CONTRACTS.CLIMATE_ORACLE,
        abi: climateOracleAbi,
        functionName: 'challengeResolution',
        args: [marketId],
      });
      return;
    }

    if (phase === 'challenging') {
      setPhase('success');
      const t = setTimeout(() => {
        setPhase('idle');
        setHandledHash(undefined);
        reset();
      }, 3000);
      return () => clearTimeout(t);
    }
  }, [
    isSuccess,
    txHash,
    handledHash,
    queryClient,
    refetchFrozen,
    refetchChallenger,
    refetchAllowance,
    phase,
    writeContract,
    marketId,
    reset,
  ]);

  useEffect(() => {
    if (!writeError) return;
    setPhase('idle');
    setHandledHash(undefined);
  }, [writeError]);

  const resolvedAt = resolvedAtRaw ? Number(resolvedAtRaw) : 0;
  const challengeWindow = challengeWindowRaw ? Number(challengeWindowRaw) : 7200;
  const challengeBond = challengeBondRaw
    ? (challengeBondRaw as bigint)
    : 50n * 10n ** 18n;

  const bondValue = Number(formatUnits(challengeBond, USDM_DECIMALS));
  const windowEnd = resolvedAt + challengeWindow;
  const secondsLeft = Math.max(0, windowEnd - now);
  const frozen = isFrozen === true;

  const hasChallenger =
    !!challengerAddr &&
    challengerAddr !== '0x0000000000000000000000000000000000000000';

  const allowance = allowanceRaw ? (allowanceRaw as bigint) : 0n;
  const needsApproval = allowance < challengeBond;

  let state: ChallengeState = 'not-resolved';
  if (market.resolved && resolvedAt > 0) {
    if (frozen && hasChallenger) state = 'challenged';
    else if (frozen) state = 'frozen';
    else if (now < windowEnd) state = 'window-open';
    else state = 'claims-open';
  }

  const isGuardian =
    !!address &&
    !!guardianAddr &&
    address.toLowerCase() === (guardianAddr as string).toLowerCase();

  const isOperator =
    !!address &&
    !!operatorAddr &&
    address.toLowerCase() === (operatorAddr as string).toLowerCase();

  const isUserChallenger =
    !!address &&
    !!challengerAddr &&
    address.toLowerCase() === (challengerAddr as string).toLowerCase();

  const verifyUrl = useMemo(() => {
    if (
      market.lat == null ||
      market.lon == null ||
      !market.startTime ||
      !market.endTime
    ) {
      return null;
    }

    return buildOpenMeteoUrl(
      market.lat,
      market.lon,
      market.marketTypeId ?? MARKET_TYPES.RAIN,
      market.startTime,
      market.endTime
    );
  }, [market]);

  if (!market.resolved || market.cancelled) return null;

  const formatTime = (secs: number) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    if (h > 0) return `${h}h ${m}m ${s}s`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  };

  const busy = isPending || isConfirming || phase === 'approving' || phase === 'challenging';
  const thresholdDisplay = formatThresholdDisplay(
    market.marketTypeId ?? MARKET_TYPES.RAIN,
    market.thresholdValue,
    market.unit,
    language,
    system
  );

  function handleApproveForChallenge() {
    setPhase('approving');
    setHandledHash(undefined);
    writeContract({
      address: CONTRACTS.USDC,
      abi: usdcAbi,
      functionName: 'approve',
      args: [CONTRACTS.CLIMATE_ORACLE, challengeBond],
    });
  }

  function handleChallenge() {
    setPhase('challenging');
    setHandledHash(undefined);
    writeContract({
      address: CONTRACTS.CLIMATE_ORACLE,
      abi: climateOracleAbi,
      functionName: 'challengeResolution',
      args: [marketId],
    });
  }

  function handleFreeze() {
    writeContract({
      address: CONTRACTS.CLIMATE_ORACLE,
      abi: climateOracleAbi,
      functionName: 'freezeResolution',
      args: [marketId],
    });
  }

  function handleConfirm() {
    writeContract({
      address: CONTRACTS.CLIMATE_ORACLE,
      abi: climateOracleAbi,
      functionName: 'confirmResolution',
      args: [marketId],
    });
  }

  function handleReResolve() {
    const val = parseInt(correctedValue, 10);
    if (Number.isNaN(val) || val < 0) return;

    writeContract({
      address: CONTRACTS.CLIMATE_ORACLE,
      abi: climateOracleAbi,
      functionName: 'reResolve',
      args: [marketId, BigInt(val)],
    });
  }

  return (
    <div
      style={{
        ...neu.controlPressed,
        borderRadius: R.lg,
        padding: '14px 16px',
        display: 'grid',
        gap: 10,
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
        }}
      >
        {copy.title}
      </div>

      {state === 'window-open' ? (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <div>
            <div
              style={{
                fontFamily: fonts.sans,
                fontSize: 14,
                fontWeight: 600,
                color: C.accent,
              }}
            >
              {copy.challengeWindowOpen}
            </div>
            <div
              style={{
                fontFamily: fonts.sans,
                fontSize: 13,
                color: C.textSoft,
                marginTop: 2,
              }}
            >
              {copy.challengeWindowDesc} {bondValue} USDC.
            </div>
          </div>
          <div
            style={{
              fontFamily: fonts.mono,
              fontSize: 18,
              fontWeight: 700,
              color: C.accent,
              minWidth: 90,
              textAlign: 'right',
            }}
          >
            {formatTime(secondsLeft)}
          </div>
        </div>
      ) : state === 'challenged' ? (
        <StatusBox
          color={C.below}
          title={copy.challenged}
          desc={`${copy.challengedDesc} ${bondValue} USDC.`}
          fonts={fonts}
          C={C}
          R={R}
        />
      ) : state === 'frozen' ? (
        <StatusBox
          color={C.below}
          title={copy.frozen}
          desc={copy.frozenDesc}
          fonts={fonts}
          C={C}
          R={R}
        />
      ) : state === 'claims-open' ? (
        <StatusBox
          color={C.above}
          title={copy.claimsOpen}
          desc={copy.claimsOpenDesc}
          fonts={fonts}
          C={C}
          R={R}
        />
      ) : null}

      {market.actualValue != null ? (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            gap: 12,
          }}
        >
          <div>
            <span
              style={{
                fontFamily: fonts.mono,
                fontSize: 10,
                color: C.textMuted,
                letterSpacing: 1,
                textTransform: 'uppercase',
              }}
            >
              {copy.reported}
            </span>
            <div
              style={{
                fontFamily: fonts.sans,
                fontSize: 16,
                fontWeight: 700,
                color: C.text,
                marginTop: 2,
              }}
            >
              {market.actualValue}
              {market.unit ?? ''}
            </div>
          </div>

          <div style={{ textAlign: 'right' }}>
            <span
              style={{
                fontFamily: fonts.mono,
                fontSize: 10,
                color: C.textMuted,
                letterSpacing: 1,
                textTransform: 'uppercase',
              }}
            >
              {copy.threshold}
            </span>
            <div
              style={{
                fontFamily: fonts.mono,
                fontSize: 14,
                fontWeight: 600,
                color: C.textSoft,
                marginTop: 2,
              }}
            >
              {thresholdDisplay}
            </div>
          </div>
        </div>
      ) : null}

      {verifyUrl ? (
        <a
          href={verifyUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'block',
            padding: '10px 14px',
            borderRadius: R.sm,
            background: C.surfaceDeep,
            fontFamily: fonts.sans,
            fontSize: 13,
            fontWeight: 600,
            color: C.accent,
            textDecoration: 'none',
            textAlign: 'center',
          }}
        >
          {copy.verify}
        </a>
      ) : null}

      {hasChallenger ? (
        <div
          style={{
            fontFamily: fonts.mono,
            fontSize: 11,
            color: C.textMuted,
          }}
        >
          {copy.challenger}: {(challengerAddr as string).slice(0, 6)}...
          {(challengerAddr as string).slice(-4)}
          {isUserChallenger ? ` (${copy.you})` : ''}
          {' · '}
          {bondValue} USDC {copy.bond}
        </div>
      ) : null}

      {state === 'window-open' && address && !isGuardian ? (
        <div
          style={{
            padding: '10px 12px',
            borderRadius: R.sm,
            background: `${C.accent}08`,
            border: `1px solid ${C.accent}18`,
          }}
        >
          <div
            style={{
              fontFamily: fonts.sans,
              fontSize: 13,
              color: C.textSoft,
              marginBottom: 8,
              lineHeight: 1.45,
            }}
          >
            {phase === 'challenging'
              ? copy.challengeSubmitted
              : phase === 'approving' && (isConfirming || isPending)
                ? copy.approvalConfirmed
                : `${copy.challengePrompt} ${bondValue} USDC.`}
          </div>

          {needsApproval ? (
            <button
              onClick={handleApproveForChallenge}
              disabled={busy}
              style={actionBtn(C, fonts, R)}
            >
              {phase === 'challenging'
                ? copy.challenging
                : busy
                  ? copy.approving
                  : `${copy.approveBond} ${bondValue} USDC`}
            </button>
          ) : (
            <button
              onClick={handleChallenge}
              disabled={busy}
              style={{
                ...actionBtn(C, fonts, R),
                background: C.below,
                color: '#FFFDF8',
              }}
            >
              {busy ? copy.challenging : `${copy.challenge} · ${bondValue} USDC`}
            </button>
          )}
        </div>
      ) : null}

      {(isGuardian || isOperator) &&
      (state === 'window-open' || state === 'challenged' || state === 'frozen') ? (
        <div
          style={{
            padding: '12px 14px',
            borderRadius: R.sm,
            background: `${C.accent}08`,
            border: `1px solid ${C.accent}20`,
          }}
        >
          <div
            style={{
              fontFamily: fonts.mono,
              fontSize: 9,
              fontWeight: 700,
              color: C.accent,
              letterSpacing: 1.4,
              textTransform: 'uppercase',
              marginBottom: 10,
            }}
          >
            {copy.guardianActions}
          </div>

          <div style={{ display: 'grid', gap: 8 }}>
            {state === 'window-open' ? (
              <button
                onClick={handleFreeze}
                disabled={busy}
                style={actionBtn(C, fonts, R)}
              >
                {busy ? copy.freezing : copy.freezeResolution}
              </button>
            ) : null}

            {(state === 'challenged' || state === 'frozen') ? (
              <>
                <button
                  onClick={handleConfirm}
                  disabled={busy}
                  style={{
                    ...actionBtn(C, fonts, R),
                    background: C.above,
                    color: '#FFFDF8',
                  }}
                >
                  {busy
                    ? copy.confirming
                    : hasChallenger
                      ? copy.confirmReject
                      : copy.confirmUnfreeze}
                </button>

                <div
                  style={{
                    display: 'flex',
                    gap: 8,
                    alignItems: 'flex-end',
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div
                      style={{
                        fontFamily: fonts.mono,
                        fontSize: 10,
                        color: C.textMuted,
                        marginBottom: 4,
                      }}
                    >
                      {copy.correctedValue}
                    </div>
                    <input
                      id="challenge-corrected-value"
                      name="corrected-value"
                      value={correctedValue}
                      onChange={(e) => setCorrectedValue(e.target.value)}
                      placeholder={copy.correctedPlaceholder}
                      inputMode="numeric"
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        borderRadius: R.sm,
                        border: `1px solid ${C.divider}`,
                        background: C.surfaceHigh,
                        fontFamily: fonts.mono,
                        fontSize: 14,
                        color: C.text,
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>

                  <button
                    onClick={handleReResolve}
                    disabled={busy || !correctedValue}
                    style={{
                      ...actionBtn(C, fonts, R),
                      background: C.below,
                      color: '#FFFDF8',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {hasChallenger ? copy.reresolveReturnBond : copy.reresolve}
                  </button>
                </div>
              </>
            ) : null}
          </div>
        </div>
      ) : null}

      {phase === 'success' ? (
        <div
          style={{
            fontFamily: fonts.sans,
            fontSize: 13,
            color: C.above,
          }}
        >
          {copy.actionCompleted}
        </div>
      ) : null}

      {writeError ? (
        <WalletErrorPanel error={writeError} onAfterReset={reset} compact />
      ) : null}
    </div>
  );
}

function StatusBox({
  color,
  title,
  desc,
  fonts,
  C,
  R,
}: {
  color: string;
  title: string;
  desc: string;
  fonts: any;
  C: any;
  R: any;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 8,
        padding: '10px 12px',
        borderRadius: R.sm,
        background: `${color}10`,
        border: `1px solid ${color}20`,
      }}
    >
      <div>
        <div
          style={{
            fontFamily: fonts.sans,
            fontSize: 14,
            fontWeight: 700,
            color,
          }}
        >
          {title}
        </div>
        <div
          style={{
            fontFamily: fonts.sans,
            fontSize: 13,
            color: C.textSoft,
            marginTop: 2,
            lineHeight: 1.45,
          }}
        >
          {desc}
        </div>
      </div>
    </div>
  );
}

function buildOpenMeteoUrl(
  lat: number,
  lon: number,
  marketTypeId: number,
  startTime: number,
  endTime: number
): string {
  const s = new Date(startTime * 1000);
  const e = new Date(endTime * 1000);

  const fmt = (d: Date) =>
    `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(
      d.getUTCDate()
    ).padStart(2, '0')}`;

  const field =
    marketTypeId === MARKET_TYPES.RAIN ||
    marketTypeId === MARKET_TYPES.DRY_STRETCH ||
    marketTypeId === MARKET_TYPES.HEAVY_RAIN
      ? 'precipitation_sum'
      : marketTypeId === MARKET_TYPES.TEMP_LOW
        || marketTypeId === MARKET_TYPES.COLD_SPELL
        || marketTypeId === MARKET_TYPES.FROST_RISK
        ? 'temperature_2m_min'
        : marketTypeId === MARKET_TYPES.SNOW
          ? 'snowfall_sum'
          : 'temperature_2m_max';

  return `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${fmt(s)}&end_date=${fmt(e)}&daily=${field}&timezone=UTC`;
}

function formatThresholdDisplay(
  marketTypeId: number,
  thresholdValue?: number,
  unit?: string,
  language: string = 'en',
  system: UnitSystem = 'metric'
) {
  const tr = (m: Record<string, string>) => m[language] ?? m.en;
  if (marketTypeId === MARKET_TYPES.HEAVY_RAIN) {
    const v = thresholdPrecip(thresholdValue ?? 0, system);
    return thresholdValue != null && thresholdValue < 9000
      ? tr({ en: `${v} in one day`, pt: `${v} em um dia`, es: `${v} en un día`, fr: `${v} en un jour`, de: `${v} an einem Tag`, zh: `一天 ${v}` })
      : tr({ en: 'Well above the usual wettest day', pt: 'Bem acima do dia mais chuvoso habitual', es: 'Muy por encima del día más lluvioso habitual', fr: 'Bien au-dessus du jour le plus pluvieux habituel', de: 'Weit über dem üblichen nassesten Tag', zh: '远高于通常最多雨的一天' });
  }
  if (marketTypeId === MARKET_TYPES.DRY_STRETCH) {
    const v = thresholdPrecip(thresholdValue ?? 1, system);
    return tr({ en: `Dry day: ≤${v} rain`, pt: `Dia seco: ≤${v} de chuva`, es: `Día seco: ≤${v} de lluvia`, fr: `Jour sec : ≤${v} de pluie`, de: `Trockener Tag: ≤${v} Regen`, zh: `干燥日：≤${v} 降雨` });
  }
  if (marketTypeId === MARKET_TYPES.COLD_SPELL) {
    return thresholdTemp(decodeColdLine(thresholdValue ?? 9_901), system);
  }
  if (marketTypeId === MARKET_TYPES.FROST_RISK) {
    const frost = thresholdTemp(2, system);
    return tr({ en: `Below ${frost}`, pt: `Abaixo de ${frost}`, es: `Por debajo de ${frost}`, fr: `En dessous de ${frost}`, de: `Unter ${frost}`, zh: `低于 ${frost}` });
  }
  if (thresholdValue == null) return `—${unit ?? ''}`;
  return formatThreshold(thresholdValue, unit, system);
}

function actionBtn(C: any, fonts: any, R: any): React.CSSProperties {
  return {
    width: '100%',
    padding: '12px 16px',
    borderRadius: R.sm,
    border: 'none',
    background: C.dark,
    color: '#FFFDF8',
    fontFamily: fonts.sans,
    fontSize: 14,
    fontWeight: 700,
    cursor: 'pointer',
  };
}
