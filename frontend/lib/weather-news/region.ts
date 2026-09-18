//kalma/frontend/lib/weather-news/region.ts
//
// Maps a place's ISO 3166-1 alpha-2 country code to one of the seven
// broad regions used by the weather-news source scoreboard (see
// docs/WEATHER_NEWS_CURATION_ROUTINE_2026-07-08.md and the region check
// constraint on public.weather_news_sources / weather_news_items).
//
// This is an editorial grouping, not a strict UN geoscheme: Mexico maps
// to north-america (NOAA's own coverage notes name Mexico as a gap it
// should eventually close) while Haiti maps to latin-america-caribbean
// (CIIFEN's stated Caribbean gap) — matching which regional source is
// meant to eventually cover each place, not just continent geometry.
//
// Self-contained (no imports) so it can be used from server components,
// client components, and Node scripts alike.

export type NewsRegion =
  | 'global'
  | 'africa'
  | 'asia'
  | 'europe'
  | 'latin-america-caribbean'
  | 'north-america'
  | 'oceania-pacific';

const REGION_BY_COUNTRY_CODE: Record<string, NewsRegion> = {
  // Africa
  AO: 'africa', CM: 'africa', EG: 'africa', ET: 'africa', GQ: 'africa',
  KE: 'africa', NG: 'africa', ZA: 'africa', MA: 'africa', GH: 'africa',
  SN: 'africa', TZ: 'africa', UG: 'africa', DZ: 'africa', TN: 'africa',

  // Asia
  AE: 'asia', CN: 'asia', ID: 'asia', IN: 'asia', JP: 'asia', KR: 'asia',
  PH: 'asia', SG: 'asia', TH: 'asia', VN: 'asia', MY: 'asia', PK: 'asia',
  BD: 'asia', TR: 'asia', SA: 'asia', IR: 'asia', IL: 'asia',

  // Europe
  DE: 'europe', ES: 'europe', FR: 'europe', GB: 'europe', IT: 'europe',
  NL: 'europe', PL: 'europe', PT: 'europe', UA: 'europe', BE: 'europe',
  CH: 'europe', SE: 'europe', NO: 'europe', FI: 'europe', DK: 'europe',
  GR: 'europe',

  // Latin America and Caribbean
  AR: 'latin-america-caribbean', BR: 'latin-america-caribbean',
  CL: 'latin-america-caribbean', CO: 'latin-america-caribbean',
  HT: 'latin-america-caribbean', PE: 'latin-america-caribbean',
  PY: 'latin-america-caribbean', UY: 'latin-america-caribbean',
  EC: 'latin-america-caribbean', BO: 'latin-america-caribbean',
  VE: 'latin-america-caribbean', CU: 'latin-america-caribbean',
  DO: 'latin-america-caribbean', GT: 'latin-america-caribbean',
  PA: 'latin-america-caribbean',

  // North America
  CA: 'north-america', US: 'north-america', MX: 'north-america',

  // Oceania and Pacific
  AU: 'oceania-pacific', NZ: 'oceania-pacific', FJ: 'oceania-pacific',
  PG: 'oceania-pacific',
};

/** Falls back to 'global' for a country code with no editorial mapping
 *  yet (e.g. a newly promoted place) — the global WMO feed is relevant
 *  everywhere, so this is a safe default rather than a hidden gap. */
export function newsRegionForCountryCode(
  countryCode: string | null | undefined,
): NewsRegion {
  if (!countryCode) return 'global';
  return REGION_BY_COUNTRY_CODE[countryCode.toUpperCase()] ?? 'global';
}
