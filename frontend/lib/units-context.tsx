//kalma/frontend/lib/units-context.tsx
//
// App-wide measurement-system state (mirrors currency-context.tsx).
// Resolution order:
//   1. explicit user preference (Profile → Units, localStorage)
//   2. the user's location — manually selected city first, then the
//      cached approximate area (countryCode when present, display-name
//      match for older stored blobs)
//   3. browser locale region (en-US → imperial)
//   4. metric
//
// Re-detects when the location changes in-session: useLocationContext
// dispatches 'kalma-location-updated' after every location write.

'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  systemForCountry,
  formatTemp as baseFormatTemp,
  formatWind as baseFormatWind,
  formatPrecip as baseFormatPrecip,
  type UnitSystem,
  type UnitsPref,
} from '@/lib/units';

const STORAGE_KEY = 'kalma-units';
export const LOCATION_UPDATED_EVENT = 'kalma-location-updated';

type StoredLocation = {
  countryCode?: string | null;
  country?: string | null;
} | null;

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function detectSystemFromLocation(): UnitSystem | null {
  const manual = readJson<StoredLocation>('kalma-location-v2');
  if (manual && (manual.countryCode || manual.country)) {
    return systemForCountry(manual.countryCode, manual.country);
  }
  const approx = readJson<{ value?: StoredLocation }>(
    'kalma-location-approximate-v1',
  );
  if (approx?.value && (approx.value.countryCode || approx.value.country)) {
    return systemForCountry(approx.value.countryCode, approx.value.country);
  }
  return null;
}

function detectSystemFromBrowser(): UnitSystem | null {
  try {
    const lang = navigator.language || '';
    const parts = lang.split('-');
    const region = parts.length >= 2 ? parts[parts.length - 1] : null;
    if (region && region.length === 2) {
      return systemForCountry(region);
    }
  } catch {
    // ignore
  }
  return null;
}

function resolveSystem(pref: UnitsPref): UnitSystem {
  if (pref === 'metric' || pref === 'imperial') return pref;
  return detectSystemFromLocation() ?? detectSystemFromBrowser() ?? 'metric';
}

interface UnitsContextValue {
  system: UnitSystem;
  pref: UnitsPref;
  setPref: (pref: UnitsPref) => void;
  formatTemp: (celsius: number | null | undefined, opts?: { unit?: boolean }) => string;
  formatWind: (kmh: number | null | undefined) => string;
  formatPrecip: (mm: number | null | undefined) => string;
}

const UnitsContext = createContext<UnitsContextValue>({
  system: 'metric',
  pref: 'auto',
  setPref: () => {},
  formatTemp: (c, o) => baseFormatTemp(c, 'metric', o),
  formatWind: (k) => baseFormatWind(k, 'metric'),
  formatPrecip: (m) => baseFormatPrecip(m, 'metric'),
});

export function UnitsProvider({ children }: { children: ReactNode }) {
  const [pref, setPrefState] = useState<UnitsPref>('auto');
  // SSR renders metric; the effect below resolves the real system on mount.
  const [system, setSystem] = useState<UnitSystem>('metric');

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    const initialPref: UnitsPref =
      saved === 'metric' || saved === 'imperial' ? saved : 'auto';
    setPrefState(initialPref);
    setSystem(resolveSystem(initialPref));

    // Location changed mid-session (manual city picked, approximate area
    // resolved) → an 'auto' preference may now mean a different system.
    const redetect = () => {
      setPrefState((current) => {
        setSystem(resolveSystem(current));
        return current;
      });
    };
    window.addEventListener(LOCATION_UPDATED_EVENT, redetect);
    window.addEventListener('storage', redetect);
    return () => {
      window.removeEventListener(LOCATION_UPDATED_EVENT, redetect);
      window.removeEventListener('storage', redetect);
    };
  }, []);

  const setPref = useCallback((next: UnitsPref) => {
    setPrefState(next);
    setSystem(resolveSystem(next));
    try {
      if (next === 'auto') localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // ignore storage failures
    }
  }, []);

  const value = useMemo<UnitsContextValue>(
    () => ({
      system,
      pref,
      setPref,
      formatTemp: (c, o) => baseFormatTemp(c, system, o),
      formatWind: (k) => baseFormatWind(k, system),
      formatPrecip: (m) => baseFormatPrecip(m, system),
    }),
    [system, pref, setPref],
  );

  return <UnitsContext.Provider value={value}>{children}</UnitsContext.Provider>;
}

export function useUnits(): UnitsContextValue {
  return useContext(UnitsContext);
}
