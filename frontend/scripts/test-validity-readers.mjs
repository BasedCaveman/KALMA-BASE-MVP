import assert from 'node:assert/strict';
import fs from 'node:fs';
import { isCurrentlyValid, applyValidityFilter } from '../lib/signal-engine/validity.ts';

const now = new Date('2026-10-04T12:00:00.000Z');
const signal = {
  status: 'active',
  valid_from: '2026-10-04T11:00:00.000Z',
  valid_until: '2026-10-04T13:00:00.000Z',
};

assert.equal(isCurrentlyValid(signal, now), true, 'vigente deve ser consumível');
assert.equal(
  isCurrentlyValid({ ...signal, valid_until: '2026-10-04T11:59:59.999Z' }, now),
  false,
  'vencido não deve ser consumível',
);
assert.equal(
  isCurrentlyValid({ ...signal, valid_from: '2026-10-04T12:00:00.001Z' }, now),
  false,
  'início futuro não deve ser consumível',
);
assert.equal(
  isCurrentlyValid({ ...signal, valid_until: 'not-a-timestamp' }, now),
  false,
  'validade inválida deve falhar fechada',
);
assert.equal(
  isCurrentlyValid({ ...signal, status: 'expired' }, now),
  false,
  'status não ativo não deve ser consumível',
);

const calls = [];
const query = Object.fromEntries(
  ['eq', 'lte', 'gt'].map((method) => [method, (...args) => { calls.push([method, ...args]); return query; }]),
);
assert.equal(applyValidityFilter(query, now), query, 'mantém o builder encadeável');
assert.deepEqual(calls, [
  ['eq', 'status', 'active'],
  ['lte', 'valid_from', now.toISOString()],
  ['gt', 'valid_until', now.toISOString()],
]);

const consumers = new Map([
  ['app/page.tsx', 3],
  ['app/signals/page.tsx', 1],
  ['hooks/useLocalSignals.ts', 2],
  ['app/places/[slug]/page.tsx', 1],
  ['app/api/places/nearest/route.ts', 1],
  ['app/api/places/[slug]/pulse/route.ts', 1],
  ['lib/signal-engine/brief.ts', 1],
]);
for (const [relativePath, minimumCalls] of consumers) {
  const source = fs.readFileSync(new URL('../' + relativePath, import.meta.url), 'utf8');
  assert.match(source, /import\s*\{\s*applyValidityFilter\s*\}\s*from/,
    relativePath + ' must use the shared validity contract');
  assert.ok((source.match(/applyValidityFilter\(/g) ?? []).length >= minimumCalls,
    relativePath + ' must apply it to every current-signal read');
}

// Dated brief archives are records, not current signals. They stay readable
// independently of whether the source signal's live window has since expired.
const archive = fs.readFileSync(new URL('../app/places/[slug]/briefs/[date]/page.tsx', import.meta.url), 'utf8');
assert.doesNotMatch(archive, /applyValidityFilter/);
const historicalSignal = structuredClone(signal);
const before = JSON.stringify(historicalSignal);
assert.equal(isCurrentlyValid({ ...historicalSignal, valid_until: '2026-10-03T00:00:00Z' }, now), false);
assert.equal(JSON.stringify(historicalSignal), before, 'validity checks do not rewrite historical records');

console.log('PASS: current, expired, future-start, invalid validity; current readers wired; historical archive preserved');
