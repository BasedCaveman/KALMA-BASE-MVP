import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const viem = require('viem');
const { privateKeyToAccount } = require('viem/accounts');
const { baseSepolia } = require('viem/chains');
function load(path, imports = {}) {
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(new URL(path, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, require: name => imports[name] ?? require(name), process: { env: { DATABASE_URL: 'fixture-not-a-database', BASE_FAUCET_OWNER_PRIVATE_KEY: 'fixture-only' } }, console: { error() {} } });
  return module.exports;
}
const policy = load('../lib/server/eth-drip.ts');
const hash = '0x' + 'ab'.repeat(32);
const address = '0x4CA2701E8E4a2325c155354EA310862bfa293cBB';
let cases = 0;
async function test(name, fn) { await fn(); cases++; console.log('PASS', name); }
function fixture(row = null) {
  const state = { row, events: [], sends: 0, waitResult: 'success', receiptResult: null };
  const deps = {
    preflight: async () => { state.events.push('preflight'); },
    reserve: async () => { state.events.push('reserve'); if (state.row && !(state.row.status === 'retry_authorized' && state.row.tx_hash === null)) return null; state.row = { status: 'pending', tx_hash: null }; return state.row; },
    existing: async () => state.row,
    save: async (status, tx_hash) => { state.events.push(status + ':' + tx_hash); state.row = { status, tx_hash }; },
    send: async () => { state.sends++; state.events.push('send'); return hash; },
    wait: async () => { state.events.push('wait'); return state.waitResult; },
    receipt: async () => state.receiptResult,
  };
  return { state, deps };
}
await test('successful send persists hash BEFORE waiting and then sent', async () => {
  const { state, deps } = fixture(); const result = await policy.prepareEthDrip(deps);
  assert.equal(result.status, 200); assert.equal(state.sends, 1); assert.equal(state.row.status, 'sent');
  assert.ok(state.events.indexOf('pending:' + hash) < state.events.indexOf('wait'));
});
await test('concurrent same-address requests send at most once', async () => {
  const { state, deps } = fixture(); await Promise.all([policy.prepareEthDrip(deps), policy.prepareEthDrip(deps)]); assert.equal(state.sends, 1);
});
await test('explicit reconciled retry marker is consumed once under concurrency', async () => {
  const { state, deps } = fixture({ status: 'retry_authorized', tx_hash: null }); await Promise.all([policy.prepareEthDrip(deps), policy.prepareEthDrip(deps)]); assert.equal(state.sends, 1); assert.equal(state.row.status, 'sent');
});
await test('retry marker with a hash cannot submit again', async () => {
  const { state, deps } = fixture({ status: 'retry_authorized', tx_hash: hash }); assert.equal((await policy.prepareEthDrip(deps)).status, 409); assert.equal(state.sends, 0);
});
await test('preflight rejection does not reserve or send', async () => {
  const { state, deps } = fixture(); deps.preflight = async () => { throw new policy.DripConfigurationError('drip_owner_mismatch', 'fixture'); };
  await assert.rejects(policy.prepareEthDrip(deps)); assert.equal(state.row, null); assert.equal(state.sends, 0);
});
for (const status of ['failed', 'submission_unknown', 'failed_reverted', 'unrecognized']) {
  await test(status + ' never silently re-reserved', async () => {
    const { state, deps } = fixture({ status, tx_hash: null }); const result = await policy.prepareEthDrip(deps);
    assert.equal(result.status, 409); assert.equal(result.body.error, 'drip_recovery_required'); assert.equal(state.sends, 0); assert.equal(state.row.status, status);
  });
}
await test('sent with receipt hash is idempotent', async () => {
  const { state, deps } = fixture({ status: 'sent', tx_hash: hash }); assert.equal((await policy.prepareEthDrip(deps)).body.status, 'already_requested'); assert.equal(state.sends, 0);
});
await test('sent without hash requires reconciliation', async () => {
  const { deps } = fixture({ status: 'sent', tx_hash: null }); assert.equal((await policy.prepareEthDrip(deps)).status, 409);
});
await test('pending without hash is non-2xx and never sent again', async () => {
  const { state, deps } = fixture({ status: 'pending', tx_hash: null }); const r = await policy.prepareEthDrip(deps); assert.equal(r.status, 409); assert.equal(r.body.error, 'drip_pending'); assert.equal(state.sends, 0);
});
for (const receipt of [null, 'success', 'reverted']) {
  await test('pending hash reconciliation: ' + receipt, async () => {
    const { state, deps } = fixture({ status: 'pending', tx_hash: hash }); state.receiptResult = receipt;
    const result = await policy.prepareEthDrip(deps); assert.equal(result.status, receipt === 'success' ? 200 : 409); assert.equal(state.sends, 0);
    assert.equal(state.row.status, receipt === 'success' ? 'sent' : receipt === 'reverted' ? 'failed_reverted' : 'pending');
  });
}
await test('receipt timeout preserves submitted hash, not retryable failed', async () => {
  const { state, deps } = fixture(); deps.wait = async () => { throw Error('timeout'); };
  const result = await policy.prepareEthDrip(deps); assert.equal(result.status, 409); assert.equal(state.row.status, 'pending'); assert.equal(state.row.tx_hash, hash);
});
await test('send timeout becomes submission_unknown, no automatic retry', async () => {
  const { state, deps } = fixture(); deps.send = async () => { state.sends++; throw Error('ambiguous broadcast'); };
  assert.equal((await policy.prepareEthDrip(deps)).status, 502); assert.equal(state.row.status, 'submission_unknown'); await policy.prepareEthDrip(deps); assert.equal(state.sends, 1);
});
await test('ledger save failure after send still prevents second send', async () => {
  const { state, deps } = fixture(); deps.save = async () => { throw Error('ledger unavailable'); };
  await policy.prepareEthDrip(deps); await policy.prepareEthDrip(deps); assert.equal(state.sends, 1);
});
await test('reverted receipt retained as failed_reverted with hash', async () => {
  const { state, deps } = fixture(); state.waitResult = 'reverted'; assert.equal((await policy.prepareEthDrip(deps)).status, 409); assert.equal(state.row.status, 'failed_reverted'); assert.equal(state.row.tx_hash, hash);
});

// Route wiring tests: fake auth/RPC/SQL; never connect to a real service.
function routeFixture({ auth = { ok: true }, ownerMismatch = false, wrongChain = false, simulationFails = false } = {}) {
  const events = []; const account = { address, type: 'local' }; let row = null;
  const sql = async (parts, ...values) => {
    const query = parts.join('?'); events.push('sql:' + query.split(' ')[0]);
    if (query.startsWith('INSERT')) { if (row) return []; row = { status: 'pending', tx_hash: null }; return [row]; }
    if (query.startsWith('SELECT')) return row ? [row] : [];
    if (query.startsWith('UPDATE')) row = { status: values[0], tx_hash: values[1] };
    return [];
  };
  const route = load('../app/api/eth-drip/route.ts', {
    'next/server': { NextResponse: { json: (body, init) => ({ body, status: init?.status ?? 200 }) } },
    '@neondatabase/serverless': { neon: () => sql },
    'viem': { isAddress: viem.isAddress, http: () => 'fixture', createWalletClient: () => ({ writeContract: async tx => { assert.equal(tx.account, account); assert.equal(tx.chain.id, 84532); assert.equal(tx.functionName, 'dripEthFor'); assert.equal(tx.args[0], address); events.push('send'); return hash; } }), createPublicClient: () => ({ getChainId: async () => wrongChain ? 1 : 84532, readContract: async () => ownerMismatch ? '0x' + '99'.repeat(20) : address, simulateContract: async tx => { assert.equal(tx.account, account); if (simulationFails) throw Error('simulation'); events.push('simulate'); }, waitForTransactionReceipt: async () => ({ status: 'success' }) }) },
    'viem/accounts': { privateKeyToAccount: () => account }, 'viem/chains': { baseSepolia },
    '@/lib/server/privy-auth': { requireWalletAuth: async () => auth }, '@/lib/server/eth-drip': policy,
  });
  return { route, events };
}
await test('route rejects invalid address before any RPC/SQL', async () => {
  const { route, events } = routeFixture(); assert.equal((await route.POST({ json: async () => ({ address: 'bad' }) })).status, 400); assert.equal(events.length, 0);
});
for (const status of [401, 403]) await test('auth ' + status + ' never reserves/sends', async () => {
  const { route, events } = routeFixture({ auth: { ok: false, status, error: 'fixture', message: 'fixture' } }); assert.equal((await route.POST({ json: async () => ({ address }) })).status, status); assert.equal(events.length, 0);
});
for (const flag of ['ownerMismatch', 'wrongChain', 'simulationFails']) await test(flag + ' fails before ledger insert', async () => {
  const { route, events } = routeFixture({ [flag]: true }); const r = await route.POST({ json: async () => ({ address }) }); assert.equal(r.status, flag === 'simulationFails' ? 502 : 503); assert.equal(events.filter(x => x.startsWith('sql:')).length, 0); assert.ok(!events.includes('send'));
});
await test('route keeps full local signer account and confirms success', async () => {
  const { route, events } = routeFixture(); assert.equal((await route.POST({ json: async () => ({ address }) })).status, 200); assert.ok(events.includes('send'));
});
await test('REAL viem local signer uses raw submission with mocked transport only', async () => {
  // Public fixture key. No real network, configured secret or wallet import.
  const account = privateKeyToAccount('0x' + '1'.padStart(64, '0')); const methods = [];
  const client = viem.createWalletClient({ account, chain: baseSepolia, transport: viem.custom({ request: async ({ method }) => { methods.push(method); if (method === 'eth_chainId') return '0x14a34'; if (method === 'eth_sendRawTransaction') return hash; throw Error('Unexpected fixture RPC: ' + method); } }) });
  const result = await client.writeContract({ account, address: '0x45176C683A245e84c9ee3f56242532031490a005', abi: [{ type: 'function', name: 'dripEthFor', stateMutability: 'nonpayable', inputs: [{ name: 'user', type: 'address' }], outputs: [] }], functionName: 'dripEthFor', args: [address], nonce: 0, gas: 100000n, maxFeePerGas: 1n, maxPriorityFeePerGas: 0n });
  assert.equal(result, hash); assert.ok(methods.includes('eth_sendRawTransaction')); assert.ok(!methods.includes('eth_sendTransaction'));
});
console.log(`PASS ${cases} eth-drip cases (mock RPC/ledger only; no real transactions or DB writes)`);
