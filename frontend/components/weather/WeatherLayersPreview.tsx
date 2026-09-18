'use client';

import Link from 'next/link';
import { useEffect, useState, type ReactNode } from 'react';
import { useColors } from '@/hooks/useColors';
import { useTranslation } from '@/hooks/useTranslation';
import { useUnits } from '@/lib/units-context';

type PreviewData = {
  layers: {
    cloud: {
      next24hMeanPct: number | null;
      lowMeanPct: number | null;
      midMeanPct: number | null;
      highMeanPct: number | null;
    };
    heat: {
      maxApparentTemperatureC48h: number | null;
      hotHours32C48h: number;
      heatWaveSignal: boolean;
    };
    storm: {
      maxWindGustKmh48h: number | null;
      maxCapeJkg48h: number | null;
      convectiveSignal: boolean;
    };
    hourly: Array<{
      cloudCoverPct: number | null;
      apparentTemperatureC: number | null;
      windGustKmh: number | null;
      capeJkg: number | null;
    }>;
  };
  alerts: {
    active: Array<{
      id: string | null;
      event: string;
      severity: string | null;
      headline: string | null;
      expires: string | null;
    }>;
  };
};

function copyFor(language: string) {
  const table: Record<string, Record<string, string>> = {
    en: {
      title: 'Weather layers',
      body: 'Cloud, heat, and wind gusts for',
      cloud: 'Cloud',
      heat: 'Heat',
      storm: 'Wind and gusts',
      gust: 'Gust',
      alerts: 'alerts',
      officialAlerts: 'Official alerts',
      open: 'Open layers',
      loading: 'Reading layers...',
      unavailable: 'Layers unavailable',
      signalSummary: 'Active signal context',
      source: 'Forecast · Open-Meteo',
      heatSub: 'Max feels-like · {hours} hot hours',
      stormSub: 'Max gust · CAPE {cape} J/kg',
      cloudLow: 'Low',
      cloudMid: 'Mid',
      cloudHigh: 'High',
    },
    pt: {
      title: 'Camadas do clima',
      body: 'Nuvens, calor e rajadas de vento para',
      cloud: 'Nuvens',
      heat: 'Calor',
      storm: 'Vento e rajadas',
      gust: 'Rajada',
      alerts: 'alertas',
      officialAlerts: 'Alertas oficiais',
      open: 'Abrir camadas',
      loading: 'Lendo camadas...',
      unavailable: 'Camadas indisponíveis',
      signalSummary: 'Contexto do sinal ativo',
      source: 'Previsão · Open-Meteo',
      heatSub: 'Máx. sensação · {hours} horas quentes',
      stormSub: 'Rajada máx. · CAPE {cape} J/kg',
      cloudLow: 'Baixas',
      cloudMid: 'Médias',
      cloudHigh: 'Altas',
    },
    es: {
      title: 'Capas del clima',
      body: 'Nubes, calor y ráfagas de viento para',
      cloud: 'Nubes',
      heat: 'Calor',
      storm: 'Viento y ráfagas',
      gust: 'Ráfaga',
      alerts: 'alertas',
      officialAlerts: 'Alertas oficiales',
      open: 'Abrir capas',
      loading: 'Leyendo capas...',
      unavailable: 'Capas no disponibles',
      signalSummary: 'Contexto de la señal activa',
      source: 'Pronóstico · Open-Meteo',
      heatSub: 'Máx. sensación · {hours} horas de calor',
      stormSub: 'Ráfaga máx. · CAPE {cape} J/kg',
      cloudLow: 'Bajas',
      cloudMid: 'Medias',
      cloudHigh: 'Altas',
    },
    fr: {
      title: 'Couches météo',
      body: 'Nuages, chaleur et rafales de vent pour',
      cloud: 'Nuages',
      heat: 'Chaleur',
      storm: 'Vent et rafales',
      gust: 'Rafale',
      alerts: 'alertes',
      officialAlerts: 'Alertes officielles',
      open: 'Ouvrir les couches',
      loading: 'Lecture des couches...',
      unavailable: 'Couches indisponibles',
      signalSummary: 'Contexte du signal actif',
      source: 'Prévision · Open-Meteo',
      heatSub: 'Ressenti max. · {hours} heures chaudes',
      stormSub: 'Rafale max. · CAPE {cape} J/kg',
      cloudLow: 'Bas',
      cloudMid: 'Moyens',
      cloudHigh: 'Hauts',
    },
    de: {
      title: 'Wetterschichten',
      body: 'Wolken, Hitze und Windböen für',
      cloud: 'Wolken',
      heat: 'Hitze',
      storm: 'Wind und Böen',
      gust: 'Böe',
      alerts: 'Warnungen',
      officialAlerts: 'Offizielle Warnungen',
      open: 'Schichten öffnen',
      loading: 'Schichten werden gelesen...',
      unavailable: 'Schichten nicht verfügbar',
      signalSummary: 'Kontext des aktiven Signals',
      source: 'Vorhersage · Open-Meteo',
      heatSub: 'Max. gefühlt · {hours} heiße Stunden',
      stormSub: 'Max. Böe · CAPE {cape} J/kg',
      cloudLow: 'Tief',
      cloudMid: 'Mittel',
      cloudHigh: 'Hoch',
    },
    zh: {
      title: '天气图层',
      body: '云量、高温和阵风：',
      cloud: '云量',
      heat: '高温',
      storm: '大风与阵风',
      gust: '阵风',
      alerts: '警报',
      officialAlerts: '官方警报',
      open: '打开图层',
      loading: '正在读取图层...',
      unavailable: '图层不可用',
      signalSummary: '活跃信号背景',
      source: '预报 · Open-Meteo',
      heatSub: '最高体感 · {hours} 个高温小时',
      stormSub: '最大阵风 · CAPE {cape} J/kg',
      cloudLow: '低云',
      cloudMid: '中云',
      cloudHigh: '高云',
    },
  };
  return table[language] ?? table.en;
}

function fmtPct(value: number | null | undefined) {
  return Number.isFinite(value) ? `${Math.round(Number(value))}%` : '-';
}



function fmtNumber(value: number | null | undefined) {
  return Number.isFinite(value) ? String(Math.round(Number(value))) : '-';
}

function clampPct(value: number | null | undefined) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Number(value)));
}

function takeEvenly<T>(items: T[], count: number) {
  if (items.length <= count) return items;
  const step = (items.length - 1) / (count - 1);
  return Array.from({ length: count }, (_, index) => items[Math.round(index * step)]);
}

function MetricChip({
  label,
  value,
  active,
}: {
  label: string;
  value: string;
  active?: boolean;
}) {
  const { C, fonts, R } = useColors();
  return (
    <span
      style={{
        border: `1px solid ${active ? `${C.below}66` : C.divider}`,
        borderRadius: R.pill,
        padding: '6px 9px',
        background: active ? `${C.below}12` : C.surfaceSoft,
        color: active ? C.below : C.textSoft,
        fontFamily: fonts.mono,
        fontSize: 10,
        fontWeight: 800,
        letterSpacing: 0.5,
        whiteSpace: 'nowrap',
      }}
    >
      {label} {value}
    </span>
  );
}

function LayerBars({
  rows,
}: {
  rows: Array<{ label: string; value: number | null; color: string }>;
}) {
  const { C, fonts } = useColors();
  return (
    <div style={{ display: 'grid', gap: 7 }}>
      {rows.map((row) => (
        <div key={row.label} style={{ display: 'grid', gap: 4 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontFamily: fonts.sans, fontSize: 12, color: C.textMuted }}>
            <span>{row.label}</span>
            <strong style={{ color: C.textSoft }}>{fmtPct(row.value)}</strong>
          </div>
          <div style={{ height: 7, borderRadius: 999, background: `${C.text}18`, overflow: 'hidden' }}>
            <div style={{ width: `${clampPct(row.value)}%`, height: '100%', borderRadius: 999, background: row.color }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function SparkBars({
  values,
  tone,
}: {
  values: Array<number | null>;
  tone: string;
}) {
  const { C } = useColors();
  const points = takeEvenly(values, 28);
  const max = Math.max(1, ...points.map((value) => Math.max(0, Number(value ?? 0))));
  return (
    <div
      aria-hidden="true"
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${points.length || 1}, 1fr)`,
        gap: 3,
        alignItems: 'end',
        minHeight: 42,
      }}
    >
      {points.map((value, index) => {
        const height = Math.max(5, Math.min(42, (Math.max(0, Number(value ?? 0)) / max) * 42));
        return (
          <span
            key={index}
            style={{
              height,
              minHeight: 5,
              borderRadius: 999,
              background: tone,
              opacity: value == null ? 0.28 : 0.9,
              boxShadow: value != null && Number(value) === max ? `0 0 10px ${tone}55` : undefined,
            }}
          />
        );
      })}
      {points.length === 0 ? <span style={{ height: 5, borderRadius: 999, background: C.textMuted }} /> : null}
    </div>
  );
}

function GraphicPanel({
  title,
  icon,
  value,
  sub,
  children,
  active,
}: {
  title: string;
  icon: string;
  value?: string;
  sub?: string;
  children: ReactNode;
  active?: boolean;
}) {
  const { C, fonts, neu, R } = useColors();
  return (
    <div
      style={{
        ...neu.subtle,
        borderRadius: R.lg,
        padding: 12,
        display: 'grid',
        gap: 9,
        minWidth: 0,
        border: active ? `1px solid ${C.below}55` : undefined,
        background: active ? `${C.below}0D` : undefined,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
        <span style={{ color: active ? C.below : C.textMutedStrong, fontFamily: fonts.mono, fontSize: 12, fontWeight: 900 }}>
          {icon}
        </span>
        <strong style={{ fontFamily: fonts.sans, fontSize: 13, lineHeight: 1.15, color: C.text, overflowWrap: 'anywhere' }}>
          {title}
        </strong>
      </div>
      {value ? (
        <div style={{ fontFamily: fonts.display, fontSize: 24, lineHeight: 1, color: active ? C.below : C.accent }}>
          {value}
        </div>
      ) : null}
      {sub ? (
        <div style={{ fontFamily: fonts.sans, fontSize: 11, lineHeight: 1.35, color: C.textMuted }}>
          {sub}
        </div>
      ) : null}
      {children}
    </div>
  );
}

function AlertsPreview({
  alerts,
  compact = false,
}: {
  alerts: PreviewData['alerts']['active'];
  compact?: boolean;
}) {
  const { C, fonts, R } = useColors();
  const { language } = useTranslation();
  const copy = copyFor(language);

  if (alerts.length === 0) return null;

  const summary = alerts.slice(0, compact ? 1 : 2).map((alert) => alert.event).join(' · ');
  const extra = alerts.length > (compact ? 1 : 2) ? ` +${alerts.length - (compact ? 1 : 2)}` : '';

  return (
    <div
      style={{
        border: `1px solid ${C.below}55`,
        borderRadius: compact ? R.pill : R.lg,
        padding: compact ? '6px 9px' : '9px 11px',
        background: `${C.below}10`,
        color: C.text,
        display: 'flex',
        alignItems: compact ? 'center' : 'flex-start',
        gap: 8,
        minWidth: 0,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 18,
          height: 18,
          flex: '0 0 auto',
          borderRadius: 999,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: `${C.below}22`,
          color: C.below,
          fontFamily: fonts.mono,
          fontSize: 10,
          fontWeight: 900,
          lineHeight: 1,
        }}
      >
        !
      </span>
      <div
        style={{
          minWidth: 0,
          fontFamily: compact ? fonts.mono : fonts.sans,
          fontSize: compact ? 10 : 12,
          fontWeight: compact ? 800 : 700,
          lineHeight: compact ? 1.2 : 1.35,
          color: compact ? C.below : C.textSoft,
          letterSpacing: compact ? 0.5 : 0,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: compact ? 'nowrap' : 'normal',
        }}
      >
        <span style={{ color: C.below }}>{copy.officialAlerts}:</span> {summary}{extra}
      </div>
    </div>
  );
}

export default function WeatherLayersPreview({
  lat,
  lon,
  placeName,
  placeSlug,
  variant = 'summary',
}: {
  lat: number;
  lon: number;
  placeName: string;
  placeSlug?: string | null;
  variant?: 'summary' | 'graphic' | 'strip';
}) {
  const { C, fonts, neu, R } = useColors();
  const { language } = useTranslation();
  const { formatTemp: formatTempUnits, formatWind: formatWindUnits } = useUnits();
  const copy = copyFor(language);
  const [data, setData] = useState<PreviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setFailed(false);
      try {
        const params = new URLSearchParams({ lat: String(lat), lon: String(lon) });
        const res = await fetch(`/api/weather/layers?${params.toString()}`, {
          headers: { accept: 'application/json' },
        });
        if (!res.ok) throw new Error('weather layers failed');
        const json = await res.json();
        if (!cancelled) setData(json);
      } catch {
        if (!cancelled) {
          setData(null);
          setFailed(true);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [lat, lon]);

  const shellStyle = variant === 'graphic'
    ? {
        ...neu.panelRaised,
        borderRadius: R.xl,
        padding: '12px',
        display: 'grid',
        gap: 10,
      }
    : variant === 'strip'
    ? {
        border: `1px solid ${C.divider}`,
        borderRadius: R.lg,
        padding: '10px 12px',
        display: 'grid',
        gap: 8,
        background: C.surfaceSoft,
      }
    : {
        ...neu.subtle,
        borderRadius: R.xl,
        padding: '12px',
        display: 'grid',
        gap: 10,
      };

  return (
    <div
      style={shellStyle}
    >
      {variant === 'graphic' ? (
        <style>{`
          @media (min-width: 860px) {
            .k-weather-preview-graphic-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
          }
        `}</style>
      ) : null}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontFamily: fonts.mono,
              fontSize: 10,
              fontWeight: 800,
              letterSpacing: 1.1,
              textTransform: 'uppercase',
              color: C.textMutedStrong,
              marginBottom: 4,
            }}
          >
            {copy.title}
          </div>
          <div style={{ fontFamily: fonts.sans, fontSize: 13, lineHeight: 1.4, color: C.textMuted }}>
            {copy.body} <span style={{ color: C.textSoft, fontWeight: 800 }}>{placeName}</span>
          </div>
        </div>
        {placeSlug ? (
          <Link
            href={`/places/${placeSlug}#weather-layers`}
            style={{
              ...neu.controlRaised,
              borderRadius: R.md,
              padding: '8px 10px',
              color: C.accent,
              fontFamily: fonts.sans,
              fontSize: 12,
              fontWeight: 800,
              textDecoration: 'none',
              whiteSpace: 'nowrap',
            }}
          >
            {copy.open}
          </Link>
        ) : null}
      </div>

      {loading ? (
        <div style={{ fontFamily: fonts.sans, fontSize: 13, color: C.textMuted }}>{copy.loading}</div>
      ) : failed || !data ? (
        <div style={{ fontFamily: fonts.sans, fontSize: 13, color: C.textMuted }}>{copy.unavailable}</div>
      ) : variant === 'strip' ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <span
              aria-hidden="true"
              style={{
                width: 8,
                height: 8,
                borderRadius: 999,
                background: data.alerts.active.length > 0 || data.layers.heat.heatWaveSignal || data.layers.storm.convectiveSignal
                  ? C.below
                  : C.accent,
                boxShadow: `0 0 0 4px ${
                  data.alerts.active.length > 0 || data.layers.heat.heatWaveSignal || data.layers.storm.convectiveSignal
                    ? `${C.below}16`
                    : `${C.accent}14`
                }`,
                flex: '0 0 auto',
              }}
            />
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontFamily: fonts.mono,
                  fontSize: 10,
                  fontWeight: 850,
                  letterSpacing: 0.8,
                  color: C.textMutedStrong,
                  textTransform: 'uppercase',
                  lineHeight: 1.2,
                }}
              >
                {copy.signalSummary}
              </div>
              <div
                style={{
                  fontFamily: fonts.sans,
                  fontSize: 13,
                  fontWeight: 750,
                  color: C.textSoft,
                  lineHeight: 1.35,
                  overflowWrap: 'anywhere',
                }}
              >
                {placeName}: {copy.cloud} {fmtPct(data.layers.cloud.next24hMeanPct)} · {copy.heat} {formatTempUnits(data.layers.heat.maxApparentTemperatureC48h)} · {copy.gust} {formatWindUnits(data.layers.storm.maxWindGustKmh48h)}
                {data.alerts.active.length > 0 ? ` · ${data.alerts.active.length} ${copy.alerts}` : ''}
              </div>
            </div>
          </div>
          <div
            style={{
              fontFamily: fonts.mono,
              fontSize: 10,
              fontWeight: 750,
              letterSpacing: 0.5,
              color: C.textMuted,
              whiteSpace: 'nowrap',
            }}
          >
            {copy.source}
          </div>
        </div>
      ) : variant === 'graphic' ? (
        <>
          <div className="k-weather-preview-graphic-grid" style={{ display: 'grid', gap: 8 }}>
            <GraphicPanel title={copy.cloud} icon="◇">
              <LayerBars
                rows={[
                  { label: copy.cloudLow, value: data.layers.cloud.lowMeanPct, color: '#92B7F3' },
                  { label: copy.cloudMid, value: data.layers.cloud.midMeanPct, color: '#B9C6D6' },
                  { label: copy.cloudHigh, value: data.layers.cloud.highMeanPct, color: '#D8E2EC' },
                ]}
              />
              <SparkBars
                values={(data.layers.hourly ?? []).slice(0, 48).map((item) => item.cloudCoverPct)}
                tone="#D8E2EC"
              />
            </GraphicPanel>

            <GraphicPanel
              title={copy.heat}
              icon="δ"
              value={formatTempUnits(data.layers.heat.maxApparentTemperatureC48h)}
              sub={copy.heatSub.replace('{hours}', String(data.layers.heat.hotHours32C48h))}
              active={data.layers.heat.heatWaveSignal}
            >
              <SparkBars
                values={(data.layers.hourly ?? []).slice(0, 48).map((item) => item.apparentTemperatureC)}
                tone={data.layers.heat.heatWaveSignal ? C.below : C.accent}
              />
            </GraphicPanel>

            <GraphicPanel
              title={copy.storm}
              icon="☼"
              value={formatWindUnits(data.layers.storm.maxWindGustKmh48h)}
              sub={copy.stormSub.replace('{cape}', fmtNumber(data.layers.storm.maxCapeJkg48h))}
              active={data.layers.storm.convectiveSignal}
            >
              <SparkBars
                values={(data.layers.hourly ?? []).slice(0, 48).map((item) => Math.max(Number(item.windGustKmh ?? 0), Number(item.capeJkg ?? 0) / 30))}
                tone={data.layers.storm.convectiveSignal ? C.below : C.textMutedStrong}
              />
            </GraphicPanel>
          </div>
          <AlertsPreview alerts={data.alerts.active} />
        </>
      ) : (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <MetricChip label={copy.cloud} value={fmtPct(data.layers.cloud.next24hMeanPct)} />
            <MetricChip
              label={copy.heat}
              value={formatTempUnits(data.layers.heat.maxApparentTemperatureC48h)}
              active={data.layers.heat.heatWaveSignal}
            />
            <MetricChip
              label={copy.gust}
              value={formatWindUnits(data.layers.storm.maxWindGustKmh48h)}
              active={data.layers.storm.convectiveSignal}
            />
            {data.alerts.active.length > 0 ? (
              <MetricChip label={String(data.alerts.active.length)} value={copy.alerts} active />
            ) : null}
          </div>
          <AlertsPreview alerts={data.alerts.active} compact />
        </>
      )}
    </div>
  );
}
