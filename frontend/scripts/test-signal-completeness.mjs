// kalma/frontend/scripts/test-signal-completeness.mjs
//
// Integration-level tests for the "insufficient data must throw, not
// return null" contract added 2026-09-21 (docs/kalma-coordination-
// handover-2026-09-15/09-UI-HANDOVER-CLIMATE-INTEGRITY-2026-09-21.md,
// item 1) plus three more defects a follow-up review found in that fix
// (docs/kalma-coordination-handover-2026-09-15/evidence/
// 10-verify-adba4a7.mjs):
//
// 1. rainfall_risk_rising requested a normal 7-day forecast but validated
//    the ENTIRE response against a 2-day window, so it threw
//    InsufficientDataError on every real forecast, 100% of the time. The
//    first version of this test's forecast mock happened to return
//    exactly 2 days, hiding the bug — every forecast mock below now
//    respects `forecast_days` like the real API does.
// 2. yearsWithData (openMeteoFetcher.ts) counted a year as "has data" if
//    it returned even one raw sample — not whether that year produced a
//    full, usable N-day window. 2 complete years + 3 single-day years
//    could read as "5/10 years", clearing hasSufficientYearCoverage().
// 3. The recent window's models=era5 + ARCHIVE_DATA_LAG_DAYS shift needed
//    to also move the historical baseline's anchor date to match — see
//    "aligns the historical baseline" test below.
//
// This loads the REAL evaluator.ts (transpiled, sandboxed) with a
// scripted fetch and a fake Supabase client, so these tests exercise the
// actual wiring end to end: test-rolling-sum.mjs covers the pure helper
// functions in isolation, not whether evaluator.ts actually calls them
// and actually throws instead of returning null.

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

// One fresh sandbox + module cache per test so mocked fetch/Supabase
// behavior from one test can't leak into the next via a cached module.
function makeSignalEngine() {
  let fetchImpl = async () => {
    throw new Error('fetchImpl not set for this test');
  };
  const fetchUrls = [];
  const context = vm.createContext({
    console,
    Date,
    URLSearchParams,
    setTimeout: (cb) => cb(),
    fetch: async (url) => {
      fetchUrls.push(String(url));
      return fetchImpl(String(url));
    },
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
    evaluator: load('evaluator'),
    setFetch: (impl) => { fetchImpl = impl; },
    urls: fetchUrls,
  };
}

// A Supabase client double whose historical_series_cache reads always
// miss (forcing the real fetch path) and whose upsert always "succeeds"
// silently — these tests are about evaluator.ts's control flow, not the
// cache read/write path itself (that's exercised by re-running the
// reviewer's evidence-script methodology, see the memory of this branch).
function alwaysMissCacheSupabase() {
  return {
    from() {
      return {
        select() { return this; }, eq() { return this; }, in() { return this; },
        then(resolve) { return Promise.resolve({ data: [], error: null }).then(resolve); },
        upsert() { return Promise.resolve({ error: null }); },
      };
    },
  };
}

function isoDate(d) { return d.toISOString().slice(0, 10); }
function addDays(d, n) { return new Date(d.getTime() + n * 86400000); }
function dateRange(start, end) {
  const out = [];
  for (let d = new Date(start); d <= end; d = addDays(d, 1)) out.push(isoDate(d));
  return out;
}

const NOW = new Date('2026-09-21T12:00:00Z');
const WATER_RECOVERY_TYPE = {
  id: 'water_recovery_signal', slug: 'water', category: 'water',
  title_template_key: '', body_template_key: '',
  trigger_logic: { source: 'open-meteo', metric: 'precipitation_sum_14d_rolling', method: 'doy_window_percentile', baseline_years: 10, doy_half_window: 7, thresholds: { active: 75, strong: 90 } },
  affected_groups: [], supported_regions: ['global'], active: true,
};
const RAINFALL_RISK_TYPE = {
  id: 'rainfall_risk_rising', slug: 'rainfall', category: 'water',
  title_template_key: '', body_template_key: '',
  trigger_logic: { source: 'open-meteo', metric: 'precipitation_sum_48h_rolling', method: 'doy_window_percentile', baseline_years: 10, doy_half_window: 7, thresholds: { low: 75, medium: 85, high: 92, extreme: 97 } },
  affected_groups: [], supported_regions: ['global'], active: true,
};
const HEAT_STRESS_TYPE = {
  id: 'heat_stress_window', slug: 'heat', category: 'heat',
  title_template_key: '', body_template_key: '',
  trigger_logic: { source: 'open-meteo', metric: 'temp_avg_7d_vs_baseline', method: 'doy_window_percentile', baseline_years: 10, doy_half_window: 7, thresholds: { low: 75, medium: 85, high: 92, extreme: 97 } },
  affected_groups: [], supported_regions: ['global'], active: true,
};
const HEAVY_RAIN_TYPE = {
  id: 'heavy_rain_event', slug: 'heavy-rain', category: 'water',
  title_template_key: '', body_template_key: '',
  trigger_logic: { source: 'open-meteo', metric: 'precip_daily_percentile', method: 'doy_window_percentile', baseline_years: 10, doy_half_window: 7, thresholds: { low: 75, medium: 90, high: 95, extreme: 99 }, default_params: { threshold_mode: 'percentile' } },
  affected_groups: [], supported_regions: ['global'], active: true,
};
const PLACE = { id: 'synthetic', slug: 'synthetic', name: 'Synthetic', latitude: 0, longitude: 0, country_code: 'BR', region_code: null };

// A generic historical-archive responder: always returns the exact
// consecutive date range requested with a fixed value per day.
function historicalResponder(mmPerDay) {
  return async (url) => {
    const u = new URL(url);
    const start = new Date(`${u.searchParams.get('start_date')}T00:00:00Z`);
    const end = new Date(`${u.searchParams.get('end_date')}T00:00:00Z`);
    const dates = dateRange(start, end);
    return { ok: true, json: async () => ({ daily: { time: dates, precipitation_sum: dates.map(() => mmPerDay) } }) };
  };
}

// A realistic forecast responder: respects `forecast_days` like the real
// Open-Meteo forecast API does, starting from `anchorDate`. The bug this
// guards the test suite itself against: an earlier version of this mock
// hand-built a fixed number of days regardless of what was requested,
// which is exactly what let the "request 7, validate 2" bug through
// undetected the first time (review 2026-09-21, fourth round).
function forecastResponder(anchorDate, mmPerDay) {
  return async (url) => {
    const u = new URL(url);
    const n = Number(u.searchParams.get('forecast_days'));
    const dates = dateRange(anchorDate, addDays(anchorDate, n - 1));
    return { ok: true, json: async () => ({ daily: { time: dates, precipitation_sum: dates.map(() => mmPerDay) } }) };
  };
}

function fetchByEndpoint({ forecast, archive }) {
  return async (url) => {
    const u = new URL(url);
    if (u.pathname.includes('/v1/forecast')) return forecast(url);
    return archive(url);
  };
}

test('item1: a NORMAL complete forecast (whatever length is actually requested) does not throw', async () => {
  const { evaluator, setFetch } = makeSignalEngine();
  setFetch(fetchByEndpoint({
    forecast: forecastResponder(NOW, 30), // anomalously wet, so it fires if it evaluates at all
    archive: historicalResponder(1),
  }));
  const signal = await evaluator.evaluateSignal(alwaysMissCacheSupabase(), PLACE, RAINFALL_RISK_TYPE, NOW);
  assert.notEqual(signal, null, 'a real, complete forecast must not be rejected as insufficient');
});

test('E1/item1: incomplete recent window throws InsufficientDataError, not a plain null', async () => {
  const { evaluator, setFetch } = makeSignalEngine();
  setFetch(async (url) => {
    const u = new URL(url);
    // Recent window request lands in 2026; return only 10 of the 14
    // requested days (a gap), everything else (historical years) gets a
    // clean, complete, anomaly-free response.
    if (u.searchParams.get('start_date').startsWith('2026')) {
      const start = new Date(`${u.searchParams.get('start_date')}T00:00:00Z`);
      const dates = dateRange(start, addDays(start, 9)); // 10 days, not 14
      return { ok: true, json: async () => ({ daily: { time: dates, precipitation_sum: dates.map(() => 1) } }) };
    }
    return historicalResponder(1)(url);
  });
  await assert.rejects(
    evaluator.evaluateSignal(alwaysMissCacheSupabase(), PLACE, WATER_RECOVERY_TYPE, NOW),
    (err) => {
      assert.equal(err.name, 'InsufficientDataError');
      return true;
    }
  );
});

test('item2: 2 of 10 historical years cannot satisfy the sample floor even with 30+ windows', async () => {
  const { evaluator, setFetch } = makeSignalEngine();
  setFetch(async (url) => {
    const u = new URL(url);
    const startParam = u.searchParams.get('start_date');
    if (startParam.startsWith('2026')) {
      // Recent window: complete and anomalously wet, so this is NOT what
      // trips the failure — only the historical coverage is thin.
      return historicalResponder(20)(url);
    }
    const requestedYear = Number(startParam.slice(0, 4));
    // Only 2 of the 10 requested years (2016-2025) actually have data.
    const goodYears = new Set([2020, 2021]);
    if (!goodYears.has(requestedYear)) {
      return { ok: false, status: 500, text: async () => 'simulated outage' };
    }
    return historicalResponder(1)(url);
  });
  await assert.rejects(
    evaluator.evaluateSignal(alwaysMissCacheSupabase(), PLACE, WATER_RECOVERY_TYPE, NOW),
    (err) => {
      assert.equal(err.name, 'InsufficientDataError');
      assert.match(err.message, /years/i);
      return true;
    }
  );
});

test('item2 (round 4 exact repro): 2 full years + 3 single-day years must NOT read as "5 usable years"', async () => {
  // Exact recipe from the review's own reproduction
  // (evidence/10-verify-adba4a7.mjs): 2020/2021 complete, 2017/2018/2019
  // return a single day each (real data, but not enough for one 14-day
  // window), 2022-2025 return nothing at all. The old yearsWithData
  // metric counted 2020,2021,2017,2018,2019 as "5 years with data" —
  // clearing hasSufficientYearCoverage(10, 5) — and emitted a signal with
  // sample_size: 30 drawn entirely from the 2 genuinely complete years.
  const { evaluator, setFetch } = makeSignalEngine();
  setFetch(async (url) => {
    const u = new URL(url);
    const startParam = u.searchParams.get('start_date');
    const year = Number(startParam.slice(0, 4));
    if (year === 2026) return historicalResponder(20)(url);
    if ([2020, 2021].includes(year)) return historicalResponder(1)(url);
    if ([2017, 2018, 2019].includes(year)) {
      return { ok: true, json: async () => ({ daily: { time: [startParam], precipitation_sum: [1] } }) };
    }
    return { ok: true, json: async () => ({ daily: { time: [], precipitation_sum: [] } }) };
  });
  await assert.rejects(
    evaluator.evaluateSignal(alwaysMissCacheSupabase(), PLACE, WATER_RECOVERY_TYPE, NOW),
    (err) => {
      assert.equal(err.name, 'InsufficientDataError');
      assert.match(err.message, /years/i);
      return true;
    },
    'must reject sparse coverage instead of emitting a signal from 2 real years dressed up as 5'
  );
});

test('item3: an incomplete forecast throws InsufficientDataError, not a silently short sum', async () => {
  const { evaluator, setFetch } = makeSignalEngine();
  setFetch(fetchByEndpoint({
    // Provider returns only 1 day no matter how many were requested.
    forecast: async () => {
      const today = isoDate(NOW);
      return { ok: true, json: async () => ({ daily: { time: [today], precipitation_sum: [50] } }) };
    },
    archive: historicalResponder(1),
  }));
  await assert.rejects(
    evaluator.evaluateSignal(alwaysMissCacheSupabase(), PLACE, RAINFALL_RISK_TYPE, NOW),
    (err) => {
      assert.equal(err.name, 'InsufficientDataError');
      return true;
    }
  );
});

test('item3: forecast dates that are the right count but not the requested run also throw', async () => {
  const { evaluator, setFetch } = makeSignalEngine();
  setFetch(fetchByEndpoint({
    // 2 values, 2 dates, but NOT starting today (e.g. a stale/misaligned
    // cached response) — sumIfComplete must check dates, not just count.
    forecast: async (url) => {
      const u = new URL(url);
      const n = Number(u.searchParams.get('forecast_days'));
      const wrongStart = addDays(NOW, 30);
      const dates = dateRange(wrongStart, addDays(wrongStart, n - 1));
      return { ok: true, json: async () => ({ daily: { time: dates, precipitation_sum: dates.map(() => 30) } }) };
    },
    archive: historicalResponder(1),
  }));
  await assert.rejects(
    evaluator.evaluateSignal(alwaysMissCacheSupabase(), PLACE, RAINFALL_RISK_TYPE, NOW),
    (err) => {
      assert.equal(err.name, 'InsufficientDataError');
      return true;
    }
  );
});

test('item4/item5: a successful water_recovery emission carries method version and coverage metadata', async () => {
  const { evaluator, setFetch } = makeSignalEngine();
  setFetch(async (url) => {
    const u = new URL(url);
    const startParam = u.searchParams.get('start_date');
    if (startParam.startsWith('2026')) return historicalResponder(20)(url); // anomalously wet recent window
    return historicalResponder(1)(url); // dry, complete 10-year baseline
  });
  const signal = await evaluator.evaluateSignal(alwaysMissCacheSupabase(), PLACE, WATER_RECOVERY_TYPE, NOW);
  assert.notEqual(signal, null);
  assert.equal(signal.structured_data.method_version, 'rolling-sum-v2-anchor-lookback-2026-09-21');
  assert.equal(signal.structured_data.historical_years_requested, 10);
  assert.equal(signal.structured_data.historical_years_with_usable_window, 10);
  assert.ok(signal.structured_data.recent_window.start);
  assert.ok(signal.structured_data.recent_window.end);
  assert.equal(signal.structured_data.recent_window.lag_days_from_now, 5);
});

test('item4: a successful rainfall_risk_rising emission carries the forecast window used', async () => {
  const { evaluator, setFetch } = makeSignalEngine();
  setFetch(fetchByEndpoint({
    forecast: forecastResponder(NOW, 30),
    archive: historicalResponder(1),
  }));
  const signal = await evaluator.evaluateSignal(alwaysMissCacheSupabase(), PLACE, RAINFALL_RISK_TYPE, NOW);
  assert.notEqual(signal, null);
  assert.equal(signal.structured_data.method_version, 'rolling-sum-v2-anchor-lookback-2026-09-21');
  assert.ok(signal.structured_data.forecast_window.start);
  assert.ok(signal.structured_data.forecast_window.end);
});

test('item3 (open-meteo docs): the recent window ends 5 days before now, not 1, and requests models=era5', async () => {
  const { evaluator, setFetch, urls } = makeSignalEngine();
  setFetch(async (url) => {
    const u = new URL(url);
    const startParam = u.searchParams.get('start_date');
    if (startParam.startsWith('2026')) return historicalResponder(20)(url);
    return historicalResponder(1)(url);
  });
  await evaluator.evaluateSignal(alwaysMissCacheSupabase(), PLACE, WATER_RECOVERY_TYPE, NOW);
  const recentUrl = urls.find((u) => u.includes('start_date=2026'));
  assert.ok(recentUrl, `expected a 2026 request among ${JSON.stringify(urls)}`);
  const parsed = new URL(recentUrl);
  assert.equal(parsed.searchParams.get('end_date'), isoDate(addDays(NOW, -5)));
  assert.equal(parsed.searchParams.get('models'), 'era5');
});

test('item3: the historical baseline is anchored to the recent window\'s end date, not `now`', async () => {
  // doy_half_window=1 makes the anchor date's effect on the requested
  // range directly observable: the historical fetch should centre on the
  // DOY of (now - 5 days), not the DOY of `now` itself.
  const type = {
    ...WATER_RECOVERY_TYPE,
    trigger_logic: { ...WATER_RECOVERY_TYPE.trigger_logic, doy_half_window: 1 },
  };
  const { evaluator, setFetch, urls } = makeSignalEngine();
  setFetch(async (url) => {
    const u = new URL(url);
    const startParam = u.searchParams.get('start_date');
    if (startParam.startsWith('2026')) return historicalResponder(20)(url);
    return historicalResponder(1)(url);
  });
  await evaluator.evaluateSignal(alwaysMissCacheSupabase(), PLACE, type, NOW);
  const anchorDate = addDays(NOW, -5); // recent window's end date
  const expectedDoyCentreYear = anchorDate.getUTCFullYear() - 1; // buildBaselineWindow skips the current year
  const historicalUrl = urls.find((u) => u.includes(`start_date=${expectedDoyCentreYear}`));
  assert.ok(historicalUrl, `expected a ${expectedDoyCentreYear} request anchored on ${isoDate(anchorDate)} among ${JSON.stringify(urls)}`);
  // The requested end_date for that year should be within 1 day (doy_half_window)
  // of anchorDate's month/day, projected onto expectedDoyCentreYear — not `now`'s.
  const endParam = new URL(historicalUrl).searchParams.get('end_date');
  const anchorMonthDay = isoDate(anchorDate).slice(5);
  const nowMonthDay = isoDate(NOW).slice(5);
  assert.notEqual(endParam.slice(5), nowMonthDay, 'must not be anchored on `now`\'s day-of-year');
  // Allow a 1-day slack either way from lookback/window construction.
  const diffDays = Math.abs(
    (Date.parse(`${expectedDoyCentreYear}-${anchorMonthDay}`) - Date.parse(`${expectedDoyCentreYear}-${endParam.slice(5)}`)) / 86400000
  );
  assert.ok(diffDays <= 1, `end_date ${endParam} should be within 1 day of the recent window's end (${anchorMonthDay}), got diff ${diffDays}`);
});

test('item1 (fifth round): a null D-5 day falls back to the last complete window within the lag bound', async () => {
  // Exact shape of the reviewer's live evidence (11-era5-live-17bcbfe.json):
  // the D-5 end date came back null while D-6 was fully populated. The
  // old fixed-D-5 request threw InsufficientDataError unconditionally;
  // this must instead find and use the D-6 window.
  const { evaluator, setFetch } = makeSignalEngine();
  setFetch(async (url) => {
    const u = new URL(url);
    const startParam = u.searchParams.get('start_date');
    if (startParam.startsWith('2026')) {
      const start = new Date(`${startParam}T00:00:00Z`);
      const end = new Date(`${u.searchParams.get('end_date')}T00:00:00Z`);
      const dates = dateRange(start, end);
      // Null out only the very last date requested (D-5) — D-6 and
      // earlier stay fully populated, so a complete 14-day window still
      // exists ending one day earlier.
      const values = dates.map((_, i) => (i === dates.length - 1 ? null : 20));
      return { ok: true, json: async () => ({ daily: { time: dates, precipitation_sum: values } }) };
    }
    return historicalResponder(1)(url);
  });
  const signal = await evaluator.evaluateSignal(alwaysMissCacheSupabase(), PLACE, WATER_RECOVERY_TYPE, NOW);
  assert.notEqual(signal, null, 'a D-5 gap must not block evaluation when D-6 is complete');
  assert.equal(signal.structured_data.recent_window.end, isoDate(addDays(NOW, -6)));
  assert.equal(signal.structured_data.recent_window.lag_days_from_now, 6);
});

test('item1 (fifth round): gaps through the entire lag bound still throw InsufficientDataError', async () => {
  const { evaluator, setFetch } = makeSignalEngine();
  setFetch(async (url) => {
    const u = new URL(url);
    const startParam = u.searchParams.get('start_date');
    if (startParam.startsWith('2026')) {
      const start = new Date(`${startParam}T00:00:00Z`);
      const end = new Date(`${u.searchParams.get('end_date')}T00:00:00Z`);
      const dates = dateRange(start, end);
      // Null out the last 4 days — covers every candidate end date within
      // the walk-back bound (MAX_EXTRA_LAG_DAYS=3, so 4 candidates total),
      // so no complete window exists anywhere in range.
      const values = dates.map((_, i) => (i >= dates.length - 4 ? null : 20));
      return { ok: true, json: async () => ({ daily: { time: dates, precipitation_sum: values } }) };
    }
    return historicalResponder(1)(url);
  });
  await assert.rejects(
    evaluator.evaluateSignal(alwaysMissCacheSupabase(), PLACE, WATER_RECOVERY_TYPE, NOW),
    (err) => {
      assert.equal(err.name, 'InsufficientDataError');
      return true;
    }
  );
});

test('heat_stress_window: sparse year coverage in the temperature baseline throws InsufficientDataError, not null, even though sample count clears 30', async () => {
  // Review 2026-09-21 (round 6/7): getHistoricalBaseline() used to discard
  // yearsWithUsableWindow, so heat_stress_window's own `length < 30` check
  // was a raw sample-count floor only. 2 of 10 requested years x a 15-day
  // DOY window = 30 samples, clearing that floor, while genuine year
  // coverage (2/10) would fail hasSufficientYearCoverage(10, 2) (needs
  // >= 5). Humidity is mocked complete throughout to isolate the failure
  // to the temperature baseline specifically.
  const { evaluator, setFetch } = makeSignalEngine();
  const goodYears = new Set([2024, 2025]);
  setFetch(async (url) => {
    const u = new URL(url);
    if (u.pathname.includes('/v1/forecast')) {
      const n = Number(u.searchParams.get('forecast_days'));
      const dates = dateRange(NOW, addDays(NOW, n - 1));
      return {
        ok: true,
        json: async () => ({ daily: { time: dates, temperature_2m_max: dates.map(() => 35), relative_humidity_2m_mean: dates.map(() => 80) } }),
      };
    }
    const daily = u.searchParams.get('daily');
    const startParam = u.searchParams.get('start_date');
    const endParam = u.searchParams.get('end_date');
    const dates = dateRange(new Date(`${startParam}T00:00:00Z`), new Date(`${endParam}T00:00:00Z`));
    if (daily === 'relative_humidity_2m_mean') {
      return { ok: true, json: async () => ({ daily: { time: dates, relative_humidity_2m_mean: dates.map(() => 50) } }) };
    }
    const year = Number(startParam.slice(0, 4));
    if (!goodYears.has(year)) {
      return { ok: true, json: async () => ({ daily: { time: [], temperature_2m_max: [] } }) };
    }
    return { ok: true, json: async () => ({ daily: { time: dates, temperature_2m_max: dates.map(() => 30) } }) };
  });
  await assert.rejects(
    evaluator.evaluateSignal(alwaysMissCacheSupabase(), PLACE, HEAT_STRESS_TYPE, NOW),
    (err) => {
      assert.equal(err.name, 'InsufficientDataError');
      assert.match(err.message, /years/i);
      return true;
    },
    'must reject sparse temperature-year coverage instead of emitting from 2 real years padded to a 30-sample floor'
  );
});

test('heavy_rain_event: sparse year coverage in the precipitation baseline throws InsufficientDataError, not null, even though sample count clears 30', async () => {
  const { evaluator, setFetch } = makeSignalEngine();
  const goodYears = new Set([2024, 2025]);
  setFetch(async (url) => {
    const u = new URL(url);
    if (u.pathname.includes('/v1/forecast')) {
      const n = Number(u.searchParams.get('forecast_days'));
      const dates = dateRange(NOW, addDays(NOW, n - 1));
      return { ok: true, json: async () => ({ daily: { time: dates, precipitation_sum: dates.map((_, i) => (i === 0 ? 40 : 0)) } }) };
    }
    const startParam = u.searchParams.get('start_date');
    const endParam = u.searchParams.get('end_date');
    const dates = dateRange(new Date(`${startParam}T00:00:00Z`), new Date(`${endParam}T00:00:00Z`));
    const year = Number(startParam.slice(0, 4));
    if (!goodYears.has(year)) {
      return { ok: true, json: async () => ({ daily: { time: [], precipitation_sum: [] } }) };
    }
    return { ok: true, json: async () => ({ daily: { time: dates, precipitation_sum: dates.map(() => 1) } }) };
  });
  await assert.rejects(
    evaluator.evaluateSignal(alwaysMissCacheSupabase(), PLACE, HEAVY_RAIN_TYPE, NOW),
    (err) => {
      assert.equal(err.name, 'InsufficientDataError');
      assert.match(err.message, /years/i);
      return true;
    },
    'must reject sparse precipitation-year coverage instead of emitting from 2 real years padded to a 30-sample floor'
  );
});

test('heat_stress_window: a genuinely complete baseline still evaluates and emits normally', async () => {
  const { evaluator, setFetch } = makeSignalEngine();
  setFetch(async (url) => {
    const u = new URL(url);
    if (u.pathname.includes('/v1/forecast')) {
      const n = Number(u.searchParams.get('forecast_days'));
      const dates = dateRange(NOW, addDays(NOW, n - 1));
      return {
        ok: true,
        json: async () => ({ daily: { time: dates, temperature_2m_max: dates.map(() => 40), relative_humidity_2m_mean: dates.map(() => 80) } }),
      };
    }
    const daily = u.searchParams.get('daily');
    const startParam = u.searchParams.get('start_date');
    const endParam = u.searchParams.get('end_date');
    const dates = dateRange(new Date(`${startParam}T00:00:00Z`), new Date(`${endParam}T00:00:00Z`));
    if (daily === 'relative_humidity_2m_mean') {
      return { ok: true, json: async () => ({ daily: { time: dates, relative_humidity_2m_mean: dates.map(() => 90) } }) };
    }
    return { ok: true, json: async () => ({ daily: { time: dates, temperature_2m_max: dates.map(() => 20) } }) };
  });
  const signal = await evaluator.evaluateSignal(alwaysMissCacheSupabase(), PLACE, HEAT_STRESS_TYPE, NOW);
  assert.notEqual(signal, null, 'a real, complete baseline must not be rejected as insufficient');
});

// ── Lote 1 (2026-09-22): forecast-side completeness + metadata contract ──

test('heat_stress_window: an incomplete temperature forecast throws InsufficientDataError, not a silent partial average', async () => {
  const { evaluator, setFetch } = makeSignalEngine();
  setFetch(async (url) => {
    const u = new URL(url);
    if (u.pathname.includes('/v1/forecast')) {
      // Only 5 of the 7 requested days come back for temperature.
      const dates = dateRange(NOW, addDays(NOW, 4));
      return {
        ok: true,
        json: async () => ({ daily: { time: dates, temperature_2m_max: dates.map(() => 40), relative_humidity_2m_mean: dates.map(() => 80) } }),
      };
    }
    return historicalResponder(1)(url);
  });
  await assert.rejects(
    evaluator.evaluateSignal(alwaysMissCacheSupabase(), PLACE, HEAT_STRESS_TYPE, NOW),
    (err) => { assert.equal(err.name, 'InsufficientDataError'); return true; }
  );
});

test('heat_stress_window: an incomplete HUMIDITY forecast does not block evaluation, but is marked partial in structured_data', async () => {
  const { evaluator, setFetch } = makeSignalEngine();
  setFetch(async (url) => {
    const u = new URL(url);
    if (u.pathname.includes('/v1/forecast')) {
      const tempDates = dateRange(NOW, addDays(NOW, 6));
      // Humidity: only 3 of 7 days — deliberately incomplete.
      const humidityDates = dateRange(NOW, addDays(NOW, 2));
      return {
        ok: true,
        json: async () => ({
          daily: {
            time: tempDates,
            temperature_2m_max: tempDates.map(() => 40),
            relative_humidity_2m_mean: humidityDates.map(() => 80),
          },
        }),
      };
    }
    const daily = u.searchParams.get('daily');
    const startParam = u.searchParams.get('start_date');
    const endParam = u.searchParams.get('end_date');
    const dates = dateRange(new Date(`${startParam}T00:00:00Z`), new Date(`${endParam}T00:00:00Z`));
    if (daily === 'relative_humidity_2m_mean') {
      return { ok: true, json: async () => ({ daily: { time: dates, relative_humidity_2m_mean: dates.map(() => 90) } }) };
    }
    return { ok: true, json: async () => ({ daily: { time: dates, temperature_2m_max: dates.map(() => 20) } }) };
  });
  const signal = await evaluator.evaluateSignal(alwaysMissCacheSupabase(), PLACE, HEAT_STRESS_TYPE, NOW);
  assert.notEqual(signal, null, 'a partial humidity forecast must not block the whole evaluation');
  assert.equal(signal.structured_data.forecast_humidity_coverage, 'partial');
});

test('heat_stress_window: a real emission carries the full metadata contract', async () => {
  const { evaluator, setFetch } = makeSignalEngine();
  setFetch(async (url) => {
    const u = new URL(url);
    if (u.pathname.includes('/v1/forecast')) {
      const dates = dateRange(NOW, addDays(NOW, 6));
      return {
        ok: true,
        json: async () => ({ daily: { time: dates, temperature_2m_max: dates.map(() => 40), relative_humidity_2m_mean: dates.map(() => 80) } }),
      };
    }
    const daily = u.searchParams.get('daily');
    const startParam = u.searchParams.get('start_date');
    const endParam = u.searchParams.get('end_date');
    const dates = dateRange(new Date(`${startParam}T00:00:00Z`), new Date(`${endParam}T00:00:00Z`));
    if (daily === 'relative_humidity_2m_mean') {
      return { ok: true, json: async () => ({ daily: { time: dates, relative_humidity_2m_mean: dates.map(() => 90) } }) };
    }
    return { ok: true, json: async () => ({ daily: { time: dates, temperature_2m_max: dates.map(() => 20) } }) };
  });
  const signal = await evaluator.evaluateSignal(alwaysMissCacheSupabase(), PLACE, HEAT_STRESS_TYPE, NOW);
  assert.notEqual(signal, null);
  const sd = signal.structured_data;
  assert.equal(sd.method_version, 'heat-stress-avg-v1-2026-09-22');
  assert.equal(sd.forecast_source, 'open-meteo');
  assert.equal(sd.historical_model, 'era5');
  assert.equal(sd.forecast_humidity_coverage, 'complete');
  assert.equal(sd.historical_humidity_coverage, 'observed');
  assert.ok(sd.forecast_window.start && sd.forecast_window.end);
  assert.ok(typeof sd.historical_years_requested === 'number');
  assert.ok(typeof sd.historical_years_with_usable_window === 'number');
});

test('heavy_rain_event: an incomplete forecast throws InsufficientDataError in BOTH fixed and percentile mode', async () => {
  const incompleteFetch = async (url) => {
    const u = new URL(url);
    if (u.pathname.includes('/v1/forecast')) {
      const dates = dateRange(NOW, addDays(NOW, 3)); // only 4 of 7 days
      return { ok: true, json: async () => ({ daily: { time: dates, precipitation_sum: dates.map(() => 40) } }) };
    }
    return historicalResponder(1)(url);
  };
  const { evaluator: evalFixed, setFetch: setFetchFixed } = makeSignalEngine();
  setFetchFixed(incompleteFetch);
  await assert.rejects(
    evalFixed.evaluateSignal(alwaysMissCacheSupabase(), PLACE, { ...HEAVY_RAIN_TYPE, trigger_logic: { ...HEAVY_RAIN_TYPE.trigger_logic, default_params: { threshold_mode: 'fixed', threshold_mm: 25 } } }, NOW),
    (err) => { assert.equal(err.name, 'InsufficientDataError'); return true; },
    'fixed mode must also require the full forecast window'
  );

  const { evaluator: evalPct, setFetch: setFetchPct } = makeSignalEngine();
  setFetchPct(incompleteFetch);
  await assert.rejects(
    evalPct.evaluateSignal(alwaysMissCacheSupabase(), PLACE, HEAVY_RAIN_TYPE, NOW),
    (err) => { assert.equal(err.name, 'InsufficientDataError'); return true; }
  );
});

test('heavy_rain_event: fixed mode emits with forecast_source but explicitly no historical_model/coverage', async () => {
  const { evaluator, setFetch } = makeSignalEngine();
  setFetch(async (url) => {
    const u = new URL(url);
    const dates = dateRange(NOW, addDays(NOW, 6));
    return { ok: true, json: async () => ({ daily: { time: dates, precipitation_sum: dates.map((_, i) => (i === 2 ? 40 : 1)) } }) };
  });
  const fixedType = { ...HEAVY_RAIN_TYPE, trigger_logic: { ...HEAVY_RAIN_TYPE.trigger_logic, default_params: { threshold_mode: 'fixed', threshold_mm: 25 } } };
  const signal = await evaluator.evaluateSignal(alwaysMissCacheSupabase(), PLACE, fixedType, NOW);
  assert.notEqual(signal, null);
  const sd = signal.structured_data;
  assert.equal(sd.forecast_source, 'open-meteo');
  assert.equal(sd.method_version, 'heavy-rain-fixed-threshold-v1-2026-09-22');
  assert.equal(sd.historical_model, undefined, 'fixed mode never consults a historical baseline');
  assert.equal(sd.historical_years_requested, undefined);
});

test('heavy_rain_event: percentile mode emits with both forecast_source and historical_model, plus coverage fields', async () => {
  const { evaluator, setFetch } = makeSignalEngine();
  setFetch(async (url) => {
    const u = new URL(url);
    if (u.pathname.includes('/v1/forecast')) {
      const dates = dateRange(NOW, addDays(NOW, 6));
      return { ok: true, json: async () => ({ daily: { time: dates, precipitation_sum: dates.map((_, i) => (i === 2 ? 40 : 1)) } }) };
    }
    return historicalResponder(1)(url);
  });
  const signal = await evaluator.evaluateSignal(alwaysMissCacheSupabase(), PLACE, HEAVY_RAIN_TYPE, NOW);
  assert.notEqual(signal, null);
  const sd = signal.structured_data;
  assert.equal(sd.forecast_source, 'open-meteo');
  assert.equal(sd.historical_model, 'era5');
  assert.equal(sd.method_version, 'heavy-rain-percentile-max-v1-2026-09-22');
  assert.ok(typeof sd.historical_years_requested === 'number');
  assert.ok(typeof sd.historical_years_with_usable_window === 'number');
  assert.ok(sd.forecast_window.start && sd.forecast_window.end);
  assert.equal(sd.registry_reference_percentile, 95, 'nominal P95 is reported as reference metadata');
  assert.equal(sd.registry_reference_is_activation_floor, false, 'nominal P95 is not a second activation floor');
  assert.equal(JSON.stringify(sd.severity_percentile_thresholds), JSON.stringify({ low: 75, medium: 90, high: 95, extreme: 99 }));
  assert.equal(sd.activation_minimum_mm, 5, 'absolute amount floor is reported separately');
  assert.equal(sd.activation_rule, 'severity-percentile-buckets-and-absolute-mm-floor');
});

test('water_recovery_signal: a real emission carries historical_model but no forecast_source (never fetches a forecast)', async () => {
  const { evaluator, setFetch } = makeSignalEngine();
  setFetch(async (url) => {
    const u = new URL(url);
    const startParam = u.searchParams.get('start_date');
    if (startParam.startsWith('2026')) return historicalResponder(20)(url);
    return historicalResponder(1)(url);
  });
  const signal = await evaluator.evaluateSignal(alwaysMissCacheSupabase(), PLACE, WATER_RECOVERY_TYPE, NOW);
  assert.notEqual(signal, null);
  assert.equal(signal.structured_data.historical_model, 'era5');
  assert.equal(signal.structured_data.forecast_source, undefined);
});

test('rainfall_risk_rising: a real emission also carries forecast_source and historical_model', async () => {
  const { evaluator, setFetch } = makeSignalEngine();
  setFetch(fetchByEndpoint({
    forecast: forecastResponder(NOW, 30),
    archive: historicalResponder(1),
  }));
  const signal = await evaluator.evaluateSignal(alwaysMissCacheSupabase(), PLACE, RAINFALL_RISK_TYPE, NOW);
  assert.notEqual(signal, null);
  assert.equal(signal.structured_data.forecast_source, 'open-meteo');
  assert.equal(signal.structured_data.historical_model, 'era5');
});

console.log('signal-completeness tests passed (InsufficientDataError contract + traceability + realistic mocks)');
