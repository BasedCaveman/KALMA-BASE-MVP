// kalma/frontend/scripts/test-cache-model-identity.mjs
//
// Tests for the model-identity fix to lib/signal-engine/seriesCache.ts and
// its onward-adapter lib/signal-engine/cache.ts, spanning review
// 2026-09-21's fifth and sixth rounds:
//
// - Fifth round: a cache read within the 7-day TTL had no way to tell a row
//   written under Open-Meteo's old "Best Match" default apart from one
//   written under the models=era5 this branch now requests on every fetch,
//   so a warm cache hit could silently serve Best Match data as if it were
//   ERA5. Reproduced live in evidence/11-verify-17bcbfe.mjs.
// - Sixth round (R1): retrofitting historical_cache itself with a `model`
//   column broke main's then-deployed writer (no `model` awareness, old
//   ON CONFLICT key) — Postgres 42P10 on every production upsert. Rolled
//   back live; historical_cache keeps its original shape permanently, and
//   cache.ts no longer talks to Supabase at all — it's a thin adapter onto
//   getHistoricalSeries() (this file), which is the ONLY place any signal
//   type's historical baseline is now cached, on historical_series_cache
//   (a genuinely new table with zero production readers/writers on main).
//
// Loads the real cache.ts, seriesCache.ts and openMeteoFetcher.ts
// (transpiled, sandboxed — same technique as the other signal-engine test
// scripts) with a Supabase double that RECORDS every filter and upsert
// payload, so these tests assert the actual query/write shape rather than
// just the returned value.

import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const root = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..');

function makeSandbox(fetchImpl) {
  const context = vm.createContext({
    console,
    Date,
    URL,
    URLSearchParams,
    setTimeout: (cb) => cb(),
    fetch: fetchImpl ?? (async () => ({ ok: true, json: async () => ({ daily: { time: [], precipitation_sum: [] } }) })),
  });
  const cache = new Map();
  function load(name) {
    if (cache.has(name)) return cache.get(name);
    const src = fs.readFileSync(path.join(root, `lib/signal-engine/${name}.ts`), 'utf8');
    const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    const m = { exports: {} };
    vm.runInContext(`(function(require,module,exports){${js}\n})`, context)((p) => load(p.replace('./', '')), m, m.exports);
    cache.set(name, m.exports);
    return m.exports;
  }
  return {
    cacheModule: load('cache'),
    seriesCacheModule: load('seriesCache'),
    ARCHIVE_MODEL: load('openMeteoFetcher').ARCHIVE_MODEL,
  };
}

// Records every .eq()/.upsert() call and which table .from() was called
// with, so a test can assert the actual filter/write shape AND that it
// targets historical_series_cache, not the untouched historical_cache.
// `rows` is what a select() resolves to (simulating a cache hit or miss).
// `upsertError` simulates a failed write.
function recordingSupabase(rows, upsertError = null) {
  const fromCalls = [];
  const eqCalls = [];
  const upserts = [];
  return {
    fromCalls,
    eqCalls,
    upserts,
    from(table) {
      fromCalls.push(table);
      const builder = {
        select() { return builder; },
        eq(...a) { eqCalls.push(a); return builder; },
        in(...a) { eqCalls.push(['in', ...a]); return builder; },
        then(resolve) { return Promise.resolve({ data: rows, error: null }).then(resolve); },
        upsert(payload, opts) { upserts.push({ payload, opts }); return Promise.resolve({ error: upsertError }); },
      };
      return builder;
    },
  };
}

test('cache.ts: getHistoricalBaseline never touches historical_cache — only historical_series_cache', async () => {
  const { cacheModule } = makeSandbox();
  const supabase = recordingSupabase([]);
  await cacheModule.getHistoricalBaseline(supabase, {
    placeId: 'p1', latitude: 0, longitude: 0, variable: 'precipitation_sum',
    targetDate: new Date('2026-09-21T00:00:00Z'), yearsBack: 3, doyHalfWindow: 0,
  });
  assert.ok(supabase.fromCalls.length > 0, 'expected at least one .from() call');
  assert.ok(
    supabase.fromCalls.every((t) => t === 'historical_series_cache'),
    `getHistoricalBaseline must not read/write historical_cache directly anymore, got .from() calls: ${JSON.stringify(supabase.fromCalls)}`
  );
});

test('cache.ts: getHistoricalBaseline returns a flat array sorted ascending', async () => {
  // rollingWindowDays defaults to 1 inside getHistoricalSeries, so
  // doyHalfWindow=0 means exactly one request per year — one value per
  // year, in year-fetch order, deliberately NOT already sorted.
  const perYearValue = { '2025': 30, '2024': 10, '2023': 20 };
  const fetchImpl = async (url) => {
    const u = new URL(url);
    const start = u.searchParams.get('start_date');
    const year = start.slice(0, 4);
    return { ok: true, json: async () => ({ daily: { time: [start], precipitation_sum: [perYearValue[year]] } }) };
  };
  const { cacheModule } = makeSandbox(fetchImpl);
  const supabase = recordingSupabase([]);
  const result = await cacheModule.getHistoricalBaseline(supabase, {
    placeId: 'p1', latitude: 0, longitude: 0, variable: 'precipitation_sum',
    targetDate: new Date('2026-09-21T00:00:00Z'), yearsBack: 3, doyHalfWindow: 0,
  });
  // `result.values` was built inside the vm sandbox, so it's cross-realm
  // from this script's own array literal — assert.deepEqual checks
  // prototype identity and fails even when structurally identical.
  // Compare via JSON.stringify instead (documented gotcha from this same
  // branch's earlier rounds).
  assert.equal(JSON.stringify(result.values), JSON.stringify([10, 20, 30]), `expected the fetched values sorted ascending, got ${JSON.stringify(result.values)}`);
  assert.equal(result.yearsRequested, 3);
  assert.equal(result.yearsWithUsableWindow, 3, 'all 3 mocked years returned a value, so all 3 should count as usable');
});

test('cache.ts: getHistoricalBaseline surfaces yearsWithUsableWindow so callers can gate on real year coverage, not just sample count', async () => {
  // Exact shape of the bug this closes (review 2026-09-21, round 6/7):
  // heat_stress_window/heavy_rain_event only checked values.length >= 30,
  // which a handful of real years can clear via a wide DOY window without
  // having broad year coverage. Here: 2 real years x 15 samples each (a
  // doyHalfWindow=7 window) = 30 samples, but only 2 of 5 requested years
  // ever returned anything.
  const doyWindowDates = (year) => {
    const out = [];
    for (let d = 0; d < 15; d++) out.push(`${year}-01-${String(d + 1).padStart(2, '0')}`);
    return out;
  };
  const goodYears = new Set(['2025', '2024']);
  const fetchImpl = async (url) => {
    const u = new URL(url);
    const year = u.searchParams.get('start_date').slice(0, 4);
    if (!goodYears.has(year)) return { ok: true, json: async () => ({ daily: { time: [], precipitation_sum: [] } }) };
    const dates = doyWindowDates(year);
    return { ok: true, json: async () => ({ daily: { time: dates, precipitation_sum: dates.map(() => 5) } }) };
  };
  const { cacheModule } = makeSandbox(fetchImpl);
  const supabase = recordingSupabase([]);
  const result = await cacheModule.getHistoricalBaseline(supabase, {
    placeId: 'p1', latitude: 0, longitude: 0, variable: 'precipitation_sum',
    targetDate: new Date('2026-01-08T00:00:00Z'), yearsBack: 5, doyHalfWindow: 7,
  });
  assert.equal(result.values.length, 30, 'sample count alone clears a 30-sample floor');
  assert.equal(result.yearsRequested, 5);
  assert.equal(result.yearsWithUsableWindow, 2, 'but only 2 of the 5 requested years actually returned data');
});

test('cache.ts: a read filters historical_series_cache by the current ARCHIVE_MODEL (end to end through the adapter)', async () => {
  const { cacheModule, ARCHIVE_MODEL } = makeSandbox();
  const supabase = recordingSupabase([]);
  await cacheModule.getHistoricalBaseline(supabase, {
    placeId: 'p1', latitude: 0, longitude: 0, variable: 'precipitation_sum',
    targetDate: new Date('2026-09-21T00:00:00Z'), yearsBack: 3, doyHalfWindow: 0,
  });
  const modelFilter = supabase.eqCalls.find((c) => c[0] === 'model');
  assert.ok(modelFilter, `expected a .eq('model', ...) call, got ${JSON.stringify(supabase.eqCalls)}`);
  assert.equal(modelFilter[1], ARCHIVE_MODEL);
});

test('seriesCache.ts: a read filters historical_series_cache by the current ARCHIVE_MODEL', async () => {
  const { seriesCacheModule, ARCHIVE_MODEL } = makeSandbox();
  const supabase = recordingSupabase([]);
  await seriesCacheModule.getHistoricalSeries(supabase, {
    placeId: 'p1', latitude: 0, longitude: 0, variable: 'precipitation_sum',
    targetDate: new Date('2026-09-21T00:00:00Z'), yearsBack: 10, doyHalfWindow: 7, rollingWindowDays: 14,
  });
  const modelFilter = supabase.eqCalls.find((c) => c[0] === 'model');
  assert.ok(modelFilter, `expected a .eq('model', ...) call, got ${JSON.stringify(supabase.eqCalls)}`);
  assert.equal(modelFilter[1], ARCHIVE_MODEL);
});

test('seriesCache.ts: a fresh fetch upserts with model stamped and included in onConflict', async () => {
  const { seriesCacheModule, ARCHIVE_MODEL } = makeSandbox(async (url) => {
    const u = new URL(url);
    const start = u.searchParams.get('start_date');
    return { ok: true, json: async () => ({ daily: { time: [start], precipitation_sum: [5] } }) };
  });
  const supabase = recordingSupabase([]);
  await seriesCacheModule.getHistoricalSeries(supabase, {
    placeId: 'p1', latitude: 0, longitude: 0, variable: 'precipitation_sum',
    targetDate: new Date('2026-09-21T00:00:00Z'), yearsBack: 3, doyHalfWindow: 0, rollingWindowDays: 1,
  });
  assert.equal(supabase.upserts.length, 1);
  assert.equal(supabase.upserts[0].payload.model, ARCHIVE_MODEL);
  assert.match(supabase.upserts[0].opts.onConflict, /(^|,)model(,|$)/);
});

test('seriesCache.ts: a failed upsert is counted and logged, not silently discarded', async () => {
  // Review 2026-09-21, R1: a schema/writer mismatch (a live migration
  // temporarily breaking a table's ON CONFLICT target for the then-
  // deployed writer) produces no visible signal unless the upsert's own
  // `error` is actually read.
  const { seriesCacheModule } = makeSandbox(async (url) => {
    const u = new URL(url);
    const start = u.searchParams.get('start_date');
    return { ok: true, json: async () => ({ daily: { time: [start], precipitation_sum: [5] } }) };
  });
  const supabase = recordingSupabase([], { message: 'simulated: no unique or exclusion constraint matching the ON CONFLICT specification' });
  const originalWarn = console.warn;
  const warnings = [];
  console.warn = (...args) => warnings.push(args.join(' '));
  try {
    await seriesCacheModule.getHistoricalSeries(supabase, {
      placeId: 'p1', latitude: 0, longitude: 0, variable: 'precipitation_sum',
      targetDate: new Date('2026-09-21T00:00:00Z'), yearsBack: 3, doyHalfWindow: 0, rollingWindowDays: 1,
    });
  } finally {
    console.warn = originalWarn;
  }
  assert.equal(seriesCacheModule.getSeriesCacheStats().upsertErrors, 1);
  assert.ok(warnings.some((w) => w.includes('upsert failed')), `expected an upsert-failure warning, got ${JSON.stringify(warnings)}`);
});

console.log('cache-model-identity tests passed (cache.ts adapts onto seriesCache.ts; both key/filter by ARCHIVE_MODEL)');
