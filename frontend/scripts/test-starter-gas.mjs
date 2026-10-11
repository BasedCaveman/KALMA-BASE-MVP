import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const module = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL('../lib/starter-gas.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, { module, exports: module.exports });
const { prepareStarterGas, STARTER_GAS_MIN_BALANCE } = module.exports;
const hash = '0x' + 'ab'.repeat(32);
let count = 0;
async function test(name, run) { await run(); count++; console.log('PASS', name); }
function fixture(results, funded = false) {
  const state = { requests: 0, receipts: 0, pauses: 0, funded };
  const deps = {
    balance: async () => state.funded ? STARTER_GAS_MIN_BALANCE : 0n,
    request: async () => { state.requests++; return results[Math.min(state.requests - 1, results.length - 1)]; },
    receipt: async value => { assert.equal(value, hash); state.receipts++; state.funded = true; },
    pause: async () => { state.pauses++; },
  };
  return { state, deps };
}
await test('already funded wallet bypasses drip configuration entirely', async () => {
  const { state, deps } = fixture([], true); await prepareStarterGas('funded', deps); assert.equal(state.requests, 0);
});
await test('multiple mounted components share one request and receipt', async () => {
  const { state, deps } = fixture([{ ok: true, txHash: hash }]); await Promise.all([prepareStarterGas('same', deps), prepareStarterGas('SAME', deps)]); assert.equal(state.requests, 1); assert.equal(state.receipts, 1);
});
await test('busy signer is retried and later confirmation refreshes readiness', async () => {
  const { state, deps } = fixture([{ ok: false, error: 'drip_signer_busy' }, { ok: true, txHash: hash }]); await prepareStarterGas('busy', deps); assert.equal(state.requests, 2); assert.equal(state.pauses, 1);
});
await test('known pending hash is awaited without another POST', async () => {
  const { state, deps } = fixture([{ ok: false, error: 'drip_pending', txHash: hash }]); await prepareStarterGas('pending', deps); assert.equal(state.requests, 1); assert.equal(state.receipts, 1);
});
for (const error of ['drip_submission_unknown', 'drip_recovery_required', 'drip_misconfigured']) await test(error + ' never retries automatically', async () => {
  const { state, deps } = fixture([{ ok: false, error }]); await assert.rejects(prepareStarterGas(error, deps)); assert.equal(state.requests, 1); assert.equal(state.pauses, 0);
});
await test('pending without hash has a bounded retry limit', async () => {
  const { state, deps } = fixture([{ ok: false, error: 'drip_pending' }]); await assert.rejects(prepareStarterGas('bounded', deps)); assert.equal(state.requests, 8);
});
await test('failed native balance read is not treated as zero or sent', async () => {
  const { state, deps } = fixture([]); deps.balance = async () => { throw new Error('RPC unavailable'); }; await assert.rejects(prepareStarterGas('read-error', deps)); assert.equal(state.requests, 0);
});
await test('failed attempt releases browser dedup so explicit retry can proceed', async () => {
  const { state, deps } = fixture([{ ok: false, error: 'drip_misconfigured' }, { ok: true, txHash: hash }]); await assert.rejects(prepareStarterGas('retry', deps)); await prepareStarterGas('retry', deps); assert.equal(state.requests, 2);
});
await test('legacy false success with no ETH does not proceed to a claim', async () => {
  const { state, deps } = fixture([{ ok: true }]); await assert.rejects(prepareStarterGas('legacy', deps)); assert.equal(state.requests, 1);
});
console.log(`PASS ${count} starter-gas cases; fake RPC/API only`);
