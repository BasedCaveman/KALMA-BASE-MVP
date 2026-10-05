// Real component rendering with isolated hooks/children. No wallet, effects,
// authentication, network or transactions. Not a remote Preview smoke test.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const root = fileURLToPath(new URL('../', import.meta.url));
let language = 'en', faucet;
const forbidden = () => { throw new Error('Side effects forbidden in copy fixtures'); };
function load(filename, cache = new Map()) {
  if (cache.has(filename)) return cache.get(filename).exports;
  const module = { exports: {} }; cache.set(filename, module);
  const importer = spec => {
    if (spec === '@/hooks/useTranslation') return { useTranslation: () => ({ language }) };
    if (spec === '@/hooks/useTheme') return { useTheme: () => ({ theme: 'dark' }) };
    if (spec === '@/hooks/useFaucet') return { useFaucet: () => faucet };
    if (spec === 'next/link') return { default: props => React.createElement('a', props) };
    if (spec === 'next/dynamic') return { default: () => () => null };
    if (['@/components/landing/LandingNow', '@/components/landing/LandingPrefs', '@/components/landing/IntentLauncher', '@/components/shared/WalletErrorPanel'].includes(spec)) return { default: () => null };
    if (spec.startsWith('@/') || spec.startsWith('.')) {
      const base = spec.startsWith('@/') ? path.join(root, spec.slice(2)) : path.resolve(path.dirname(filename), spec);
      const resolved = [base + '.ts', base + '.tsx', path.join(base, 'index.ts')].find(f => fs.existsSync(f));
      assert.ok(resolved, `Unresolved ${spec}`); return load(resolved, cache);
    }
    return require(spec);
  };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  }).outputText, { module, exports: module.exports, require: importer, console, BigInt, Date, Map, Set }, { filename });
  return module.exports;
}
const copy = load(path.join(root, 'lib/read-state-copy.ts')).readStateCopy;
const state = load(path.join(root, 'lib/contract-read-state.ts')).faucetReadState;
const Landing = load(path.join(root, 'components/landing/LandingContent.tsx')).default;
const Banner = load(path.join(root, 'components/shared/FaucetBanner.tsx')).default;
export function renderLanding(locale) {
  language = locale;
  return renderToStaticMarkup(React.createElement(Landing, {
    teasers: [], activePlaceCount: 0, activeSignalCount: 0, activeAlertCount: 0, globalLead: null,
  }));
}
for (const [locale, title, ctas, expected] of [
  ['en', 'More than a weather forecast. What deserves attention where it matters to you.', ["Open today&#x27;s dashboard", 'Browse live signals'], {
    loading: 'Loading data…', unavailable: 'Could not load the data. Please try again.', retry: 'Try again', claimUnavailable: 'Test credits are not available right now.',
  }],
  ['pt', 'Não é só previsão do tempo. É o que merece atenção onde importa para você.', ['Abrir o painel de hoje', 'Explorar sinais ativos'], {
    loading: 'Carregando dados…', unavailable: 'Não foi possível carregar os dados. Tente novamente.', retry: 'Tentar novamente', claimUnavailable: 'Os créditos de teste não estão disponíveis no momento.',
  }],
]) {
  assert.equal(JSON.stringify(copy(locale)), JSON.stringify(expected));
  const html = renderLanding(locale);
  assert.equal(html.match(/<h1[^>]*>(.*?)<\/h1>/s)[1], title);
  for (const cta of ctas) assert.ok(html.includes(cta));
  for (const connected of [false, true]) for (const value of [undefined, 0n, 1n]) for (const eligible of [undefined, false, true]) for (const failed of [false, true]) {
    const reads = state(connected, { data: value, isError: failed }, { data: eligible, isError: failed });
    const unavailable = connected && !failed && value === 0n && eligible === false;
    assert.equal(reads.claimUnavailable, unavailable);
    faucet = { ...reads, usdmBalance: reads.balance, stage: 'idle', claimFaucet: forbidden, refetchReads: forbidden };
    const rendered = renderToStaticMarkup(React.createElement(Banner));
    assert.equal(rendered.includes(expected.claimUnavailable), unavailable);
    if (connected && failed) {
      assert.ok(rendered.includes(expected.unavailable)); assert.ok(rendered.includes(expected.retry));
    } else if (connected && (value === undefined || eligible === undefined)) {
      assert.ok(rendered.includes(expected.loading));
    }
    if (connected && value === undefined && !failed) assert.ok(rendered.includes('—'));
  }
}
console.log('PASS EN/PT real hero literals + preserved CTA; 36 read-state combinations per locale rendered in real FaucetBanner. Pending/error/unknown never imply claim-unavailable. No side effects.');
