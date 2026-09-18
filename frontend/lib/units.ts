//kalma/frontend/lib/units.ts
//
// Measurement-system localization. A user in California should read 97°F
// and 14 mph, not 36°C and 22 km/h — the app detects the system from the
// user's location (approximate or manually selected city) and lets them
// override it in Profile. Pure module: shared by client components, the
// units context, and server OG-card renders (where the system follows the
// PLACE's country instead of the viewer's).
//
// All internal data stays metric (Open-Meteo, contract thresholds, the
// wind impact scale bands). Conversion happens at DISPLAY time only.

export type UnitSystem = 'metric' | 'imperial';
export type UnitsPref = 'auto' | UnitSystem;

// Countries where everyday weather runs on °F / mph. ISO-3166 alpha-2.
// US + its territories, plus the classic Fahrenheit holdouts.
const IMPERIAL_CODES = new Set([
  'US', 'PR', 'GU', 'VI', 'AS', 'MP', 'UM',
  'BS', 'BZ', 'KY', 'PW', 'FM', 'MH', 'LR', 'MM',
]);

// Fallback for stored locations that only carry a display name (possibly
// localized). Normalized substring match — deliberately short list.
const IMPERIAL_NAME_PATTERNS = [
  'united states', 'estados unidos', 'états-unis', 'etats-unis',
  'vereinigte staaten', '美国',
  'bahamas', 'belize', 'liberia', 'libéria',
  'myanmar', 'burma', 'birmania', 'birmânia', 'birmanie',
];
const IMPERIAL_NAME_EXACT = new Set(['usa', 'us', 'eua', 'ee. uu.', 'ee.uu.']);

export function systemForCountry(
  countryCode?: string | null,
  countryName?: string | null,
): UnitSystem {
  if (countryCode && IMPERIAL_CODES.has(countryCode.trim().toUpperCase())) {
    return 'imperial';
  }
  if (countryName) {
    const normalized = countryName.trim().toLowerCase();
    if (
      IMPERIAL_NAME_EXACT.has(normalized) ||
      IMPERIAL_NAME_PATTERNS.some((p) => normalized.includes(p))
    ) {
      return 'imperial';
    }
  }
  return 'metric';
}

export const cToF = (celsius: number): number => (celsius * 9) / 5 + 32;
export const kmhToMph = (kmh: number): number => kmh / 1.609344;
export const mmToIn = (mm: number): number => mm / 25.4;
export const cmToIn = (cm: number): number => cm / 2.54;

/** "36°C" / "97°F"; null-safe → "-". `unit: false` drops the letter ("36°"). */
export function formatTemp(
  celsius: number | null | undefined,
  system: UnitSystem,
  opts: { unit?: boolean } = {},
): string {
  if (!Number.isFinite(celsius)) return '-';
  const value = system === 'imperial' ? cToF(Number(celsius)) : Number(celsius);
  const suffix = opts.unit === false ? '°' : system === 'imperial' ? '°F' : '°C';
  return `${Math.round(value)}${suffix}`;
}

/** "22 km/h" / "14 mph"; null-safe → "-". */
export function formatWind(
  kmh: number | null | undefined,
  system: UnitSystem,
): string {
  if (!Number.isFinite(kmh)) return '-';
  return system === 'imperial'
    ? `${Math.round(kmhToMph(Number(kmh)))} mph`
    : `${Math.round(Number(kmh))} km/h`;
}

/** "27mm" / "1.1 in"; null-safe → "-". */
export function formatPrecip(
  mm: number | null | undefined,
  system: UnitSystem,
): string {
  if (!Number.isFinite(mm)) return '-';
  if (system === 'metric') return `${Math.round(Number(mm))}mm`;
  const inches = mmToIn(Number(mm));
  return `${inches < 1 ? inches.toFixed(2) : inches.toFixed(1)} in`;
}

/** Wind-scale tick label in the display system (ticks are defined in km/h). */
export function windTickLabel(kmhTick: number, system: UnitSystem): string {
  return system === 'imperial'
    ? String(Math.round(kmhToMph(kmhTick)))
    : String(kmhTick);
}

export const windUnitLabel = (system: UnitSystem): string =>
  system === 'imperial' ? 'mph' : 'km/h';

// ---------------------------------------------------------------------------
// Signal thresholds
//
// The threshold a signal asks about is written on-chain in METRIC and is the
// value the oracle resolves against — it never changes. These helpers convert
// it for DISPLAY only, so a grower in Iowa reads the same question in °F that
// a grower in Lavras reads in °C, and both resolve against the same number.
//
// `unit` is the string the MarketTypeRegistry registered for the threshold
// axis ('°C', 'mm', 'cm', or a non-measurement unit like 'days'). Anything
// that is not a measurement passes through untouched.
// ---------------------------------------------------------------------------

/**
 * Convert an on-chain (metric) threshold into the display system.
 * Returns the display value and the unit string to append to it — the unit
 * carries its own leading space where the convention needs one (" in"), so
 * callers can keep writing `${value}${unit}`.
 */
export function convertThreshold(
  metricValue: number,
  metricUnit: string | null | undefined,
  system: UnitSystem,
): { value: number; unit: string } {
  const unit = (metricUnit ?? '').trim();
  if (system === 'metric' || !Number.isFinite(metricValue)) {
    return { value: metricValue, unit };
  }

  if (unit === '°C') {
    return { value: Math.round(cToF(metricValue)), unit: '°F' };
  }
  if (unit === 'mm' || unit === 'cm') {
    const inches = unit === 'mm' ? mmToIn(metricValue) : cmToIn(metricValue);
    // Sub-inch amounts need two decimals to stay meaningful (0.04 in, not 0 in).
    return { value: Number(inches < 1 ? inches.toFixed(2) : inches.toFixed(1)), unit: ' in' };
  }
  // 'days', '%', anything else the registry carries: not a measurement system.
  return { value: metricValue, unit };
}

/** `convertThreshold` rendered straight to a string: "28°C" / "82°F". */
export function formatThreshold(
  metricValue: number,
  metricUnit: string | null | undefined,
  system: UnitSystem,
): string {
  const { value, unit } = convertThreshold(metricValue, metricUnit, system);
  return `${value}${unit}`;
}

/** Temperature threshold shorthand — the °C/°F axis without a registry unit. */
export function thresholdTemp(celsius: number, system: UnitSystem): string {
  return formatThreshold(celsius, '°C', system);
}

/** Rainfall threshold shorthand — the mm/in axis without a registry unit. */
export function thresholdPrecip(mm: number, system: UnitSystem): string {
  return formatThreshold(mm, 'mm', system);
}
