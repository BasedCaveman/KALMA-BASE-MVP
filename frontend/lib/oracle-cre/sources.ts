// kalma/frontend/lib/oracle-cre/sources.ts
//
// Weather sources for the CRE shadow oracle. Each source independently
// fetches the daily series for a market's window and derives the observed
// value with the shared, operator-identical math in ./derive.
//
// The point of the CRE side is CONSENSUS ACROSS SOURCES. The operator oracle
// resolves on-chain from Open-Meteo alone; the CRE shadow runs several public
// sources and reports where they agree and where they diverge. Adding a
// fourth source later is one entry in SOURCES, and the consensus logic in
// ./shadow adapts automatically.
//
// All sources here are keyless public APIs (Open-Meteo archive, NASA POWER),
// the same two the operator watchdog already uses (Open-Meteo to resolve,
// NASA POWER for challenge review), so nothing new needs provisioning.

import {
  dailyVariableForMarketType,
  deriveObservedValue,
  MARKET_TYPES,
  type Derived,
} from './derive';

export type MarketWindow = {
  lat: number;
  lon: number;
  marketTypeId: number;
  /** Unix seconds. */
  startTime: number;
  /** Unix seconds. */
  endTime: number;
};

export type SourceReading = Derived & {
  source: string;
  sourceUrl: string;
  rawValues: number[];
};

function unixToDate(unix: number): string {
  return new Date(Number(unix) * 1000).toISOString().slice(0, 10);
}

// The window's inclusive last day: endTime is the exclusive boundary, so step
// back one second before taking the date (matches the watchdog).
function unixToInclusiveEndDate(unix: number): string {
  return unixToDate(Math.max(0, Number(unix) - 1));
}

async function fetchOpenMeteo(w: MarketWindow): Promise<SourceReading> {
  const daily = dailyVariableForMarketType(w.marketTypeId);
  const url =
    `https://archive-api.open-meteo.com/v1/archive?latitude=${w.lat}&longitude=${w.lon}` +
    `&start_date=${unixToDate(w.startTime)}&end_date=${unixToInclusiveEndDate(w.endTime)}` +
    `&daily=${daily}&timezone=UTC`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Open-Meteo ${res.status}`);
  const data = await res.json();
  const values: number[] = Array.isArray(data?.daily?.[daily])
    ? data.daily[daily].map(Number).filter((n: number) => Number.isFinite(n))
    : [];
  if (!values.length) throw new Error('Open-Meteo returned no values');
  return { ...deriveObservedValue(w.marketTypeId, values), source: 'Open-Meteo', sourceUrl: url, rawValues: values };
}

async function fetchNasaPower(w: MarketWindow): Promise<SourceReading> {
  const parameter =
    w.marketTypeId === MARKET_TYPES.TEMP_HIGH
      ? 'T2M_MAX'
      : w.marketTypeId === MARKET_TYPES.TEMP_LOW ||
          w.marketTypeId === MARKET_TYPES.COLD_SPELL ||
          w.marketTypeId === MARKET_TYPES.FROST_RISK
        ? 'T2M_MIN'
        : 'PRECTOTCORR';
  const start = unixToDate(w.startTime).replace(/-/g, '');
  const end = unixToInclusiveEndDate(w.endTime).replace(/-/g, '');
  const url =
    `https://power.larc.nasa.gov/api/temporal/daily/point?parameters=${parameter}` +
    `&community=RE&longitude=${w.lon}&latitude=${w.lat}&start=${start}&end=${end}&format=JSON`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`NASA POWER ${res.status}`);
  const data = await res.json();
  const params = data?.properties?.parameter?.[parameter] ?? {};
  const values: number[] = Object.values(params)
    .map(Number)
    // NASA POWER uses -999 as a fill/no-data sentinel.
    .filter((v) => Number.isFinite(v) && v > -900);
  if (!values.length) throw new Error(`NASA POWER returned no values (${parameter})`);
  // NASA POWER has no snowfall parameter; snow markets fall back to Open-Meteo
  // only (handled by the caller catching this throw).
  if (w.marketTypeId === MARKET_TYPES.SNOW) throw new Error('NASA POWER has no snowfall series');
  return { ...deriveObservedValue(w.marketTypeId, values), source: 'NASA POWER', sourceUrl: url, rawValues: values };
}

/** The registered CRE shadow sources. Order is display order on the trust page. */
export const SOURCES: Array<{ name: string; fetch: (w: MarketWindow) => Promise<SourceReading> }> = [
  { name: 'Open-Meteo', fetch: fetchOpenMeteo },
  { name: 'NASA POWER', fetch: fetchNasaPower },
];

/**
 * Fetch every source for a market window, tolerating individual failures.
 * Returns only the readings that succeeded (never throws for a single dead
 * source); the caller decides whether enough sources responded.
 */
export async function fetchAllSources(w: MarketWindow): Promise<SourceReading[]> {
  const settled = await Promise.allSettled(SOURCES.map((s) => s.fetch(w)));
  const ok: SourceReading[] = [];
  for (const r of settled) {
    if (r.status === 'fulfilled') ok.push(r.value);
    else console.warn('[cre-shadow] source failed:', r.reason?.message ?? r.reason);
  }
  return ok;
}
