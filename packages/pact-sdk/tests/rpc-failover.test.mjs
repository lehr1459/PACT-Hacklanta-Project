import test from 'node:test';
import assert from 'node:assert/strict';
import {setImmediate as immediate, setTimeout as delay} from 'node:timers/promises';
import {keccak_256} from '@noble/hashes/sha3';
import {createPactClient, PactError} from '@pact/sdk';
import {createPlatformReader, createPlatformReaderPool, createEndpointHistory} from '../dist/server-chain.js';
import {fixture, input, seller, license, PROGRAM, GENESIS, corrupt} from './fixtures.mjs';

const PRIMARY='https://primary.invalid/', SECONDARY='https://secondary.invalid/';
const CLOCK='SysvarC1ock11111111111111111111111111111111';
const EPOCH=1000000, code=expected=>error=>error?.code===expected;
const allowed=new Set(['getGenesisHash','getMultipleAccounts','getLatestBlockhash','getSignatureStatuses']);
const metadataJson=JSON.stringify({schema:'pact-solana-license-v1',title:'Failover',terms:'Synthetic public fixture',priceLamports:'1000000',durationSeconds:'60'});
function deferred(){let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve};}
async function flush(){await immediate();await immediate();}
function snapshot(state={}){
  const result=fixture({slot:state.slot??100,timestamp:state.timestamp??1000n,expiry:state.expiry??1060n});
  corrupt(result,0,bytes=>Buffer.from(keccak_256(Buffer.from(metadataJson))).copy(bytes,64));
  if(state.missing)result.value[1]=null;
  return result;
}
function harness(t, override=()=>undefined, state={}){
  const calls=[];
  t.after(()=>assert.ok(calls.every(call=>allowed.has(call.q.method)),'RPC allowlist asserted outside implementation catches'));
  const fetch=async(url,init)=>{
    const q=JSON.parse(init.body),call={url:String(url),q,signal:init.signal};calls.push(call);
    const custom=await override(call,state);if(custom!==undefined)return custom;
    let result;
    if(q.method==='getGenesisHash')result=GENESIS;
    else if(q.method==='getMultipleAccounts'){
      result=snapshot(state);
      if(q.params[0].length===4&&q.params[0][1]!==license.toBase58())result.value[1]=null;
      if(q.params[0].length===2)result.value=[result.value[2],result.value[3]];
      if(q.params[0].length===3)result.value=[null,result.value[2],result.value[3]];
    }else if(q.method==='getLatestBlockhash')result={context:{slot:state.slot??100},value:{blockhash:seller.toBase58(),lastValidBlockHeight:200}};
    else result={context:{slot:state.slot??100},value:[null]};
    return Response.json({jsonrpc:'2.0',id:q.id,result});
  };
  return{fetch,calls,state};
}
const reader=(source,extra={})=>createPlatformReader({rpcUrls:[PRIMARY,SECONDARY],fetch:source.fetch,now:()=>EPOCH,...extra});

test('server endpoint options are bounded, normalized, distinct, and copied at construction',async t=>{
  for(const rpcUrls of [[],new Array(1),[PRIMARY,SECONDARY,'https://third.invalid'],[PRIMARY,'https://PRIMARY.invalid:443'],['http://remote.invalid'],['https://user:password@private.invalid'],['https://private.invalid/#fragment'],[null]])
    assert.throws(()=>createPlatformReader({rpcUrls}),code('INVALID_INPUT'));
  assert.throws(()=>createPlatformReader({rpcUrl:PRIMARY,rpcUrls:[SECONDARY]}),code('INVALID_INPUT'));
  const source=harness(t),urls=[PRIMARY,SECONDARY],r=createPlatformReader({rpcUrls:urls,fetch:source.fetch,now:()=>EPOCH});
  urls[0]='https://mutated.invalid/';await r.readiness();assert.equal(source.calls[0].url,PRIMARY);
});

for(const failure of ['network','429','503','body-transport'])test(`settled ${failure} failure restarts genesis and the full snapshot at the second endpoint`,async t=>{
  const source=harness(t,({url,q})=>{
    if(url!==PRIMARY||q.method!=='getMultipleAccounts')return;
    if(failure==='network')throw new PactError('WRONG_NETWORK','https://private.invalid/?secret=DO_NOT_REFLECT');
    if(failure==='body-transport')return{ok:true,headers:new Headers(),body:{getReader:()=>({read:async()=>{throw new PactError('STALE','PRIVATE_BODY');},cancel:async()=>{},releaseLock(){}})}};
    return new Response('Unavailable',{status:Number(failure)});
  });
  assert.equal((await reader(source).getLicenseStatus(input)).active,true);
  assert.deepEqual(source.calls.map(c=>[c.url,c.q.method]),[[PRIMARY,'getGenesisHash'],[PRIMARY,'getMultipleAccounts'],[SECONDARY,'getGenesisHash'],[SECONDARY,'getMultipleAccounts']]);
});

for(const failure of ['wrong-genesis','bad-json','bad-utf8','bad-envelope','rpc-error','401','bad-account','stale-clock'])test(`${failure} is a semantic failure and never selects fallback`,async t=>{
  const source=harness(t,({q})=>{
    if(failure==='wrong-genesis'&&q.method==='getGenesisHash')return Response.json({jsonrpc:'2.0',id:q.id,result:'NotDevnet'});
    if(q.method!=='getMultipleAccounts')return;
    if(failure==='bad-json')return new Response('{');
    if(failure==='bad-utf8')return new Response(new Uint8Array([255]));
    if(failure==='bad-envelope')return Response.json({jsonrpc:'2.0',id:q.id+1,result:snapshot()});
    if(failure==='rpc-error')return Response.json({jsonrpc:'2.0',id:q.id,error:{code:-32005,message:'Unavailable'}});
    if(failure==='401')return new Response('Unauthorized',{status:401});
    const result=snapshot(failure==='stale-clock'?{timestamp:900n}:{});
    if(failure==='bad-account')result.value[0].owner=seller.toBase58();
    return Response.json({jsonrpc:'2.0',id:q.id,result});
  });
  const expected=failure==='wrong-genesis'?'WRONG_NETWORK':failure==='bad-account'?'INVALID_ACCOUNT':failure==='stale-clock'?'STALE':'RPC_ERROR';
  await assert.rejects(reader(source).getLicenseStatus(input),code(expected));
  assert.ok(source.calls.every(c=>c.url===PRIMARY));
});

for(const action of ['checkout','offer'])test(`late blockhash outage restarts ${action} preparation and preserves the first validated high-water`,async t=>{
  const source=harness(t,({url,q},state)=>{
    state.slot=url===PRIMARY?101:102;
    if(url===PRIMARY&&q.method==='getLatestBlockhash')return new Response('Unavailable',{status:503});
  },{missing:true});
  const r=reader(source),prepared=action==='checkout'
    ?await r.prepareCheckout({network:'devnet',offerAddress:input.offer,walletAddress:input.wallet,metadataJson})
    :await r.prepareOffer({network:'devnet',sellerWallet:seller.toBase58(),nonce:'1',metadataJson});
  assert.equal(action==='checkout'?prepared.quote.contextSlot:prepared.contextSlot,102);
  assert.deepEqual(source.calls.map(c=>c.q.method),['getGenesisHash','getMultipleAccounts','getLatestBlockhash','getGenesisHash','getMultipleAccounts','getLatestBlockhash']);
  const second=source.calls.find(c=>c.url===SECONDARY&&c.q.method==='getMultipleAccounts');
  assert.equal(second.q.params[1].minContextSlot,101);
});

test('offer lookup failover returns only the complete fallback quote',async t=>{
  const source=harness(t,({url,q},state)=>{
    state.slot=url===PRIMARY?100:101;
    if(url===PRIMARY&&q.method==='getMultipleAccounts')throw Error('Unavailable');
  });
  const result=await reader(source).getOffer({offer:input.offer});
  assert.equal(result.offer,input.offer);assert.equal(result.contextSlot,101);
  assert.deepEqual(source.calls.map(c=>c.q.method),['getGenesisHash','getMultipleAccounts','getGenesisHash','getMultipleAccounts']);
});

test('transaction-status failover revalidates genesis without refreshing Clock history',async t=>{
  const history=createEndpointHistory(),source=harness(t,({url,q})=>{
    if(url===PRIMARY&&q.method==='getSignatureStatuses')return new Response('Unavailable',{status:503});
  });
  const r=createPlatformReaderPool({rpcUrls:[PRIMARY,SECONDARY],fetch:source.fetch,now:()=>EPOCH},{history,activeLimit:1,queueLimit:0});
  assert.equal((await r.getTransactionStatus({signature:'1'.repeat(64)})).state,'not-found');
  assert.equal(history.slot,-1);assert.equal(history.timestamp,-1n);
  assert.deepEqual(source.calls.map(c=>c.q.method),['getGenesisHash','getSignatureStatuses','getGenesisHash','getSignatureStatuses']);
});

test('a fallback cannot roll back a validated primary snapshot after later blockhash failure',async t=>{
  const source=harness(t,({url,q},state)=>{
    state.slot=url===PRIMARY?101:100;
    if(url===PRIMARY&&q.method==='getLatestBlockhash')return new Response('Unavailable',{status:503});
  },{missing:true});
  await assert.rejects(reader(source).prepareCheckout({network:'devnet',offerAddress:input.offer,walletAddress:input.wallet,metadataJson}),code('INVALID_ACCOUNT'));
  assert.equal(source.calls.filter(c=>c.q.method==='getLatestBlockhash').length,1);
});

test('a timed-out attempt waits for real ignored-abort fetch settlement before fallback',async t=>{
  const held=deferred();let primarySettled=false,secondaryObservedSettlement=false;
  const source=harness(t,async({url,q})=>{
    if(url===PRIMARY){await held.promise;primarySettled=true;return Response.json({jsonrpc:'2.0',id:q.id,result:GENESIS});}
    secondaryObservedSettlement=primarySettled;
  });
  const r=reader(source),pending=r.readiness();
  t.after(()=>held.resolve());
  await delay(2100);assert.equal(source.calls.length,1);assert.equal(source.calls[0].signal.aborted,true);
  held.resolve();assert.equal((await pending).ready,true);assert.equal(secondaryObservedSettlement,true);
});

test('five-second admission deadline includes queue wait; ignored work never starts replacement transports',async t=>{
  const held=deferred(),source=harness(t,async()=>{await held.promise;throw Error('late transport');});
  const r=createPlatformReaderPool({rpcUrls:[PRIMARY,SECONDARY],fetch:source.fetch,now:()=>EPOCH},{history:createEndpointHistory(),activeLimit:1,queueLimit:1});
  t.after(()=>held.resolve());
  const started=performance.now(),pending=[r.readiness(),r.readiness()];
  await flush();assert.deepEqual(r.diagnostics(),{inflight:1,queued:1,quarantined:0});
  const results=await Promise.allSettled(pending);
  assert.ok(results.every(v=>v.status==='rejected'&&v.reason.code==='TIMEOUT'));
  assert.ok(performance.now()-started>=4900&&performance.now()-started<6500);
  assert.equal(source.calls.length,1);assert.deepEqual(r.diagnostics(),{inflight:0,queued:0,quarantined:1});
  held.resolve();await flush();assert.deepEqual(r.diagnostics(),{inflight:0,queued:0,quarantined:0});
});

for(const kind of ['body-read','body-cancel'])test(`unsettled ${kind} prevents fallback and retains cancelled pool capacity`,async t=>{
  const held=deferred(),controller=new AbortController();
  const source=harness(t,()=>kind==='body-read'?{ok:true,headers:new Headers(),body:{getReader:()=>({read:()=>held.promise,cancel:async()=>{},releaseLock(){}})}}:
    {ok:false,status:503,body:{cancel:()=>held.promise}});
  const r=createPlatformReaderPool({rpcUrls:[PRIMARY,SECONDARY],fetch:source.fetch,now:()=>EPOCH},{history:createEndpointHistory(),activeLimit:1,queueLimit:0});
  t.after(()=>held.resolve({done:true}));
  const pending=r.readiness({signal:controller.signal});await flush();controller.abort();
  await assert.rejects(pending,code('CANCELLED'));assert.equal(source.calls.length,1);
  assert.deepEqual(r.diagnostics(),{inflight:0,queued:0,quarantined:1});
  await assert.rejects(r.readiness(),code('BUSY'));
  held.resolve({done:true});await flush();assert.deepEqual(r.diagnostics(),{inflight:0,queued:0,quarantined:0});
});

test('readiness reads fresh genesis and only same-context Clock/program, with safe output',async t=>{
  const source=harness(t),r=reader(source),result=await r.readiness();
  assert.deepEqual(result,{ready:true,network:'devnet',programId:PROGRAM,contextSlot:100,chainTimestamp:'1000',startedAtMs:EPOCH,receivedAtMs:EPOCH});
  assert.deepEqual(source.calls.map(c=>c.q.method),['getGenesisHash','getMultipleAccounts']);
  assert.deepEqual(source.calls[1].q.params[0],[CLOCK,PROGRAM]);
  assert.ok(!JSON.stringify(result).includes('invalid'));
  await r.readiness();assert.equal(source.calls.filter(c=>c.q.method==='getGenesisHash').length,2,'no cached-positive readiness');
});

for(const bad of ['program','clock-slot','old-clock','future-clock','partial'])test(`readiness rejects ${bad} without advancing shared history or using fallback`,async t=>{
  const history=createEndpointHistory();let invalid=true;
  const source=harness(t,({q})=>{
    if(!invalid||q.method!=='getMultipleAccounts')return;
    const snap=snapshot({slot:999,timestamp:bad==='old-clock'?939n:bad==='future-clock'?1061n:1000n});
    if(bad==='program')snap.value[3].owner=PROGRAM;
    if(bad==='clock-slot')corrupt(snap,2,b=>b.writeBigUInt64LE(998n));
    return Response.json({jsonrpc:'2.0',id:q.id,result:{context:snap.context,value:bad==='partial'?[snap.value[2]]:[snap.value[2],snap.value[3]]}});
  });
  const r=createPlatformReaderPool({rpcUrls:[PRIMARY,SECONDARY],fetch:source.fetch,now:()=>EPOCH},{history,activeLimit:1,queueLimit:0});
  await assert.rejects(r.readiness(),code(bad==='old-clock'||bad==='future-clock'?'STALE':'INVALID_ACCOUNT'));assert.equal(history.slot,-1);assert.ok(source.calls.every(c=>c.url===PRIMARY));
  invalid=false;assert.equal((await r.readiness()).contextSlot,100);
});

test('readiness shares frozen Clock/slot progress with license reads; status lookups cannot refresh it',async t=>{
  let now=EPOCH;const history=createEndpointHistory(),source=harness(t);
  const r=createPlatformReaderPool({fetch:source.fetch,now:()=>now},{history,activeLimit:1,queueLimit:0});
  await r.readiness();now+=11000;source.state.slot=101;source.state.timestamp=1001n;await r.getLicenseStatus(input);
  now+=12000;await r.getTransactionStatus({signature:'1'.repeat(64)});
  source.state.slot=102;await assert.rejects(r.readiness(),code('STALE'));assert.equal(history.slot,101);
  source.state.timestamp=1002n;assert.equal((await r.readiness()).contextSlot,102);
});

test('server clocks require safe nonnegative epoch integers while browser clocks retain fractional compatibility',async t=>{
  const source=harness(t);
  for(const value of [NaN,Infinity,-1,1000000.5,Number.MAX_SAFE_INTEGER+1])assert.throws(()=>createPlatformReader({fetch:source.fetch,now:()=>value}).readiness(),code('STALE'));
  assert.equal(source.calls.length,0);
  assert.equal((await createPactClient({fetch:source.fetch,now:()=>0.25}).getLicenseStatus(input)).active,true);
});

test('server transaction lookup accepts exact canonical64-byte signatures, including syntactic zero',async t=>{
  const source=harness(t),r=reader(source);
  assert.equal((await r.getTransactionStatus({signature:'1'.repeat(64)})).state,'not-found');
  const before=source.calls.length;
  for(const value of ['1'.repeat(63),'1'.repeat(65),'2'.repeat(64),'0'.repeat(88)])assert.throws(()=>r.getTransactionStatus({signature:value}),code('INVALID_INPUT'));
  assert.equal(source.calls.length,before);
});

test('single-endpoint fetch/body thrown exported errors are statically redacted',async t=>{
  for(const kind of ['fetch','body']){
    const source=harness(t,()=>{
      if(kind==='fetch')throw new PactError('WRONG_NETWORK','PRIVATE_ENDPOINT_TOKEN');
      return{ok:true,headers:new Headers(),body:{getReader:()=>({read:async()=>{throw new PactError('STALE','PRIVATE_ENDPOINT_TOKEN');},cancel:async()=>{},releaseLock(){}})}};
    });
    await assert.rejects(createPlatformReader({fetch:source.fetch,now:()=>EPOCH}).readiness(),error=>error instanceof PactError&&error.code==='RPC_ERROR'&&!error.message.includes('PRIVATE'));
  }
});
