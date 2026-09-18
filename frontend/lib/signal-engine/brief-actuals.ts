// kalma/frontend/lib/signal-engine/brief-actuals.ts
// Provider failures are errors; unpublished daily values are deferred work.
//
// 429 is the exception: it says "ask again later", not "this row is bad". The
// 2026-09-09 measurement found every single verification miss was a 429 (50 of
// 200 selected), and an unretried 429 costs the row a whole half-day, since it
// only comes back on the next scheduled pass. So rate limiting is retried here,
// honouring Retry-After when the provider sends one.

export type DailyActuals = {
  precipitation_sum_mm: number | null;
  temperature_max_c: number | null;
  temperature_min_c: number | null;
  snowfall_sum_cm: number | null;
  wind_gusts_max_kmh: number | null;
};

export class BriefActualsError extends Error {
  code: string;
  status: number | null;

  constructor(code: string, status: number | null = null) {
    super(`brief actuals: ${code}${status === null ? '' : ` (${status})`}`);
    this.name = 'BriefActualsError';
    this.code = code;
    this.status = status;
  }
}

/** Backoff before the Nth rate-limit retry, in ms. Length sets the retry count. */
const RATE_LIMIT_BACKOFF_MS = [1_000, 3_000];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Retry-After is either seconds or an HTTP date. Anything unreadable, absent or
 * absurd falls back to our own backoff: a provider asking us to wait ten minutes
 * must not stall a cron pass that has 300 seconds in total.
 */
function retryAfterMs(response: Response, fallbackMs: number): number {
  const header = response.headers.get('retry-after');
  if (!header) return fallbackMs;
  const seconds = Number(header);
  const ms = Number.isFinite(seconds)
    ? seconds * 1_000
    : Date.parse(header) - Date.now();
  if (!Number.isFinite(ms) || ms <= 0) return fallbackMs;
  return Math.min(ms, 10_000);
}

export async function fetchDailyActuals(
  lat: number,
  lon: number,
  date: string,
): Promise<DailyActuals | null> {
  const params = new URLSearchParams({
    latitude: String(lat), longitude: String(lon),
    daily: 'precipitation_sum,temperature_2m_max,temperature_2m_min,snowfall_sum,wind_gusts_10m_max',
    start_date: date, end_date: date, timezone: 'auto',
  });
  let response: Response;
  for (let attempt = 0; ; attempt += 1) {
    try {
      response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, {
        signal: AbortSignal.timeout(10_000),
      });
    } catch (error) {
      throw new BriefActualsError(
        error instanceof Error && /Timeout|Abort/.test(error.name)
          ? 'provider_timeout' : 'provider_transport',
      );
    }
    if (response.status !== 429 || attempt >= RATE_LIMIT_BACKOFF_MS.length) break;
    await sleep(retryAfterMs(response, RATE_LIMIT_BACKOFF_MS[attempt]));
  }
  if (!response.ok) throw new BriefActualsError('provider_http', response.status);
  let body;
  try { body = await response.json(); }
  catch { throw new BriefActualsError('provider_invalid_json'); }
  const daily = body?.daily;
  if (!daily || daily.time?.[0] !== date) {
    throw new BriefActualsError('provider_invalid_daily');
  }
  const first = (values: unknown): number | null =>
    Array.isArray(values) && typeof values[0] === 'number' && Number.isFinite(values[0])
      ? values[0] : null;
  const actuals: DailyActuals = {
    precipitation_sum_mm: first(daily.precipitation_sum),
    temperature_max_c: first(daily.temperature_2m_max),
    temperature_min_c: first(daily.temperature_2m_min),
    snowfall_sum_cm: first(daily.snowfall_sum),
    wind_gusts_max_kmh: first(daily.wind_gusts_10m_max),
  };
  return Object.values(actuals).some(value => value !== null) ? actuals : null;
}
