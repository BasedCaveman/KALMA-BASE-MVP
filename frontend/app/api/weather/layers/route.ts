import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type HourlySeries = {
  time?: string[];
  temperature_2m?: number[];
  apparent_temperature?: number[];
  relative_humidity_2m?: number[];
  cloud_cover?: number[];
  cloud_cover_low?: number[];
  cloud_cover_mid?: number[];
  cloud_cover_high?: number[];
  precipitation_probability?: number[];
  wind_gusts_10m?: number[];
  cape?: number[];
  uv_index?: number[];
};

function finiteNumbers(values: unknown): number[] {
  return Array.isArray(values) ? values.filter((value): value is number => Number.isFinite(value)) : [];
}

function max(values: unknown) {
  const nums = finiteNumbers(values);
  return nums.length ? Math.max(...nums) : null;
}

function mean(values: unknown) {
  const nums = finiteNumbers(values);
  return nums.length ? nums.reduce((sum, value) => sum + value, 0) / nums.length : null;
}

function countAtLeast(values: unknown, threshold: number) {
  return finiteNumbers(values).filter((value) => value >= threshold).length;
}

function sliceSeries(values: number[] | undefined, count: number) {
  return Array.isArray(values) ? values.slice(0, count) : [];
}

function parseCoordinate(value: string | null, min: number, maxValue: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= min && parsed <= maxValue ? parsed : null;
}

async function fetchOpenMeteo(lat: number, lon: number) {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    current: [
      'temperature_2m',
      'apparent_temperature',
      'relative_humidity_2m',
      'cloud_cover',
      'wind_speed_10m',
      'wind_gusts_10m',
      'weather_code',
    ].join(','),
    hourly: [
      'temperature_2m',
      'apparent_temperature',
      'relative_humidity_2m',
      'cloud_cover',
      'cloud_cover_low',
      'cloud_cover_mid',
      'cloud_cover_high',
      'precipitation_probability',
      'wind_gusts_10m',
      'cape',
      'uv_index',
    ].join(','),
    forecast_hours: '72',
    timezone: 'auto',
  });

  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`, {
    headers: { accept: 'application/json' },
    next: { revalidate: 900 },
  });
  if (!res.ok) throw new Error(`Open-Meteo ${res.status}`);
  return res.json() as Promise<{ current?: Record<string, number>; hourly?: HourlySeries; timezone?: string }>;
}

async function fetchNwsAlerts(lat: number, lon: number) {
  const params = new URLSearchParams({ point: `${lat.toFixed(4)},${lon.toFixed(4)}` });
  const res = await fetch(`https://api.weather.gov/alerts/active?${params.toString()}`, {
    headers: {
      accept: 'application/geo+json',
      'user-agent': 'kalma.me weather-layers contact@kalma.me',
    },
    next: { revalidate: 300 },
  }).catch(() => null);

  if (!res?.ok) return [];
  const json = await res.json().catch(() => null);
  return Array.isArray(json?.features)
    ? json.features.slice(0, 8).map((feature: any) => ({
        id: feature.id ?? null,
        event: feature.properties?.event ?? 'Weather alert',
        severity: feature.properties?.severity ?? null,
        urgency: feature.properties?.urgency ?? null,
        certainty: feature.properties?.certainty ?? null,
        headline: feature.properties?.headline ?? null,
        effective: feature.properties?.effective ?? null,
        expires: feature.properties?.expires ?? null,
      }))
    : [];
}

function buildLayers(payload: { current?: Record<string, number>; hourly?: HourlySeries; timezone?: string }) {
  const hourly = payload.hourly ?? {};
  const next24Cloud = sliceSeries(hourly.cloud_cover, 24);
  const next24Low = sliceSeries(hourly.cloud_cover_low, 24);
  const next24Mid = sliceSeries(hourly.cloud_cover_mid, 24);
  const next24High = sliceSeries(hourly.cloud_cover_high, 24);
  const next48Apparent = sliceSeries(hourly.apparent_temperature, 48);
  const next48Temp = sliceSeries(hourly.temperature_2m, 48);
  const next48Gust = sliceSeries(hourly.wind_gusts_10m, 48);
  const next48Cape = sliceSeries(hourly.cape, 48);
  const next48Precip = sliceSeries(hourly.precipitation_probability, 48);

  const maxApparent = max(next48Apparent);
  const maxTemp = max(next48Temp);
  const maxGust = max(next48Gust);
  const maxCape = max(next48Cape);
  const maxPrecipProbability = max(next48Precip);

  return {
    source: 'Open-Meteo',
    timezone: payload.timezone ?? null,
    current: {
      temperatureC: payload.current?.temperature_2m ?? null,
      apparentTemperatureC: payload.current?.apparent_temperature ?? null,
      humidityPct: payload.current?.relative_humidity_2m ?? null,
      cloudCoverPct: payload.current?.cloud_cover ?? null,
      windSpeedKmh: payload.current?.wind_speed_10m ?? null,
      windGustKmh: payload.current?.wind_gusts_10m ?? null,
      weatherCode: payload.current?.weather_code ?? null,
    },
    cloud: {
      next24hMeanPct: mean(next24Cloud),
      next24hMaxPct: max(next24Cloud),
      lowMeanPct: mean(next24Low),
      midMeanPct: mean(next24Mid),
      highMeanPct: mean(next24High),
    },
    heat: {
      maxTemperatureC48h: maxTemp,
      maxApparentTemperatureC48h: maxApparent,
      hotHours32C48h: countAtLeast(next48Apparent, 32),
      extremeHours38C48h: countAtLeast(next48Apparent, 38),
      heatWaveSignal: (maxApparent ?? maxTemp ?? 0) >= 38 || countAtLeast(next48Apparent, 35) >= 6,
    },
    storm: {
      maxWindGustKmh48h: maxGust,
      maxCapeJkg48h: maxCape,
      maxPrecipProbabilityPct48h: maxPrecipProbability,
      convectiveSignal: (maxCape ?? 0) >= 1000 || ((maxGust ?? 0) >= 60 && (maxPrecipProbability ?? 0) >= 50),
    },
    hourly: (hourly.time ?? []).slice(0, 72).map((time, index) => ({
      time,
      cloudCoverPct: hourly.cloud_cover?.[index] ?? null,
      apparentTemperatureC: hourly.apparent_temperature?.[index] ?? null,
      windGustKmh: hourly.wind_gusts_10m?.[index] ?? null,
      capeJkg: hourly.cape?.[index] ?? null,
      precipitationProbabilityPct: hourly.precipitation_probability?.[index] ?? null,
    })),
  };
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const lat = parseCoordinate(searchParams.get('lat'), -90, 90);
  const lon = parseCoordinate(searchParams.get('lon'), -180, 180);
  const includeNws = searchParams.get('nws') !== 'false';

  if (lat == null || lon == null) {
    return NextResponse.json({ error: 'bad_coordinates' }, { status: 400 });
  }

  try {
    const [openMeteo, nwsAlerts] = await Promise.all([
      fetchOpenMeteo(lat, lon),
      includeNws ? fetchNwsAlerts(lat, lon) : Promise.resolve([]),
    ]);

    return NextResponse.json({
      lat,
      lon,
      generatedAt: new Date().toISOString(),
      layers: buildLayers(openMeteo),
      alerts: {
        source: 'NOAA/NWS',
        active: nwsAlerts,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'weather_layers_failed', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 502 },
    );
  }
}
