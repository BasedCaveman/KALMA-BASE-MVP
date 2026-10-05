import assert from 'node:assert/strict';
import fs from 'node:fs';
import { readStatus, marketReadStatus, faucetReadState } from '../lib/contract-read-state.ts';
import { readStateCopy } from '../lib/read-state-copy.ts';
import { deriveMarketUiState } from '../lib/market-state.ts';

const ok = () => ({ data: [{ status: 'success' }] });
const fields = () => Array.from({ length:4 }, ok);
let checks = 0;
function check(actual, expected) { assert.deepEqual(actual, expected); checks++; }
check(marketReadStatus(3n, { data:4n }, fields()), 'success');
check(marketReadStatus(4n, { data:4n }, fields()), 'not_found');
check(marketReadStatus(0n, {}, []), 'not_found');
check(marketReadStatus(3n, {}, fields()), 'loading');
check(marketReadStatus(3n, { isError:true }, fields()), 'error');
check(marketReadStatus(3n, { data:4n }, [{}, ...fields().slice(1)]), 'loading');
for (let i=0; i<4; i++) {
  const failed = fields(); failed[i] = { isError:true };
  check(marketReadStatus(3n, { data:4n }, failed), 'error');
  const decode = fields(); decode[i] = { data:[{status:'failure'}] };
  check(marketReadStatus(3n, { data:4n }, decode), 'error');
}
check(readStatus({data:0n}), 'success');
check(readStatus({data:false}), 'success');
check(readStatus({}), 'loading');
check(readStatus({data:0n,isError:true}), 'error');
check(readStatus({},false), 'idle');
check(deriveMarketUiState({startTime:100,endTime:200,predictionDeadline:100,resolved:false,now:99}), 'live');
check(deriveMarketUiState({startTime:100,endTime:200,predictionDeadline:100,resolved:false,now:100}), 'cooldown');
check(deriveMarketUiState({startTime:100,endTime:200,predictionDeadline:200,resolved:false,now:199}), 'live');
check(deriveMarketUiState({startTime:100,endTime:200,predictionDeadline:200,resolved:false,now:200}), 'expired');
for (const connected of [false,true]) for (const balanceRead of [{},{isError:true},{data:0n},{data:100000000n}]) for (const claimRead of [{},{isError:true},{data:false},{data:true}]) {
  const state=faucetReadState(connected,balanceRead,claimRead);
  check(state.showBanner, connected && balanceRead.data===0n && claimRead.data===true);
  check(state.claimUnavailable, connected && balanceRead.data===0n && claimRead.data===false);
  if (!connected || balanceRead.data===undefined) check(state.balance,undefined);
  if (!connected || claimRead.data===undefined) check(state.canClaim,undefined);
}
for(const locale of ['en','pt']) {
  assert.ok(!/0m|minute|minuto/.test(readStateCopy(locale).claimUnavailable)); checks++;
}
const source=(path)=>fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');
assert.match(source('app/markets/[id]/MarketDetailClient.tsx'),/useMarkets\(location, \{ marketId \}\)/);
assert.match(source('app/markets/[id]/MarketDetailClient.tsx'),/detailReadStatus === 'not_found' \? copy.notFound/);
assert.doesNotMatch(source('hooks/useFaucet.ts'),/data:.*= (0n|false)|cooldownSeconds: 0/);
assert.doesNotMatch(source('components/shared/FaucetBanner.tsx'),/formatCooldown/);
assert.doesNotMatch(source('app/profile/page.tsx'),/formatCooldown/);
console.log(`PASS ${checks} read-state assertions; targeted ID / false-not-found / no fabricated cooldown wiring checks.`);
console.log('State tests only: actual Chrome transport response, contained browser QA and Preview remain separate gates.');
