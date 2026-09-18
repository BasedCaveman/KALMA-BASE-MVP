//frontend/hooks/useLocationContext.ts
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { LocationContextValue } from '@/lib/location';

const STORAGE_KEY = 'kalma-location-v2';
const APPROXIMATE_CACHE_KEY = 'kalma-location-approximate-v1';
const APPROXIMATE_CACHE_TTL_MS = 1000 * 60 * 30;

const AUSTIN_FALLBACK: LocationContextValue = {
  mode: 'approximate',
  city: 'Austin',
  region: 'Texas',
  country: 'United States',
  countryCode: 'US',
  lat: 30.2672,
  lon: -97.7431,
  timezone: 'America/Chicago',
  precise: false,
  sourceLabel: 'Approximate area',
};

function safeRead<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function safeWrite(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore storage failures
  }
}

// Anything deriving state from the stored location (the units context)
// listens for this to re-resolve when the location changes in-session.
function announceLocationUpdated() {
  try {
    window.dispatchEvent(new Event('kalma-location-updated'));
  } catch {
    // ignore
  }
}

function safeRemove(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore storage failures
  }
}

function toFixedCoord(value?: number | null): number | null {
  return typeof value === 'number' && Number.isFinite(value)
    ? Number(value.toFixed(4))
    : null;
}

function getBrowserTimezone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;
  } catch {
    return null;
  }
}

async function fetchApproximateLocation(): Promise<LocationContextValue | null> {
  try {
    const res = await fetch('/api/approximate-location', {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });

    if (!res.ok) {
      throw new Error(`Approximate lookup failed with ${res.status}`);
    }

    const data: any = await res.json();

    const timezone =
      typeof data?.timezone === 'string' && data.timezone.length > 0
        ? data.timezone
        : getBrowserTimezone() ?? AUSTIN_FALLBACK.timezone;

    const next: LocationContextValue = {
      mode: 'approximate',
      city: data?.city ?? null,
      region: data?.region ?? null,
      country: data?.country ?? null,
      countryCode: typeof data?.countryCode === 'string' ? data.countryCode : null,
      lat: toFixedCoord(data?.lat),
      lon: toFixedCoord(data?.lon),
      timezone,
      precise: false,
      sourceLabel: 'Approximate area',
    };

    return next;
  } catch (err) {
    // We intentionally degrade to the default place when approximate
    // lookup is unavailable, so avoid noisy client-side warnings.
    return null;
  }
}

type ApproximateLocationCacheEntry = {
  savedAt: number;
  value: LocationContextValue;
};

function readApproximateCache(): LocationContextValue | null {
  const cached = safeRead<ApproximateLocationCacheEntry>(APPROXIMATE_CACHE_KEY);
  if (!cached?.value || typeof cached.savedAt !== 'number') return null;
  if (Date.now() - cached.savedAt > APPROXIMATE_CACHE_TTL_MS) {
    safeRemove(APPROXIMATE_CACHE_KEY);
    return null;
  }
  return cached.value;
}

function writeApproximateCache(value: LocationContextValue) {
  safeWrite(APPROXIMATE_CACHE_KEY, {
    savedAt: Date.now(),
    value,
  });
  announceLocationUpdated();
}

type ManualLocationInput = {
  city: string;
  region?: string | null;
  country?: string | null;
  countryCode?: string | null;
  lat?: number | null;
  lon?: number | null;
  timezone?: string | null;
};

export function useLocationContext(options: { enabled?: boolean } = {}) {
  const enabled = options.enabled ?? true;
  const [location, setLocation] = useState<LocationContextValue | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(enabled);
  const [error, setError] = useState<string>('');

  const loadLocation = useCallback(async () => {
    setIsLoading(true);
    setError('');

    const savedManual = safeRead<LocationContextValue>(STORAGE_KEY);

    if (savedManual?.mode === 'manual') {
      setLocation({
        ...savedManual,
        timezone:
          savedManual.timezone ??
          getBrowserTimezone() ??
          AUSTIN_FALLBACK.timezone,
      });
      setIsLoading(false);
      return;
    }

    const cachedApproximate = readApproximateCache();
    if (cachedApproximate?.mode === 'approximate') {
      setLocation({
        ...cachedApproximate,
        timezone:
          cachedApproximate.timezone ??
          getBrowserTimezone() ??
          AUSTIN_FALLBACK.timezone,
      });
      setIsLoading(false);
      return;
    }

    const approximate = await fetchApproximateLocation();

    if (approximate) {
      writeApproximateCache(approximate);
      setLocation(approximate);
      setIsLoading(false);
      return;
    }

    const browserTimezone = getBrowserTimezone();

    setLocation({
      ...AUSTIN_FALLBACK,
      timezone: browserTimezone ?? AUSTIN_FALLBACK.timezone,
    });
    setError('Using fallback location.');
    setIsLoading(false);
  }, []);

  useEffect(() => {
    if (!enabled) {
      setLocation(null);
      setIsLoading(false);
      setError('');
      return;
    }
    void loadLocation();
  }, [enabled, loadLocation]);

  const setManualLocation = useCallback((input: ManualLocationInput) => {
    const next: LocationContextValue = {
      mode: 'manual',
      city: input.city ?? null,
      region: input.region ?? null,
      country: input.country ?? null,
      countryCode: input.countryCode ?? null,
      lat: input.lat ?? null,
      lon: input.lon ?? null,
      timezone:
        input.timezone ??
        getBrowserTimezone() ??
        AUSTIN_FALLBACK.timezone,
      precise: false,
      sourceLabel: 'Manual city',
    };

    safeWrite(STORAGE_KEY, next);
    announceLocationUpdated();
    setLocation(next);
    setError('');
  }, []);

  const clearManualLocation = useCallback(async () => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }

    setIsLoading(true);
    setError('');

    const approximate = await fetchApproximateLocation();

    if (approximate) {
      writeApproximateCache(approximate);
      setLocation(approximate);
      setIsLoading(false);
      return;
    }

    const browserTimezone = getBrowserTimezone();

    setLocation({
      ...AUSTIN_FALLBACK,
      timezone: browserTimezone ?? AUSTIN_FALLBACK.timezone,
    });
    setError('Using fallback location.');
    setIsLoading(false);
  }, []);

  return useMemo(
    () => ({
      location,
      isLoading,
      error,
      setManualLocation,
      clearManualLocation,
    }),
    [location, isLoading, error, setManualLocation, clearManualLocation]
  );
}
