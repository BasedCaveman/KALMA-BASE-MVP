// Optional isolated test tool, NOT a runtime dependency. Pass pinned PGlite module path.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
if (!process.argv[2]) throw Error('Pass the absolute module path of @electric-sql/pglite@0.5.8 installed outside the repo');
const { PGlite } = await import(pathToFileURL(process.argv[2]).href);
const db = new PGlite();
const route = fs.readFileSync(new URL('../app/api/eth-drip/route.ts', import.meta.url), 'utf8');
const doc = fs.readFileSync(new URL('../../docs/MVP-DRIP-FOCAL-PREPARATION-2026-10-06.md', import.meta.url), 'utf8');
const ddl = route.match(/sql`(CREATE TABLE[^`]+)`/)[1];
const reserveTemplate = [...route.matchAll(/sql`([^`]*eth_drip_claims[^`]*)`/g)]
  .map(match => match[1])
  .find(query => query.startsWith("INSERT INTO eth_drip_claims (address, status) VALUES (${normalized}, 'pending')"));
assert.ok(reserveTemplate, 'wallet reservation SQL template exists');
const reserve = reserveTemplate.replaceAll('${normalized}', '$1');
const marker = doc.match(/```sql\n([\s\S]+?)\n```/)[1];
const target = '0x4ca2701e8e4a2325c155354ea310862bfa293cbb';
let cases = 0;
async function test(name, fn) { await fn(); cases++; console.log('PASS', name); }
try {
  await db.exec(ddl);
  await test('actual reservation SQL creates one pending row', async () => {
    assert.equal((await db.query(reserve, ['new'])).rows.length, 1);
    assert.equal((await db.query(reserve, ['new'])).rows.length, 0);
  });
  for (const status of ['failed', 'submission_unknown', 'failed_reverted', 'pending', 'sent']) await test(status + ' cannot be re-reserved', async () => {
    await db.query('INSERT INTO eth_drip_claims(address,status) VALUES ($1,$2)', [status, status]);
    assert.equal((await db.query(reserve, [status])).rows.length, 0);
  });
  await test('retry marker with existing hash blocks submission', async () => {
    await db.query('INSERT INTO eth_drip_claims(address,status,tx_hash) VALUES ($1,$2,$3)', ['hash', 'retry_authorized', '0xfixture']);
    assert.equal((await db.query(reserve, ['hash'])).rows.length, 0);
  });
  await db.query('INSERT INTO eth_drip_claims(address,status,created_at) VALUES ($1,$2,$3)', [target, 'failed', '2026-10-06T12:09:20.291Z']);
  await test('recovery proposal rolls back without changing target', async () => {
    await db.exec('BEGIN'); assert.equal((await db.query(marker)).rows.length, 1); await db.exec('ROLLBACK');
    assert.equal((await db.query('SELECT status FROM eth_drip_claims WHERE address=$1', [target])).rows[0].status, 'failed');
  });
  await test('operator marker changes exactly target, retains created_at and other rows', async () => {
    const before = (await db.query('SELECT * FROM eth_drip_claims WHERE address<>$1 ORDER BY address', [target])).rows;
    const row = (await db.query(marker)).rows; assert.equal(row.length, 1); assert.equal(row[0].address, target); assert.equal(new Date(row[0].created_at).toISOString(), '2026-10-06T12:09:20.291Z');
    assert.deepEqual((await db.query('SELECT * FROM eth_drip_claims WHERE address<>$1 ORDER BY address', [target])).rows, before);
    assert.equal((await db.query(marker)).rows.length, 0);
  });
  await test('twenty queued reservations consume retry marker exactly once', async () => {
    const results = await Promise.all(Array.from({ length: 20 }, () => db.query(reserve, [target])));
    assert.equal(results.reduce((n,r) => n + r.rows.length, 0), 1);
    const row = (await db.query('SELECT * FROM eth_drip_claims WHERE address=$1', [target])).rows[0]; assert.equal(row.status, 'pending'); assert.equal(row.tx_hash, null); assert.equal(new Date(row.created_at).toISOString(), '2026-10-06T12:09:20.291Z');
  });
  console.log(`PASS ${cases} SQL cases: PostgreSQL WASM in memory; actual route/doc SQL; NO remote DB. Queued single-connection test is not multi-worker Neon concurrency proof.`);
} finally { await db.close(); }
