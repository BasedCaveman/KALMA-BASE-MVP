'use client';

import { useMemo } from 'react';
import { useColors } from '@/hooks/useColors';
import { useTranslation } from '@/hooks/useTranslation';
import { RainIcon, TempIcon, WindIcon } from '@/components/shared/icons';
import { WIND_BANDS, windBandFor, windScalePct, normalizeWindLocale } from '@/lib/weather/wind-scale';
import { useUnits } from '@/lib/units-context';
import { windTickLabel } from '@/lib/units';
// Shared with the 'Now' block at the top of the place page so a single view
// makes one request for this payload, not two (see hooks/useWeatherLayers).
import { useWeatherLayers, type WeatherLayerResponse } from '@/hooks/useWeatherLayers';


function clampPct(value: number | null | undefined) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Number(value)));
}

function fmtPct(value: number | null | undefined) {
  return Number.isFinite(value) ? `${Math.round(Number(value))}%` : '-';
}

function fmtNumber(value: number | null | undefined, suffix: string) {
  return Number.isFinite(value) ? `${Math.round(Number(value))}${suffix}` : '-';
}

function takeEvenly<T>(items: T[], count: number) {
  if (items.length <= count) return items;
  const step = (items.length - 1) / (count - 1);
  return Array.from({ length: count }, (_, index) => items[Math.round(index * step)]);
}

function panelCopy(language: string) {
  const table: Record<string, Record<string, string>> = {
    en: {
      title: 'Graphic weather layers',
      body: 'Cloud cover, heat stress, and wind gusts — with what they mean on the ground.',
      loading: 'Reading forecast layers...',
      unavailable: 'Weather layers are unavailable right now.',
      cloud: 'Cloud stack',
      low: 'Low',
      mid: 'Mid',
      high: 'High',
      heat: 'Heat stress',
      maxApparent: 'Max apparent temp',
      hotHours: 'hot hours',
      storm: 'Wind and gusts',
      maxGust: 'Max gust (48h)',
      officialAlerts: 'Official alerts nearby:',
      sources: 'Forecast · Open-Meteo',
      nws: ' + NOAA/NWS alerts',
    },
    pt: {
      title: 'Camadas climáticas visuais',
      body: 'Cobertura de nuvens, estresse de calor e rajadas de vento — com o que significam na prática.',
      loading: 'Lendo camadas de previsão...',
      unavailable: 'As camadas climáticas estão indisponíveis agora.',
      cloud: 'Nuvens por altura',
      low: 'Baixas',
      mid: 'Médias',
      high: 'Altas',
      heat: 'Estresse de calor',
      maxApparent: 'Máx. sensação térmica',
      hotHours: 'horas quentes',
      storm: 'Vento e rajadas',
      maxGust: 'Rajada máx. (48h)',
      officialAlerts: 'Alertas oficiais próximos:',
      sources: 'Previsão · Open-Meteo',
      nws: ' + alertas NOAA/NWS',
    },
    es: {
      title: 'Capas visuales del clima',
      body: 'Cobertura nubosa, estrés por calor y ráfagas de viento — con lo que significan en la práctica.',
      loading: 'Leyendo capas del pronóstico...',
      unavailable: 'Las capas climáticas no están disponibles ahora.',
      cloud: 'Nubes por altura',
      low: 'Bajas',
      mid: 'Medias',
      high: 'Altas',
      heat: 'Estrés por calor',
      maxApparent: 'Máx. sensación térmica',
      hotHours: 'horas de calor',
      storm: 'Viento y ráfagas',
      maxGust: 'Ráfaga máx. (48h)',
      officialAlerts: 'Alertas oficiales cercanas:',
      sources: 'Pronóstico · Open-Meteo',
      nws: ' + alertas NOAA/NWS',
    },
    fr: {
      title: 'Couches météo visuelles',
      body: "Couverture nuageuse, stress thermique et rafales de vent — avec ce qu'elles impliquent sur le terrain.",
      loading: 'Lecture des couches de prévision...',
      unavailable: 'Les couches météo sont indisponibles pour le moment.',
      cloud: 'Nuages par étage',
      low: 'Bas',
      mid: 'Moyens',
      high: 'Hauts',
      heat: 'Stress thermique',
      maxApparent: 'Ressenti max.',
      hotHours: 'heures chaudes',
      storm: 'Vent et rafales',
      maxGust: 'Rafale max. (48h)',
      officialAlerts: 'Alertes officielles proches :',
      sources: 'Prévision · Open-Meteo',
      nws: ' + alertes NOAA/NWS',
    },
    de: {
      title: 'Grafische Wetterschichten',
      body: 'Bewölkung, Hitzebelastung und Windböen — mit dem, was sie am Boden bedeuten.',
      loading: 'Vorhersageschichten werden gelesen...',
      unavailable: 'Wetterschichten sind gerade nicht verfügbar.',
      cloud: 'Wolkenschichten',
      low: 'Tief',
      mid: 'Mittel',
      high: 'Hoch',
      heat: 'Hitzebelastung',
      maxApparent: 'Max. gefühlt',
      hotHours: 'heiße Stunden',
      storm: 'Wind und Böen',
      maxGust: 'Max. Böe (48h)',
      officialAlerts: 'Offizielle Warnungen in der Nähe:',
      sources: 'Vorhersage · Open-Meteo',
      nws: ' + NOAA/NWS-Warnungen',
    },
    zh: {
      title: '图形天气层',
      body: '云量、热压力与阵风——以及它们在地面上的实际影响。',
      loading: '正在读取预报图层...',
      unavailable: '当前无法获取天气图层。',
      cloud: '云层结构',
      low: '低云',
      mid: '中云',
      high: '高云',
      heat: '热压力',
      maxApparent: '最高体感',
      hotHours: '高温小时',
      storm: '大风与阵风',
      maxGust: '最大阵风（48小时）',
      officialAlerts: '附近官方警报：',
      sources: '预报 · Open-Meteo',
      nws: ' + NOAA/NWS 警报',
    },
  };
  return table[language] ?? table.en;
}

function MiniBar({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | null | undefined;
  tone: string;
}) {
  return (
    <div style={{ display: 'grid', gap: 5, minWidth: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ opacity: 0.74, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
        <span style={{ fontWeight: 800 }}>{fmtPct(value)}</span>
      </div>
      <div
        style={{
          height: 8,
          borderRadius: 999,
          background: 'color-mix(in srgb, var(--k-text) 10%, transparent)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${clampPct(value)}%`,
            height: '100%',
            borderRadius: 999,
            background: tone,
          }}
        />
      </div>
    </div>
  );
}

function Timeline({
  items,
  colorFor,
  valueFor,
}: {
  items: WeatherLayerResponse['layers']['hourly'];
  colorFor: (item: WeatherLayerResponse['layers']['hourly'][number]) => string;
  valueFor: (item: WeatherLayerResponse['layers']['hourly'][number]) => number;
}) {
  const points = takeEvenly(items.slice(0, 48), 24);
  return (
    <div
      aria-hidden="true"
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${Math.max(points.length, 1)}, 1fr)`,
        gap: 3,
        alignItems: 'end',
        minHeight: 46,
      }}
    >
      {points.map((item, index) => {
        const pct = Math.max(8, Math.min(100, valueFor(item)));
        return (
          <div
            key={`${item.time}-${index}`}
            style={{
              height: `${pct}%`,
              minHeight: 4,
              borderRadius: 999,
              background: colorFor(item),
              opacity: 0.9,
            }}
          />
        );
      })}
    </div>
  );
}

export default function WeatherLayersPanel({
  lat,
  lon,
}: {
  lat: number;
  lon: number;
}) {
  const { C, fonts, neu, R } = useColors();
  const { language } = useTranslation();
  const copy = panelCopy(language);
  const { data, loading, failed } = useWeatherLayers(lat, lon);

  const heatTone = data?.layers.heat.heatWaveSignal ? C.below : C.accent;
  const { system, formatTemp, formatWind } = useUnits();
  const gustBand = windBandFor(data?.layers.storm.maxWindGustKmh48h ?? null);
  const windLocale = normalizeWindLocale(language);

  const alertSummary = useMemo(() => {
    const alerts = data?.alerts.active ?? [];
    if (alerts.length === 0) return null;
    return alerts.slice(0, 2).map((alert) => alert.event).join(' · ');
  }, [data]);

  return (
    <section
      id="weather-layers"
      style={{
        ...neu.panelRaised,
        borderRadius: R.xl,
        padding: '16px',
        marginBottom: 24,
        display: 'grid',
        gap: 14,
      }}
    >
      <style>{`
        @media (min-width: 760px) {
          .k-weather-layer-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
        }
      `}</style>
      <div style={{ display: 'grid', gap: 6 }}>
        <div
          style={{
            fontFamily: fonts.mono,
            fontSize: 11,
            fontWeight: 800,
            letterSpacing: 1.3,
            textTransform: 'uppercase',
            color: C.textMutedStrong,
          }}
        >
          {copy.title}
        </div>
        <div style={{ fontFamily: fonts.sans, fontSize: 14, lineHeight: 1.5, color: C.textMuted }}>
          {copy.body}
        </div>
      </div>

      {loading ? (
        <div style={{ ...neu.subtle, borderRadius: R.lg, padding: 14, color: C.textMuted, fontFamily: fonts.sans }}>
          {copy.loading}
        </div>
      ) : failed || !data ? (
        <div style={{ ...neu.subtle, borderRadius: R.lg, padding: 14, color: C.textMuted, fontFamily: fonts.sans }}>
          {copy.unavailable}
        </div>
      ) : (
        <>
          <div className="k-weather-layer-grid" style={{ display: 'grid', gap: 10 }}>
            <div style={{ ...neu.subtle, borderRadius: R.lg, padding: 13, display: 'grid', gap: 10, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: C.text }}>
                <RainIcon size={16} color={C.text} />
                <strong style={{ fontFamily: fonts.sans, fontSize: 15 }}>{copy.cloud}</strong>
              </div>
              <MiniBar label={copy.low} value={data.layers.cloud.lowMeanPct} tone="#8fb8ff" />
              <MiniBar label={copy.mid} value={data.layers.cloud.midMeanPct} tone="#b9c6d6" />
              <MiniBar label={copy.high} value={data.layers.cloud.highMeanPct} tone="#d9e5f2" />
              <Timeline
                items={data.layers.hourly}
                valueFor={(item) => clampPct(item.cloudCoverPct)}
                colorFor={() => '#b9c6d6'}
              />
            </div>

            <div style={{ ...neu.subtle, borderRadius: R.lg, padding: 13, display: 'grid', gap: 10, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: C.text }}>
                <TempIcon size={16} color={C.text} />
                <strong style={{ fontFamily: fonts.sans, fontSize: 15 }}>{copy.heat}</strong>
              </div>
              <div style={{ fontFamily: fonts.display, fontSize: 28, lineHeight: 1, color: heatTone }}>
                {formatTemp(data.layers.heat.maxApparentTemperatureC48h)}
              </div>
              <div style={{ fontFamily: fonts.sans, fontSize: 13, color: C.textMuted, lineHeight: 1.4 }}>
                {copy.maxApparent} · {data.layers.heat.hotHours32C48h} {copy.hotHours}
              </div>
              <Timeline
                items={data.layers.hourly}
                valueFor={(item) => Math.max(0, ((item.apparentTemperatureC ?? 0) - 15) * 4)}
                colorFor={(item) => ((item.apparentTemperatureC ?? 0) >= 38 ? C.below : heatTone)}
              />
            </div>

            <div style={{ ...neu.subtle, borderRadius: R.lg, padding: 13, display: 'grid', gap: 10, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: C.text }}>
                <WindIcon size={16} color={C.text} />
                <strong style={{ fontFamily: fonts.sans, fontSize: 15 }}>{copy.storm}</strong>
              </div>
              <div style={{ fontFamily: fonts.display, fontSize: 28, lineHeight: 1, color: gustBand.color }}>
                {formatWind(data.layers.storm.maxWindGustKmh48h)}
              </div>
              <div style={{ display: 'grid', gap: 2 }}>
                <div style={{ fontFamily: fonts.sans, fontSize: 13, fontWeight: 700, color: gustBand.color }}>
                  {gustBand.label[windLocale]}
                </div>
                <div style={{ fontFamily: fonts.sans, fontSize: 12, color: C.textMuted, lineHeight: 1.4 }}>
                  {gustBand.impact[windLocale]}
                </div>
              </div>
              {/* Impact scale 0–140 km/h; only the active band is fully lit. */}
              <div style={{ display: 'grid', gap: 3 }}>
                <div style={{ position: 'relative', display: 'flex', height: 8, borderRadius: 999, overflow: 'hidden' }}>
                  {WIND_BANDS.map((band) => (
                    <div
                      key={band.id}
                      style={{
                        width: `${(((band.max ?? 140) - band.min) / 140) * 100}%`,
                        background: band.color,
                        opacity: band.id === gustBand.id ? 1 : 0.35,
                      }}
                    />
                  ))}
                  <div
                    style={{
                      position: 'absolute',
                      left: `calc(${windScalePct(data.layers.storm.maxWindGustKmh48h)}% - 1px)`,
                      top: 0,
                      width: 2,
                      height: 8,
                      background: C.text,
                    }}
                  />
                </div>
                <div style={{ position: 'relative', height: 12 }}>
                  {[0, 20, 40, 60, 90, 120].map((tick) => (
                    <span
                      key={tick}
                      style={{
                        position: 'absolute',
                        left: `${(tick / 140) * 100}%`,
                        transform: tick === 0 ? 'none' : 'translateX(-50%)',
                        fontFamily: fonts.mono,
                        fontSize: 9,
                        color: C.textMuted,
                      }}
                    >
                      {windTickLabel(tick, system)}
                    </span>
                  ))}
                </div>
              </div>
              <div style={{ fontFamily: fonts.sans, fontSize: 12, color: C.textMuted, lineHeight: 1.4 }}>
                {copy.maxGust} · CAPE {fmtNumber(data.layers.storm.maxCapeJkg48h, '')} J/kg
              </div>
              <Timeline
                items={data.layers.hourly}
                valueFor={(item) => Math.max(8, Math.min(100, ((item.windGustKmh ?? 0) / 140) * 100))}
                colorFor={(item) => windBandFor(item.windGustKmh).color}
              />
            </div>
          </div>

          {alertSummary ? (
            <div
              style={{
                border: `1px solid ${C.below}55`,
                borderRadius: R.lg,
                padding: '10px 12px',
                background: `${C.below}12`,
                color: C.text,
                fontFamily: fonts.sans,
                fontSize: 13,
                lineHeight: 1.45,
              }}
            >
              {copy.officialAlerts} {alertSummary}
            </div>
          ) : null}

          <div style={{ fontFamily: fonts.mono, fontSize: 9, color: C.textMuted, letterSpacing: 0.8, textTransform: 'uppercase' }}>
            {copy.sources}{data.alerts.active.length ? copy.nws : ''}
          </div>
        </>
      )}
    </section>
  );
}
