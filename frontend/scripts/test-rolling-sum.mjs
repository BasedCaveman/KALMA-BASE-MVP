// kalma/frontend/scripts/test-rolling-sum.mjs
//
// Pins the fix for the rolling-sum bug found 2026-09-21
// (docs/kalma-coordination-handover-2026-09-15/08-CLIMATE-COORDINATION-
// ASSESSMENT-2026-09-21.md) and the five follow-up defects an independent
// integration review found in that fix (docs/kalma-coordination-handover-
// 2026-09-15/09-UI-HANDOVER-CLIMATE-INTEGRITY-2026-09-21.md, E1-E5):
//
// - rollingNDaySumByYear(): the old rollingNDaySum() summed array-adjacent
//   entries of an already value-sorted array — nearest in magnitude, not
//   nearest in time. [0,10,0,10] has real 2-day sums [10,10,10], but the
//   old path sorted to [0,0,10,10] first and summed to [0,10,20].
// - E1: water_recovery_signal's production config only fetched enough
//   days for 20 rolling 14-day sums, under the 30-sample floor. Fixed by
//   fetching lookbackDays extra days per year.
// - E2: parseDailySeries must reject null/undefined before coercion —
//   Number(null) === 0, so a naive Number(raw[i]) turned a missing
//   observation into a real zero.
// - E3: sumIfComplete must refuse to sum a partial window as if it were
//   whole.
// - E4: DatedValue's `anchorYear` is the fetch-window label, not the true
//   calendar year of every date in it — grouping must still block cross-
//   window blending while allowing a genuinely continuous Dec->Jan run.
// - E5: doyTolerance's wraparound near the year boundary.

import assert from 'node:assert/strict';
import test from 'node:test';
import { rollingNDaySumByYear, parseDailySeries, sumIfComplete, hasSufficientYearCoverage } from '../lib/signal-engine/percentile.ts';
import { candidateDoys, doyDistance, wrapDoy, DOY_TOLERANCE } from '../lib/signal-engine/doyTolerance.ts';

function series(anchorYear, startDate, values) {
  const start = new Date(`${startDate}T00:00:00Z`);
  return values.map((value, i) => {
    const d = new Date(start.getTime() + i * 86400000);
    return { anchorYear, date: d.toISOString().slice(0, 10), value };
  });
}

test('reproduces the reported defect and confirms the fix', () => {
  const daily = series(2025, '2025-03-01', [0, 10, 0, 10]);
  const { sums } = rollingNDaySumByYear(daily, 2);
  assert.deepEqual(sums, [10, 10, 10]);
  assert.notDeepEqual(sums, [0, 10, 20]);
});

test('does not sum across an anchor-window boundary', () => {
  const year2024 = series(2024, '2024-09-20', [100, 100, 100]);
  const year2025 = series(2025, '2025-09-20', [1, 1, 1]);
  const { sums, yearsWithUsableWindow } = rollingNDaySumByYear([...year2024, ...year2025], 2);
  assert.deepEqual(sums, [2, 2, 200, 200]);
  assert.equal(yearsWithUsableWindow, 2);
});

test('skips a window with a missing day instead of silently shifting', () => {
  const withGap = [
    { anchorYear: 2025, date: '2025-06-01', value: 5 },
    { anchorYear: 2025, date: '2025-06-02', value: 5 },
    // 2025-06-03 missing (e.g. Open-Meteo returned null and it was dropped)
    { anchorYear: 2025, date: '2025-06-04', value: 5 },
  ];
  const { sums } = rollingNDaySumByYear(withGap, 2);
  assert.deepEqual(sums, [10]);
});

test('output is ascending, as percentileRank requires', () => {
  const daily = series(2025, '2025-01-01', [3, 1, 4, 1, 5, 9, 2, 6]);
  const { sums } = rollingNDaySumByYear(daily, 3);
  for (let i = 1; i < sums.length; i++) {
    assert.ok(sums[i] >= sums[i - 1], 'rolling sums must be sorted ascending');
  }
});

test('item2 (round 4): a year with data but not enough for one window does not count as usable', () => {
  // 2 years with 15 consecutive days each (a full window), 3 years with
  // only 1 day each — real data, but not enough to form even one 14-day
  // window. The earlier metric (openMeteoFetcher.ts's yearsWithData)
  // counted all 5 as "has data"; only 2 actually contribute a sum.
  const full2020 = series(2020, '2020-08-25', Array(15).fill(1));
  const full2021 = series(2021, '2021-08-25', Array(15).fill(1));
  const thin2017 = series(2017, '2017-08-25', [1]);
  const thin2018 = series(2018, '2018-08-25', [1]);
  const thin2019 = series(2019, '2019-08-25', [1]);
  const { sums, yearsWithUsableWindow } = rollingNDaySumByYear(
    [...full2020, ...full2021, ...thin2017, ...thin2018, ...thin2019],
    14
  );
  assert.equal(sums.length, 4); // 2 windows/year x 2 full years
  assert.equal(yearsWithUsableWindow, 2, 'the 3 single-day years must not count');
});

// ---------------------------------------------------------------------
// E1: production config (baseline_years=10, doy_half_window=7, N=14)
// must clear the 30-sample floor once lookbackDays extends the fetch.
// ---------------------------------------------------------------------

test('E1: 10yr x (15-day window + 13-day lookback) clears the 30-sample floor for a 14-day roll', () => {
  const N = 14;
  const lookbackDays = N - 1; // what evaluator.ts now passes
  const nominalWindowDays = 15; // 2*doy_half_window(7)+1
  const fetchedDaysPerYear = nominalWindowDays + lookbackDays; // 28
  const allSamples = [];
  for (let y = 2016; y < 2026; y++) {
    allSamples.push(...series(y, `${y}-08-25`, Array(fetchedDaysPerYear).fill(1)));
  }
  const { sums, yearsWithUsableWindow } = rollingNDaySumByYear(allSamples, N);
  // 28 - 14 + 1 = 15 windows/year x 10 years = 150.
  assert.equal(sums.length, 150);
  assert.ok(sums.length >= 30, 'must clear evaluator.ts\'s 30-sample floor');
  assert.equal(yearsWithUsableWindow, 10);
});

test('E1: without lookback, the same config falls short (documents why the fix is needed)', () => {
  const N = 14;
  const nominalWindowDays = 15;
  const allSamples = [];
  for (let y = 2016; y < 2026; y++) {
    allSamples.push(...series(y, `${y}-08-25`, Array(nominalWindowDays).fill(1)));
  }
  const { sums } = rollingNDaySumByYear(allSamples, N);
  assert.equal(sums.length, 20); // 15-14+1=2 per year x 10 years
  assert.ok(sums.length < 30, 'this is the bug E1 fixed — 20 is under the floor');
});

// ---------------------------------------------------------------------
// E2: null/undefined must not become a real zero.
// ---------------------------------------------------------------------

test('E2: parseDailySeries drops null and undefined, keeps a genuine 0', () => {
  const dates = ['2025-01-01', '2025-01-02', '2025-01-03', '2025-01-04'];
  const raw = [5, null, 0, undefined];
  const out = parseDailySeries(2025, dates, raw);
  assert.deepEqual(
    out.map((p) => [p.date, p.value]),
    [['2025-01-01', 5], ['2025-01-03', 0]]
  );
});

test('E2: a gap from a dropped null correctly breaks a rolling window', () => {
  const dates = ['2025-06-01', '2025-06-02', '2025-06-03'];
  const raw = [5, null, 5]; // the exact case from the independent review
  const parsed = parseDailySeries(2025, dates, raw);
  const { sums } = rollingNDaySumByYear(parsed, 2);
  // day1 and day3 are not consecutive (day2 is missing, not zero) — no
  // valid 2-day window exists here at all.
  assert.deepEqual(sums, []);
});

// ---------------------------------------------------------------------
// E3: a partial recent window must not be summed as if it were complete.
// ---------------------------------------------------------------------

function consecutiveDates(start, n) {
  const s = new Date(`${start}T00:00:00Z`);
  return Array.from({ length: n }, (_, i) => new Date(s.getTime() + i * 86400000).toISOString().slice(0, 10));
}

test('item3: sumIfComplete rejects a short or gappy window', () => {
  assert.equal(sumIfComplete(consecutiveDates('2026-01-01', 3), [1, 2, 3], '2026-01-01', 14).complete, false);
  assert.equal(
    sumIfComplete(consecutiveDates('2026-01-01', 14), [...Array(13).fill(1), null], '2026-01-01', 14).complete,
    false
  );
});

test('item3: sumIfComplete rejects dates that are the right count but not the requested consecutive run', () => {
  // 14 values, 14 dates, but the dates are NOT the requested run (e.g. a
  // provider quirk or a stale cached response reused for the wrong day).
  const wrongDates = consecutiveDates('2026-02-01', 14); // requested start was 2026-01-01
  const result = sumIfComplete(wrongDates, Array(14).fill(1), '2026-01-01', 14);
  assert.equal(result.complete, false);
});

test('item3: sumIfComplete accepts a genuinely complete window, real zeros included', () => {
  const dates = consecutiveDates('2026-01-01', 14);
  const fourteenDays = [0, ...Array(13).fill(1)];
  const result = sumIfComplete(dates, fourteenDays, '2026-01-01', 14);
  assert.equal(result.complete, true);
  assert.equal(result.sum, 13);
});

// ---------------------------------------------------------------------
// E4: anchorYear groups correctly even across a real December->January
// run, and never blends two different anchor windows.
// ---------------------------------------------------------------------

test('E4: a genuine December->January run within ONE anchor window sums correctly', () => {
  // One anchor-window iteration (e.g. targetDate 2026-01-01, doyHalfWindow
  // 1) can fetch 2024-12-31, 2025-01-01, 2025-01-02, all labelled with the
  // SAME anchorYear (the iteration's label) even though the first date's
  // true calendar year differs.
  const window = [
    { anchorYear: 2025, date: '2024-12-31', value: 1 },
    { anchorYear: 2025, date: '2025-01-01', value: 1 },
    { anchorYear: 2025, date: '2025-01-02', value: 1 },
  ];
  const { sums } = rollingNDaySumByYear(window, 2);
  // Real consecutive days -> both 2-day sums are valid, physical
  // continuity across the year boundary is preserved.
  assert.deepEqual(sums, [2, 2]);
});

test('E4: two different anchor windows that each touch the same true calendar year do not blend', () => {
  // anchorYear 2025's window ends 2024-12-31; anchorYear 2024's window
  // starts 2024-01-01. Both touch true calendar year 2024, from opposite
  // ends, a year apart. Grouping by true calendar year (instead of
  // anchorYear) would incorrectly pool these together.
  const anchor2025 = series(2025, '2024-12-30', [100, 100]); // 2024-12-30, 2024-12-31
  const anchor2024 = series(2024, '2024-01-01', [1, 1]); // 2024-01-01, 2024-01-02
  const { sums } = rollingNDaySumByYear([...anchor2025, ...anchor2024], 2);
  assert.deepEqual(sums, [2, 200]);
});

// ---------------------------------------------------------------------
// E5: DOY tolerance must wrap consistently past the year boundary.
// ---------------------------------------------------------------------

test('E5: wrapDoy cycles past 365/366 instead of clamping', () => {
  assert.equal(wrapDoy(367), 1);
  assert.equal(wrapDoy(368), 2);
  assert.equal(wrapDoy(0), 366);
});

test('E5: candidateDoys near year-end includes the wrapped low DOYs doyDistance agrees are near', () => {
  const candidates = candidateDoys(364, DOY_TOLERANCE);
  // 1 is exactly DOY_TOLERANCE (3) steps from 364 going forward
  // (364->365->366->1) and must be reachable — it was completely absent
  // before the fix.
  assert.ok(candidates.includes(1), `expected 1 in ${JSON.stringify(candidates)}`);
  assert.equal(doyDistance(364, 1), DOY_TOLERANCE);
});

test('E5: candidateDoys and doyDistance agree at 364, 365, 366, and 1', () => {
  for (const center of [364, 365, 366, 1]) {
    const candidates = candidateDoys(center, DOY_TOLERANCE);
    for (const c of candidates) {
      assert.ok(
        doyDistance(center, c) <= DOY_TOLERANCE,
        `candidateDoys(${center}) included ${c}, but doyDistance says it's ${doyDistance(center, c)} away`
      );
    }
    // And nothing within tolerance is missing from the candidate set.
    for (let doy = 1; doy <= 366; doy++) {
      if (doyDistance(center, doy) <= DOY_TOLERANCE) {
        assert.ok(candidates.includes(doy), `doy ${doy} is within tolerance of ${center} but candidateDoys omitted it`);
      }
    }
  }
});

// ---------------------------------------------------------------------
// item2: a fixed sample-count floor can pass on very thin real coverage
// once lookback is in play — hasSufficientYearCoverage() is the guard.
// ---------------------------------------------------------------------

test('item2: 2 of 10 years is insufficient even though it clears a 30-window floor', () => {
  assert.equal(hasSufficientYearCoverage(10, 2), false);
  assert.equal(hasSufficientYearCoverage(10, 5), true);
  assert.equal(hasSufficientYearCoverage(10, 10), true);
  assert.equal(hasSufficientYearCoverage(2, 1), true); // ceil(2/2) = 1
});

console.log('rolling-sum tests passed (E1-E5 plus the original rolling-sum defect)');
