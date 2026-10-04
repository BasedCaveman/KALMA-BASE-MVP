import assert from 'node:assert/strict';
import {buildCompatibleChecks, safeVerification, isComparableCheck, COMPARISON_AVAILABLE_NOTE, COMPARISON_NOTE} from '../lib/signal-engine/verification-contract.ts';
import {reduceTrackRecord} from '../lib/signal-engine/brief-track-record.ts';
const date = '2026-09-25';
const observation = {variable:'precipitation_sum',unit:'mm',aggregation:'sum',duration_days:1,
  timezone:'UTC',start:date,end:date,sample_count:1,samples_complete:true,
  source:'Open-Meteo daily fixture',method_version:'daily-fixture-v1'};
const dailyHistoricalSamples = [...Array.from({length:23},(_,i)=>i+1),...Array(7).fill(12)]
  .map((value,i)=>({date:`${1996+i}-09-25`,value,duration_days:1}));
const sorted = dailyHistoricalSamples.map(x=>x.value).sort((a,b)=>a-b);
const median = (sorted[14]+sorted[15])/2;
assert.equal(median,12,'reference really comes from daily samples, not a scaled rolling sum');
const reference = {...observation,start:'2025-09-25',end:'2025-09-25',sample_count:30,
  baseline:median,source:'historical daily fixture',method_version:'daily-median-fixture-v1'};
const signal = {signal_type_id:'rainfall_risk_rising',title:'Synthetic daily reference',structured_data:{baseline_median_mm:12,comparison_reference:reference}};
const actuals = {precipitation_sum_mm:8.1,comparison_observations:{precipitation_sum:observation}};
const alias = structuredClone(signal);alias.structured_data.comparison_reference.timezone = 'GMT';
assert.equal(buildCompatibleChecks([alias],actuals,date).length,1,'GMT and UTC calendar windows are equivalent');
const checks = buildCompatibleChecks([signal],actuals,date);
assert.equal(checks.length,1);
assert.equal(checks[0].verdict,'below_baseline');
const available = safeVerification({checks,note:COMPARISON_NOTE},date);
assert.equal(available.comparison_status,'compatible_daily_reference');
assert.equal(available.note,COMPARISON_AVAILABLE_NOTE,'compatible comparison must not claim it is unavailable');
for (const days of [2,14]) {
  const s = structuredClone(signal);s.structured_data.comparison_reference.duration_days = days;
  assert.deepEqual(buildCompatibleChecks([s],actuals,date),[]);
}
assert.deepEqual(buildCompatibleChecks([{...signal,structured_data:{baseline_median_mm:77.7}}],actuals,date),[]);
assert.deepEqual(buildCompatibleChecks([signal],{precipitation_sum_mm:8.1},date),[]);
for (const [field,value] of [['unit','cm'],['variable','snowfall_sum'],['aggregation','mean'],['timezone','America/Sao_Paulo'],['timezone','unknown-zone'],['method_version',''],['source',''],['sample_count',0],['samples_complete',false],['end','2025-09-26'],['baseline',13]]) {
  const s = structuredClone(signal);s.structured_data.comparison_reference[field] = value;
  assert.deepEqual(buildCompatibleChecks([s],actuals,date),[],field);
}
assert.deepEqual(buildCompatibleChecks([signal],actuals,'2026-09-26'),[]);
assert.deepEqual(buildCompatibleChecks([signal],{...actuals,precipitation_sum_mm:NaN},date),[]);
assert.deepEqual(buildCompatibleChecks([{...signal,structured_data:{baseline_median_c:26}}],{temperature_max_c:28},date),[],'temperature without contract is not validated');
const legacy = {actuals:{precipitation_sum_mm:8.1},checks:[{...checks[0],comparison_contract:undefined}],note:'old unsafe copy'};
const before = JSON.stringify(legacy);
const safe = safeVerification(legacy,date);
assert.deepEqual(safe.checks,[]);
assert.equal(safe.actuals.precipitation_sum_mm,8.1);
assert.equal(safe.comparison_status,'unavailable_or_incompatible');
assert.equal(safe.note,COMPARISON_NOTE);
assert.equal(JSON.stringify(legacy),before,'reader never rewrites historical JSON');
assert.equal(isComparableCheck(legacy.checks[0]),false,'same guard used by compatible-check readers');
assert.equal(safeVerification({checks},date).checks.length,1);
const record = reduceTrackRecord([{brief_date:date,verified_at:date,verification:legacy}],30);
assert.equal(record.briefs_verified,1);
assert.equal(record.signal_days_checked,0);
const validRecord = reduceTrackRecord([{brief_date:date,verified_at:date,verification:{checks}}],30);
assert.equal(validRecord.signal_days_checked,1);
console.log('PASS: daily/2d/14d, dimensions, metadata, samples, temperature guard, legacy readers and track record');
// Exercise the actual exported builder and writer bodies without loading cron/service dependencies.
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const source = fs.readFileSync(new URL('../lib/signal-engine/brief.ts',import.meta.url),'utf8');
const ast = ts.createSourceFile('brief.ts',source,ts.ScriptTarget.Latest,true);
const names = ['buildChecks','verifyBrief'];
const functions = ast.statements.filter(n => ts.isFunctionDeclaration(n) && names.includes(n.name?.text));
assert.equal(functions.length,2);
const js = ts.transpileModule(functions.map(n=>n.getText(ast)).join('\n'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const exports = {};
const context = {exports,buildCompatibleChecks,safeVerification,COMPARISON_NOTE:'Contract-required',fetchDailyActuals:async()=>actuals,Date};
vm.runInNewContext(js,context);
assert.equal(exports.buildChecks([signal],actuals,date).length,1);
assert.equal(exports.buildChecks([{...signal,structured_data:{baseline_median_mm:104.9}}],actuals,date).length,0);
let written;
const db = {from(table){assert.equal(table,'place_briefs');return {update(row){written=row;return{eq:async(k,id)=>{assert.equal(k,'id');assert.equal(id,'fixture');return{error:null};}};}};}};
await exports.verifyBrief(db,{id:'fixture',brief_date:date,signals:[{...signal,structured_data:{baseline_median_mm:77.7}}]},{lat:0,lon:0});
assert.equal(written.verification.actuals.precipitation_sum_mm,8.1);
assert.equal(written.verification.checks.length,0);
assert.equal(written.verification.comparison_status,'unavailable_or_incompatible');
console.log('PASS: actual buildChecks and verifyBrief persistence simulated; no remote writes');
