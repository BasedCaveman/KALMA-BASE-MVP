//frontend/components/shared/AppHeader.tsx
'use client';

import { C, fonts, neu, R } from '@/components/design/palette';
import { useTranslation } from '@/hooks/useTranslation';
import { decodeActualValue } from '@/lib/contracts/addresses';

const LIFECYCLE_COPY: Record<string, Record<string, string>> = {
  en: {
    live: 'Live', cooldown: 'Waiting resolution', review: 'In review', resolved: 'Resolved',
    expired: 'Expired', cancelled: 'Cancelled',
    barPredict: 'Answer', barResolve: 'Resolve', barClaim: 'Claim',
    cancelledTitle: 'Cancelled', cancelledBody: 'This market was cancelled.',
    resolvedTitle: 'Resolved', winningSide: 'Winning side:', finalOutcome: 'The weather answered:',
    above: 'Yes', below: 'No', resolvedBody: 'The weather has settled this signal.',
  },
  pt: {
    live: 'Ativo', cooldown: 'Aguardando resolução', review: 'Em revisão', resolved: 'Resolvido',
    expired: 'Expirado', cancelled: 'Cancelado',
    barPredict: 'Responder', barResolve: 'Resolver', barClaim: 'Coletar',
    cancelledTitle: 'Cancelado', cancelledBody: 'Esta janela foi cancelada.',
    resolvedTitle: 'Resolvido', winningSide: 'Lado vencedor:', finalOutcome: 'O tempo respondeu:',
    above: 'Sim', below: 'Não', resolvedBody: 'O tempo encerrou este sinal.',
  },
  es: {
    live: 'Activo', cooldown: 'Esperando resolución', review: 'En revisión', resolved: 'Resuelto',
    expired: 'Expirado', cancelled: 'Cancelado',
    barPredict: 'Responder', barResolve: 'Resolver', barClaim: 'Cobrar',
    cancelledTitle: 'Cancelado', cancelledBody: 'Esta ventana fue cancelada.',
    resolvedTitle: 'Resuelto', winningSide: 'Lado ganador:', finalOutcome: 'El tiempo respondió:',
    above: 'Sí', below: 'No', resolvedBody: 'El tiempo cerró esta señal.',
  },
  fr: {
    live: 'En direct', cooldown: 'En attente de résolution', review: 'En examen', resolved: 'Résolu',
    expired: 'Expiré', cancelled: 'Annulé',
    barPredict: 'Répondre', barResolve: 'Résoudre', barClaim: 'Réclamer',
    cancelledTitle: 'Annulé', cancelledBody: 'Cette fenêtre a été annulée.',
    resolvedTitle: 'Résolu', winningSide: 'Côté gagnant :', finalOutcome: 'La météo a répondu :',
    above: 'Oui', below: 'Non', resolvedBody: 'La météo a tranché ce signal.',
  },
  de: {
    live: 'Live', cooldown: 'Wartet auf Auflösung', review: 'In Prüfung', resolved: 'Aufgelöst',
    expired: 'Abgelaufen', cancelled: 'Abgebrochen',
    barPredict: 'Antworten', barResolve: 'Auflösen', barClaim: 'Abholen',
    cancelledTitle: 'Abgebrochen', cancelledBody: 'Dieses Fenster wurde abgebrochen.',
    resolvedTitle: 'Aufgelöst', winningSide: 'Gewinner-Seite:', finalOutcome: 'Das Wetter hat geantwortet:',
    above: 'Ja', below: 'Nein', resolvedBody: 'Das Wetter hat dieses Signal entschieden.',
  },
  zh: {
    live: '运行中', cooldown: '等待结算', review: '审查中', resolved: '已结算',
    expired: '已过期', cancelled: '已取消',
    barPredict: '回答', barResolve: '结算', barClaim: '领取',
    cancelledTitle: '已取消', cancelledBody: '此窗口已取消。',
    resolvedTitle: '已结算', winningSide: '获胜方：', finalOutcome: '天气给出了答案：',
    above: '是', below: '否', resolvedBody: '天气已为这个信号给出结果。',
  },
};

function lifecycleCopy(language: string) {
  return LIFECYCLE_COPY[language] ?? LIFECYCLE_COPY.en;
}

export type MarketLifecyclePhase =
  | 'live'
  | 'cooldown'
  | 'review'
  | 'resolved'
  | 'expired'
  | 'cancelled';

type MarketLike = {
  startTime?: string | number | Date | null;
  startsAt?: string | number | Date | null;
  resolved?: boolean;
  cancelled?: boolean;
  reviewEndsAt?: string | number | Date | null;
  reviewEnds?: string | number | Date | null;
  endTime?: string | number | Date | null;
  endsAt?: string | number | Date | null;
  uiState?: string | null;
  winningSide?: 'above' | 'below' | boolean | null;
  outcome?: 'above' | 'below' | boolean | null;
  actualValue?: number | null;
  unit?: string | null;
  marketTypeId?: number | null;
  thresholdValue?: number | null;
  [key: string]: unknown;
};

function toMs(value: unknown): number | null {
  if (value == null) return null;

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    return value < 1_000_000_000_000 ? value * 1000 : value;
  }

  if (typeof value === 'string') {
    const asNumber = Number(value);
    if (Number.isFinite(asNumber) && value.trim() !== '') {
      return asNumber < 1_000_000_000_000 ? asNumber * 1000 : asNumber;
    }

    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) ? ms : null;
  }

  return null;
}

export function derivePhase(market: MarketLike): MarketLifecyclePhase {
  if (market.cancelled || market.uiState === 'cancelled') return 'cancelled';
  if (market.resolved || market.uiState === 'resolved') return 'resolved';
  if (market.uiState === 'expired') return 'expired';
  if (market.uiState === 'cooldown') return 'cooldown';
  if (market.uiState === 'live') return 'live';

  const now = Date.now();
  const reviewEndsMs = toMs(market.reviewEndsAt ?? market.reviewEnds);
  const endMs = toMs(market.endTime ?? market.endsAt);

  if (reviewEndsMs && now < reviewEndsMs && endMs && now >= endMs) return 'review';
  if (endMs && now < endMs) return 'live';
  if (endMs && now >= endMs) return 'cooldown';

  return 'live';
}

function getPhaseLabel(
  phase: MarketLifecyclePhase,
  copy: Record<string, string>,
) {
  switch (phase) {
    case 'live':
      return copy.live;
    case 'cooldown':
      return copy.cooldown;
    case 'review':
      return copy.review;
    case 'resolved':
      return copy.resolved;
    case 'expired':
      return copy.expired;
    case 'cancelled':
      return copy.cancelled;
    default:
      return copy.live;
  }
}

function getPhaseColors(phase: MarketLifecyclePhase) {
  switch (phase) {
    case 'live':
      return {
        bg: `${C.accent}18`,
        text: C.accent,
      };
    case 'cooldown':
    case 'review':
      return {
        bg: `${C.textMutedStrong}16`,
        text: C.textMutedStrong,
      };
    case 'resolved':
      return {
        bg: `${C.above}18`,
        text: C.above,
      };
    case 'expired':
    case 'cancelled':
      return {
        bg: `${C.below}14`,
        text: C.below,
      };
    default:
      return {
        bg: `${C.textMutedStrong}16`,
        text: C.textMutedStrong,
      };
  }
}

export function PhaseIndicator({
  phase,
  compact = false,
}: {
  phase: MarketLifecyclePhase;
  compact?: boolean;
}) {
  const { language } = useTranslation();
  const copy = lifecycleCopy(language);
  const colors = getPhaseColors(phase);

  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        borderRadius: 999,
        padding: compact ? '6px 10px' : '7px 12px',
        background: colors.bg,
        color: colors.text,
        fontFamily: fonts.mono,
        fontSize: compact ? 10 : 11,
        fontWeight: 700,
        letterSpacing: 1.2,
        textTransform: 'uppercase',
        whiteSpace: 'nowrap',
      }}
    >
      <span
        style={{
          width: compact ? 6 : 7,
          height: compact ? 6 : 7,
          borderRadius: 999,
          background: colors.text,
          opacity: 0.9,
        }}
      />
      {getPhaseLabel(phase, copy)}
    </div>
  );
}

export function LifecycleBar({
  phase,
  startTime,
  endTime,
}: {
  phase: MarketLifecyclePhase;
  startTime?: string | number | Date | null;
  endTime?: string | number | Date | null;
}) {
  void startTime;
  void endTime;

  const { language } = useTranslation();
  const copy = lifecycleCopy(language);

  const steps: { key: MarketLifecyclePhase | 'claim'; label: string }[] = [
    { key: 'live', label: copy.barPredict },
    { key: 'cooldown', label: copy.barResolve },
    { key: 'resolved', label: copy.barClaim },
  ];

  const activeIndex =
    phase === 'live'
      ? 0
      : phase === 'cooldown' || phase === 'review'
        ? 1
        : phase === 'resolved'
          ? 2
          : phase === 'expired' || phase === 'cancelled'
            ? 2
            : 0;

  return (
    <div
      style={{
        ...neu.controlPressed,
        borderRadius: R.lg,
        padding: '12px 12px 10px',
      }}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 8,
          alignItems: 'center',
        }}
      >
        {steps.map((step, index) => {
          const done = index < activeIndex;
          const active = index === activeIndex;

          return (
            <div
              key={step.key}
              style={{
                display: 'grid',
                gap: 6,
                justifyItems: 'center',
              }}
            >
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 999,
                  display: 'grid',
                  placeItems: 'center',
                  background: active || done ? C.dark : C.surfaceHigh,
                  color: active || done ? '#FFFDF8' : C.textMutedStrong,
                  fontFamily: fonts.mono,
                  fontSize: 11,
                  fontWeight: 700,
                  boxShadow:
                    active || done
                      ? `0 6px 14px ${C.dark}22`
                      : `inset 1px 1px 0 ${C.surfaceHigh}`,
                }}
              >
                {index + 1}
              </div>

              <div
                style={{
                  fontFamily: fonts.sans,
                  fontSize: 12,
                  fontWeight: active ? 700 : 600,
                  color: active ? C.text : C.textSoft,
                  textAlign: 'center',
                }}
              >
                {step.label}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function ResolutionBanner({
  market,
  phase,
}: {
  market: MarketLike;
  phase?: MarketLifecyclePhase;
}) {
  const { language } = useTranslation();
  const copy = lifecycleCopy(language);
  const resolvedPhase = phase ?? derivePhase(market);

  if (resolvedPhase !== 'resolved' && resolvedPhase !== 'cancelled' && resolvedPhase !== 'expired') {
    return null;
  }

  if (resolvedPhase === 'cancelled') {
    return (
      <div style={bannerBase}>
        <div style={bannerEyebrow}>{copy.cancelledTitle}</div>
        <div style={bannerText}>{copy.cancelledBody}</div>
      </div>
    );
  }

  const rawWinningSide = market.winningSide ?? market.outcome ?? null;

  const winningSide =
    rawWinningSide === 'above' || rawWinningSide === true
      ? 'above'
      : rawWinningSide === 'below' || rawWinningSide === false
        ? 'below'
        : null;

  const actualValue =
    typeof market.actualValue === 'number'
      ? `${decodeActualValue(market.marketTypeId, market.actualValue)}${market.unit ?? ''}`
      : null;

  return (
    <div style={bannerBase}>
      <div style={bannerEyebrow}>{copy.resolvedTitle}</div>
      <div style={bannerText}>
        {winningSide ? (
          <>
            {copy.winningSide}{' '}
            <strong>{winningSide === 'above' ? copy.above : copy.below}</strong>
            {actualValue ? (
              <>
                {' '}
                · {copy.finalOutcome} <strong>{actualValue}</strong>
              </>
            ) : null}
          </>
        ) : actualValue ? (
          <>
            {copy.finalOutcome} <strong>{actualValue}</strong>
          </>
        ) : (
          copy.resolvedBody
        )}
      </div>
    </div>
  );
}

const bannerBase: React.CSSProperties = {
  ...neu.controlPressed,
  borderRadius: R.lg,
  padding: '12px 14px',
  display: 'grid',
  gap: 4,
};

const bannerEyebrow: React.CSSProperties = {
  fontFamily: fonts.mono,
  fontSize: 10,
  fontWeight: 700,
  color: C.textMutedStrong,
  letterSpacing: 1.4,
  textTransform: 'uppercase',
};

const bannerText: React.CSSProperties = {
  fontFamily: fonts.sans,
  fontSize: 14,
  color: C.text,
  lineHeight: 1.45,
};
