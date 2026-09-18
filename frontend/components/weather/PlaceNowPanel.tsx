// kalma/frontend/components/weather/PlaceNowPanel.tsx
//
// "Now" at the top of a place page: what the sky is doing here, right now.
//
// WHY IT EXISTS. /places/[slug] opened straight into "LOCAL SIGNALS", which
// tells a person what MIGHT happen over the next two weeks without ever
// telling them what is happening today. Someone arriving at their own city
// had no anchor to read the forecast against, and nothing on the page changed
// between visits, so there was no reason to open it twice. The place dashboard
// has to answer "what is it like here now?" before it answers "what is
// changing?" (Golden Rule 8, Read before Context).
//
// SOURCE DISCIPLINE. Every number here is Open-Meteo forecast data and is
// labelled as such. It is not a community observation and it is not an
// official alert, which are the other two kinds of truth on this page and are
// rendered in their own blocks. Units follow the reader's own preference via
// useUnits, not the place's country.
//
// It reuses /api/weather/layers through useWeatherLayers, which dedupes the
// request against the graphic layers panel further down the same page.

'use client';

import { useColors } from '@/hooks/useColors';
import { useTranslation } from '@/hooks/useTranslation';
import { useUnits } from '@/lib/units-context';
import { useWeatherLayers } from '@/hooks/useWeatherLayers';

function copyFor(language: string) {
  const t: Record<string, {
    title: string; now: string; feels: string; humidity: string; wind: string;
    loading: string; unavailable: string; source: string;
  }> = {
    en: { title: 'Now', now: 'Temp', feels: 'Feels like', humidity: 'Humidity', wind: 'Wind', loading: 'Reading the local sky...', unavailable: 'Live conditions are unavailable right now.', source: 'Open-Meteo forecast' },
    pt: { title: 'Agora', now: 'Temp', feels: 'Sensação', humidity: 'Umidade', wind: 'Vento', loading: 'Lendo o céu local...', unavailable: 'As condições ao vivo estão indisponíveis agora.', source: 'Previsão Open-Meteo' },
    es: { title: 'Ahora', now: 'Temp', feels: 'Sensación', humidity: 'Humedad', wind: 'Viento', loading: 'Leyendo el cielo local...', unavailable: 'Las condiciones en vivo no están disponibles ahora.', source: 'Pronóstico Open-Meteo' },
    fr: { title: 'Maintenant', now: 'Temp', feels: 'Ressenti', humidity: 'Humidité', wind: 'Vent', loading: 'Lecture du ciel local...', unavailable: 'Les conditions en direct sont indisponibles pour le moment.', source: 'Prévision Open-Meteo' },
    de: { title: 'Jetzt', now: 'Temp', feels: 'Gefühlt', humidity: 'Feuchte', wind: 'Wind', loading: 'Lese den lokalen Himmel...', unavailable: 'Live-Bedingungen sind gerade nicht verfügbar.', source: 'Open-Meteo-Prognose' },
    zh: { title: '现在', now: '气温', feels: '体感', humidity: '湿度', wind: '风速', loading: '正在读取本地天空...', unavailable: '当前无法获取实时状况。', source: 'Open-Meteo 预报' },
  };
  return t[language] ?? t.en;
}

export default function PlaceNowPanel({ lat, lon }: { lat: number; lon: number }) {
  const { C, fonts, neu, R } = useColors();
  const { language } = useTranslation();
  const { formatTemp, formatWind } = useUnits();
  const copy = copyFor(language);
  const { data, loading, failed } = useWeatherLayers(lat, lon);

  const current = data?.layers.current;

  const shell: React.CSSProperties = {
    ...neu.panelRaised,
    borderRadius: R.xl,
    padding: '14px 16px',
    marginBottom: 24,
  };

  const label: React.CSSProperties = {
    fontFamily: fonts.mono,
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: 1.3,
    textTransform: 'uppercase',
    color: C.textMutedStrong,
  };

  if (loading) {
    return (
      <div style={shell}>
        <div style={label}>{copy.title}</div>
        <div style={{ marginTop: 10, fontFamily: fonts.sans, fontSize: 14, color: C.textMuted }}>
          {copy.loading}
        </div>
      </div>
    );
  }

  // A place page is useful without this block, so a failed fetch degrades to a
  // quiet line rather than an error state or an empty frame.
  if (failed || !current) {
    return (
      <div style={shell}>
        <div style={label}>{copy.title}</div>
        <div style={{ marginTop: 10, fontFamily: fonts.sans, fontSize: 14, color: C.textMuted }}>
          {copy.unavailable}
        </div>
      </div>
    );
  }

  const metrics: Array<{ key: string; value: string }> = [
    { key: copy.now, value: current.temperatureC != null ? formatTemp(current.temperatureC) : '·' },
    { key: copy.feels, value: current.apparentTemperatureC != null ? formatTemp(current.apparentTemperatureC) : '·' },
    { key: copy.humidity, value: current.humidityPct != null ? `${Math.round(current.humidityPct)}%` : '·' },
    { key: copy.wind, value: current.windSpeedKmh != null ? formatWind(current.windSpeedKmh) : '·' },
  ];

  return (
    <div style={shell}>
      <div style={label}>{copy.title}</div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 10,
          marginTop: 12,
        }}
      >
        {metrics.map((m) => (
          <div key={m.key}>
            <div
              style={{
                fontFamily: fonts.mono,
                fontSize: 18,
                fontWeight: 700,
                lineHeight: 1.1,
                color: C.text,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {m.value}
            </div>
            <div style={{ ...label, fontSize: 8.5, letterSpacing: 0.8, marginTop: 3 }}>{m.key}</div>
          </div>
        ))}
      </div>
      <div style={{ ...label, fontSize: 9, letterSpacing: 0.8, marginTop: 12, opacity: 0.8 }}>
        {copy.source}
      </div>
    </div>
  );
}
