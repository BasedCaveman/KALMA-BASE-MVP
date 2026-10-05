// Hook integration fixtures: real hook code, mocked wagmi results; no effects,
// network, authenticated session, wallet mutation or transaction execution.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require=createRequire(import.meta.url);
const ts=require('typescript');
const root=fileURLToPath(new URL('../',import.meta.url));
let mode='success', balance=0n, eligible=true;
const calls=[];
const query=(data)=>({data,isError:false,isLoading:data===undefined,refetch:async()=>({data})});
const mockReact={useMemo:f=>f(),useEffect:()=>{},useState:value=>[value,()=>{}]};
const results={
  getMarketV5:['Phoenix, Arizona, United States',33448000n,-112074000n,1n,3n,1790694000n,1790953200n,1790694000n],
  getMarketStatus:[0n,25000000n,false,false,'0x53abC47Cf0836A53737BB45936bB4dc6d2066937',false,0n],
  getOdds:[0n,100n,0n,1000000n],getParticipantCount:1n,
  getResolutionDetails:[0n,0n,false,false],getUserPosition:[0n,0n,false],
};
const wagmi={
  useReadContract:options=>{
    calls.push(options);
    const data=options.functionName==='nextMarketId'?4n:options.functionName==='balanceOf'?balance:eligible;
    if(mode==='transport') return {...query(undefined),isError:true,isLoading:false};
    return query(mode==='loading'?undefined:data);
  },
  useReadContracts:options=>{
    calls.push(...options.contracts);
    if(mode==='transport')return {...query(undefined),isError:true,isLoading:false};
    if(mode==='loading')return query(undefined);
    return query(options.contracts.map(c=>mode==='decode'?
      {status:'failure',error:new Error('fixture decode error')}:
      {status:'success',result:results[c.functionName]}));
  },
  useWaitForTransactionReceipt:()=>({isLoading:false,isSuccess:false}),
};
function load(filename,cache=new Map()) {
  if(cache.has(filename))return cache.get(filename).exports;
  const module={exports:{}};cache.set(filename,module);
  function importer(spec) {
    if(spec==='react')return mockReact;
    if(spec==='wagmi')return wagmi;
    if(spec==='@/hooks/useWallet')return {useAccount:()=>({address:'0x4CA2701E8E4a2325c155354EA310862bfa293cBB',isConnected:true})};
    if(spec==='@/hooks/useWriteContract')return {useWriteContract:()=>({writeContractAsync:()=>{throw Error('writes forbidden');},reset:()=>{},isPending:false})};
    if(spec==='@/lib/social/auth-fetch')return {authFetch:()=>{throw Error('auth writes forbidden');}};
    if(spec.startsWith('@/')||spec.startsWith('.')) {
      const base=spec.startsWith('@/')?path.join(root,spec.slice(2)):path.resolve(path.dirname(filename),spec);
      const resolved=[base+'.ts',path.join(base,'index.ts')].find(f=>fs.existsSync(f));
      if(!resolved)throw Error('Unresolved '+spec);
      return load(resolved,cache);
    }
    return require(spec);
  }
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,
    {module,exports:module.exports,require:importer,console,Date,BigInt,Promise,Set,Map}, {filename});
  return module.exports;
}
for(const [scenario,expected] of [['success','success'],['transport','error'],['decode','error'],['loading','loading']]) {
  mode=scenario;calls.length=0;
  const state=load(path.join(root,'hooks/useMarkets.ts')).useMarkets(null,{marketId:3n});
  assert.equal(state.detailReadStatus,expected);
  assert.ok(calls.every(c=>c.chainId===84532));
  assert.ok(calls.filter(c=>c.args).every(c=>c.args[0]===3n),'detail must not read any other market');
  if(scenario==='success')assert.equal(state.markets[0].cityName,'Phoenix, Arizona, United States');
}
mode='success';calls.length=0;
const absent=load(path.join(root,'hooks/useMarkets.ts')).useMarkets(null,{marketId:4n});
assert.equal(absent.detailReadStatus,'not_found');
assert.equal(calls.filter(c=>c.args).length,0,'contract-confirmed absent ID must not query market fields');
for(const scenario of ['success','transport','loading'])for(const claim of [true,false,undefined])for(const value of [0n,100000000n,undefined]) {
  mode=scenario;balance=value;eligible=claim;calls.length=0;
  const state=load(path.join(root,'hooks/useFaucet.ts')).useFaucet();
  assert.ok(calls.every(c=>c.chainId===84532));
  assert.equal(state.showBanner,scenario==='success'&&value===0n&&claim===true);
  assert.equal(state.claimUnavailable,scenario==='success'&&value===0n&&claim===false);
  assert.equal(state.usdmBalance,scenario==='success'?value:undefined);
}
console.log('PASS real hook fixtures: targeted existing/absent market, loading/transport/decode, explicit chain84532, claim true/false/unavailable, balance zero/unavailable. Effects and writes never executed.');
