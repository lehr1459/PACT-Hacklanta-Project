import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {accessFixture} from './access-fixture.mjs';
import {PROGRAM} from './rpc-fixture.mjs';
import {root} from '../validation/common.mjs';

// Finite pilot evidence, not a production-provider benchmark or capacity SLA.
// PostgreSQL, HTTP, durable real host clock and hardened SDK are actual; the
// independent raw RPC server supplies disposable encoded chain fixtures.
test('Phase8 finite four-concurrent two-app HTTP load preserves fresh authority and outage recovery',{timeout:30000},async t=>{
 const c=await accessFixture({serviceOptions:{now:Date.now,monotonicNow:()=>performance.now()}});
 t.after(()=>c.close());
 c.rpc.state.timestampSeconds=null; // Fixture Clock now follows the real host wall.
 c.rpc.addLicense({offer:c.offer,buyer:c.buyer.identity,expirySeconds:BigInt(Math.floor(Date.now()/1000)+300)});
 const second=await c.app();
 assert.equal((await c.admin.mutate('POST',second.path+'/resources',second.id,'resource.bind',{
  resourceKey:'premium',offerAddress:c.offer.address})).status,200);
 const secondGrant=await c.grant(second,c.buyer.identity);
 const targets=[{app:c.own,grant:c.buyer},{app:second,grant:secondGrant}];
 const timings=[],started=performance.now();
 function fresh(response,target){
  assert.equal(response.status,200,'bounded legitimate load must allow');
  const r=response.data,f=r.freshness,wall=Date.now();
  assert.equal(r.decision==='ALLOW'&&r.reason==='ACTIVE_LICENSE',true,'supported positive decision required');
  assert.equal(r.schemaVersion===1&&typeof r.requestId==='string',true);
  assert.equal(r.appId===target.app.id&&r.resourceKey==='premium'&&r.resourceVersion===1&&r.policyEpoch==='1',true,'exact policy binding required');
  assert.equal(r.offerAddress===c.offer.address&&r.walletAddress===target.grant.identity.address&&r.network==='solana-devnet'&&r.programId===PROGRAM,true,'exact identity and chain binding required');
  assert.equal(Number.isSafeInteger(r.contextSlot)&&r.contextSlot>0&&typeof r.chainTimestamp==='string'&&/^[0-9]+$/.test(r.chainTimestamp),true);
  assert.equal(typeof r.expiresAt==='string'&&/^[0-9]+$/.test(r.expiresAt),true);
  assert.equal(f&&[f.readStartedAtMs,f.receivedAtMs,f.lastProgressAtMs,f.verifiedAtMs,f.validUntilMs].every(Number.isSafeInteger),true);
  assert.equal(f.maxAgeMs===8000&&f.maxProgressAgeMs===12000,true);
  assert.equal(f.readStartedAtMs<=f.receivedAtMs&&f.receivedAtMs<=f.verifiedAtMs&&f.verifiedAtMs<=wall&&wall<f.validUntilMs,true,'original evidence must still be fresh on receipt');
  assert.equal(f.validUntilMs<=f.readStartedAtMs+8000&&f.validUntilMs<=f.lastProgressAtMs+12000,true);
  assert.equal(BigInt(r.expiresAt)*1000n>=BigInt(f.validUntilMs)&&BigInt(r.expiresAt)>BigInt(Math.floor(wall/1000)),true);
  assert.equal(r.verifiedAt===new Date(f.verifiedAtMs).toISOString(),true);
 }
 async function protectedRead(target,measure=true){
  const start=performance.now(),response=await c.check({walletGrant:target.grant.walletGrant,resourceKey:'premium'},target.app.key);
  if(measure)timings.push(performance.now()-start);return response;
 }
 // Exactly two reads per app: respects per-app chain2 and shared protected6,
 // while four real HTTP requests contend for the protected SQL pool's2 sockets.
 for(let batch=0;batch<6;batch++){
  const requests=targets.flatMap(target=>[target,target]);
  const results=await Promise.all(requests.map(target=>protectedRead(target)));
  results.forEach((result,index)=>fresh(result,requests[index]));
 }
 c.rpc.state.fail=true;let unavailable;
 try{unavailable=await protectedRead(targets[0],false);}finally{c.rpc.state.fail=false;}
 assert.equal(unavailable.status,503);assert.equal(unavailable.data.decision==='DENY'&&unavailable.data.reason==='CHAIN_UNAVAILABLE',true,'outage must never produce a positive decision');
 fresh(await protectedRead(targets[0],false),targets[0]);
 await c.service.flushTelemetry();
 let settled=false;
 for(let attempt=0;attempt<100;attempt++){
  const diagnostic=c.service.diagnostics(),database=c.native.diagnostics();
  if(diagnostic.http.active===0&&diagnostic.chain.access===0&&diagnostic.chain.control===0
   &&database.pending===0&&database.protectedPending===0&&c.service.telemetry.diagnostics().pending===0){settled=true;break;}
  await delay(10);
 }
 assert.equal(settled,true,'all admitted work and observations must settle');
 timings.sort((a,b)=>a-b);
 const percentile=p=>Number(timings[Math.ceil(timings.length*p)-1].toFixed(3));
 const receipt={schemaVersion:1,kind:'finite-hosted-pilot-load',status:'passed',samples:24,concurrency:4,applications:2,
  totalMs:Number((performance.now()-started).toFixed(3)),latencyMs:{p50:percentile(.5),p95:percentile(.95),p99:percentile(.99),max:percentile(1)},
  positiveResponses:24,outageDenials:1,recoveryAllows:1,errorClasses:{CHAIN_UNAVAILABLE:1},allAdmissionsSettled:true,
  authorityClock:'actual host Date.now plus performance.now and durable filesystem ceiling',
  rpc:'local encoded Devnet fixture with advancing slot and host-wall Clock; no external provider or transaction',productionSla:false};
 const directory=path.join(root,'web/test-results/validation/hosted-load');await mkdir(directory,{recursive:true});
 await writeFile(path.join(directory,'receipt.json'),JSON.stringify(receipt,null,2)+'\n');
 process.stdout.write(JSON.stringify(receipt)+'\n');
});
