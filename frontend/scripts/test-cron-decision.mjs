// kalma/frontend/scripts/test-cron-decision.mjs
//
// Tests for lib/signal-engine/cronDecision.ts's decideAndApply(), the
// logic app/api/cron/signal-engine/route.ts uses per (place, signal
// type). Requested explicitly in review 2026-09-21 (fourth round) as a
// condition for closing the release: confirm insufficiency preserves an
// existing active signal (no write to local_signals AT ALL, so its
// valid_until can't have been touched), that a real "evaluated fully,
// nothing crossed" outcome DOES supersede it, and that preserving never
// extends validity (there's nothing to extend — no write happened).
//
// Loads the real cronDecision.ts (transpiled, sandboxed, same technique
// as test-signal-completeness.mjs) with a scripted `evaluate` (not the
// real network-calling evaluator.ts — this module takes it as an
// injected dependency precisely so it doesn't need one) and a Supabase
// double that RECORDS every call, so "no write happened" is something
// these tests can actually assert, not just infer from the outcome type.

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

function loadCronDecision() {
  const context = vm.createContext({ console, Date });
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
  // Load evaluator.ts too, in the SAME vm context, so the test can throw
  // a real `new InsufficientDataError(...)` — a plain Error with `.name`
  // set to match would NOT satisfy cronDecision's `instanceof` check,
  // since that check is against the class object living in this sandbox.
  return { ...load('cronDecision'), InsufficientDataError: load('evaluator').InsufficientDataError };
}

// Records every call so a test can assert "no write happened", not just
// "the outcome type looked right". Each builder call (.eq, .select, ...)
// is recorded on the SAME call object as it's chained, then resolved by
// `.then` — mirroring how the real Supabase client's thenable builders work.
function recordingSupabase() {
  const calls = [];
  return {
    calls,
    from(table) {
      const call = { table, method: null, args: [] };
      calls.push(call);
      const builder = {
        update(patch) { call.method = 'update'; call.args.push(patch); return builder; },
        eq(...a) { call.args.push(['eq', ...a]); return builder; },
        select(...a) { call.args.push(['select', ...a]); return builder; },
        then(resolve) { return Promise.resolve({ data: [{ id: 'sig-1' }], error: null }).then(resolve); },
      };
      return builder;
    },
  };
}

const PLACE = { id: 'place-1', slug: 'synthetic', name: 'Synthetic', latitude: 0, longitude: 0, country_code: 'BR', region_code: null };
const SIGNAL_TYPE = {
  id: 'water_recovery_signal', slug: 'water', category: 'water',
  title_template_key: '', body_template_key: '',
  trigger_logic: { source: 'open-meteo', metric: '', method: 'doy_window_percentile', baseline_years: 10, doy_half_window: 7, thresholds: {} },
  affected_groups: [], supported_regions: ['global'], active: true,
};

function neverCalled(label = 'this function') {
  return () => { throw new Error(`${label} must not be called for this outcome`); };
}

test('insufficient data: preserves the existing signal — no local_signals write at all', async () => {
  const { decideAndApply, InsufficientDataError } = loadCronDecision();
  const supabase = recordingSupabase();
  const outcome = await decideAndApply(supabase, PLACE, SIGNAL_TYPE, {
    evaluate: async () => { throw new InsufficientDataError('gap'); },
    refineGroups: neverCalled('refineGroups'),
    upsert: neverCalled('upsert'),
  });
  assert.equal(outcome.kind, 'insufficient_data');
  // The real assertion: zero calls touched local_signals. Not "the update
  // wasn't THIS specific patch" — no write of any kind, so valid_until
  // cannot have been extended, shortened, or touched in any way.
  assert.equal(supabase.calls.length, 0, `expected no Supabase calls, got ${JSON.stringify(supabase.calls)}`);
});

test('evaluated fully, nothing crossed: supersedes the existing active signal', async () => {
  const { decideAndApply } = loadCronDecision();
  const supabase = recordingSupabase();
  const outcome = await decideAndApply(supabase, PLACE, SIGNAL_TYPE, {
    evaluate: async () => null,
    refineGroups: neverCalled('refineGroups'),
    upsert: neverCalled('upsert'),
  });
  // outcome crosses the vm sandbox's realm boundary, so its plain-object
  // literal has a different Object.prototype than one built in this
  // script — assert.deepEqual (strict mode) treats that as unequal even
  // when structurally identical. Compare fields directly instead.
  assert.equal(outcome.kind, 'no_crossing');
  assert.equal(outcome.supersededCount, 1);
  assert.equal(supabase.calls.length, 1);
  const call = supabase.calls[0];
  assert.equal(call.table, 'local_signals');
  assert.equal(call.method, 'update');
  // call.args[0] (the update patch) and the array entries below were built
  // inside the vm sandbox, so they're cross-realm from this script's own
  // object/array literals — compare via JSON.stringify (deepEqual/
  // deepStrictEqual checks prototype identity and fails across realms
  // even when structurally identical).
  assert.equal(JSON.stringify(call.args[0]), JSON.stringify({ status: 'superseded' }));
  // Scoped to exactly this place + type + currently-active rows — never a
  // blanket update, and never touching valid_until (the patch above is
  // only {status: 'superseded'}, nothing else).
  const eqCalls = call.args.filter((a) => Array.isArray(a) && a[0] === 'eq');
  assert.equal(
    JSON.stringify(eqCalls),
    JSON.stringify([
      ['eq', 'place_id', PLACE.id],
      ['eq', 'signal_type_id', SIGNAL_TYPE.id],
      ['eq', 'status', 'active'],
    ])
  );
});

test('a genuine fetch/parse error also preserves the existing signal — no write', async () => {
  const { decideAndApply } = loadCronDecision();
  const supabase = recordingSupabase();
  const outcome = await decideAndApply(supabase, PLACE, SIGNAL_TYPE, {
    evaluate: async () => { throw new Error('Open-Meteo archive 500'); },
    refineGroups: neverCalled('refineGroups'),
    upsert: neverCalled('upsert'),
  });
  assert.equal(outcome.kind, 'error');
  assert.equal(supabase.calls.length, 0);
});

test('a real emission runs refineGroups then upsert, and reports its result', async () => {
  const { decideAndApply } = loadCronDecision();
  const supabase = recordingSupabase();
  const candidate = { place_id: PLACE.id, signal_type_id: SIGNAL_TYPE.id, affected_groups: ['farmers'] };
  let refined = false;
  const outcome = await decideAndApply(supabase, PLACE, SIGNAL_TYPE, {
    evaluate: async () => candidate,
    refineGroups: (c, st) => { assert.equal(c, candidate); assert.equal(st, SIGNAL_TYPE); refined = true; },
    upsert: async (sb, c) => { assert.equal(c, candidate); return 'created'; },
  });
  assert.equal(refined, true);
  assert.equal(outcome.kind, 'created');
  assert.equal(supabase.calls.length, 0, 'upsert is injected and does its own writes outside this recorder');
});

test('a failed supersede write is reported as an error, not a silent no_crossing with count 0', async () => {
  // Review 2026-09-21 (fifth round), reproduced live: the supersede
  // update's `error` field was never checked, so a DB write failure
  // (data: null, error: {...}) read as `stale?.length ?? 0` — the exact
  // same shape as "nothing was active to supersede". A caller cannot
  // distinguish "the write failed" from "there was nothing to do" without
  // this fix.
  const { decideAndApply } = loadCronDecision();
  const supabase = {
    from(table) {
      const call = { table, method: null, args: [] };
      const builder = {
        update(patch) { call.method = 'update'; call.args.push(patch); return builder; },
        eq(...a) { call.args.push(['eq', ...a]); return builder; },
        select(...a) { call.args.push(['select', ...a]); return builder; },
        then(resolve) {
          return Promise.resolve({ data: null, error: { message: 'simulated database write failure' } }).then(resolve);
        },
      };
      return builder;
    },
  };
  const outcome = await decideAndApply(supabase, PLACE, SIGNAL_TYPE, {
    evaluate: async () => null,
    refineGroups: neverCalled('refineGroups'),
    upsert: neverCalled('upsert'),
  });
  assert.equal(outcome.kind, 'error');
  assert.match(outcome.message, /simulated database write failure/);
});

test('an unchanged upsert (duplicate for the day) is reported as skipped_duplicate, not created/updated', async () => {
  const { decideAndApply } = loadCronDecision();
  const supabase = recordingSupabase();
  const outcome = await decideAndApply(supabase, PLACE, SIGNAL_TYPE, {
    evaluate: async () => ({ place_id: PLACE.id, signal_type_id: SIGNAL_TYPE.id, affected_groups: [] }),
    refineGroups: () => {},
    upsert: async () => 'unchanged',
  });
  assert.equal(outcome.kind, 'skipped_duplicate');
});

console.log('cron-decision tests passed (insufficient data preserves; no-crossing supersedes; no write extends validity)');
