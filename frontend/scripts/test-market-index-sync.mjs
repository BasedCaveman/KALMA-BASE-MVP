import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require = createRequire(import.meta.url), ts = require('typescript');
const source = fs.readFileSync(new URL('../lib/market-index-sync.ts',import.meta.url),'utf8');
const pool = '0x770a62f413b42b05b827f2bebe118d34b899f97d';
function load(saved = new Map()) {
  const module={exports:{}};
  const context={module,exports:module.exports,require:()=>({CONTRACTS:{CLIMATE_POOL:pool},CHAIN:{id:84532}}),window:{localStorage:{getItem:key=>saved.get(key)??null,setItem:(key,value)=>saved.set(key,value)}},AbortSignal,setTimeout,fetch:()=>{throw new Error('No real network')},console};
  vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,context);
  return module.exports;
}
const good=id=>({ok:true,json:async()=>({ok:true,row:{market_id:id,pool_address:pool}})});
let count=0;
for(const mode of ['success','http failure','wrong pool','wrong id','transient failure']){
  const api=load();let calls=0;
  const request=async()=>{calls++;if(mode==='http failure'||mode==='transient failure'&&calls===1)return{ok:false,json:async()=>({error:'unavailable'})};if(mode==='wrong pool')return{ok:true,json:async()=>({ok:true,row:{market_id:4,pool_address:'other'}})};if(mode==='wrong id')return good(3);return good(4);};
  if(['http failure','wrong pool','wrong id'].includes(mode)){await assert.rejects(api.syncMarketIndex(4,request,async()=>{}));assert.equal(calls,3);assert.ok(api.pendingMarketIndexes().includes(4));}
  else{await api.syncMarketIndex(4,request,async()=>{});assert.equal(api.pendingMarketIndexes().length,0);assert.equal(calls,mode==='success'?1:2);}
  count++;console.log('PASS',mode);
}
const saved=new Map(), first=load(saved);first.queueMarketIndex(4);const reopened=load(saved);assert.ok(reopened.pendingMarketIndexes().includes(4));await reopened.syncMarketIndex(4,async()=>good(4));assert.equal(load(saved).pendingMarketIndexes().length,0);count++;console.log('PASS persistent retry after reopen');
const api=load();let calls=0;const request=async()=>{calls++;return good(5);};await Promise.all([api.syncMarketIndex(5,request),api.syncMarketIndex(5,request)]);assert.equal(calls,1);count++;console.log('PASS shared in-flight operation');
for(const invalid of [0,-1,1.5,NaN])assert.throws(()=>api.queueMarketIndex(invalid));count++;console.log('PASS invalid IDs rejected');
console.log(`PASS ${count} market-index cases; no network or DB writes`);
