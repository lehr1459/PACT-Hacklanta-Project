import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const golden=JSON.parse(readFileSync(new URL('./golden/protocol-v1.json',import.meta.url),'utf8'));
let sequence=0;

async function recoveryFixture(t,{baseline='expired',current=baseline,history='expired',journals='paired',conflict=false}={}){
  const vector=golden.vectors[0],storage=new Map(),calls=[],stages=[];
  let now=0,signs=0;
  t.after(()=>{
    const allowed=new Set(['getGenesisHash','getSignatureStatuses','getBlockHeight','isBlockhashValid','getMultipleAccounts']);
    assert.deepEqual(calls.filter(method=>!allowed.has(method)),[],'Recovery must issue only read-only RPC methods, even when an internal error is caught');
    assert.equal(signs,0,'No recovery path may request a signature');
  });
  const id=`${golden.program}:${golden.buyer}:${vector.offer}`,own='pact.solana.checkout.v1:'+id,mirror='pact.solana.pending.v1:'+id;
  const data=state=>Buffer.from(vector.licenseDataHex[state],'hex').toString('base64');
  const record={version:1,network:'devnet',program:golden.program,buyer:golden.buyer,offer:vector.offer,
    action:'Purchase license',signature:'2'.repeat(88),blockhash:golden.blockhash,lastValidBlockHeight:200,state:'unknown',
    baseline:baseline==='missing'?{kind:'missing',expiry:'0',data:null}:{kind:'initialized',expiry:'999',data:data('expired')}};
  const{version:_version,baseline:_baseline,...legacy}=record;
  if(journals==='paired'||journals==='own')storage.set(own,JSON.stringify(record));
  if(journals==='paired'||journals==='legacy')storage.set(mirror,JSON.stringify({...legacy,...(conflict?{signature:'3'.repeat(88)}:{})}));
  if(journals==='malformed')storage.set(own,'{');
  const before=new Map(storage);
  const previousStorage=Object.getOwnPropertyDescriptor(globalThis,'localStorage'),previousNavigator=Object.getOwnPropertyDescriptor(globalThis,'navigator');
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,String(value)),removeItem:key=>storage.delete(key)}});
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{locks:{request:async(_name,_options,fn)=>fn({})}}});
  t.after(()=>{
    if(previousStorage)Object.defineProperty(globalThis,'localStorage',previousStorage);else delete globalThis.localStorage;
    if(previousNavigator)Object.defineProperty(globalThis,'navigator',previousNavigator);else delete globalThis.navigator;
  });
  const account=(hex,owner=golden.program)=>({owner,executable:false,lamports:1000000,data:[Buffer.from(hex,'hex').toString('base64'),'base64']});
  const fetch=async(_url,init)=>{
    const request=JSON.parse(init.body);calls.push(request.method);let result;
    switch(request.method){
      case'getGenesisHash':result=golden.genesis;break;
      case'getSignatureStatuses':{
        const status=history==='finalized'?{slot:100,err:null,confirmationStatus:'finalized'}:
          history==='failed'?{slot:100,err:{InstructionError:[0,{Custom:6004}]},confirmationStatus:'finalized'}:
          history==='confirmed'?{slot:100,err:null,confirmationStatus:'confirmed'}:null;
        if(history==='confirmed'||history==='ambiguous')now=120001;
        result={context:{slot:100},value:[status]};break;
      }
      case'getBlockHeight':result=history==='ambiguous'?100:201;break;
      case'isBlockhashValid':result={context:{slot:100},value:false};break;
      case'getMultipleAccounts':result={context:{slot:100},value:[account(vector.offerDataHex),
        current==='missing'?null:account(vector.licenseDataHex[current]),account(golden.clock.dataHex,'Sysvar1111111111111111111111111111111111111'),
        {owner:'BPFLoaderUpgradeab1e11111111111111111111111',executable:true,lamports:1000000,data:['','base64']}]};break;
      default:assert.fail(`Recovery must not sign, simulate, prepare or send: ${request.method}`);
    }
    return Response.json({jsonrpc:'2.0',id:request.id,result});
  };
  // A fresh module is a new browser-reload memory scope; persisted evidence is
  // deliberately shared below. No test depends on another test's memory map.
  const makeClient=async()=>{
    const{createCheckoutClient}=await import(new URL(`../dist/checkout.js?golden-recovery=${sequence++}`,import.meta.url));
    const client=createCheckoutClient({programId:golden.program,rpcUrl:'https://golden.invalid',fetch,now:()=>now,onState:state=>stages.push(state.stage),
      walletAdapter:{connect:async()=>golden.buyer,disconnect:async()=>{},getPublicKey:()=>golden.buyer,
        signTransaction:async()=>{signs++;assert.fail('Recovery cannot request signing');},subscribe:()=>()=>{},destroy(){}}});
    t.after(()=>client.destroy());return client;
  };
  return{client:await makeClient(),makeClient,offer:vector.offer,storage,before,calls,stages,own,mirror,signs:()=>signs};
}

for(const baseline of['missing','expired'])test(`unchanged ${baseline} baseline releases only after finalized expiration proofs`,async t=>{
  const f=await recoveryFixture(t,{baseline});
  const result=await f.client.recoverPurchase({offer:f.offer});
  assert.equal(result.outcome,'expired');assert.equal(f.storage.size,0);assert.equal(f.signs(),0);
  assert.equal(f.calls.filter(method=>method==='getSignatureStatuses').length,2);
  assert.ok(f.calls.includes('getBlockHeight'));assert.ok(f.calls.includes('isBlockhashValid'));assert.ok(f.calls.includes('getMultipleAccounts'));
});

test('changed expired entitlement baseline remains protected without another approval',async t=>{
  const f=await recoveryFixture(t,{current:'equal'}),result=await f.client.recoverPurchase({offer:f.offer});
  assert.equal(result.outcome,'unknown');assert.match(result.error.message,/changed/i);assert.deepEqual(f.storage,f.before);assert.equal(f.signs(),0);
});

test('legacy-only journal cannot infer a baseline or automatically release protection',async t=>{
  const f=await recoveryFixture(t,{journals:'legacy'}),result=await f.client.recoverPurchase({offer:f.offer});
  assert.equal(result.outcome,'unknown');assert.deepEqual(f.storage,f.before);assert.equal(f.signs(),0);
});

test('own baseline journal survives missing mirror and simulated reload',async t=>{
  const f=await recoveryFixture(t,{journals:'own'});
  assert.equal(f.client.getPendingPurchase({offer:f.offer}).signature,'2'.repeat(88));f.client.destroy();
  const reloaded=await f.makeClient();assert.equal(reloaded.getPendingPurchase({offer:f.offer}).signature,'2'.repeat(88));
  assert.equal((await reloaded.recoverPurchase({offer:f.offer})).outcome,'expired');assert.equal(f.storage.size,0);assert.equal(f.signs(),0);
});

for(const journals of['none','malformed'])test(`${journals} journal cannot fabricate recovery evidence`,async t=>{
  const f=await recoveryFixture(t,{journals});
  if(journals==='none')assert.equal(f.client.getPendingPurchase({offer:f.offer}),null);
  else assert.throws(()=>f.client.getPendingPurchase({offer:f.offer}));
  await assert.rejects(f.client.recoverPurchase({offer:f.offer}));assert.deepEqual(f.storage,f.before);assert.equal(f.calls.length,0);assert.equal(f.signs(),0);
});

test('conflicting paired signatures refuse recovery and preserve both records',async t=>{
  const f=await recoveryFixture(t,{conflict:true});assert.throws(()=>f.client.getPendingPurchase({offer:f.offer}),/disagree|protect/i);
  await assert.rejects(f.client.recoverPurchase({offer:f.offer}),/disagree|protect/i);
  assert.deepEqual(f.storage,f.before);assert.equal(f.calls.length,0);assert.equal(f.signs(),0);
});

test('finalized repurchase resolves only with a fresh independently encoded entitlement',async t=>{
  const f=await recoveryFixture(t,{history:'finalized',current:'active'}),result=await f.client.recoverPurchase({offer:f.offer});
  assert.equal(result.outcome,'licensed');assert.equal(result.license.expiry,'1060');assert.equal(result.license.wallet,golden.buyer);
  assert.equal(f.storage.size,0);assert.equal(f.signs(),0);
});

test('finalized failure remains failure and clears only its matching journal',async t=>{
  const f=await recoveryFixture(t,{history:'failed'}),result=await f.client.recoverPurchase({offer:f.offer});
  assert.equal(result.outcome,'failed');assert.equal(f.storage.size,0);assert.equal(f.signs(),0);assert.ok(!f.calls.includes('getMultipleAccounts'));
});

for(const history of['confirmed','ambiguous'])test(`${history} deadline never becomes a safe automatic retry`,async t=>{
  const f=await recoveryFixture(t,{history}),result=await f.client.recoverPurchase({offer:f.offer});
  assert.equal(result.outcome,'unknown');assert.equal(f.storage.size,2);assert.equal(f.signs(),0);
  if(history==='confirmed'){
    assert.equal(result.error.code,'FINALIZATION_PENDING');
    assert.equal(f.stages.at(-1),'confirmed');assert.equal(JSON.parse(f.storage.get(f.own)).state,'confirmed');
    assert.ok(!f.stages.includes('expired'));assert.ok(!f.calls.includes('getBlockHeight'));
  }else{
    assert.equal(result.error,undefined,'An uncertain history answer is not a fabricated RPC rejection');
    assert.equal(f.stages.at(-1),'unknown');assert.deepEqual(f.storage,f.before);
  }
});
