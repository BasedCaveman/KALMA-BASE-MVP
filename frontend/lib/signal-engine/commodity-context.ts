//kalma/frontend/lib/signal-engine/commodity-context.ts
//
// Commodity market context engine: daily front-month futures closes and
// anomaly events (surge / drop / 52-week high / 52-week low). Events are
// routed to places at read time by intersecting COMMODITY_MAP's activity
// groups with place_activity_profiles.groups — a coffee price spike is
// context for Lavras and São Paulo, noise for Winnipeg.
//
// Kalma is a coordination layer, not a trading app: we store daily
// closes and emit an event only when movement is anomalous. A flat
// market produces silence. Market data is a fourth kind of truth
// (Golden Rule 8) — always surfaced with its own source label, never as
// advice.
//
// Same conventions as activity-profile.ts: intentionally self-contained
// (zero imports) so the Next.js cron route, the browser bundle, and
// plain Node scripts (native type stripping) share one implementation.

export type CommodityDef = {
  /** Yahoo Finance front-month futures symbol. */
  symbol: string;
  /** Human label used in copy templates. */
  label: string;
  /** Quote unit, for honest display ("¢/lb" not a bare number). */
  unit: string;
  /** Activity-profile groups this commodity is context for
   *  (vocabulary from ACTIVITY_TAXONOMY in activity-profile.ts). */
  groups: string[];
};

// Commodities with liquid futures that map onto the activity taxonomy.
// Groups without a liquid market (street_vendors, fishing, horticulture,
// ski_tourism, orchards, grape_growers…) get no market context — honest
// by omission.
export const COMMODITY_MAP: Record<string, CommodityDef> = {
  coffee: {
    symbol: 'KC=F',
    label: 'coffee',
    unit: '¢/lb',
    groups: ['coffee_growers'],
  },
  soybeans: {
    symbol: 'ZS=F',
    label: 'soybeans',
    unit: '¢/bu',
    groups: ['soy_farmers'],
  },
  wheat: {
    symbol: 'ZW=F',
    label: 'wheat',
    unit: '¢/bu',
    groups: ['grain_farmers'],
  },
  corn: {
    symbol: 'ZC=F',
    label: 'corn',
    unit: '¢/bu',
    groups: ['grain_farmers'],
  },
  sugar: {
    symbol: 'SB=F',
    label: 'sugar',
    unit: '¢/lb',
    groups: ['sugarcane_growers'],
  },
  cotton: {
    symbol: 'CT=F',
    label: 'cotton',
    unit: '¢/lb',
    groups: ['cotton_growers'],
  },
  cocoa: {
    symbol: 'CC=F',
    label: 'cocoa',
    unit: 'USD/t',
    groups: ['cocoa_growers'],
  },
  rice: {
    symbol: 'ZR=F',
    label: 'rice',
    unit: 'USD/cwt',
    groups: ['rice_farmers'],
  },
  cattle: {
    symbol: 'LE=F',
    label: 'cattle',
    unit: '¢/lb',
    groups: ['livestock'],
  },
};

export type ContextEventKind = 'surge' | 'drop' | 'high_52w' | 'low_52w';

export type CommodityContextEvent = {
  commodity: string;
  kind: ContextEventKind;
  pct_7d: number | null;
  pct_30d: number | null;
  latest_close: number;
  unit: string;
  source: string;
};

// ── Thresholds ──────────────────────────────────────────────────────────────
//
// Mirrors the signal engine's anomaly philosophy: emit only when the move
// is unusual. 7-day |change| ≥ SURGE_PCT fires surge/drop; a latest close
// at the extreme of the trailing 52 weeks fires high_52w/low_52w. Both
// can be true at once (e.g. a spike to a yearly high emits two events;
// the read side dedupes per commodity by severity order).

export const SURGE_PCT_7D = 6;
/** Events auto-expire if the daily cron misses a couple of passes. */
export const EVENT_TTL_HOURS = 60;

export type DailyClose = { date: string; close: number };

// ── Evaluation ──────────────────────────────────────────────────────────────

function pctChange(latest: number, past: number | null): number | null {
  if (past === null || past === 0) return null;
  return ((latest - past) / past) * 100;
}

/** Close at or before `daysAgo` calendar days from the latest point
 *  (markets close on weekends; take the nearest earlier trading day). */
function closeDaysAgo(series: DailyClose[], daysAgo: number): number | null {
  if (series.length === 0) return null;
  const latestMs = Date.parse(series[series.length - 1].date);
  const targetMs = latestMs - daysAgo * 24 * 60 * 60 * 1000;
  for (let i = series.length - 1; i >= 0; i -= 1) {
    if (Date.parse(series[i].date) <= targetMs) return series[i].close;
  }
  return null;
}

/**
 * Evaluate anomaly events for one commodity from its (ascending-date)
 * daily close series. Series should cover ~52 weeks for the extreme
 * checks; shorter series simply can't fire high/low events.
 */
export function evaluateContextEvents(
  commodityId: string,
  series: DailyClose[],
): CommodityContextEvent[] {
  const def = COMMODITY_MAP[commodityId];
  if (!def || series.length < 2) return [];

  const latest = series[series.length - 1].close;
  const pct7 = pctChange(latest, closeDaysAgo(series, 7));
  const pct30 = pctChange(latest, closeDaysAgo(series, 30));

  const events: CommodityContextEvent[] = [];
  const base = {
    commodity: commodityId,
    pct_7d: pct7 === null ? null : Math.round(pct7 * 10) / 10,
    pct_30d: pct30 === null ? null : Math.round(pct30 * 10) / 10,
    latest_close: latest,
    unit: def.unit,
    source: 'yahoo-futures',
  };

  if (pct7 !== null && Math.abs(pct7) >= SURGE_PCT_7D) {
    events.push({ ...base, kind: pct7 > 0 ? 'surge' : 'drop' });
  }

  // 52-week extremes need a meaningfully long window; ~200 trading days
  // guards against firing "yearly high" off a few weeks of data.
  if (series.length >= 200) {
    let hi = -Infinity;
    let lo = Infinity;
    for (const p of series) {
      if (p.close > hi) hi = p.close;
      if (p.close < lo) lo = p.close;
    }
    if (latest >= hi) events.push({ ...base, kind: 'high_52w' });
    if (latest <= lo) events.push({ ...base, kind: 'low_52w' });
  }

  return events;
}

// ── Routing ─────────────────────────────────────────────────────────────────

/**
 * Which active events matter for a place, given its verified activity
 * profile groups? Pure intersection — the read-side join the UI uses.
 * Returns at most one event per commodity (severity order: extremes
 * beat week moves) so a spike-to-yearly-high doesn't render twice.
 */
export function eventsForProfile(
  events: Array<CommodityContextEvent & { valid_until?: string }>,
  profileGroups: string[] | null | undefined,
): CommodityContextEvent[] {
  if (!Array.isArray(profileGroups) || profileGroups.length === 0) return [];
  const groups = new Set(profileGroups);
  const KIND_RANK: Record<ContextEventKind, number> = {
    high_52w: 0,
    low_52w: 1,
    surge: 2,
    drop: 3,
  };

  const byCommodity = new Map<string, CommodityContextEvent>();
  for (const ev of events) {
    const def = COMMODITY_MAP[ev.commodity];
    if (!def || !def.groups.some((g) => groups.has(g))) continue;
    const current = byCommodity.get(ev.commodity);
    if (!current || KIND_RANK[ev.kind] < KIND_RANK[current.kind]) {
      byCommodity.set(ev.commodity, ev);
    }
  }
  return [...byCommodity.values()];
}

// ── Yahoo Finance fetcher ───────────────────────────────────────────────────

const YAHOO_CHART = 'https://query1.finance.yahoo.com/v8/finance/chart';
const FETCH_USER_AGENT = 'Mozilla/5.0 (compatible; KalmaContext/1.0; +https://kalma.me)';

/**
 * Fetch ~52 weeks of daily closes for one symbol. Nulls (holidays,
 * missing ticks) are dropped; result is ascending by date.
 */
export async function fetchDailyCloses(
  symbol: string,
  fetchImpl: typeof fetch = fetch,
  range: string = '1y',
): Promise<DailyClose[]> {
  const url = `${YAHOO_CHART}/${encodeURIComponent(symbol)}?range=${range}&interval=1d`;
  const res = await fetchImpl(url, {
    headers: { 'User-Agent': FETCH_USER_AGENT, Accept: 'application/json' },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`yahoo http ${res.status} for ${symbol}`);
  const data = (await res.json()) as {
    chart?: {
      result?: Array<{
        timestamp?: number[];
        indicators?: { quote?: Array<{ close?: Array<number | null> }> };
      }>;
      error?: { description?: string } | null;
    };
  };
  if (data.chart?.error) {
    throw new Error(
      `yahoo error for ${symbol}: ${data.chart.error.description ?? 'unknown'}`,
    );
  }
  const result = data.chart?.result?.[0];
  const timestamps = result?.timestamp ?? [];
  const closes = result?.indicators?.quote?.[0]?.close ?? [];

  const series: DailyClose[] = [];
  for (let i = 0; i < timestamps.length; i += 1) {
    const close = closes[i];
    if (typeof close !== 'number' || !Number.isFinite(close)) continue;
    series.push({
      date: new Date(timestamps[i] * 1000).toISOString().slice(0, 10),
      close,
    });
  }
  series.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  // Same trading day can appear twice (live tick + close); keep the last.
  return series.filter((p, i) => i === series.length - 1 || p.date !== series[i + 1].date);
}

// ── Orchestration ───────────────────────────────────────────────────────────
//
// Shared by /api/cron/commodity-context (daily, after US close) and
// scripts/commodity-context.mjs (backfill/QA). Structural client type
// keeps this module dependency-free.

type DbClient = {
  from(table: string): any;
};

export type CommodityRunOptions = {
  /** Restrict to one commodity id (QA). */
  only?: string;
  /** Log + evaluate without writing rows. */
  dryRun?: boolean;
  /** Upsert the full fetched series (backfill) instead of the recent tail. */
  backfill?: boolean;
  sleepMs?: number;
  log?: (msg: string) => void;
  fetchImpl?: typeof fetch;
};

export type CommodityRunSummary = {
  commodities: number;
  prices_written: number;
  events_active: number;
  events: CommodityContextEvent[];
  errors: Array<{ commodity: string; message: string }>;
};

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function runCommodityContext(
  db: DbClient,
  opts: CommodityRunOptions = {},
): Promise<CommodityRunSummary> {
  const log = opts.log ?? (() => {});
  const sleepMs = opts.sleepMs ?? 400;

  const ids = Object.keys(COMMODITY_MAP).filter(
    (id) => !opts.only || id === opts.only,
  );
  const summary: CommodityRunSummary = {
    commodities: ids.length,
    prices_written: 0,
    events_active: 0,
    events: [],
    errors: [],
  };

  const validUntil = new Date(
    Date.now() + EVENT_TTL_HOURS * 60 * 60 * 1000,
  ).toISOString();

  for (let i = 0; i < ids.length; i += 1) {
    const id = ids[i];
    const def = COMMODITY_MAP[id];
    try {
      const series = await fetchDailyCloses(def.symbol, opts.fetchImpl ?? fetch);
      if (series.length === 0) throw new Error('empty series');

      const events = evaluateContextEvents(id, series);
      const latest = series[series.length - 1];
      log(
        `[commodity-context] ${id.padEnd(9)} ${latest.date} close=${latest.close.toFixed(2)} ${def.unit} ` +
          `points=${series.length} events=[${events.map((e) => `${e.kind}${e.pct_7d !== null ? ` ${e.pct_7d}%/7d` : ''}`).join(', ')}]`,
      );

      if (!opts.dryRun) {
        // Steady state only the tail changes; backfill writes the year.
        const rows = (opts.backfill ? series : series.slice(-10)).map((p) => ({
          commodity: id,
          date: p.date,
          close: p.close,
          source: 'yahoo-futures',
          fetched_at: new Date().toISOString(),
        }));
        const { error: priceErr } = await db
          .from('commodity_prices')
          .upsert(rows, { onConflict: 'commodity,date' });
        if (priceErr) throw new Error(priceErr.message);
        summary.prices_written += rows.length;

        // Refresh this commodity's events: replace the set atomically
        // enough for our needs (delete then insert; unique(commodity,kind)
        // guards against dupes if two runs overlap).
        const { error: delErr } = await db
          .from('commodity_context_events')
          .delete()
          .eq('commodity', id);
        if (delErr) throw new Error(delErr.message);
        if (events.length > 0) {
          const { error: insErr } = await db
            .from('commodity_context_events')
            .insert(
              events.map((e) => ({
                ...e,
                detected_at: new Date().toISOString(),
                valid_until: validUntil,
              })),
            );
          if (insErr) throw new Error(insErr.message);
        }
      }

      summary.events_active += events.length;
      summary.events.push(...events);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      summary.errors.push({ commodity: id, message });
      log(`[commodity-context] ERROR ${id}: ${message}`);
    }
    if (i < ids.length - 1) await sleep(sleepMs);
  }

  // Drop expired events from commodities that errored this pass (their
  // delete+insert never ran) so stale context never lingers past TTL.
  if (!opts.dryRun) {
    await db
      .from('commodity_context_events')
      .delete()
      .lt('valid_until', new Date().toISOString());
  }

  return summary;
}
