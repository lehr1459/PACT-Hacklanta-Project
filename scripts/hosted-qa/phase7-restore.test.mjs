import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,createHash} from 'node:crypto';
import {copyFile,readFile} from 'node:fs/promises';
import path from 'node:path';
import {createDatabase,migrate} from '../../services/pact-api/src/database.mjs';
import {createService} from '../../services/pact-api/src/service.mjs';
import {prepareDatabase,wallet} from './helpers.mjs';
import {Browser,ORIGIN} from './browser.mjs';
import {rpcFixture} from './rpc-fixture.mjs';
import {clockDirectory,waitForClockCeiling} from './phase7-clock-fixture.mjs';

const random=()=>randomBytes(32).toString('base64url');
test('Phase7 native isolated PostgreSQL snapshot/restore retains app history and requires fresh secret/clock authority',{timeout:30000},async t=>{
 const connectionString=await prepareDatabase(),control=await createDatabase({connectionString,profile:'test'}),rpc=await rpcFixture();
 const suffix=randomBytes(8).toString('hex'),sourceName='pact_hosted_qa_restore_src_'+suffix,restoredName='pact_hosted_qa_restore_dst_'+suffix,owned=new Set(),handles=new Set();
 function name(value){if(!/^pact_hosted_qa_restore_(?:src|dst)_[a-f0-9]{16}$/.test(value))throw Error('Unowned restore database name');return '"'+value+'"';}
 function dsn(database){const url=new URL(connectionString);assert.equal(url.hostname,'127.0.0.1');assert.equal(url.pathname,'/pact_hosted_qa');url.pathname='/'+database;return url.href;}
 async function stop(handle){if(!handle||handle.closed)return;await handle.service.close();await handle.database.close();handle.closed=true;handles.delete(handle);}
 t.after(async()=>{
  for(const handle of [...handles])await stop(handle);
  for(const database of [restoredName,sourceName])if(owned.has(database))await control.query('DROP DATABASE '+name(database));
  await control.close();await rpc.close();
 });
 await control.query('CREATE DATABASE '+name(sourceName)+' TEMPLATE template0');owned.add(sourceName);
 async function open(databaseName,pepper,directory){
  const database=await createDatabase({connectionString:dsn(databaseName),profile:'test'});
  try{await migrate(database);
   const service=await createService({database,origin:ORIGIN,pepper,profile:'test',clockDirectory:directory,rateLimit:1000,readerOptions:{rpcUrl:rpc.url}});
   const handle={database,service,base:await service.server.listen({host:'127.0.0.1',port:0}),closed:false};handles.add(handle);return handle;
  }catch(error){await database.close();throw error;}
 }
 const pepper=random(),sourceDirectory=await clockDirectory();let source=await open(sourceName,pepper,sourceDirectory);
 const admin=new Browser(source.base);await admin.login();let response=await admin.request('POST','/v1/developer/apps',{name:'Isolated restore fixture',framework:'rest'});assert.equal(response.status,200);
 const appId=response.data.app.id,appPath='/v1/developer/apps/'+appId,callback='http://127.0.0.1:4200/callback';
 assert.equal((await admin.mutate('PATCH',appPath,appId,'app.update',{status:'active'})).status,200);
 assert.equal((await admin.mutate('POST',appPath+'/callback-uris',appId,'callback.create',{uri:callback,websiteOrigin:'http://127.0.0.1:4200'})).status,200);
 const offer=rpc.addOffer({seller:admin.wallet});assert.equal((await admin.mutate('POST',appPath+'/resources',appId,'resource.bind',{resourceKey:'premium',offerAddress:offer.address})).status,200);
 assert.equal((await admin.mutate('PATCH',appPath+'/resources/premium',appId,'resource.update',{resourceKey:'premium',expectedVersion:1,enabled:true})).status,200);
 response=await admin.mutate('POST',appPath+'/credentials',appId,'credential.create',{name:'Pre-snapshot private key',scopes:['access:check','connect:write'],expiresAt:Date.now()+3600000});assert.equal(response.status,200);
 const oldKey=response.data.secret,oldCredentialId=response.data.credential.id,identity=wallet();
 async function issue(handle,key,buyerIdentity,exchange){
  const api=new Browser(handle.base),state=random(),verifier=random();let r=await api.backend('/v1/connect/transactions',key,{redirectUri:callback,state,codeChallenge:createHash('sha256').update(verifier).digest('base64url'),codeChallengeMethod:'S256',purpose:'Native restore drill'});assert.equal(r.status,200);
  const transactionId=r.data.transactionId,buyer=new Browser(handle.base);r=await buyer.request('GET','/v1/connect/transactions/'+transactionId);assert.equal(r.status,200);buyer.csrf=r.data.csrfToken;
  r=await buyer.request('POST','/v1/connect/challenge',{transactionId,walletAddress:buyerIdentity.address});assert.equal(r.status,200);
  r=await buyer.request('POST','/v1/connect/verify',{transactionId,challengeId:r.data.challengeId,signatureBase64:buyerIdentity.sign(r.data.message)});assert.equal(r.status,200);
  const input={code:new URL(r.data.callbackUrl).searchParams.get('code'),redirectUri:callback,state,codeVerifier:verifier,issuer:ORIGIN};
  if(!exchange)return input;r=await api.backend('/v1/connect/token',key,input);assert.equal(r.status,200);return r.data.walletGrant;
 }
 const oldGrant=await issue(source,oldKey,identity,true),oldCode=await issue(source,oldKey,identity,false),payload={description:'Old snapshot proof must fail'},oldProof=await admin.proof(appId,'app.update',payload),oldJar=new Map(admin.jar),oldCsrf=admin.csrf;
 rpc.addLicense({offer,buyer:identity,expirySeconds:BigInt(Math.floor(Date.now()/1000)+3600)});
 assert.equal((await new Browser(source.base).backend('/v1/access/check',oldKey,{walletGrant:oldGrant,resourceKey:'premium'})).status,200);
 await stop(source);const snapshotDirectory=await clockDirectory();await copyFile(path.join(sourceDirectory,'authority.bin'),path.join(snapshotDirectory,'authority.bin'));
 await control.query('CREATE DATABASE '+name(restoredName)+' TEMPLATE '+name(sourceName));owned.add(restoredName);
 await waitForClockCeiling(sourceDirectory);source=await open(sourceName,pepper,sourceDirectory);admin.base=source.base;
 assert.equal((await admin.mutate('POST',appPath+'/credentials/'+oldCredentialId+'/revoke',appId,'credential.revoke',{credentialId:oldCredentialId})).status,200);
 assert.equal((await new Browser(source.base).key(oldKey)).status,401);await stop(source);
 // Deliberate local counterexample: restoring both old secret and clock state
 // cannot detect a valid prior DB snapshot or preserve its later revocation.
 await waitForClockCeiling(snapshotDirectory);let restored=await open(restoredName,pepper,snapshotDirectory);
 assert.equal((await new Browser(restored.base).key(oldKey)).status,200,'same-secret restore is explicitly unsafe; do not claim automatic rollback detection');await stop(restored);
 const offline=await createDatabase({connectionString:dsn(restoredName),profile:'test'});
 try{
  const beforeEpoch=Number((await offline.query('SELECT policy_epoch FROM developer_applications WHERE id=$1',[appId])).rows[0].policy_epoch);
  const recoverySql=await readFile(new URL('../../services/pact-api/operations/restore-quarantine.sql',import.meta.url),'utf8');
  await offline.query(recoverySql);
  assert.equal((await offline.query('SELECT status FROM developer_applications WHERE id=$1',[appId])).rows[0].status,'paused');
  assert.equal(Number((await offline.query('SELECT policy_epoch FROM developer_applications WHERE id=$1',[appId])).rows[0].policy_epoch),beforeEpoch+1);
  assert.ok((await offline.query('SELECT revoked_at FROM api_credentials WHERE id=$1',[oldCredentialId])).rows[0].revoked_at!==null);
  for(const table of ['api_credentials','admin_sessions','wallet_grants'])assert.equal(Number((await offline.query('SELECT COUNT(*) AS n FROM '+table+' WHERE revoked_at IS NULL')).rows[0].n),0);
  for(const table of ['admin_challenges','action_challenges','wallet_challenges'])assert.equal(Number((await offline.query('SELECT COUNT(*) AS n FROM '+table+' WHERE consumed_at IS NULL')).rows[0].n),0);
  assert.equal(Number((await offline.query('SELECT COUNT(*) AS n FROM login_transactions WHERE redeemed_at IS NULL OR expires_at<>0 OR code_expires_at<>0')).rows[0].n),0);
  assert.equal(Number((await offline.query('SELECT COUNT(*) AS n FROM resource_versions WHERE app_id=$1',[appId])).rows[0].n),2);
 }finally{await offline.close();}
 // Normal recovery selects a fresh pepper/store before opening any listener.
 restored=await open(restoredName,random(),await clockDirectory());const api=new Browser(restored.base);
 assert.equal((await api.key(oldKey)).status,401);
 const oldAdmin=new Browser(restored.base);oldAdmin.jar=new Map(oldJar);oldAdmin.csrf=oldCsrf;
 assert.equal((await oldAdmin.request('GET',appPath)).status,401);assert.equal((await oldAdmin.request('GET','/v1/developer/auth/session')).data.authenticated,false);
 const freshAdmin=new Browser(restored.base);freshAdmin.wallet=admin.wallet;await freshAdmin.login();
 response=await freshAdmin.request('GET',appPath+'/resources/premium');assert.equal(response.status,200);assert.equal(response.data.resource.version,2);assert.equal(response.data.versions.length,2);
 assert.equal((await freshAdmin.request('GET',appPath)).data.app.status,'paused');
 assert.equal((await freshAdmin.mutate('PATCH',appPath,appId,'app.update',{status:'active'})).status,200);
 response=await freshAdmin.mutate('POST',appPath+'/credentials',appId,'credential.create',{name:'Post-restore private key',scopes:['access:check','connect:write'],expiresAt:Date.now()+3600000});assert.equal(response.status,200);const freshKey=response.data.secret;
 assert.equal((await api.backend('/v1/access/check',freshKey,{walletGrant:oldGrant,resourceKey:'premium'})).status,401);
 assert.equal((await api.backend('/v1/connect/token',freshKey,oldCode)).status,401);
 assert.equal((await freshAdmin.request('PATCH',appPath,{payload,proof:oldProof})).status,401);
 const freshGrant=await issue(restored,freshKey,identity,true);assert.equal((await api.backend('/v1/access/check',freshKey,{walletGrant:freshGrant,resourceKey:'premium'})).status,200);
 assert.equal((await freshAdmin.request('GET',appPath)).data.app.description,'');
});
