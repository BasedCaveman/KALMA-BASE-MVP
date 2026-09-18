// kalma/frontend/lib/growth/freshness.ts
//
// Never publish a number the current model run no longer supports.
//
// This guard exists because of a near miss. The planner offered, and was
// about to publish:
//
//   "169mm in a single day is on the table for Boston on Thursday."
//
// The brief was honest: at 06:02 UTC the run really did carry 168.9mm, almost
// certainly a tropical system the model later moved. By the time we went to
// post, Open-Meteo said 28.6mm for that day. Tokyo had swung the same way,
// 35.8mm of 48-hour rain down to 8.4mm.
//
// Inside the app a brief is a dated snapshot and that is the point. On X a
// number is a claim about right now, and a 6x stale claim is simply false.
// So every post re-checks its own headline figure against a live fetch, and
// a post that no longer holds is dropped rather than corrected: the next
// place in the ranking is one line of copy away.

import type { BriefSignal, SignalPlace } from './kalma-data.ts';

const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';

export interface FreshnessResult {
  ok: boolean;
  /** What the stored brief claimed. */
  stored: number | null;
  /** What the model says now. */
  fresh: number | null;
  metric: string;
  reason: string;
}

const OK = (metric: string, stored: number, fresh: number): FreshnessResult => ({
  ok: true,
  stored,
  fresh,
  metric,
  reason: 'holds',
});

const STALE = (
  metric: string,
  stored: number | null,
  fresh: number | null,
): FreshnessResult => ({
  ok: false,
  stored,
  fresh,
  metric,
  reason: 'model_moved',
});

const UNKNOWN = (metric: string, reason: string): FreshnessResult => ({
  ok: false,
  stored: null,
  fresh: null,
  metric,
  reason,
});

interface DailyRows {
  time: string[];
  precipitation_sum?: Array<number | null>;
  temperature_2m_max?: Array<number | null>;
  temperature_2m_min?: Array<number | null>;
}

async function fetchDaily(
  place: SignalPlace,
  days: number,
  fetchImpl: typeof fetch = fetch,
): Promise<DailyRows | null> {
  if (place.lat === null || place.lon === null) return null;
  const params = new URLSearchParams({
    latitude: String(place.lat),
    longitude: String(place.lon),
    daily: 'precipitation_sum,temperature_2m_max,temperature_2m_min',
    forecast_days: String(days),
    timezone: 'UTC',
  });
  try {
    const res = await fetchImpl(`${FORECAST_URL}?${params}`, {
      headers: { 'user-agent': 'kalma-growth/1.0 (+https://kalma.me)' },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { daily?: DailyRows };
    return json.daily ?? null;
  } catch {
    return null;
  }
}

const nums = (values: Array<number | null> | undefined): number[] =>
  (values ?? []).map((v) => (typeof v === 'number' ? v : NaN)).filter(isFinite);

/**
 * Does the headline number still hold?
 *
 * Tolerances are generous on purpose: forecasts move, and we are not trying
 * to catch a 10% drift. We are trying to never again offer 169mm when the
 * model says 29.
 */
export async function verifySignal(
  place: SignalPlace,
  signal: BriefSignal,
  fetchImpl: typeof fetch = fetch,
): Promise<FreshnessResult> {
  const sd = signal.structured_data ?? {};
  const stored = (key: string): number => Number(sd[key]);

  const daily = await fetchDaily(place, 14, fetchImpl);
  if (!daily) return UNKNOWN(signal.signal_type_id, 'no_live_data');

  switch (signal.signal_type_id) {
    case 'rainfall_risk_rising': {
      const claim = stored('forecast_48h_mm');
      const rain = nums(daily.precipitation_sum).slice(0, 2);
      if (!rain.length) return UNKNOWN('forecast_48h_mm', 'no_live_data');
      const fresh = rain.reduce((a, b) => a + b, 0);
      return withinRain(claim, fresh)
        ? OK('forecast_48h_mm', claim, fresh)
        : STALE('forecast_48h_mm', claim, fresh);
    }
    case 'heavy_rain_event': {
      const claim = stored('wettest_forecast_mm');
      const rain = nums(daily.precipitation_sum).slice(0, 7);
      if (!rain.length) return UNKNOWN('wettest_forecast_mm', 'no_live_data');
      const fresh = Math.max(...rain);
      return withinRain(claim, fresh)
        ? OK('wettest_forecast_mm', claim, fresh)
        : STALE('wettest_forecast_mm', claim, fresh);
    }
    case 'frost_risk': {
      const claim = stored('coldest_forecast_celsius');
      const lows = nums(daily.temperature_2m_min);
      if (!lows.length) return UNKNOWN('coldest_forecast_celsius', 'no_live_data');
      const fresh = Math.min(...lows);
      // A frost claim survives while the cold night is still in the run.
      return Math.abs(fresh - claim) <= 2.5
        ? OK('coldest_forecast_celsius', claim, fresh)
        : STALE('coldest_forecast_celsius', claim, fresh);
    }
    case 'heat_stress_window': {
      const claim = stored('forecast_7d_max_avg_c');
      const highs = nums(daily.temperature_2m_max).slice(0, 7);
      if (!highs.length) return UNKNOWN('forecast_7d_max_avg_c', 'no_live_data');
      const fresh = highs.reduce((a, b) => a + b, 0) / highs.length;
      return Math.abs(fresh - claim) <= 2
        ? OK('forecast_7d_max_avg_c', claim, fresh)
        : STALE('forecast_7d_max_avg_c', claim, fresh);
    }
    case 'dry_stretch_window': {
      const claim = stored('observed_run_days');
      const threshold = Number(sd.threshold_mm ?? 1);
      const rain = nums(daily.precipitation_sum);
      let fresh = 0;
      for (const value of rain) {
        if (value <= threshold) fresh++;
        else break;
      }
      // A run only has to still be long enough to be the story we told.
      return fresh >= Math.min(claim, 5) * 0.7
        ? OK('observed_run_days', claim, fresh)
        : STALE('observed_run_days', claim, fresh);
    }
    case 'consecutive_cold_below': {
      const claim = stored('observed_run_days');
      const threshold = Number(sd.threshold_celsius);
      const highs = nums(daily.temperature_2m_max);
      let best = 0;
      let run = 0;
      for (const value of highs) {
        run = value < threshold ? run + 1 : 0;
        best = Math.max(best, run);
      }
      return best >= Math.min(claim, 3) * 0.7
        ? OK('observed_run_days', claim, best)
        : STALE('observed_run_days', claim, best);
    }
    default:
      // Signals built from recorded history rather than a forecast do not
      // go stale in this way.
      return { ok: true, stored: null, fresh: null, metric: signal.signal_type_id, reason: 'not_forecast_based' };
  }
}

/**
 * Rainfall tolerance. Absolute room for small numbers, proportional room for
 * big ones, and a hard stop on the direction that embarrasses us: claiming
 * far more rain than the model now carries.
 */
function withinRain(claim: number, fresh: number): boolean {
  if (!isFinite(claim) || !isFinite(fresh)) return false;
  if (Math.abs(fresh - claim) <= 5) return true;
  const ratio = fresh / Math.max(claim, 0.1);
  return ratio >= 0.6;
}
