// kalma/frontend/lib/signal-engine/signal-action.ts
//
// Bridge between a weather signal and the user's options for acting on it.
//
// For each signal, the user should see ONE of:
//   - "Open this risk signal →" link to a live market that already covers
//     this place + risk + window
//   - "Open a risk signal for this place →" deeplink to /create with the right
//     coordinates, market type, and start/duration prefilled
//
// The "this market exists" check matches by:
//   - lat/lon proximity (≤ ~50km)
//   - signal type → user-creatable market type (1-4: RAIN, TEMP_HIGH,
//     TEMP_LOW, SNOW). V6 signals map back to V5 market types — the
//     four hidden market types (5-8) aren't user-creatable, so we
//     direct people to the closest available market type.
//   - market still accepts positions OR overlaps the signal's window
//
// This file is pure data shape — no React, no hooks. The Match shape
// gets consumed by <SignalActionCTA /> which mounts inside SignalCard.

import { MARKET_TYPES } from '@/lib/contracts';

/**
 * Map a signal_type_id to a user-creatable market type (V5: 1-4).
 * V6 signals (cold spell, dry stretch, frost, heavy rain) don't have
 * a 1:1 user-creatable market type, so we route to the closest match:
 *   cold spell    → TEMP_LOW
 *   dry stretch   → RAIN
 *   frost risk    → TEMP_LOW
 *   heavy rain    → RAIN
 *   water recovery → RAIN
 */
export function signalToMarketType(signalTypeId: string): number {
  switch (signalTypeId) {
    case 'rainfall_risk_rising':
      return MARKET_TYPES.RAIN;
    case 'heat_stress_window':
      return MARKET_TYPES.TEMP_HIGH;
    case 'water_recovery_signal':
      return MARKET_TYPES.RAIN;
    case 'consecutive_cold_below':
      return MARKET_TYPES.TEMP_LOW;
    case 'dry_stretch_window':
      return MARKET_TYPES.RAIN;
    case 'frost_risk':
      return MARKET_TYPES.TEMP_LOW;
    case 'heavy_rain_event':
      return MARKET_TYPES.RAIN;
    default:
      return MARKET_TYPES.RAIN;
  }
}

/**
 * Haversine distance in km between two lat/lon pairs. Used to find
 * nearby markets to a signal's place.
 */
function distanceKm(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(x));
}

// Minimal Market shape this helper needs. Real Market objects (from
// useMarkets) have many more fields; we only pick what we use.
export type MarketLike = {
  id: bigint;
  marketTypeId: number;
  lat: number;
  lon: number;
  startTime: number;
  endTime: number;
  /** When answering closes (unix seconds). After this the market is
   *  observe-only until it resolves. Falls back to startTime if absent. */
  predictionDeadline?: number;
  resolved: boolean;
  cancelled: boolean;
};

export type SignalActionMatch =
  | {
      kind: 'open-market';
      marketId: string;
      /** true → still accepting answers; false → observe-only (answering
       *  closed, the weather window is running until resolution). */
      answerable: boolean;
    }
  | {
      kind: 'create-market';
      params: {
        lat: number;
        lon: number;
        name: string;
        type: number;
        start: string; // YYYY-MM-DD
        duration: number;
      };
    };

/**
 * Find the best market alignment for a signal. Returns 'open-market'
 * when there's an active market for this place + compatible type;
 * otherwise builds the create-market deeplink params.
 *
 * Heuristics:
 *   - Markets must be within 50km of the signal's place
 *   - Same market type as the signal maps to (per signalToMarketType)
 *   - Not resolved, not cancelled
 *   - Window doesn't have to overlap exactly — if the signal validity
 *     starts within (or shortly before) the market's prediction window,
 *     we consider it a match. People can predict on a market whose
 *     window covers the signal's expected event.
 */
export function getSignalAction(
  signal: {
    signalTypeId: string;
    validFrom: string;
    validUntil: string;
    place: { name: string; lat: number; lon: number };
  },
  markets: MarketLike[],
): SignalActionMatch {
  const wantedType = signalToMarketType(signal.signalTypeId);
  const signalFromMs = Date.parse(signal.validFrom);
  const signalUntilMs = Date.parse(signal.validUntil);
  const signalFromS = Number.isFinite(signalFromMs) ? signalFromMs / 1000 : 0;
  const signalUntilS = Number.isFinite(signalUntilMs)
    ? signalUntilMs / 1000
    : 0;

  // 1) Find live markets nearby with the right type.
  const candidates = markets
    .filter((m) => !m.resolved && !m.cancelled)
    .filter((m) => m.marketTypeId === wantedType)
    .filter(
      (m) =>
        distanceKm(
          { lat: signal.place.lat, lon: signal.place.lon },
          { lat: m.lat, lon: m.lon },
        ) <= 50,
    );

  // 2) Of those, prefer one whose window overlaps the signal validity.
  //    Fallback: any active candidate.
  const overlapping = candidates.filter((m) => {
    // Treat the market as "useful for this signal" if the signal's
    // validity intersects the market's observation window, OR if the
    // market is still open for predictions (signal date precedes the
    // market's startTime).
    const overlaps = signalFromS <= m.endTime && signalUntilS >= m.startTime;
    const stillOpen = signalFromS < m.startTime;
    return overlaps || stillOpen;
  });

  // A market is answerable while now < its prediction deadline (state
  // 'live'); once the deadline passes it's observe-only ('cooldown' /
  // awaiting resolution). Prefer an answerable market so people land on a
  // question they can actually answer; only fall back to an observe-only
  // one when no answerable market exists for this place.
  const nowS = Math.floor(Date.now() / 1000);
  const isAnswerable = (m: MarketLike) =>
    nowS <
    (m.predictionDeadline && m.predictionDeadline > 0
      ? m.predictionDeadline
      : m.startTime);

  const best =
    overlapping.find(isAnswerable) ??
    candidates.find(isAnswerable) ??
    overlapping[0] ??
    candidates[0];
  if (best) {
    return {
      kind: 'open-market',
      marketId: best.id.toString(),
      answerable: isAnswerable(best),
    };
  }

  // 3) No matching market — build a create deeplink. Use the signal's
  //    valid_from as the start date (the signal is forecasting that
  //    period). Duration spans the signal's window, clamped to 1-30d.
  const startDate =
    isoDate(signal.validFrom) ?? isoDate(new Date().toISOString())!;
  const fromMs = Date.parse(signal.validFrom);
  const untilMs = Date.parse(signal.validUntil);
  let duration = 7;
  if (Number.isFinite(fromMs) && Number.isFinite(untilMs)) {
    duration = Math.round((untilMs - fromMs) / (24 * 60 * 60 * 1000));
    duration = Math.min(30, Math.max(1, duration));
  }

  return {
    kind: 'create-market',
    params: {
      lat: signal.place.lat,
      lon: signal.place.lon,
      name: signal.place.name,
      type: wantedType,
      start: startDate,
      duration,
    },
  };
}

/**
 * Markets a place can currently answer that no active local_signal points
 * to. /signals and /places/[slug] only ever rendered a market by way of a
 * signal's own CTA (SignalActionCTA), so a place whose live signals happen
 * to all be one family (Phoenix: three straight rain-family signals, no
 * heat/cold one) left its genuinely open temp_high/temp_low markets
 * reachable only from /markets and /today. This is the other direction of
 * getSignalAction: instead of the best market for one signal, every open
 * market no signal already covers.
 *
 * Generic over T so callers can pass full `Market` objects (from
 * useMarkets/useMarketsSnapshot) straight through to MarketCard without a
 * lossy round-trip through the narrower MarketLike shape.
 */
export function findOrphanMarkets<T extends MarketLike>(
  signals: Array<{
    signalTypeId: string;
    validFrom: string;
    validUntil: string;
    place: { name: string; lat: number; lon: number };
  }>,
  markets: T[],
  now: number = Math.floor(Date.now() / 1000),
): T[] {
  const covered = new Set<string>();
  for (const signal of signals) {
    const action = getSignalAction(signal, markets);
    if (action.kind === 'open-market') covered.add(action.marketId);
  }

  const isOpen = (m: MarketLike) => {
    if (m.resolved || m.cancelled) return false;
    const deadline =
      m.predictionDeadline && m.predictionDeadline > 0
        ? m.predictionDeadline
        : m.startTime;
    return now < deadline;
  };

  return markets.filter((m) => isOpen(m) && !covered.has(m.id.toString()));
}

function isoDate(s: string): string | null {
  const t = Date.parse(s);
  if (!Number.isFinite(t)) return null;
  const d = new Date(t);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Build the /create deeplink URL from a create-market match.
 */
export function buildCreateLink(
  params: Extract<SignalActionMatch, { kind: 'create-market' }>['params'],
): string {
  const usp = new URLSearchParams({
    lat: String(params.lat),
    lon: String(params.lon),
    name: params.name,
    type: String(params.type),
    start: params.start,
    duration: String(params.duration),
  });
  return `/create?${usp.toString()}`;
}
