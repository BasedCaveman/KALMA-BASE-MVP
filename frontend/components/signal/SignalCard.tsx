// kalma/frontend/components/signal/SignalCard.tsx
//
// Renders one local-signal card from a composed SignalCard payload
// (see lib/signal-engine/composer.ts). The card is observational +
// calibrated — never a forecast certainty and never a market CTA:
//
//   1. Severity pill (Extreme / High / Medium / Low / Active / Strong)
//   2. Title    — what is happening, factually
//   3. Body     — observation with anchored numbers, interpolated from
//                 structured_data via the {{token}} system
//   4. Affected groups — who is likely to care (chip row)
//   5. Attribution — "Generated through Kalma local signal infrastructure"
//
// The optional `placeLabel` slot puts the city above the title for the
// home-page nearby surface; on /places/[slug] we hide it because the
// whole page is already that one place.

'use client';

import Link from 'next/link';
import { useColors } from '@/hooks/useColors';
import { useTranslation } from '@/hooks/useTranslation';
import {
  resolveSignalString,
  marketContextCopy,
  type Locale,
} from '@/lib/signal-engine/i18n';
import type { CommodityContextEvent } from '@/lib/signal-engine/commodity-context';
import {
  severityMeta,
  type SignalCard as SignalCardPayload,
} from '@/lib/signal-engine/composer';
import { getSignalComparison } from '@/lib/signal-engine/comparison';
import { localizeCountry } from '@/lib/place-format';
import { getSignalChartData } from '@/lib/signal-engine/chart-data';
import SignalContextChart from '@/components/signal/SignalContextChart';
import SignalActionCTA from '@/components/signal/SignalActionCTA';
import ShareButton from '@/components/shared/ShareButton';
import { filterAffectedGroups } from '@/lib/signal-engine/place-aware-groups';
import { groupLabel } from '@/lib/signal-engine/group-labels';

type Props = {
  signal: SignalCardPayload & {
    place: {
      slug: string;
      name: string;
      region: string | null;
      country: string;
      lat: number;
      lon: number;
      /** Verified activity groups from place_activity_profiles. When
       *  provided, evidence-based chip filtering replaces the latitude
       *  heuristics. Optional — most list views don't fetch profiles. */
      activityGroups?: string[] | null;
      /** Activity groups confirmed by community field observations
       *  (place_community_activity). Additive: keeps a chip the article
       *  or the latitude band would have dropped, never removes one. */
      communityGroups?: string[] | null;
    };
  };
  /** Show "Brasília, Minas Gerais, Brazil" above the title. Home only. */
  showPlace?: boolean;
  /** Active commodity market events already routed to this signal's place
   *  (see eventsForProfile in lib/signal-engine/commodity-context.ts).
   *  Optional — only the place page wires this in today. A coffee price
   *  spike renders as one labeled line, never as advice. */
  marketContext?: CommodityContextEvent[];
};

function riskVisualForSignal(
  signalTypeId: string,
  C: Record<string, string>
): { icon: string; accent: string; tint: string; rail: string } {
  if (
    ['rainfall_risk_rising', 'heavy_rain_event', 'water_recovery_signal'].includes(signalTypeId)
  ) {
    return {
      icon: '~',
      accent: '#7EB4E6',
      tint: 'rgba(126, 180, 230, 0.12)',
      rail: 'rgba(126, 180, 230, 0.6)',
    };
  }

  if (signalTypeId === 'dry_stretch_window') {
    return {
      icon: '=',
      accent: '#D8AF63',
      tint: 'rgba(216, 175, 99, 0.12)',
      rail: 'rgba(216, 175, 99, 0.62)',
    };
  }

  if (signalTypeId === 'heat_stress_window') {
    return {
      icon: '+',
      accent: '#E18D78',
      tint: 'rgba(225, 141, 120, 0.12)',
      rail: 'rgba(225, 141, 120, 0.62)',
    };
  }

  if (['consecutive_cold_below', 'frost_risk'].includes(signalTypeId)) {
    return {
      icon: '*',
      accent: '#A8A3E8',
      tint: 'rgba(168, 163, 232, 0.12)',
      rail: 'rgba(168, 163, 232, 0.6)',
    };
  }

  if (signalTypeId === 'snow') {
    return {
      icon: 'o',
      accent: '#B8D9F0',
      tint: 'rgba(184, 217, 240, 0.12)',
      rail: 'rgba(184, 217, 240, 0.6)',
    };
  }

  return {
    icon: '·',
    accent: C.accent,
    tint: `${C.accent}10`,
    rail: `${C.accent}66`,
  };
}

// Map severity tone → palette role. Returns { border, bg, fg } colors.
function toneToColors(
  tone: string,
  C: Record<string, string>
): { border: string; bg: string; fg: string } {
  switch (tone) {
    case 'critical':
      return { border: `${C.below}66`, bg: `${C.below}14`, fg: C.below };
    case 'warning':
      return { border: `${C.below}44`, bg: `${C.below}10`, fg: C.below };
    case 'caution':
      return { border: `${C.label}55`, bg: `${C.label}14`, fg: C.label };
    case 'positive':
      return { border: `${C.above}44`, bg: `${C.above}10`, fg: C.above };
    case 'positive_strong':
      return { border: `${C.above}66`, bg: `${C.above}14`, fg: C.above };
    case 'info':
    default:
      return { border: `${C.divider}`, bg: 'transparent', fg: C.textSoft };
  }
}

function layerLinkCopy(language: string) {
  const table: Record<string, string> = {
    en: 'See cloud / heat / storm layers',
    pt: 'Ver camadas de nuvens / calor / tempestade',
    es: 'Ver capas de nubes / calor / tormenta',
    fr: 'Voir les couches nuages / chaleur / orage',
    de: 'Wolken- / Hitze- / Gewitterlagen ansehen',
    zh: '查看云量 / 高温 / 风暴图层',
  };
  return table[language] ?? table.en;
}

export function SignalCard({ signal, showPlace = false, marketContext }: Props) {
  const { C, fonts, neu, R } = useColors();
  const { language } = useTranslation();
  const locale = (language ?? 'en') as Locale;

  const meta = severityMeta(signal.severity);
  const tone = toneToColors(meta.tone, C);
  const riskVisual = riskVisualForSignal(signal.signalTypeId, C);

  const title = resolveSignalString(locale, signal.titleKey);
  const body = resolveSignalString(locale, signal.bodyKey, signal.bodyValues);

  // Layer-2 support pair: "Usual X · Now Y" — gives the prose its
  // credibility numbers without resorting to percentile language.
  const comparison = getSignalComparison(signal.signalTypeId, signal.bodyValues, locale);

  // Layer-2 chart: visualization of the signal's local context.
  //   - percentile signals (rain / heat / water / heavy rain) → band shape
  //   - event signals (cold spell / dry stretch / frost) → run-strip shape
  // shape === null means no chart is appropriate.
  const chart = getSignalChartData(
    signal.signalTypeId,
    signal.bodyValues,
    signal.validFrom ?? null,
    locale,
  );
  const severityLabel = resolveSignalString(locale, meta.labelKey);
  const attribution = resolveSignalString(locale, signal.attributionKey);

  const placeCountry = localizeCountry(signal.place.country, language);
  const placeLine = signal.place.region
    ? `${signal.place.name}, ${signal.place.region}, ${placeCountry}`
    : `${signal.place.name}, ${placeCountry}`;

  // The card holds nested interactive elements (action CTA → /create or
  // /markets/X, share button). To stay valid HTML we render the card as
  // a plain <article> and only wrap the place line + title in a Link
  // pointing to the place page.
  const placeHref = `/places/${signal.place.slug}`;
  const layersHref = `${placeHref}#weather-layers`;

  return (
    <article
      style={{
        ...neu.panelRaised,
        borderRadius: R.xl,
        padding: '16px 18px',
        marginBottom: 12,
        border: `1px solid ${tone.border}`,
        background:
          tone.bg !== 'transparent'
            ? `linear-gradient(180deg, ${riskVisual.tint} 0%, ${tone.bg} 100%)`
            : `linear-gradient(180deg, ${riskVisual.tint} 0%, transparent 100%)`,
        color: 'inherit',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: '12px auto 12px 0',
          width: 4,
          borderRadius: 999,
          background: riskVisual.rail,
          boxShadow: `0 0 18px ${riskVisual.rail}`,
        }}
      />
      {showPlace && (
        <Link
          href={placeHref}
          style={{
            display: 'block',
            textDecoration: 'none',
            fontFamily: fonts.mono,
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: 1.4,
            textTransform: 'uppercase',
            color: C.textMutedStrong,
            marginBottom: 8,
            paddingLeft: 2,
          }}
        >
          {placeLine}
        </Link>
      )}

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginBottom: 8,
            flexWrap: 'wrap',
          }}
        >
          <span
            style={{
              padding: '3px 8px',
              borderRadius: R.pill,
              background: `${tone.fg}22`,
              color: tone.fg,
              fontFamily: fonts.mono,
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: 1.2,
              textTransform: 'uppercase',
            }}
          >
            {severityLabel}
          </span>
          <span
            aria-hidden
            style={{
              width: 24,
              height: 24,
              borderRadius: 999,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: riskVisual.tint,
              color: riskVisual.accent,
              border: `1px solid ${riskVisual.rail}`,
              fontFamily: fonts.mono,
              fontSize: 12,
              fontWeight: 700,
              lineHeight: 1,
              boxShadow: `0 0 14px ${riskVisual.tint}`,
            }}
          >
            {riskVisual.icon}
          </span>
          {signal.confidence > 0 && (
            <span
              style={{
                fontFamily: fonts.mono,
                fontSize: 10,
                color: C.textMuted,
                letterSpacing: 0.6,
              }}
            >
              {Math.round(signal.confidence)}% confidence
            </span>
          )}
        </div>

        <Link
          href={placeHref}
          style={{
            textDecoration: 'none',
            color: 'inherit',
            display: 'block',
          }}
        >
          <h3
            style={{
              margin: 0,
              fontFamily: fonts.display,
              fontSize: 19,
              fontWeight: 600,
              color: C.text,
              lineHeight: 1.3,
              paddingLeft: 2,
            }}
          >
            {title}
          </h3>
        </Link>

        <p
          style={{
            margin: '8px 0 0',
            fontFamily: fonts.sans,
            fontSize: 14,
            lineHeight: 1.5,
            color: C.textSoft,
            paddingLeft: 2,
          }}
        >
          {body}
        </p>

        {/* Layer 2 — context chart. Band for percentile signals,
            run-strip for event signals (cold spell / dry stretch /
            frost). Both ship in SSR'd HTML for AI crawler access. */}
        {chart.shape !== null ? (
          <div style={{ marginTop: 12, color: C.text }}>
            <SignalContextChart data={chart} markerColor={tone.fg} />
          </div>
        ) : null}

        {/* Layer 2 — compact comparison strip. Two numbers, mono font,
            no commentary. Lets the reader anchor the prose ("around
            double the usual") to actual values without reading the
            full body twice. */}
        {comparison ? (
          <div
            style={{
              marginTop: 10,
              display: 'flex',
              gap: 14,
              alignItems: 'baseline',
              flexWrap: 'wrap',
              fontFamily: fonts.mono,
              fontSize: 11,
              color: C.textMuted,
            }}
          >
            <span>
              <span style={{ opacity: 0.65, marginRight: 6 }}>
                {comparison.usualLabel}:
              </span>
              <span style={{ color: C.text, fontWeight: 600 }}>
                {comparison.usualValue}
              </span>
            </span>
            <span style={{ opacity: 0.45 }}>·</span>
            <span>
              <span style={{ opacity: 0.65, marginRight: 6 }}>
                {comparison.nowLabel}:
              </span>
              <span style={{ color: tone.fg, fontWeight: 700 }}>
                {comparison.nowValue}
              </span>
            </span>
          </div>
        ) : null}

        {/* Layer 3 — "Now what?" action CTA. Either deeplinks to the
            existing market for this place+risk+window, or opens /create
            pre-filled. Mounted before the affected-groups chips so it
            sits as a clear call-to-action when the reader is most
            engaged with the signal. */}
        <SignalActionCTA
          signal={{
            signalTypeId: signal.signalTypeId,
            validFrom: signal.validFrom,
            validUntil: signal.validUntil,
            place: {
              name: signal.place.name,
              lat: signal.place.lat,
              lon: signal.place.lon,
            },
          }}
        />

        <Link
          href={layersHref}
          style={{
            marginTop: 10,
            display: 'inline-flex',
            alignItems: 'center',
            minHeight: 32,
            padding: '6px 10px',
            borderRadius: R.md,
            border: `1px solid ${C.divider}`,
            background: C.surfaceSoft,
            color: C.accent,
            fontFamily: fonts.sans,
            fontSize: 12,
            fontWeight: 800,
            textDecoration: 'none',
          }}
        >
          {layerLinkCopy(language)}
        </Link>

        {(() => {
          // Place-aware filter — drops groups whose geography doesn't
          // fit (e.g. coffee_growers outside the tropical belt), unless
          // the community has reported the activity, which outranks both
          // the article and the latitude band. The chip row renders only
          // if at least one plausible group survives; otherwise it hides
          // entirely, which is preferable to misleading chips.
          const placeAwareGroups = filterAffectedGroups(
            signal.affectedGroups,
            {
              lat: signal.place.lat,
              lon: signal.place.lon,
              country: signal.place.country,
              region: signal.place.region,
            },
            signal.place.activityGroups ?? null,
            signal.place.communityGroups ?? null,
          );
          if (placeAwareGroups.length === 0) return null;
          return (
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 6,
              marginTop: 12,
            }}
          >
            {placeAwareGroups.slice(0, 6).map((g) => (
              <span
                key={g}
                style={{
                  padding: '4px 8px',
                  borderRadius: R.pill,
                  background: 'transparent',
                  border: `1px solid ${C.divider}`,
                  color: C.textMuted,
                  fontFamily: fonts.mono,
                  fontSize: 10,
                  letterSpacing: 0.5,
                }}
              >
                {groupLabel(locale, g)}
              </span>
            ))}
          </div>
          );
        })()}

        {marketContext && marketContext.length > 0 ? (
          <div
            style={{
              marginTop: 12,
              padding: '8px 10px',
              borderRadius: R.md,
              border: `1px solid ${C.divider}`,
              background: C.surfaceSoft,
            }}
          >
            <div
              style={{
                fontFamily: fonts.mono,
                fontSize: 9,
                letterSpacing: 0.6,
                textTransform: 'uppercase',
                color: C.textMuted,
                marginBottom: 4,
              }}
            >
              {resolveSignalString(locale, 'signals.market_context.label')}
            </div>
            {marketContext.slice(0, 2).map((ev) => {
              const copy = marketContextCopy(locale, ev);
              if (!copy) return null;
              return (
                <div
                  key={ev.commodity}
                  style={{
                    fontFamily: fonts.sans,
                    fontSize: 12,
                    color: C.textSoft,
                    lineHeight: 1.4,
                  }}
                >
                  {copy}
                  <span style={{ color: C.textMuted }}>
                    {' · '}
                    {resolveSignalString(locale, 'signals.market_context.source')}
                  </span>
                </div>
              );
            })}
          </div>
        ) : null}

        <div
          style={{
            marginTop: 12,
            paddingTop: 10,
            borderTop: `1px solid ${C.divider}`,
            fontFamily: fonts.mono,
            fontSize: 10,
            color: C.textMuted,
            letterSpacing: 0.3,
            display: 'flex',
            justifyContent: 'space-between',
            gap: 8,
          }}
        >
          <span>{attribution}</span>
          {signal.sources.length > 0 && (
            <span style={{ whiteSpace: 'nowrap' }}>
              {signal.sources.join(' · ')}
            </span>
          )}
        </div>

        {/* Share — small affordance so signals become shareable
            artefacts (calm tone, no big CTA). Sits below attribution
            so it doesn't pull focus from the primary action CTA above. */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            marginTop: 10,
          }}
        >
          <ShareButton
            url={`/places/${signal.place.slug}`}
            title={`${signal.place.name} — ${title}`}
            text={attribution}
            size="sm"
          />
        </div>
      </article>
  );
}
