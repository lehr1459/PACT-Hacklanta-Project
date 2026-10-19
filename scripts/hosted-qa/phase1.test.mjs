import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {createDatabase,migrate} from '../../services/pact-api/src/database.mjs';
import {createService} from '../../services/pact-api/src/service.mjs';
import {Client,prepareDatabase,nonce,assertSecretAbsent} from './helpers.mjs';
import {Browser,ORIGIN as origin} from './browser.mjs';

test('Phase1 independent native PostgreSQL control-plane acceptance',async t=>{
 const connectionString=await prepareDatabase();
 const pepper=randomBytes(32).toString('base64url');
 let db,service,base,dnsRows=[];
 async function start(){
  db=await createDatabase({connectionString,profile:'test'});await migrate(db);
  service=await createService({database:db,origin,pepper,profile:'test',rateLimit:1000,resolveTxt:async()=>dnsRows});
  base=await service.server.listen({port:0,host:'127.0.0.1'});
 }
 await start();
 t.after(async()=>{await service.close();await db.close();});
 const a=new Browser(base),b=new Browser(base);let appA,appB,key,rotated;
 const suffix=nonce();
 await t.test('admin wallet proofs, CSRF and replay',async()=>{
  const loginProof=await a.login();await b.login();
  assert.equal((await a.request('POST','/v1/developer/auth/verify',loginProof)).status,401);
  assert.equal((await a.request('POST','/v1/developer/apps',{name:'csrf',framework:'rest'},{'x-pact-csrf':null})).status,403);
  assert.equal((await a.request('POST','/v1/developer/apps',{name:'origin',framework:'rest'},{Origin:'https://attacker.invalid'})).status,403);
  assert.equal((await a.request('POST','/v1/developer/apps',{name:'missing-origin',framework:'rest'},{Origin:null})).status,403);
  assert.equal((await a.request('GET','/v1/developer/apps',undefined,{Cookie:[...b.jar].map(([k,v])=>`${k}=${v}`).join('; ')})).status,200);
  // A valid session without its paired browser binding cannot authorize.
  const mixed=new Map(a.jar);mixed.set('pact_hosted_binding',b.jar.get('pact_hosted_binding'));
  assert.equal((await a.request('GET','/v1/developer/apps',undefined,{Cookie:[...mixed].map(([k,v])=>`${k}=${v}`).join('; ')})).status,401);
 });
 await t.test('two admins create and enumerate only owned applications',async()=>{
  let r=await a.request('POST','/v1/developer/apps',{name:`QA A ${suffix}`,framework:'rest'});assert.equal(r.status,200);appA=r.data.app.id;
  r=await b.request('POST','/v1/developer/apps',{name:`QA B ${suffix}`,framework:'express'});assert.equal(r.status,200);appB=r.data.app.id;
  assert.deepEqual((await a.request('GET','/v1/developer/apps')).data.apps.map(x=>x.id),[appA]);
  for(const tail of ['', '/credentials','/callback-uris','/usage','/events'])
   assert.equal((await b.request('GET',`/v1/developer/apps/${appA}${tail}`)).status,404,tail);
  assert.equal((await b.request('POST','/v1/developer/actions/challenge',{appId:appA,action:'app.update',payload:{status:'active'}})).status,404);
 });
 await t.test('fresh sensitive proofs bind exact payload, session, wallet and single use',async()=>{
  const path=`/v1/developer/apps/${appA}`,payload={status:'active'},proof=await a.proof(appA,'app.update',payload);
  assert.equal((await a.request('PATCH',path,{payload:{status:'paused'},proof})).status,401);
  assert.equal((await b.request('PATCH',path,{payload,proof})).status,401);
  assert.equal((await a.request('PATCH',path,{payload,proof})).status,200);
  assert.equal((await a.request('PATCH',path,{payload,proof})).status,401);
  const sameWalletSession=new Browser(base);sameWalletSession.wallet=a.wallet;await sameWalletSession.login();
  const sessionPayload={description:'session-specific proof'},sessionProof=await a.proof(appA,'app.update',sessionPayload);
  assert.equal((await sameWalletSession.request('PATCH',path,{payload:sessionPayload,proof:sessionProof})).status,401);
  assert.equal((await a.request('PATCH',path,{payload:sessionPayload,proof:sessionProof})).status,200);
  const next=await a.proof(appA,'app.update',{name:'unchanged'});
  next.signatureBase64=b.wallet.sign('wrong message');
  assert.equal((await a.request('PATCH',path,{payload:{name:'unchanged'},proof:next})).status,401);
  const concurrentPayload={description:'one signed mutation'},concurrentProof=await a.proof(appA,'app.update',concurrentPayload);
  const race=await Promise.all([a.request('PATCH',path,{payload:concurrentPayload,proof:concurrentProof}),a.request('PATCH',path,{payload:concurrentPayload,proof:concurrentProof})]);
  assert.deepEqual(race.map(x=>x.status).sort(),[200,401]);
  const rename={name:`Concurrent ${suffix}`},pause={status:'paused'};
  const [renameProof,pauseProof]=await Promise.all([a.proof(appA,'app.update',rename),a.proof(appA,'app.update',pause)]);
  const updates=await Promise.all([a.request('PATCH',path,{payload:rename,proof:renameProof}),a.request('PATCH',path,{payload:pause,proof:pauseProof})]);
  assert.deepEqual(updates.map(x=>x.status),[200,200]);
  const final=(await a.request('GET',path)).data.app;assert.equal(final.name,rename.name);assert.equal(final.status,'paused');
  assert.equal((await a.mutate('PATCH',path,appA,'app.update',{status:'active'})).status,200);
 });
 await t.test('exact callback validation and local-only verification exception',async()=>{
  const invalid=[
   ['https://app.example/cb#x','https://app.example'],['https://app.example/cb?x=1','https://app.example'],
   ['https://user:pass@app.example/cb','https://app.example'],['https://*.example/cb','https://*.example'],
   ['https://app.example/%2e%2e/cb','https://app.example'],['https://app.example/a/../cb','https://app.example'],
   ['http://app.example/cb','http://app.example'],['https://127.1/cb','https://127.0.0.1'],
   ['https://192.168.1.1/cb','https://192.168.1.1'],['https://app.internal/cb','https://app.internal'],
   ['https://app.example/cb','https://other.example']
  ];
  for(const [uri,websiteOrigin]of invalid){
   const r=await a.request('POST','/v1/developer/actions/challenge',{appId:appA,action:'callback.create',payload:{uri,websiteOrigin}});
   assert.equal(r.status,400,uri);
  }
  let payload={uri:'http://127.0.0.1:4200/callback',websiteOrigin:'http://127.0.0.1:4200'};
  let r=await a.mutate('POST',`/v1/developer/apps/${appA}/callback-uris`,appA,'callback.create',payload);
  assert.equal(r.status,200);assert.equal(r.data.callback.status,'verified');assert.equal(r.data.callback.local,true);
  payload={uri:'https://qa-owner.example/callback',websiteOrigin:'https://qa-owner.example'};
  r=await a.mutate('POST',`/v1/developer/apps/${appA}/callback-uris`,appA,'callback.create',payload);
  assert.equal(r.status,200);assert.equal(r.data.callback.status,'pending');assert.ok(r.data.dnsToken);
  assertSecretAbsent((await a.request('GET',`/v1/developer/apps/${appA}/callback-uris`)).data,[r.data.dnsToken]);
  const dnsToken=r.data.dnsToken,callbackId=r.data.callback.id,verifyPath=`/v1/developer/apps/${appA}/callback-uris/verify`;
  dnsRows=[['pact-domain-verification=WRONG']];
  assert.equal((await a.mutate('POST',verifyPath,appA,'callback.verify',{callbackId})).status,403);
  dnsRows=[[dnsToken]];
  r=await a.mutate('POST',verifyPath,appA,'callback.verify',{callbackId});
  assert.equal(r.status,200);assert.equal(r.data.callback.status,'verified');
  assertSecretAbsent(r.data,[dnsToken]);
  r=await a.mutate('POST',`/v1/developer/apps/${appA}/callback-uris/${callbackId}/renew-proof`,appA,'callback.renew',{callbackId});
  assert.equal(r.status,200);assert.equal(r.data.callback.status,'pending');assert.notEqual(r.data.dnsToken,dnsToken);
  const renewedToken=r.data.dnsToken;
  dnsRows=[[dnsToken]];assert.equal((await a.mutate('POST',verifyPath,appA,'callback.verify',{callbackId})).status,403);
  dnsRows=[[renewedToken]];
  assert.equal((await a.mutate('POST',verifyPath,appA,'callback.verify',{callbackId})).status,200);
  r=await a.mutate('POST',`/v1/developer/apps/${appA}/callback-uris/${callbackId}/revoke`,appA,'callback.revoke',{callbackId});
  assert.equal(r.status,200);assert.equal(r.data.callback.status,'revoked');assert.equal(r.data.callback.verifiedUntil,null);
  assert.equal((await a.mutate('POST',verifyPath,appA,'callback.verify',{callbackId})).status,409);
 });
 await t.test('keys reveal once, persist only verifiers, rotate overlap and revoke',async()=>{
  const path=`/v1/developer/apps/${appA}/credentials`;
  let r=await a.mutate('POST',path,appA,'credential.create',{name:'QA key',scopes:['access:check'],expiresAt:Date.now()+3600000});
  assert.equal(r.status,200);key=r.data;
  assert.match(key.secret,/^pact_sk_dev_key_/);
  const listed=await a.request('GET',path);assert.equal(listed.status,200);assertSecretAbsent(listed.data,[key.secret]);
  assert.ok(!Object.hasOwn(listed.data.credentials[0],'token_hash'));
  const raw=new Client({connectionString});await raw.connect();
  try{
   const persisted=(await raw.query('SELECT * FROM api_credentials WHERE id=$1',[key.credential.id])).rows[0];
   assertSecretAbsent(persisted,[key.secret]);assert.match(persisted.token_hash,/^[a-f0-9]{64}$/);
  }finally{await raw.end();}
  const auth=secret=>({headers:{authorization:`Bearer ${secret}`}});
  assert.equal((await service.authenticateKey(auth(key.secret),'access:check')).app_id,appA);
  r=await a.key(key.secret);assert.equal(r.status,200);assert.equal(r.data.appId,appA);assertSecretAbsent(r.data,[key.secret]);
  assert.equal((await a.key('invalid')).status,401);
  assert.equal((await a.key(key.secret,{walletAddress:a.wallet.address})).status,400);
  assert.equal((await a.request('POST','/v1/credentials/validate',{}, {Authorization:`Bearer ${key.secret}`})).status,403);
  await assert.rejects(service.authenticateKey({...auth(key.secret),headers:{...auth(key.secret).headers,origin}},'access:check'));
  await assert.rejects(service.authenticateKey(auth(key.secret),'connect:write'));
  r=await a.mutate('POST',`${path}/${key.credential.id}/rotate`,appA,'credential.rotate',
   {credentialId:key.credential.id,expiresAt:Date.now()+3600000,overlapSeconds:60});
  assert.equal(r.status,200);rotated=r.data;
  await service.authenticateKey(auth(key.secret),'access:check');await service.authenticateKey(auth(rotated.secret),'access:check');
  assert.equal((await a.key(key.secret)).status,200);assert.equal((await a.key(rotated.secret)).status,200);
  r=await a.mutate('POST',`${path}/${key.credential.id}/revoke`,appA,'credential.revoke',{credentialId:key.credential.id});assert.equal(r.status,200);
  await assert.rejects(service.authenticateKey(auth(key.secret),'access:check'));
  assert.equal((await a.key(key.secret)).status,401);assert.equal((await a.key(rotated.secret)).status,200);
  await service.authenticateKey(auth(rotated.secret),'access:check');
  assertSecretAbsent((await a.request('GET',path)).data,[key.secret,rotated.secret]);
  assertSecretAbsent((await a.request('GET',`/v1/developer/apps/${appA}/events`)).data,[key.secret,rotated.secret]);
  const admin=new Client({connectionString});await admin.connect();
  try{
   await admin.query("UPDATE developer_accounts SET status='disabled' WHERE wallet=$1",[a.wallet.address]);
   assert.equal((await a.key(rotated.secret)).status,401);
   assert.equal((await a.request('GET',`/v1/developer/apps/${appA}`)).status,401);
  }finally{await admin.query("UPDATE developer_accounts SET status='active' WHERE wallet=$1",[a.wallet.address]);await admin.end();}
 });
 await t.test('process/connection restart preserves sessions, app state and key revocation',async()=>{
  await service.close();await db.close();await start();a.base=base;b.base=base;
  assert.equal((await a.request('GET',`/v1/developer/apps/${appA}`)).status,200);
  assert.equal((await b.request('GET',`/v1/developer/apps/${appA}`)).status,404);
  await assert.rejects(service.authenticateKey({headers:{authorization:`Bearer ${key.secret}`}},'access:check'));
  assert.equal((await a.key(key.secret)).status,401);assert.equal((await a.key(rotated.secret)).status,200);
  await service.authenticateKey({headers:{authorization:`Bearer ${rotated.secret}`}},'access:check');
  const path=`/v1/developer/apps/${appA}`;
  assert.equal((await a.mutate('PATCH',path,appA,'app.update',{status:'paused'})).status,200);
  await assert.rejects(service.authenticateKey({headers:{authorization:`Bearer ${rotated.secret}`}},'access:check'));
  assert.equal((await a.key(rotated.secret)).status,403);
  const credentialPath=`${path}/credentials/${rotated.credential.id}/revoke`;
  assert.equal((await a.mutate('POST',credentialPath,appA,'credential.revoke',{credentialId:rotated.credential.id})).status,200);
  assert.equal((await a.request('POST','/v1/developer/auth/logout',{})).status,200);
  assert.equal((await a.request('GET',path)).status,401);
 });
 await t.test('DB unavailable denies routes and readiness while liveness remains available',async()=>{
  await db.close();
  assert.equal((await b.request('GET','/v1/developer/apps')).status,503);
  assert.equal((await b.request('GET','/v1/health/ready')).status,503);
  assert.equal((await b.request('GET','/v1/health/live')).status,200);
  await service.close();await start();a.base=base;b.base=base;
  assert.equal((await b.request('GET',`/v1/developer/apps/${appB}`)).status,200);
 });
});

test('Phase1 quotas remain atomic under concurrent app creation and key rotation',async t=>{
 const connectionString=await prepareDatabase(),db=await createDatabase({connectionString,profile:'test'});
 await migrate(db);
 const service=await createService({database:db,origin,pepper:randomBytes(32).toString('base64url'),profile:'test',rateLimit:1000});
 const base=await service.server.listen({port:0,host:'127.0.0.1'});
 t.after(async()=>{await service.close();await db.close();});
 await t.test('parallel registrations cannot exceed twenty owned apps',async()=>{
  const a=new Browser(base);await a.login();
  for(let i=0;i<19;i++)assert.equal((await a.request('POST','/v1/developer/apps',{name:`quota ${i}`,framework:'rest'})).status,200);
  const race=await Promise.all(Array.from({length:4},(_,i)=>a.request('POST','/v1/developer/apps',{name:`racing ${i}`,framework:'rest'})));
  assert.equal(race.filter(x=>x.status===200).length,1,'more than one parallel request passed the final available app slot');
 });
 await t.test('rotation overlap cannot bypass ten active credentials per app',async()=>{
  const a=new Browser(base);await a.login();
  const app=(await a.request('POST','/v1/developer/apps',{name:'rotation quota',framework:'rest'})).data.app.id;
  const path=`/v1/developer/apps/${app}/credentials`;
  const first=await a.mutate('POST',path,app,'credential.create',{name:'rotate',scopes:['access:check'],expiresAt:Date.now()+3600000});
  assert.equal(first.status,200);const keyId=first.data.credential.id;
  for(let i=0;i<9;i++)assert.equal((await a.mutate('POST',`${path}/${keyId}/rotate`,app,'credential.rotate',{
   credentialId:keyId,expiresAt:Date.now()+3600000,overlapSeconds:60})).status,200);
  assert.equal((await a.mutate('POST',`${path}/${keyId}/rotate`,app,'credential.rotate',{
   credentialId:keyId,expiresAt:Date.now()+3600000,overlapSeconds:60})).status,429,'rotation bypassed active-key quota');
  assert.equal((await a.mutate('POST',`${path}/${keyId}/rotate`,app,'credential.rotate',{
   credentialId:keyId,expiresAt:Date.now()+3600000,overlapSeconds:0})).status,200,'zero-overlap rotation must be possible at quota');
 });
});
