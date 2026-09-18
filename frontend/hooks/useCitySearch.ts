'use client';

import { useCallback, useState } from 'react';

import {
  primaryCityFor,
  isPopulatedPlace,
  isCountryRecord,
} from '@/lib/geo/country-primary-city';

export type CitySearchResult = {
  id: number;
  name: string;
  country?: string;
  country_code?: string;
  admin1?: string;
  /** Open-Meteo place class (PPL* populated place, PCLI country, ADM* division). */
  feature_code?: string;
  /** Inhabitants, when Open-Meteo has a figure. Absent for many small towns. */
  population?: number;
  latitude: number;
  longitude: number;
  timezone?: string;
};

const GEO_CACHE_PREFIX = 'kalma-geo-v1:';
const GEO_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function normalizeGeoQuery(value: string) {
  return value.trim().toLowerCase();
}

function getGeoCacheKey(query: string) {
  return `${GEO_CACHE_PREFIX}${normalizeGeoQuery(query)}`;
}

function readGeoCache(query: string): CitySearchResult[] | null {
  try {
    const raw = localStorage.getItem(getGeoCacheKey(query));
    if (!raw) return null;

    const parsed = JSON.parse(raw) as {
      timestamp: number;
      results: CitySearchResult[];
    };

    if (!parsed?.timestamp || !Array.isArray(parsed.results)) {
      localStorage.removeItem(getGeoCacheKey(query));
      return null;
    }

    if (Date.now() - parsed.timestamp > GEO_CACHE_TTL_MS) {
      localStorage.removeItem(getGeoCacheKey(query));
      return null;
    }

    return parsed.results;
  } catch {
    return null;
  }
}

function writeGeoCache(query: string, results: CitySearchResult[]) {
  try {
    localStorage.setItem(
      getGeoCacheKey(query),
      JSON.stringify({
        timestamp: Date.now(),
        results,
      })
    );
  } catch {
    // ignore cache write failures
  }
}

export function buildCitySearchLabel(city: CitySearchResult) {
  return [city.name, city.admin1, city.country].filter(Boolean).join(', ');
}

export function buildCitySearchMeta(city: CitySearchResult) {
  return [city.admin1, city.country].filter(Boolean).join(' · ');
}


// ── Result refinement ───────────────────────────────────────────────────────
//
// Two problems the raw geocoder has, both hit by real searches on 2026-08-05.
//
// 1. A COUNTRY IS NOT A PLACE ANYONE STANDS IN. "Nepal" answers with the
//    country itself, a centroid in the Himalaya, and Kathmandu appears nowhere
//    in the results. The API has no "capital of" concept, so a country record
//    is swapped for its primary city via a second lookup (see
//    lib/geo/country-primary-city.ts), and dropped when we have no mapping
//    rather than left in to fail later.
//
// 2. HAMLETS OUTRANK CITIES. "Bahia" answered with Salvador first, but
//    "California" answered with four villages named California in Missouri,
//    Colombia, Maryland and Pennsylvania. Ordering by population puts the
//    place a person probably meant at the top without hiding the others,
//    which matters far more often than the country case: the common failure
//    is someone typing their own city and getting eight homonyms.
//
// Done here rather than in the five calling surfaces because this hook is the
// one door they all already go through.

async function lookupPrimaryCity(
  cityName: string,
  countryCode: string,
): Promise<CitySearchResult | null> {
  try {
    const url =
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cityName)}` +
      `&count=10&language=en&format=json`;
    const res = await fetch(url, { headers: { Accept: 'application/json' }, cache: 'no-store' });
    if (!res.ok) return null;
    const json = await res.json();
    const list: CitySearchResult[] = Array.isArray(json?.results) ? json.results : [];
    // Must be IN that country and be a populated place, so a same-named city
    // elsewhere can never stand in for the one we meant.
    const match = list.find(
      (r) =>
        (r.country_code ?? '').toUpperCase() === countryCode.toUpperCase() &&
        isPopulatedPlace(r.feature_code),
    );
    return match ?? null;
  } catch {
    return null;
  }
}

async function refineResults(raw: CitySearchResult[]): Promise<CitySearchResult[]> {
  const out: CitySearchResult[] = [];
  const seen = new Set<string>();

  for (const r of raw) {
    if (isCountryRecord(r.feature_code)) {
      const cc = (r.country_code ?? '').toUpperCase();
      const city = primaryCityFor(cc);
      if (!city) continue; // no mapping: better absent than broken
      const resolved = await lookupPrimaryCity(city, cc);
      if (resolved) {
        const key = `${resolved.latitude},${resolved.longitude}`;
        if (!seen.has(key)) {
          seen.add(key);
          out.push(resolved);
        }
      }
      continue;
    }
    const key = `${r.latitude},${r.longitude}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }

  // Most populous first; places with no population figure keep their relative
  // order at the end rather than being dropped, since plenty of small real
  // towns simply have no figure recorded.
  return out.sort((a, b) => (b.population ?? -1) - (a.population ?? -1));
}

export function useCitySearch() {
  const [results, setResults] = useState<CitySearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState('');
  const [searchedQuery, setSearchedQuery] = useState('');

  const clearCitySearch = useCallback(() => {
    setResults([]);
    setError('');
    setSearchedQuery('');
  }, []);

  const searchCities = useCallback(async (query: string) => {
    const trimmed = query.trim();
    setSearchedQuery(trimmed);

    if (trimmed.length < 2) {
      setResults([]);
      setError('Type at least 2 letters.');
      return [];
    }

    const cached = readGeoCache(trimmed);
    if (cached) {
      setResults(cached);
      setError('');
      return cached;
    }

    try {
      setIsSearching(true);
      setError('');
      setResults([]);

      const url =
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(trimmed)}` +
        `&count=8&language=en&format=json`;

      const res = await fetch(url, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        cache: 'no-store',
      });

      if (!res.ok) throw new Error(`Geocoding failed with ${res.status}`);

      const data = await res.json();
      const raw: CitySearchResult[] = Array.isArray(data?.results) ? data.results : [];
      const nextResults = await refineResults(raw);

      setResults(nextResults);
      writeGeoCache(trimmed, nextResults);
      return nextResults;
    } catch {
      setResults([]);
      setError('Could not search cities right now.');
      return [];
    } finally {
      setIsSearching(false);
    }
  }, []);

  return {
    results,
    isSearching,
    error,
    searchedQuery,
    searchCities,
    clearCitySearch,
  };
}
