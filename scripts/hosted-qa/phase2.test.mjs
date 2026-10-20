import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {createDatabase,migrate} from '../../services/pact-api/src/database.mjs';
import {createService} from '../../services/pact-api/src/service.mjs';
import {prepareDatabase,wallet,nonce} from './helpers.mjs';
import {Browser,ORIGIN} from './browser.mjs';
import {rpcFixture,PROGRAM,GENESIS} from './rpc-fixture.mjs';
import {clockDirectory} from './phase7-clock-fixture.mjs';

test('Phase2 independent real-PG policy binding through hardened SDK and HTTP RPC',async t=>{
 const connectionString=await prepareDatabase(),db=await createDatabase({connectionString,profile:'test'});
 await migrate(db);const rpc=await rpcFixture();
 const service=await createService({database:db,origin:ORIGIN,pepper:randomBytes(32).toString('base64url'),
  profile:'test',rateLimit:1000,clockDirectory:await clockDirectory(),readerOptions:{rpcUrl:rpc.url}});
 const base=await service.server.listen({port:0,host:'127.0.0.1'});
 t.after(async()=>{await service.close();await db.close();await rpc.close();});
 const a=new Browser(base),b=new Browser(base);await a.login();await b.login();
 const appA=(await a.request('POST','/v1/developer/apps',{name:`resource A ${nonce()}`,framework:'rest'})).data.app.id;
 const appB=(await b.request('POST','/v1/developer/apps',{name:`resource B ${nonce()}`,framework:'rest'})).data.app.id;
 const path=`/v1/developer/apps/${appA}/resources`;
 const own=rpc.addOffer({seller:a.wallet}),replacement=rpc.addOffer({seller:a.wallet,nonce:2n});
 const foreign=rpc.addOffer({seller:b.wallet}),inactive=rpc.addOffer({seller:a.wallet,nonce:3n,active:false});
 let version=1;
 const epoch=async()=>(await a.request('GET',`/v1/developer/apps/${appA}`)).data.app.policyEpoch;
 async function bind(resourceKey,offerAddress){return a.mutate('POST',path,appA,'resource.bind',{resourceKey,offerAddress});}
 await t.test('signed seller binds active validated offer into owned immutable resource',async()=>{
  const before=rpc.calls.length,r=await bind('premium',own.address);
  assert.equal(r.status,200,JSON.stringify(r.data));assert.equal(r.data.resource.resourceKey,'premium');
  assert.equal(r.data.resource.offerAddress,own.address);assert.equal(r.data.resource.version,1);assert.equal(r.data.resource.enabled,true);
  assert.ok(rpc.calls.length>before,'binding must invoke actual reader/RPC');
  assert.ok(rpc.calls.some(x=>x.method==='getGenesisHash'));assert.ok(rpc.calls.some(x=>x.method==='getMultipleAccounts'));
  const list=await a.request('GET',path);assert.equal(list.status,200);assert.equal(list.data.resources.length,1);
  assert.equal(await epoch(),1);
 });
 await t.test('foreign seller, missing/inactive offer and wrong network/program/Clock fail closed',async()=>{
  for(const [key,address]of [['foreign',foreign.address],['inactive',inactive.address],['missing',wallet().address]]){
   const r=await bind(key,address);assert.ok(r.status>=400,key+' must deny');
  }
  for(const [field,value,reset]of [
   ['genesis','wrong-genesis',GENESIS],['owner','11111111111111111111111111111111',PROGRAM],
   ['programExecutable',false,true],['clockOffset',-120,0],['fail',true,false]
  ]){
   rpc.state[field]=value;
   try{assert.ok((await bind(`invalid-${field.toLowerCase()}`,replacement.address)).status>=400,field+' must deny');}
   finally{rpc.state[field]=reset;}
  }
  assert.equal((await a.request('GET',path)).data.resources.length,1,'rejections cannot create policy rows');
  assert.equal(await epoch(),1,'rejections cannot advance policy epoch');
 });
 await t.test('strict policy inputs and tenant checks reject overrides and resource substitution',async()=>{
  for(const override of [{walletAddress:b.wallet.address},{network:'mainnet-beta'},{programId:foreign.address}]){
   const r=await a.request('POST','/v1/developer/actions/challenge',{appId:appA,action:'resource.bind',
    payload:{resourceKey:'override',offerAddress:own.address,...override}});assert.equal(r.status,400);
  }
  for(const resourceKey of ['Upper','../escape','a_b','a'.repeat(65)])
   assert.equal((await a.request('POST','/v1/developer/actions/challenge',{appId:appA,action:'resource.bind',payload:{resourceKey,offerAddress:own.address}})).status,400);
  assert.equal((await b.request('GET',path)).status,404);
  assert.equal((await b.request('GET',path+'/premium')).status,404);
  assert.equal((await b.request('POST','/v1/developer/actions/challenge',{appId:appA,action:'resource.bind',payload:{resourceKey:'cross',offerAddress:foreign.address}})).status,404);
  const r=await b.mutate('POST',`/v1/developer/apps/${appB}/resources`,appB,'resource.bind',{resourceKey:'stolen',offerAddress:own.address});
  assert.ok(r.status>=400,'a separate tenant cannot register a foreign seller offer');
  assert.equal((await a.request('GET',path+'/unknown')).status,404);
 });
 await t.test('signed updates preserve history, reject stale version and forbid key rename',async()=>{
  assert.equal((await bind('premium',own.address)).status,409);
  const replacementPayload={resourceKey:'premium',expectedVersion:version,offerAddress:replacement.address};
  const r=await a.mutate('PATCH',path+'/premium',appA,'resource.update',replacementPayload);
  assert.equal(r.status,200,JSON.stringify(r.data));version=r.data.resource.version;assert.equal(version,2);
  assert.equal(r.data.resource.offerAddress,replacement.address);
  assert.equal(await epoch(),2);
  assert.equal((await a.mutate('PATCH',path+'/premium',appA,'resource.update',replacementPayload)).status,409);
  assert.equal((await a.mutate('PATCH',path+'/premium',appA,'resource.update',{resourceKey:'renamed',expectedVersion:version,enabled:false})).status,400);
  const detail=await a.request('GET',path+'/premium');assert.equal(detail.status,200);
  assert.equal(detail.data.resource.resourceKey,'premium');assert.equal(detail.data.versions.length,2);
  assert.deepEqual(detail.data.versions.map(x=>x.offerAddress).sort(),[own.address,replacement.address].sort());
  assert.equal(await epoch(),2,'stale versions and rename attempts cannot advance epoch');
 });
 await t.test('emergency disable avoids RPC; enabling inactive policy denies',async()=>{
  rpc.state.fail=true;let r;
  try{r=await a.mutate('DELETE',path+'/premium',appA,'resource.update',{resourceKey:'premium',expectedVersion:version,enabled:false});}
  finally{rpc.state.fail=false;}
  assert.equal(r.status,200,JSON.stringify(r.data));assert.equal(r.data.resource.enabled,false);version=r.data.resource.version;
  replacement.active=false;
  assert.ok((await a.mutate('PATCH',path+'/premium',appA,'resource.update',{resourceKey:'premium',expectedVersion:version,enabled:true})).status>=400);
  replacement.active=true;
  r=await a.mutate('PATCH',path+'/premium',appA,'resource.update',{resourceKey:'premium',expectedVersion:version,enabled:true});
  assert.equal(r.status,200);assert.equal(r.data.resource.enabled,true);assert.equal(r.data.resource.version,version+1);
  version=r.data.resource.version;assert.equal(await epoch(),4);
  assert.ok(rpc.calls.every(x=>['getGenesisHash','getMultipleAccounts'].includes(x.method)),'fixture forbids signing and transaction submission methods');
 });
 await t.test('competing signed same-version updates allow exactly one and advance epoch once',async()=>{
  const first={resourceKey:'premium',expectedVersion:version,enabled:false};
  const second={resourceKey:'premium',expectedVersion:version,offerAddress:own.address};
  const [p1,p2]=await Promise.all([a.proof(appA,'resource.update',first),a.proof(appA,'resource.update',second)]);
  const raced=await Promise.all([a.request('PATCH',path+'/premium',{payload:first,proof:p1}),a.request('PATCH',path+'/premium',{payload:second,proof:p2})]);
  assert.deepEqual(raced.map(x=>x.status).sort(),[200,409]);
  const detail=(await a.request('GET',path+'/premium')).data;
  assert.equal(detail.resource.version,version+1);assert.equal(detail.versions.length,5);assert.equal(await epoch(),5);
  assert.ok(detail.versions.every(x=>x.actorWallet===a.wallet.address));
 });
});
