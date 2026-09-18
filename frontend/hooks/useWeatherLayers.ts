// kalma/frontend/hooks/useWeatherLayers.ts
//
// Shared client access to /api/weather/layers.
//
// WHY A HOOK AND NOT A SECOND FETCH. The place page now renders the "Now"
// block at the top and the graphic weather layers near the bottom, and both
// want the same Open-Meteo payload. Copying the fetch effect would double the
// browser requests on every place view for data that is identical, and the
// standing note from the July UX pass is to watch Open-Meteo burst
// concurrency, not add to it.
//
// So requests are deduped in-module by rounded coordinate: the second caller
// mounting on the same page joins the first one's in-flight promise instead of
// issuing its own. The TTL matches the route's own `revalidate: 900`, so the
// client cache never claims to be fresher than the server's.

'use client';

import { useEffect, useState } from 'react';

export type WeatherLayerCurrent = {
  temperatureC: number | null;
  apparentTemperatureC: number | null;
  humidityPct: number | null;
  cloudCoverPct: number | null;
  windSpeedKmh: number | null;
  windGustKmh: number | null;
  weatherCode: number | null;
};

export type WeatherLayerResponse = {
  generatedAt: string;
  layers: {
    current: WeatherLayerCurrent;
    cloud: {
      next24hMeanPct: number | null;
      next24hMaxPct: number | null;
      lowMeanPct: number | null;
      midMeanPct: number | null;
      highMeanPct: number | null;
    };
    heat: {
      maxTemperatureC48h: number | null;
      maxApparentTemperatureC48h: number | null;
      hotHours32C48h: number;
      extremeHours38C48h: number;
      heatWaveSignal: boolean;
    };
    storm: {
      maxWindGustKmh48h: number | null;
      maxCapeJkg48h: number | null;
      maxPrecipProbabilityPct48h: number | null;
      convectiveSignal: boolean;
    };
    hourly: Array<{
      time: string;
      cloudCoverPct: number | null;
      apparentTemperatureC: number | null;
      windGustKmh: number | null;
      capeJkg: number | null;
      precipitationProbabilityPct: number | null;
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

const TTL_MS = 15 * 60 * 1000; // matches `next: { revalidate: 900 }` on the route

type Entry = { at: number; promise: Promise<WeatherLayerResponse> };
const cache = new Map<string, Entry>();

// 3 decimal places is ~110 m. Finer than that is noise for a city-scale
// forecast and would defeat the dedupe when two callers round differently.
function keyFor(lat: number, lon: number) {
  return `${lat.toFixed(3)},${lon.toFixed(3)}`;
}

function load(lat: number, lon: number): Promise<WeatherLayerResponse> {
  const key = keyFor(lat, lon);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.promise;

  const params = new URLSearchParams({ lat: String(lat), lon: String(lon) });
  const promise = fetch(`/api/weather/layers?${params.toString()}`, {
    headers: { accept: 'application/json' },
  }).then(async (res) => {
    if (!res.ok) throw new Error(`weather layers ${res.status}`);
    return (await res.json()) as WeatherLayerResponse;
  });

  // Drop a rejected promise so the next mount retries rather than replaying
  // the failure for the whole TTL.
  promise.catch(() => {
    if (cache.get(key)?.promise === promise) cache.delete(key);
  });

  cache.set(key, { at: Date.now(), promise });
  return promise;
}

export type UseWeatherLayers = {
  data: WeatherLayerResponse | null;
  loading: boolean;
  failed: boolean;
};

/** Fetch the weather layer payload for a coordinate, deduped across callers. */
export function useWeatherLayers(lat: number, lon: number): UseWeatherLayers {
  const [data, setData] = useState<WeatherLayerResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFailed(false);

    load(lat, lon)
      .then((json) => {
        if (cancelled) return;
        setData(json);
      })
      .catch(() => {
        if (cancelled) return;
        setData(null);
        setFailed(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [lat, lon]);

  return { data, loading, failed };
}
