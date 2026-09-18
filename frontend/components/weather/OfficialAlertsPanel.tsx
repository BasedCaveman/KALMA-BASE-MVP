//kalma/frontend/components/weather/OfficialAlertsPanel.tsx
//
// Official government weather alerts (docs/OFFICIAL_ALERTS_LAYER_2026-07-14.md).
// Reads GET /api/places/[slug]/alerts — CAP alerts (currently INMET/Brazil)
// routed to this exact place by point-in-polygon on its lat/lon.
//
// A distinct kind of truth from forecast layers, weather news, and community
// observations (Golden Rule 8): the official "why should I care?" answer.
// Never rendered as advice — every card carries its own severity, official
// timing window, and source label.
//
// i18n: the event name and numeric summary (rain/wind/temperature/humidity
// thresholds) are fully localized via lib/weather-alerts/alert-copy.ts —
// NOT machine-translated. A mistranslated official warning is a real safety
// risk, so the summary is built from structured fields (event_key, severity,
// numbers extracted from the source text) into a designed sentence per
// language. The raw source-language text (headline/description/areaDesc)
// stays reachable only via the "official source" outbound link — never
// shown as primary card content.
//
// Renders nothing while loading and nothing when there are no active
// alerts — most places have no coverage yet (INMET is Brazil-only), and a
// permanently empty "no official alerts" box on every place page would be
// exactly the kind of filler Golden Rule 9 asks us to avoid.

'use client';

import { useEffect, useState } from 'react';
import { useColors } from '@/hooks/useColors';
import { useTranslation } from '@/hooks/useTranslation';
import { RainIcon, SnowIcon, TempIcon, StormIcon, WindIcon, WarningIcon, ClockIcon } from '@/components/shared/icons';
import { buildAlertSummary, eventLabel } from '@/lib/weather-alerts/alert-copy';

type OfficialAlert = {
  id: string;
  source: string;
  event: string;
  eventKey: string;
  severity: string;
  responseType: string | null;
  headline: string | null;
  description: string | null;
  areaDesc: string | null;
  onset: string | null;
  expires: string;
  link: string | null;
};

const LOCALE_MAP: Record<string, string> = {
  en: 'en-US',
  pt: 'pt-BR',
  es: 'es-ES',
  fr: 'fr-FR',
  de: 'de-DE',
  zh: 'zh-CN',
};

function iconFor(eventKey: string) {
  switch (eventKey) {
    case 'heavy_rain':
      return RainIcon;
    case 'storm':
      return StormIcon;
    case 'high_wind':
    case 'coastal_wind':
      return WindIcon;
    case 'frost':
      return SnowIcon;
    case 'heatwave':
    case 'cold_spell':
      return TempIcon;
    default:
      return WarningIcon;
  }
}

// Severity → palette tone, mirroring SignalCard's critical/warning/caution/
// info mapping so an official alert reads with the same visual grammar as
// the rest of the app's severity language.
function severityTone(severity: string, C: Record<string, string>) {
  switch (severity) {
    case 'Extreme':
      return { border: `${C.below}77`, bg: `${C.below}1c`, fg: C.below };
    case 'Severe':
      return { border: `${C.below}55`, bg: `${C.below}12`, fg: C.below };
    case 'Moderate':
      return { border: `${C.label}55`, bg: `${C.label}14`, fg: C.label };
    default:
      return { border: C.divider, bg: 'transparent', fg: C.textSoft };
  }
}

function panelCopy(language: string) {
  const table: Record<string, Record<string, string>> = {
    en: {
      title: 'Official alert',
      body: 'A government weather warning for this exact place — not a forecast, not news, not community input.',
      prepare: 'Prepare',
      until: 'until',
      source: 'Source',
    },
    pt: {
      title: 'Alerta oficial',
      body: 'Um aviso meteorológico do governo para este lugar exato — não é previsão, notícia ou observação da comunidade.',
      prepare: 'Prepare-se',
      until: 'até',
      source: 'Fonte',
    },
    es: {
      title: 'Alerta oficial',
      body: 'Una alerta meteorológica oficial para este lugar exacto — no es un pronóstico, ni una noticia, ni un aporte comunitario.',
      prepare: 'Prepárate',
      until: 'hasta',
      source: 'Fuente',
    },
    fr: {
      title: 'Alerte officielle',
      body: "Une alerte météo officielle pour cet endroit précis — ni prévision, ni actualité, ni contribution communautaire.",
      prepare: 'Préparez-vous',
      until: "jusqu'à",
      source: 'Source',
    },
    de: {
      title: 'Amtliche Warnung',
      body: 'Eine amtliche Wetterwarnung für genau diesen Ort — keine Vorhersage, keine Nachricht, kein Community-Beitrag.',
      prepare: 'Vorbereiten',
      until: 'bis',
      source: 'Quelle',
    },
    zh: {
      title: '官方预警',
      body: '针对这个具体地点的政府天气预警 —— 不是预报、新闻或社区内容。',
      prepare: '请做好准备',
      until: '至',
      source: '来源',
    },
  };
  return table[language] ?? table.en;
}

const SEVERITY_LABELS: Record<string, Record<string, string>> = {
  Extreme: { en: 'Extreme', pt: 'Extremo', es: 'Extremo', fr: 'Extrême', de: 'Extrem', zh: '极端' },
  Severe: { en: 'Severe', pt: 'Grave', es: 'Grave', fr: 'Sévère', de: 'Schwer', zh: '严重' },
  Moderate: { en: 'Moderate', pt: 'Moderado', es: 'Moderado', fr: 'Modéré', de: 'Mäßig', zh: '中等' },
  Minor: { en: 'Minor', pt: 'Baixo', es: 'Bajo', fr: 'Mineur', de: 'Gering', zh: '轻微' },
};

function severityLabel(severity: string, language: string): string {
  return SEVERITY_LABELS[severity]?.[language] ?? SEVERITY_LABELS[severity]?.en ?? severity;
}

function formatWindow(onset: string | null, expires: string, language: string, until: string): string {
  const locale = LOCALE_MAP[language] ?? 'en-US';
  const fmt = new Intl.DateTimeFormat(locale, { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  const end = fmt.format(new Date(expires));
  if (!onset) return `${until} ${end}`;
  return `${fmt.format(new Date(onset))} – ${end}`;
}

export default function OfficialAlertsPanel({ slug }: { slug: string }) {
  const { C, fonts, neu, R } = useColors();
  const { language } = useTranslation();
  const copy = panelCopy(language);

  const [alerts, setAlerts] = useState<OfficialAlert[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/places/${slug}/alerts`, { headers: { accept: 'application/json' } });
        if (!res.ok) return;
        const json = await res.json();
        if (!cancelled) setAlerts(Array.isArray(json.alerts) ? json.alerts : []);
      } catch {
        // Silent: this panel simply doesn't render when the fetch fails.
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (alerts.length === 0) return null;

  return (
    <section
      style={{
        ...neu.panelRaised,
        borderRadius: R.xl,
        padding: '16px',
        marginBottom: 24,
        display: 'grid',
        gap: 14,
      }}
    >
      <div style={{ display: 'grid', gap: 6 }}>
        <div
          style={{
            fontFamily: fonts.mono,
            fontSize: 11,
            fontWeight: 800,
            letterSpacing: 1.3,
            textTransform: 'uppercase',
            color: C.textMutedStrong,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <WarningIcon size={13} color={C.textMutedStrong} />
          {copy.title}
          {alerts.length > 1 ? (
            <span
              style={{
                ...neu.subtle,
                borderRadius: 999,
                padding: '1px 8px',
                fontSize: 10,
                fontWeight: 700,
                color: C.textMuted,
              }}
            >
              {alerts.length}
            </span>
          ) : null}
        </div>
        <div style={{ fontFamily: fonts.sans, fontSize: 14, lineHeight: 1.5, color: C.textMuted }}>
          {copy.body}
        </div>
      </div>

      <div style={{ display: 'grid', gap: 10 }}>
        {alerts.map((alert) => {
          const tone = severityTone(alert.severity, C);
          const Icon = iconFor(alert.eventKey);
          const card = (
            <div
              style={{
                borderRadius: R.lg,
                border: `1px solid ${tone.border}`,
                background: tone.bg,
                padding: '12px 13px',
                display: 'grid',
                gap: 8,
                minWidth: 0,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div
                  style={{
                    flexShrink: 0,
                    width: 30,
                    height: 30,
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: `${tone.fg}1c`,
                    color: tone.fg,
                  }}
                >
                  <Icon size={16} color={tone.fg} />
                </div>
                <div style={{ display: 'grid', gap: 2, minWidth: 0, flex: 1 }}>
                  <div style={{ fontFamily: fonts.sans, fontSize: 14, fontWeight: 700, color: C.text, lineHeight: 1.3 }}>
                    {eventLabel(alert.eventKey, alert.event, language)}
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      fontFamily: fonts.mono,
                      fontSize: 10.5,
                      color: tone.fg,
                      fontWeight: 700,
                      letterSpacing: 0.3,
                      textTransform: 'uppercase',
                    }}
                  >
                    {severityLabel(alert.severity, language)}
                    {alert.responseType?.toLowerCase() === 'prepare' && (
                      <>
                        <span style={{ color: C.divider }}>·</span>
                        {copy.prepare}
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div
                style={{
                  fontFamily: fonts.sans,
                  fontSize: 12.5,
                  color: C.textSoft,
                  lineHeight: 1.45,
                }}
              >
                {alert.description
                  ? buildAlertSummary(alert.eventKey, alert.description, language)
                  : severityLabel(alert.severity, language)}
              </div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  fontFamily: fonts.mono,
                  fontSize: 10,
                  color: C.textMuted,
                  letterSpacing: 0.3,
                }}
              >
                <ClockIcon size={11} color={C.textMuted} />
                {formatWindow(alert.onset, alert.expires, language, copy.until)}
                {alert.source ? (
                  <>
                    <span style={{ color: C.divider }}>·</span>
                    {copy.source}: {alert.source.toUpperCase()}
                  </>
                ) : null}
              </div>
            </div>
          );

          return alert.link ? (
            <a
              key={alert.id}
              href={alert.link}
              target="_blank"
              rel="noopener noreferrer"
              style={{ textDecoration: 'none', color: 'inherit' }}
            >
              {card}
            </a>
          ) : (
            <div key={alert.id}>{card}</div>
          );
        })}
      </div>
    </section>
  );
}
