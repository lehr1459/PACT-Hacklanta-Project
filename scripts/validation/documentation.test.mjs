// Copied by documentation.mjs into an independently installed consumer before execution.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {generateKeyPairSync,sign} from 'node:crypto';
import {lookupLicense} from './examples/lookup.mjs';
import {createPurchaseActions} from './examples/purchase-recovery.mjs';
import {createLicensedHandler} from './examples/authorize.mjs';
import {PactClient} from '@pact/sdk/v1';
import {PACT_PROGRAM_ID} from '@pact/sdk';

// This is fixture construction, not another SDK implementation or application dependency.
const {PublicKey}=createRequire(import.meta.url)('@solana/web3.js');
const golden=JSON.parse(readFileSync(new URL('./protocol-v1.json',import.meta.url),'utf8'));
const vector=golden.vectors.find(value=>value.name==='ordinary');
const ORIGIN='http://localhost:3100',RPC='http://127.0.0.1:8899';
globalThis.fetch=async()=>{throw Error('Documentation smoke forbids real network transport');};

function rpcFixture({wallet=golden.buyer,now=1000000,expiry=999n}={}){
  const state={now,expiry,slot:100},calls=[];
  const [license,bump]=PublicKey.findProgramAddressSync([Buffer.from('license'),new PublicKey(vector.offer).toBuffer(),new PublicKey(wallet).toBuffer()],new PublicKey(golden.program));
  const account=(bytes,owner=golden.program)=>({data:[bytes.toString('base64'),'base64'],owner,executable:false,lamports:1000000});
  const licenseBytes=()=>{const data=Buffer.from(vector.licenseDataHex.expired,'hex');new PublicKey(wallet).toBuffer().copy(data,40);data.writeBigInt64LE(state.expiry,72);data[80]=bump;return data;};
  const fetch=async(_url,init)=>{
    const q=JSON.parse(init.body);calls.push(q);let result;
    if(q.method==='getGenesisHash')result=golden.genesis;
    else if(q.method==='getMultipleAccounts'){
      assert.equal(q.params[0][0],vector.offer);assert.equal(q.params[0][1],license.toBase58());
      const clock=Buffer.from(golden.clock.dataHex,'hex');clock.writeBigUInt64LE(BigInt(state.slot));clock.writeBigInt64LE(BigInt(Math.floor(state.now/1000)),32);
      result={context:{slot:state.slot},value:[account(Buffer.from(vector.offerDataHex,'hex')),account(licenseBytes()),account(clock,'Sysvar1111111111111111111111111111111111111'),{...account(Buffer.alloc(0),'BPFLoaderUpgradeab1e11111111111111111111111'),executable:true}]};
    }else if(q.method==='getLatestBlockhash')result={context:{slot:state.slot},value:{blockhash:golden.blockhash,lastValidBlockHeight:200}};
    else if(q.method==='simulateTransaction')result={context:{slot:state.slot},value:{err:null,logs:[]}};
    else if(q.method==='getSignatureStatuses')result={context:{slot:state.slot},value:[null]};
    else if(q.method==='getBlockHeight')result=201;
    else if(q.method==='isBlockhashValid')result={context:{slot:state.slot},value:false};
    else throw Error('Forbidden documentation RPC method');
    return Response.json({jsonrpc:'2.0',id:q.id,result});
  };
  return{state,calls,fetch,licenseBytes};
}

test('documented lookup reports public state without wallet proof or authorization',async t=>{
  const f=rpcFixture({expiry:1060n});t.after(()=>assert.deepEqual(f.calls.map(q=>q.method),['getGenesisHash','getMultipleAccounts']));
  const read=await lookupLicense({offer:vector.offer,wallet:golden.buyer,rpcUrl:RPC,fetch:f.fetch,now:()=>f.state.now});
  assert.equal(read.fresh,true);assert.equal(read.status.wallet,golden.buyer);assert.equal(read.authorized,false);assert.equal(read.walletControlProven,false);
});

test('documented purchase is explicit, rejects safely and recovery never signs or resends',async t=>{
  const f=rpcFixture(),storage=new Map();let signs=0;
  const previous={localStorage:Object.getOwnPropertyDescriptor(globalThis,'localStorage'),navigator:Object.getOwnPropertyDescriptor(globalThis,'navigator')};
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,String(value)),removeItem:key=>storage.delete(key)}});
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{locks:{request:async(_name,_options,callback)=>callback({})}}});
  t.after(()=>{for(const[key,descriptor]of Object.entries(previous)){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else Reflect.deleteProperty(globalThis,key);}assert.equal(signs,1);assert.deepEqual(f.calls.filter(q=>!['getGenesisHash','getMultipleAccounts','getLatestBlockhash','simulateTransaction','getSignatureStatuses','getBlockHeight','isBlockhashValid'].includes(q.method)),[]);});
  const actions=createPurchaseActions({offer:vector.offer,rpcUrl:RPC,fetch:f.fetch,now:()=>f.state.now,walletAdapter:{connect:async()=>golden.buyer,disconnect:async()=>{},getPublicKey:()=>golden.buyer,signTransaction:async()=>{signs++;throw Object.assign(Error('Synthetic user rejection'),{code:4001});},subscribe:()=>()=>{},destroy(){}}});
  t.after(()=>actions.destroy());assert.equal(signs,0);assert.equal(f.calls.length,0);
  await actions.connect();assert.equal(actions.pending(),null);
  assert.equal((await actions.purchase({metadataJson:vector.metadataJson,termsAccepted:true})).outcome,'rejected');assert.equal(storage.size,0);
  // Synthetic public journal models prior uncertainty; it is not a broadcast receipt.
  const id=`${PACT_PROGRAM_ID}:${golden.buyer}:${vector.offer}`,primary='pact.solana.checkout.v1:'+id,mirror='pact.solana.pending.v1:'+id;
  const record={version:1,network:'devnet',program:PACT_PROGRAM_ID,buyer:golden.buyer,offer:vector.offer,action:'Purchase license',signature:'2'.repeat(88),blockhash:golden.blockhash,lastValidBlockHeight:200,state:'unknown',baseline:{kind:'initialized',expiry:'999',data:f.licenseBytes().toString('base64')}};
  const seed=()=>{const{version:_,baseline:__,...legacy}=record;storage.set(primary,JSON.stringify(record));storage.set(mirror,JSON.stringify(legacy));};
  seed();const start=f.calls.length;assert.equal(actions.pending().signature,record.signature);
  assert.equal((await actions.recover()).outcome,'expired');assert.equal(storage.size,0);assert.equal(signs,1);
  assert.deepEqual(f.calls.slice(start).filter(q=>!['getGenesisHash','getMultipleAccounts','getSignatureStatuses','getBlockHeight','isBlockhashValid'].includes(q.method)),[]);
  seed();f.state.expiry=1000n;assert.equal((await actions.recover()).outcome,'unknown');assert.equal(storage.size,2);assert.equal(signs,1);
});

test('documented handler proves wallet control then enforces private resources, logout and expiry',async t=>{
  const key=generateKeyPairSync('ed25519'),wallet=new PublicKey(key.publicKey.export({type:'spki',format:'der'}).subarray(-32)).toBase58();
  const now=Date.now(),f=rpcFixture({wallet,now,expiry:BigInt(Math.floor(now/1000)+60)});let preparations=0,commits=0;
  t.after(()=>assert.deepEqual(f.calls.filter(q=>!['getGenesisHash','getMultipleAccounts'].includes(q.method)),[]));
  const handler=createLicensedHandler({origin:ORIGIN,offer:vector.offer,rpcUrl:RPC,fetch:f.fetch,now:()=>f.state.now,
    loadPrivateAsset:async({walletAddress,offerAddress,signal})=>{assert.equal(walletAddress,wallet);assert.equal(offerAddress,vector.offer);assert.equal(signal.aborted,false);preparations++;return 'CUSTOMER_PRIVATE_ASSET';},
    prepareOperation:()=>({body:'operation completed',commit:()=>{commits++;return undefined;}})});
  const jar=new Map();
  const send=async(input,init={})=>{
    const url=new URL(input,ORIGIN),headers=new Headers(init.headers);headers.set('origin',ORIGIN);
    if(init.credentials==='include')headers.set('cookie',[...jar].map(([k,v])=>k+'='+v).join('; '));
    const response=await handler(new Request(url,{...init,headers}));
    for(const cookie of response.headers.getSetCookie()){const pair=cookie.split(';')[0],i=pair.indexOf('=');jar.set(pair.slice(0,i),pair.slice(i+1));}
    return response;
  };
  const resource=(name='asset',method='GET')=>send(ORIGIN+'/api/pact/resources/'+name,{method,credentials:'include'});
  const client=new PactClient({network:'devnet',apiUrl:ORIGIN+'/api/pact',fetch:send});
  const publicRead=await client.licenses.verify({offerAddress:vector.offer,walletAddress:wallet});assert.equal(publicRead.valid,true);assert.equal(publicRead.authorized,false);
  assert.equal((await resource()).status,401);assert.equal(preparations,0);
  const authenticate=()=>client.auth.authenticate({getPublicKey:()=>wallet,signMessage:async bytes=>new Uint8Array(sign(null,bytes,key.privateKey))});
  assert.equal((await authenticate()).authenticated,true);
  const asset=await resource();assert.equal(asset.status,200);assert.equal(await asset.text(),'CUSTOMER_PRIVATE_ASSET');assert.match(asset.headers.get('cache-control'),/no-store/);assert.equal(preparations,1);
  assert.equal((await resource('operation','POST')).status,200);assert.equal(commits,1);
  await client.auth.logout();assert.equal((await resource()).status,401);assert.equal(preparations,1);
  await authenticate();f.state.now+=61000;f.state.slot++;
  assert.equal((await resource()).status,403);assert.equal(preparations,1);assert.equal(commits,1);
});
