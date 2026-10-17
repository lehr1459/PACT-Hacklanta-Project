import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate as immediate } from 'node:timers/promises';
import { PublicKey } from '@solana/web3.js';
import { keccak_256 } from '@noble/hashes/sha3';
import { createPactClient, PactError } from '@pact/sdk';
import * as publicServer from '@pact/sdk/server';
import { createPlatformReader, createPlatformReaderPool, createEndpointHistory } from '../dist/server-chain.js';
import { fixture, input, seller, wallet, offer, PROGRAM, GENESIS, corrupt } from './fixtures.mjs';

const metadataJson = JSON.stringify({schema:'pact-solana-license-v1',title:'Pool fixture',terms:'Public synthetic terms.',priceLamports:'1000000',durationSeconds:'60'});
const readonly = new Set(['getGenesisHash','getMultipleAccounts','getLatestBlockhash','getSignatureStatuses']);
const code = expected => error => error?.code === expected;
function deferred() { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; }
async function flush() { await immediate(); await immediate(); }
function snapshotFor(identity = input.wallet, options = {}) {
  const snapshot = fixture(options);
  const address = new PublicKey(identity);
  const [, bump] = PublicKey.findProgramAddressSync([Buffer.from('license'),offer.toBuffer(),address.toBuffer()],new PublicKey(PROGRAM));
  corrupt(snapshot,1,data => { address.toBuffer().copy(data,40); data[80]=bump; });
  corrupt(snapshot,0,data => Buffer.from(keccak_256(Buffer.from(metadataJson))).copy(data,64));
  if(options.missing) snapshot.value[1]=null;
  return snapshot;
}
function rpc(t, state = {}) {
  const calls=[];
  t.after(() => assert.ok(calls.every(call => readonly.has(call.method)), 'RPC calls stay read-only outside implementation catches'));
  const fetch=async(_url,init) => {
    const q=JSON.parse(init.body); calls.push(q);
    if(state.transport) return state.transport(q,init);
    let result;
    if(q.method==='getGenesisHash') result=GENESIS;
    else if(q.method==='getMultipleAccounts') {
      result=snapshotFor(state.wallet??input.wallet,{slot:state.slot??100,timestamp:state.timestamp??1000n,expiry:state.expiry??1060n,missing:state.missing});
      if(q.params[0].length===3) result.value=[null,result.value[2],result.value[3]];
      if(state.mutate) state.mutate(result,q);
    } else if(q.method==='getLatestBlockhash') {
      if(state.failBlockhash) throw Error('private upstream URL must not escape');
      result={value:{blockhash:seller.toBase58(),lastValidBlockHeight:200}};
    } else result={context:{slot:state.slot??100},value:[null]};
    return Response.json({jsonrpc:'2.0',id:q.id,result});
  };
  return {fetch,calls,state};
}
function small(options, history=createEndpointHistory(), activeLimit=1, queueLimit=0) {
  return createPlatformReaderPool(options,{history,activeLimit,queueLimit});
}

test('internal factories do not extend package exports and capacity bounds are validated', () => {
  assert.equal(publicServer.createPlatformReaderPool,undefined);
  assert.equal(publicServer.createEndpointHistory,undefined);
  for(const [activeLimit,queueLimit] of [[0,0],[9,0],[1,-1],[1,17],[1.1,0],[1,NaN]])
    assert.throws(()=>small({},createEndpointHistory(),activeLimit,queueLimit),code('INVALID_INPUT'));
});

test('eight simultaneous snapshots retain each caller identity and exact request association', async t => {
  const identities=Array.from({length:8},(_,i)=>new PublicKey(new Uint8Array(32).fill(i+10)).toBase58());
  const held=deferred(),calls=[];
  const fetch=async(_url,init)=>{
    const q=JSON.parse(init.body);calls.push(q);
    if(q.method==='getGenesisHash'){await held.promise;return Response.json({jsonrpc:'2.0',id:q.id,result:GENESIS});}
    const identity=identities.find(value=>PublicKey.findProgramAddressSync([Buffer.from('license'),offer.toBuffer(),new PublicKey(value).toBuffer()],new PublicKey(PROGRAM))[0].toBase58()===q.params[0][1]);
    assert.ok(identity);
    return Response.json({jsonrpc:'2.0',id:q.id,result:snapshotFor(identity)});
  };
  t.after(()=>assert.ok(calls.every(q=>readonly.has(q.method))));
  const reader=createPlatformReader({fetch,now:()=>0});
  const mutable=identities.map(identity=>({offer:input.offer,wallet:identity}));
  const pending=mutable.map(value=>reader.getLicenseStatus(value));
  mutable.forEach(value=>{value.wallet=input.wallet;});
  await flush();assert.equal(calls.length,8);held.resolve();
  const results=await Promise.all(pending);
  assert.deepEqual(results.map(result=>result.wallet),identities);
  assert.equal(new Set(results.map(result=>result.licensePda)).size,8);
});

test('default pool admits exactly eight active plus sixteen queued; cancellation removes queue and quarantines ignored fetches', async t => {
  const held=deferred();let requests=0;
  const source=rpc(t,{transport:async(q)=>{requests++;await held.promise;return Response.json({jsonrpc:'2.0',id:q.id,result:GENESIS});}});
  const reader=createPlatformReader({fetch:source.fetch,now:()=>0});
  const controllers=Array.from({length:24},()=>new AbortController());
  const pending=controllers.map(c=>reader.getLicenseStatus(input,{signal:c.signal}).catch(error=>error));
  await flush();assert.equal(requests,8);
  await assert.rejects(reader.getLicenseStatus(input),code('BUSY'));
  controllers.forEach(c=>c.abort());
  assert.ok((await Promise.all(pending)).every(error=>error.code==='CANCELLED'));
  const second=Array.from({length:16},()=>new AbortController());
  const queued=second.map(c=>reader.getLicenseStatus(input,{signal:c.signal}).catch(error=>error));
  await assert.rejects(reader.getLicenseStatus(input),code('BUSY'));
  await flush();assert.equal(requests,8,'cancelled live fetches still occupy every active slot');
  second.forEach(c=>c.abort());await Promise.all(queued);held.resolve();await flush();
  assert.equal(requests,8,'no cancelled queued operation reaches transport');
});

test('queue begins the deadline at admission, including wait time', async t => {
  const source=rpc(t),held=deferred();let hold=true;
  const fetch=async(url,init)=>{if(hold){hold=false;await held.promise;}return source.fetch(url,init);};
  let now=0;const reader=small({fetch,now:()=>now},createEndpointHistory(),1,1);
  const first=reader.getLicenseStatus(input).catch(error=>error);
  const queued=reader.getLicenseStatus(input).catch(error=>error);
  await flush();
  now=5000;held.resolve();
  assert.equal((await first).code,'TIMEOUT');assert.equal((await queued).code,'TIMEOUT');
  assert.equal(source.calls.length,1,'queue expiration prevents its first transport');
});

test('FIFO queued reads capture caller identity before waiting', async () => {
  const held=deferred(),started=[];
  const identities=[input.wallet,seller.toBase58(),new PublicKey(new Uint8Array(32).fill(7)).toBase58()];
  let first=true;
  const fetch=async(_url,init)=>{
    const q=JSON.parse(init.body);
    assert.ok(readonly.has(q.method));
    if(q.method==='getGenesisHash') {
      if(first){first=false;await held.promise;}
      return Response.json({jsonrpc:'2.0',id:q.id,result:GENESIS});
    }
    const identity=identities.find(value=>PublicKey.findProgramAddressSync([Buffer.from('license'),offer.toBuffer(),new PublicKey(value).toBuffer()],new PublicKey(PROGRAM))[0].toBase58()===q.params[0][1]);
    assert.ok(identity);started.push(identity);
    return Response.json({jsonrpc:'2.0',id:q.id,result:snapshotFor(identity)});
  };
  const reader=small({fetch,now:()=>0},createEndpointHistory(),1,2);
  const inputs=identities.map(identity=>({offer:input.offer,wallet:identity}));
  const reads=inputs.map(value=>reader.getLicenseStatus(value));
  inputs.forEach(value=>{value.offer=seller.toBase58();value.wallet=wallet.toBase58();});
  await flush();held.resolve();
  const results=await Promise.all(reads);
  assert.deepEqual(started,identities);assert.deepEqual(results.map(value=>value.wallet),identities);
});

test('five-second real deadline settles active and queued callers without multiplying hung transports', async t => {
  const held=deferred();let calls=0;
  const reader=small({fetch:async()=>{calls++;await held.promise;throw Error('late');}},createEndpointHistory(),1,1);
  const started=performance.now();
  const outcomes=await Promise.allSettled([reader.getLicenseStatus(input),reader.getLicenseStatus(input)]);
  assert.ok(outcomes.every(result=>result.status==='rejected'&&result.reason.code==='TIMEOUT'));
  assert.ok(performance.now()-started>=4900&&performance.now()-started<6500);
  assert.equal(calls,1);
  const controller=new AbortController();
  const next=reader.getLicenseStatus(input,{signal:controller.signal}).catch(error=>error);
  await assert.rejects(reader.getLicenseStatus(input),code('BUSY'));controller.abort();await next;
  assert.equal(calls,1);held.resolve();await flush();
});

test('late cancelled valid snapshot cannot update high-water or progress and its slot stays held until settlement', async t => {
  const held=deferred(),source=rpc(t),history=createEndpointHistory();
  let block=true;
  const fetch=async(url,init)=>{const q=JSON.parse(init.body);if(block&&q.method==='getMultipleAccounts'){await held.promise;return Response.json({jsonrpc:'2.0',id:q.id,result:snapshotFor(input.wallet,{slot:999,timestamp:9999n})});}return source.fetch(url,init);};
  const reader=small({fetch,now:()=>0},history),controller=new AbortController();
  const pending=reader.getLicenseStatus(input,{signal:controller.signal});await flush();controller.abort();
  await assert.rejects(pending,code('CANCELLED'));
  await assert.rejects(reader.getLicenseStatus(input),code('BUSY'));
  assert.equal(history.slot,-1);held.resolve();await flush();assert.equal(history.slot,-1);
  block=false;assert.equal((await reader.getLicenseStatus(input)).contextSlot,100);
});

test('body read and body cancellation promises independently retain quarantined capacity', async () => {
  const read=deferred(),cancel=deferred();let calls=0,reads=0;
  const fetch=async()=>{calls++;return{ok:true,status:200,headers:new Headers(),body:{getReader:()=>({read:()=>{reads++;return read.promise;},cancel:()=>cancel.promise,releaseLock(){}})}};};
  const reader=small({fetch,now:()=>0}),controller=new AbortController();
  const pending=reader.getLicenseStatus(input,{signal:controller.signal});await flush();assert.equal(reads,1);
  controller.abort();await assert.rejects(pending,code('CANCELLED'));
  await assert.rejects(reader.getLicenseStatus(input),code('BUSY'));
  read.resolve({done:true});await flush();
  await assert.rejects(reader.getLicenseStatus(input),code('BUSY'));
  assert.equal(calls,1);cancel.resolve();await flush();
});

test('shared global progress prevents idle-worker false stalls and requires both Clock and slot advancement', async t => {
  let now=0;const source=rpc(t),history=createEndpointHistory();
  const a=small({fetch:source.fetch,now:()=>now},history),b=small({fetch:source.fetch,now:()=>now},history);
  await a.getLicenseStatus(input);
  now=11000;source.state.slot=101;source.state.timestamp=1001n;await b.getLicenseStatus(input);
  now=13000;assert.equal((await a.getLicenseStatus(input)).lastProgressAtMs,11000);
  now=23000;source.state.slot=102;
  await assert.rejects(a.getLicenseStatus(input),code('STALE'));
  assert.equal(history.slot,101,'frozen Clock cannot advance the high-water');
  source.state.timestamp=1002n;assert.equal((await b.getLicenseStatus(input)).contextSlot,102);
  now=60000;source.state.slot=103;source.state.timestamp=1003n;
  assert.equal((await a.getLicenseStatus(input)).contextSlot,103,'both advancing after idle recovers');
  source.state.slot=102;await assert.rejects(b.getLicenseStatus(input),code('INVALID_ACCOUNT'));
  source.state.slot=104;source.state.timestamp=1002n;await assert.rejects(b.getLicenseStatus(input),code('STALE'));
});

test('out-of-order concurrent snapshots compare against the latest committed shared high-water', async () => {
  const old=deferred();let snapshotCalls=0;
  const fetch=async(_url,init)=>{
    const q=JSON.parse(init.body);assert.ok(readonly.has(q.method));
    if(q.method==='getGenesisHash') return Response.json({jsonrpc:'2.0',id:q.id,result:GENESIS});
    const first=++snapshotCalls===1;
    if(first) await old.promise;
    return Response.json({jsonrpc:'2.0',id:q.id,result:snapshotFor(input.wallet,{slot:first?100:101,timestamp:first?1000n:1001n})});
  };
  const reader=small({fetch,now:()=>0},createEndpointHistory(),2,0);
  const pending=reader.getLicenseStatus(input);await flush();
  assert.equal((await reader.getLicenseStatus(input)).contextSlot,101);
  old.resolve();await assert.rejects(pending,code('INVALID_ACCOUNT'));
});

test('invalid account observations and signature-only reads cannot refresh frozen-provider health', async t => {
  let now=0;const source=rpc(t),history=createEndpointHistory();const reader=small({fetch:source.fetch,now:()=>now},history);
  await reader.getLicenseStatus(input);now=11000;source.state.slot=101;source.state.timestamp=1001n;
  source.state.mutate=result=>{result.value[1].owner=seller.toBase58();};
  await assert.rejects(reader.getLicenseStatus(input),code('INVALID_ACCOUNT'));
  assert.equal(history.slot,100);assert.equal(history.slotProgress,0);
  await reader.getTransactionStatus({signature:'1'.repeat(64)});
  assert.equal(history.slot,100);assert.equal(history.timestampProgress,0);
  delete source.state.mutate;now=12000;source.state.slot=100;source.state.timestamp=1000n;
  await assert.rejects(reader.getLicenseStatus(input),code('STALE'));
});

for(const failure of ['metadata','blockhash']) test(`fully validated snapshot anchors high-water despite later ${failure} failure`, async t => {
  const source=rpc(t,{slot:101,timestamp:1001n,missing:true}),history=createEndpointHistory();
  const reader=small({fetch:source.fetch,now:()=>0},history);
  source.state.failBlockhash=failure==='blockhash';
  await assert.rejects(reader.prepareCheckout({network:'devnet',offerAddress:input.offer,walletAddress:input.wallet,metadataJson:failure==='metadata'?metadataJson+' ':metadataJson}));
  assert.equal(history.slot,101);assert.equal(history.timestamp,1001n);
  source.state.slot=100;source.state.timestamp=1000n;
  await assert.rejects(reader.getLicenseStatus(input),code('INVALID_ACCOUNT'));
  assert.equal(source.calls.filter(q=>q.method==='getMultipleAccounts').at(-1).params[1].minContextSlot,101);
});

test('offer creation shares endpoint Clock history with license snapshots', async t => {
  let now=0;const source=rpc(t),history=createEndpointHistory(),reader=small({fetch:source.fetch,now:()=>now},history);
  await reader.getLicenseStatus(input);now=12000;source.state.slot=101;
  await assert.rejects(reader.prepareOffer({network:'devnet',sellerWallet:seller.toBase58(),nonce:'1',metadataJson}),code('STALE'));
  source.state.timestamp=1001n;
  await reader.prepareOffer({network:'devnet',sellerWallet:seller.toBase58(),nonce:'1',metadataJson});
  assert.equal(history.slot,101);assert.equal(history.timestamp,1001n);
});

test('public pool overload cannot consume reserved protected capacity; both pools share monotonic history', async t => {
  const held=deferred(),source=rpc(t),history=createEndpointHistory();let activePublic=0;
  const publicReader=createPlatformReaderPool({now:()=>0,fetch:async(url,init)=>{activePublic++;await held.promise;return source.fetch(url,init);}},{history,activeLimit:4,queueLimit:8});
  const protectedReader=createPlatformReaderPool({now:()=>0,fetch:source.fetch},{history,activeLimit:4,queueLimit:8});
  const controllers=Array.from({length:12},()=>new AbortController());
  const pending=controllers.map(c=>publicReader.getLicenseStatus(input,{signal:c.signal}).catch(error=>error));
  await flush();assert.equal(activePublic,4);await assert.rejects(publicReader.getLicenseStatus(input),code('BUSY'));
  source.state.slot=105;source.state.timestamp=1005n;
  assert.equal((await protectedReader.getLicenseStatus(input)).contextSlot,105);
  controllers.forEach(c=>c.abort());await Promise.all(pending);held.resolve();await flush();
  source.state.slot=104;await assert.rejects(protectedReader.getLicenseStatus(input),code('INVALID_ACCOUNT'));
});

for(const mode of ['oversized','utf8','json','transport','throw-undefined']) test(`bounded RPC ${mode} errors are typed and do not expose transport details`, async () => {
  const fetch=async()=>{
    if(mode==='transport') throw Error('secret upstream URL');
    if(mode==='throw-undefined') throw undefined;
    if(mode==='oversized') return new Response('x'.repeat(131073));
    if(mode==='utf8') return new Response(new Uint8Array([0xff]));
    return new Response('{');
  };
  for(const reader of [createPactClient({fetch,now:()=>0}),small({fetch,now:()=>0})]) {
    await assert.rejects(reader.getLicenseStatus(input),error=>error instanceof PactError&&error.code==='RPC_ERROR'&&!error.message.includes('secret'));
  }
});

test('RPC accepts exactly 128 KiB and rejects enormous addresses before any transport', async () => {
  let calls=0;
  const fetch=async(_url,init)=>{
    calls++;const q=JSON.parse(init.body);
    const text=JSON.stringify({jsonrpc:'2.0',id:q.id,result:q.method==='getGenesisHash'?GENESIS:snapshotFor()});
    return new Response(text+' '.repeat(131072-Buffer.byteLength(text)));
  };
  for(const reader of [createPactClient({fetch,now:()=>0}),small({fetch,now:()=>0})]) {
    assert.equal((await reader.getLicenseStatus(input)).active,true);
    const previous=calls;
    await assert.rejects(async()=>reader.getLicenseStatus({...input,wallet:'1'.repeat(1000000)}),code('INVALID_INPUT'));
    assert.equal(calls,previous);
  }
});
