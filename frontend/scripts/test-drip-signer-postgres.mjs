// Disposable native PostgreSQL, independent connections, fake chain only.
// Usage: node <script> <absolute temporary embedded-postgres install prefix>
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const toolRequire = createRequire(path.join(process.argv[2], 'package.json'));
const EmbeddedPostgres = toolRequire('embedded-postgres').default;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mvp-drip-native-db-'));
const pg = new EmbeddedPostgres({ databaseDir: dir, user: 'postgres', password: 'local-fixture', port: 55439, persistent: true, onLog: () => {}, onError: () => {} });
const module = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL('../lib/server/drip-signer-gate.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, { module, exports: module.exports });
const { createSignerGate, SignerBusyError } = module.exports;
const route = fs.readFileSync(new URL('../app/api/eth-drip/route.ts', import.meta.url), 'utf8');
const templates = [...route.matchAll(/sql`([^`]*eth_drip_claims[^`]*)`/g)].map(x => x[1]);
const query = (client, start, vars) => {
    const template = templates.find(x => x.startsWith(start));
  assert.ok(template, start);
  const values = [];
  const sql = template.replace(/\$\{(\w+)\}/g, (_, name) => { values.push(vars[name]); return '$' + values.length; });
  return client.query(sql, values);
};
const clients = [];
let cases = 0;
const hash = '0x' + 'ab'.repeat(32);
const signer = '0x' + '11'.repeat(20);
async function connect() { const client = pg.getPgClient(); await client.connect(); clients.push(client); return client; }
function store(client, chainId = 84532, address = signer) {
  const lockAddress = `__signer_lock__:${chainId}:${address.toLowerCase()}`;
  const vars = { lockAddress };
  return {
    read: async () => {
      const row = (await query(client, 'SELECT status, tx_hash FROM eth_drip_claims', vars)).rows[0];
      return row ? { token: row.status.slice('signer_lock:'.length), tx_hash: row.tx_hash } : null;
    },
    acquire: async token => (await query(client, 'INSERT INTO eth_drip_claims (address, status, tx_hash)', { ...vars, value: `signer_lock:${token}` })).rows.length === 1,
    hash: async (token, hash) => { assert.equal((await query(client, 'UPDATE eth_drip_claims SET tx_hash', { ...vars, value: `signer_lock:${token}`, hash })).rows.length, 1); },
    release: async token => { await query(client, "UPDATE eth_drip_claims SET status = 'signer_released'", { ...vars, value: `signer_lock:${token}` }); },
  };
}
async function test(name, fn) { await fn(); cases++; console.log('PASS', name); }
try {
  await pg.initialise(); await pg.start();
  const admin = await connect();
  const ddl = route.match(/sql`(CREATE TABLE IF NOT EXISTS eth_drip_claims[^`]+)`/)[1];
  await admin.query(ddl);
  console.log((await admin.query('SELECT version() AS version')).rows[0].version);
  const workers = await Promise.all(Array.from({ length: 20 }, connect));
  await test('20 independent PostgreSQL sessions, different recipients, one signer winner', async () => {
    const results = await Promise.all(workers.map((client, i) => store(client).acquire('wallet-' + i)));
    assert.equal(results.filter(Boolean).length, 1);
    const lock = await store(admin).read(); await store(admin).release(lock.token);
  });
  await test('uncommitted lock contention waits then loses after winner commits', async () => {
    await workers[0].query('BEGIN'); assert.equal(await store(workers[0]).acquire('transaction-owner'), true);
    let completed = false;
    const competing = store(workers[1]).acquire('competing').then(x => { completed = true; return x; });
    // A server-side sleep ensures the competing request has reached PostgreSQL.
    await admin.query('SELECT pg_sleep(0.05)'); assert.equal(completed, false);
    await workers[0].query('COMMIT'); assert.equal(await competing, false);
    await store(admin).release('transaction-owner');
  });
  await test('token fencing: stale release/hash cannot affect next instance', async () => {
    const s = store(admin); await s.acquire('old'); await s.release('old'); await s.acquire('new');
    await s.release('old'); await assert.rejects(s.hash('old', hash)); assert.equal((await s.read()).token, 'new'); await s.release('new');
  });
  await test('failure before broadcast releases; next request can reserve', async () => {
    const s = store(admin); const gate = await createSignerGate(s, 'pre-send', async () => null); await gate.close();
    assert.equal(await s.acquire('next'), true); await s.release('next');
  });
  await test('ambiguous broadcast stays locked across independent instances and retries', async () => {
    const gate = await createSignerGate(store(workers[0]), 'uncertain', async () => null);
    await assert.rejects(gate.send(async () => { throw Error('RPC timeout'); })); await gate.close();
    await assert.rejects(createSignerGate(store(workers[1]), 'retry', async () => null), SignerBusyError);
    assert.equal((await store(admin).read()).token, 'uncertain');
    // Fixture cleanup only; production requires explicit reconciliation approval.
    await store(admin).release('uncertain');
  });
  await test('known hash without confirmed receipt stays locked, never sends again', async () => {
    const gate = await createSignerGate(store(workers[0]), 'pending', async () => null); await gate.send(async () => hash); await gate.close();
    let sends = 0;
    await assert.rejects(createSignerGate(store(workers[1]), 'duplicate', async () => { sends++; return null; }), SignerBusyError);
    assert.equal(sends, 1); assert.equal((await store(admin).read()).tx_hash, hash); await store(admin).release('pending');
  });
  for (const status of ['success', 'reverted']) await test('confirmed ' + status + ' permits next worker, not rebroadcast of old hash', async () => {
    const old = await createSignerGate(store(workers[0]), 'old-' + status, async () => null); await old.send(async () => hash); await old.close();
    const next = await createSignerGate(store(workers[1]), 'next-' + status, async h => { assert.equal(h, hash); return status; });
    await old.close(); assert.equal((await store(admin).read()).token, 'next-' + status); await next.close();
  });
  await test('receipt lookup failure blocks rather than stealing', async () => {
    const s = store(admin); await s.acquire('lookup-fail'); await s.hash('lookup-fail', hash);
    await assert.rejects(createSignerGate(store(workers[1]), 'try', async () => { throw Error('RPC unavailable'); }));
    assert.equal((await s.read()).token, 'lookup-fail'); await s.release('lookup-fail');
  });
  await test('hash persistence failure after broadcast retains exclusion', async () => {
    const s = store(admin); const gate = await createSignerGate({ ...s, hash: async () => { throw Error('SQL unavailable'); } }, 'hash-fail', async () => null);
    await assert.rejects(gate.send(async () => hash)); await gate.close();
    assert.equal((await s.read()).token, 'hash-fail'); await s.release('hash-fail');
  });
  await test('repeated invocation of one gate never broadcasts twice', async () => {
    const gate = await createSignerGate(store(admin), 'one-submit', async () => null); let sends = 0;
    const submit = async () => { sends++; return hash; };
    await gate.send(submit); await assert.rejects(gate.send(submit)); assert.equal(sends, 1); gate.settled(); await gate.close();
  });
  await test('abandoned hash-free lock is NOT reclaimed even after days', async () => {
    const s = store(admin); await s.acquire('crashed');
    await admin.query("UPDATE eth_drip_claims SET updated_at = NOW() - INTERVAL '7 days' WHERE status='signer_lock:crashed'");
    await assert.rejects(createSignerGate(store(workers[1]), 'later', async () => null), SignerBusyError); await s.release('crashed');
  });
  await test('separate signers/networks do not share a lock', async () => {
    const s = store(admin); const other = store(workers[1], 84532, '0x' + '22'.repeat(20)); const chain = store(workers[2], 1);
    assert.equal(await s.acquire('base'), true); assert.equal(await other.acquire('other'), true); assert.equal(await chain.acquire('chain'), true);
    await s.release('base'); await other.release('other'); await chain.release('chain');
  });
  await test('sequential different recipients use next nonce only after settlement', async () => {
    let nonce = 5; const used = [];
    for (let i = 0; i < 2; i++) {
      const gate = await createSignerGate(store(workers[i]), 'recipient-' + i, async () => null);
      await gate.send(async () => { used.push(nonce); return hash; });
      await assert.rejects(createSignerGate(store(workers[i + 2]), 'compete', async () => null), SignerBusyError);
      nonce++; gate.settled(); await gate.close();
    }
    assert.deepEqual(used, [5, 6]);
  });
  console.log('PASS ' + cases + ' native PostgreSQL signer cases; 21 connections; no remote DB or real chain');
} finally { await Promise.all(clients.map(x => x.end())); await pg.stop(); }
