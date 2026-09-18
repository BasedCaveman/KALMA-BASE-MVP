// kalma/frontend/lib/weather-alerts/routing.ts
//
// Route official CAP alerts to a place by geometry. DB-agnostic (no PostGIS):
// a cheap bbox prefilter in SQL narrows candidates, then exact ray-casting
// point-in-polygon runs in JS. See docs/OFFICIAL_ALERTS_LAYER_2026-07-14.md.

import type { SupabaseClient } from '@supabase/supabase-js';

export interface WeatherAlert {
  id: string;
  source: string;
  event: string;
  event_key: string;
  severity: string;
  response_type: string | null;
  headline: string | null;
  description: string | null;
  area_desc: string | null;
  polygon: [number, number][];
  bbox: [number, number, number, number];
  onset: string | null;
  expires: string;
  link: string | null;
}

// Ray casting. polygon is [[lat,lon], ...]; point is [lat, lon].
export function pointInPolygon(lat: number, lon: number, polygon: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [latI, lonI] = polygon[i];
    const [latJ, lonJ] = polygon[j];
    const intersects =
      lonI > lon !== lonJ > lon &&
      lat < ((latJ - latI) * (lon - lonI)) / (lonJ - lonI) + latI;
    if (intersects) inside = !inside;
  }
  return inside;
}

function inBbox(lat: number, lon: number, bbox: [number, number, number, number]): boolean {
  const [minLat, minLon, maxLat, maxLon] = bbox;
  return lat >= minLat && lat <= maxLat && lon >= minLon && lon <= maxLon;
}

// CAP severity ordering (most severe first) for display sorting.
const SEVERITY_RANK: Record<string, number> = {
  Extreme: 4,
  Severe: 3,
  Moderate: 2,
  Minor: 1,
  Unknown: 0,
};

/**
 * Active official alerts covering a place point, most severe first.
 * Fetches only currently-active alerts (RLS enforces expires > now()),
 * bbox-prefilters, then exact point-in-polygon.
 */
export async function alertsForPlace(
  supabase: SupabaseClient,
  lat: number,
  lon: number,
): Promise<WeatherAlert[]> {
  const { data, error } = await supabase
    .from('weather_alerts')
    .select(
      'id,source,event,event_key,severity,response_type,headline,description,area_desc,polygon,bbox,onset,expires,link',
    )
    .gt('expires', new Date().toISOString());

  if (error || !data) return [];

  const matches = (data as WeatherAlert[]).filter(
    (a) =>
      Array.isArray(a.bbox) &&
      Array.isArray(a.polygon) &&
      inBbox(lat, lon, a.bbox) &&
      pointInPolygon(lat, lon, a.polygon),
  );

  matches.sort((a, b) => {
    const sev = (SEVERITY_RANK[b.severity] ?? 0) - (SEVERITY_RANK[a.severity] ?? 0);
    if (sev !== 0) return sev;
    // then soonest onset first
    return new Date(a.onset ?? a.expires).getTime() - new Date(b.onset ?? b.expires).getTime();
  });

  return matches;
}
