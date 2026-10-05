import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
// Evaluate the real configuration's headers; bundler plugins are not invoked.
const module = { exports: {} };
vm.runInNewContext(fs.readFileSync(new URL('../next.config.js', import.meta.url), 'utf8'), {
  module, __dirname: new URL('..', import.meta.url).pathname,
  require: id => id === 'webpack' ? {} : require(id),
});
const config = module.exports;
const headers = await config.headers();
const csp = headers.find(rule => rule.source === '/(.*)').headers.find(h => h.key === 'Content-Security-Policy').value;
const connect = csp.split(';').map(v => v.trim()).find(v => v.startsWith('connect-src ')).split(/\s+/).slice(1);
const chain = fs.readFileSync(new URL('../lib/chain.ts', import.meta.url), 'utf8');
const rpc = chain.match(/default:\s*\{\s*http:\s*\['([^']+)'\]/)?.[1];
assert.equal(rpc, 'https://sepolia.base.org');
assert.ok(connect.includes(new URL(rpc).origin), 'configured RPC must be allowed by the emitted CSP');
assert.ok(connect.includes("'self'"));
assert.ok(!connect.includes('*'));
assert.doesNotMatch(csp, /carrot\.Base|timothy\.Base/);
assert.ok(csp.includes("frame-ancestors 'none'"));
assert.ok(connect.includes('https://auth.privy.io'));
assert.ok(connect.includes('https://*.supabase.co'));
console.log('PASS: Base RPC matches emitted CSP; existing auth/database and framing restrictions retained');
