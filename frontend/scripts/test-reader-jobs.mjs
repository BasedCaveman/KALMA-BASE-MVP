import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const routes = ['signal-engine', 'enrich-places', 'commodity-context', 'leaderboard',
  'weather-news', 'inmet-alerts', 'place-briefs', 'cre-shadow'];
const read = (path) => fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8');
function load(source, env, require, effects) {
  const exports = {};
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(compiled, {
    exports, require, process: { env }, console, URL, Response,
    fetch: () => { effects.push('fetch'); throw new Error('unexpected network effect'); },
  });
  return exports;
}
const gate = load(read('lib/server/climate-job-role.ts'), {}, () => {}, []);
assert.equal(gate.climateJobBlockReason({}), 'climate_jobs_disabled');
assert.equal(gate.climateJobBlockReason({ KALMA_DEPLOYMENT_ROLE: 'unknown' }), 'climate_jobs_disabled');
assert.equal(gate.climateJobBlockReason({ KALMA_DEPLOYMENT_ROLE: 'climate-executor', VERCEL_ENV: 'production' }), null);
assert.equal(gate.climateJobBlockReason({ KALMA_DEPLOYMENT_ROLE: 'climate-executor', VERCEL_ENV: 'preview' }), 'preview_jobs_disabled');

let invocations = 0;
for (const route of routes) {
  for (const env of [
    { NODE_ENV: 'development' }, // Old auth allowed manual calls here without a secret.
    { NODE_ENV: 'production', VERCEL_ENV: 'production', KALMA_DEPLOYMENT_ROLE: 'reader' },
    { NODE_ENV: 'production', VERCEL_ENV: 'preview', KALMA_DEPLOYMENT_ROLE: 'reader' },
    { NODE_ENV: 'production', VERCEL_ENV: 'preview', KALMA_DEPLOYMENT_ROLE: 'climate-executor' },
  ]) {
    const effects = [];
    // Deliberately provide valid test credentials: the role gate must win over auth.
    const testEnv = { ...env, CRON_SECRET: 'fixture-only',
      NEXT_PUBLIC_SUPABASE_URL: 'https://example.invalid', SUPABASE_SERVICE_ROLE_KEY: 'fixture-only' };
    const unexpected = (name) => () => { effects.push(name); throw new Error('unexpected effect: ' + name); };
    const dependencies = (id) => {
      if (id === '@/lib/server/climate-job-role') return gate;
      if (id === 'next/server') return { NextResponse: { json: Response.json } };
      if (id === '@/lib/contracts') return { CONTRACTS: { CLIMATE_POOL: '0x0000000000000000000000000000000000000001' }, CHAIN: {} };
      // parseAbiItem only parses a constant at module load; it is not an RPC call.
      return new Proxy({}, { get: (_target, name) => name === 'parseAbiItem'
        ? (abi) => abi : unexpected(id + '.' + String(name)) });
    };
    const handlers = load(read('app/api/cron/' + route + '/route.ts'), testEnv, dependencies, effects);
    assert.equal(typeof handlers.GET, 'function', route + ' exposes GET');
    for (const method of ['GET', 'POST']) {
      if (!handlers[method]) continue;
      for (const queryAuth of [false, true]) {
        const request = new Request('https://mvp.invalid/api/cron/' + route +
          (queryAuth ? '?secret=fixture-only' : ''), {
          method, headers: { authorization: 'Bearer fixture-only' },
        });
        const response = await handlers[method](request);
        assert.equal(response.status, 403, route + ' ' + method + ' must refuse');
        assert.deepEqual(await response.json(), { error: gate.climateJobBlockReason(testEnv) });
        assert.deepEqual(effects, [], route + ' must not touch DB, providers, RPC or transactions');
        invocations++;
      }
    }
  }
}
const config = JSON.parse(read('vercel.json'));
assert.deepEqual(config.crons, [], 'MVP has no background job schedules');
console.log(`PASS: ${invocations} real handler invocations refused; zero dependency/network effects; eight jobs unscheduled`);
