//frontend/lib/location.ts
export type LocationMode = 'manual' | 'approximate' | 'none';

export type LocationContextValue = {
  mode: LocationMode;
  city: string | null;
  region: string | null;
  country: string | null;
  /** ISO-3166 alpha-2 when known (drives unit-system auto-detection). */
  countryCode?: string | null;
  lat: number | null;
  lon: number | null;
  timezone: string | null;
  precise: false;
  sourceLabel: string;
};

const MANUAL_KEY = 'kalma_manual_location_v1';

export function getStoredManualLocation(): LocationContextValue | null {
  if (typeof window === 'undefined') return null;

  try {
    const raw = localStorage.getItem(MANUAL_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LocationContextValue;
    if (parsed?.mode !== 'manual') return null;
    return parsed;
  } catch {
    return null;
  }
}

export function storeManualLocation(value: LocationContextValue) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(MANUAL_KEY, JSON.stringify(value));
}

export function clearStoredManualLocation() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(MANUAL_KEY);
}

export function buildApproximateLocation(input: {
  city?: string | null;
  region?: string | null;
  country?: string | null;
  lat?: number | null;
  lon?: number | null;
  timezone?: string | null;
}): LocationContextValue {
  return {
    mode: 'approximate',
    city: input.city ?? null,
    region: input.region ?? null,
    country: input.country ?? null,
    lat: input.lat ?? null,
    lon: input.lon ?? null,
    timezone: input.timezone ?? null,
    precise: false,
    sourceLabel: 'Approximate area',
  };
}

export function buildManualLocation(input: {
  city: string;
  region?: string | null;
  country?: string | null;
  lat?: number | null;
  lon?: number | null;
  timezone?: string | null;
}): LocationContextValue {
  return {
    mode: 'manual',
    city: input.city,
    region: input.region ?? null,
    country: input.country ?? null,
    lat: input.lat ?? null,
    lon: input.lon ?? null,
    timezone: input.timezone ?? null,
    precise: false,
    sourceLabel: 'Chosen place',
  };
}

export function formatLocationLabel(loc: LocationContextValue | null) {
  if (!loc) return 'Location unavailable';

  const parts = [loc.city, loc.region, loc.country].filter(Boolean);
  if (!parts.length) return loc.sourceLabel;

  return parts.join(', ');
}
