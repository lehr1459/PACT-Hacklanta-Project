import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {randomBytes,randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {createPactClient,PactError} from '../index.mjs';
const appId='app_'+'a'.repeat(32),apiKey='pact_sk_dev_key_'+'b'.repeat(32)+'_'+randomBytes(32).toString('base64url');
const walletGrant='pact_grant_'+randomBytes(32).toString('base64url'),walletAddress='11111111111111111111111111111111';
const input={walletGrant,walletAddress,resourceKey:'premium'};
const base=extra=>({schemaVersion:1,requestId:randomUUID(),...extra});
function allow(){const n=Date.now();return base({decision:'ALLOW',reason:'ACTIVE_LICENSE',appId,resourceKey:'premium',resourceVersion:1,policyEpoch:'1',offerAddress:walletAddress,walletAddress,network:'solana-devnet',programId:'EiiiWWsW2kkqP6nugHz6iBADvhnW5xnibAtZ82ZExVqy',expiresAt:String(Math.floor(n/1000)+60),verifiedAt:new Date(n).toISOString(),contextSlot:1,chainTimestamp:String(Math.floor(n/1000)),freshness:{readStartedAtMs:n,receivedAtMs:n,lastProgressAtMs:n,verifiedAtMs:n,maxAgeMs:8000,maxProgressAgeMs:12000,validUntilMs:n+8000}});}
async function fixture(t){
 let handler=(req,res)=>{res.end(JSON.stringify(allow()));};
 const seen=[];const server=createServer(async(req,res)=>{
  let body='';for await(const chunk of req)body+=chunk;seen.push({url:req.url,headers:req.headers,body:JSON.parse(body)});
  res.setHeader('content-type','application/json');res.setHeader('cache-control','no-store');await handler(req,res);
 });await new Promise(r=>server.listen(0,'127.0.0.1',r));
 t.after(()=>new Promise(r=>{server.closeAllConnections();server.close(r);}));
 const origin=`http://127.0.0.1:${server.address().port}`;
 return{origin,seen,client:createPactClient({origin,apiKey,appId}),set(fn){handler=fn;},value(value,status=200){handler=(_req,res)=>{res.statusCode=status;res.end(JSON.stringify(value));};}};
}
test('fresh receipt is deeply immutable, expected wallet is not a caller selector',async t=>{
 const c=await fixture(t),r=await c.client.checkAccess(input);r.assertFresh();assert.equal(r.decision,'ALLOW');
 assert.equal(Object.isFrozen(r.freshness),true);assert.throws(()=>{r.freshness.validUntilMs=Infinity;});
 assert.deepEqual(Object.keys(c.seen[0].body).sort(),['resourceKey','walletGrant']);assert.equal(c.seen[0].body.resourceKey,'premium');assert.ok(c.seen[0].body.walletGrant===walletGrant,'wire grant must match without printing it');assert.equal(c.seen[0].headers.origin,undefined);assert.ok(c.seen[0].headers.authorization===`Bearer ${apiKey}`,'private authorization header must match');
});
test('unsupported decisions, fields and policy/identity bindings always deny',async t=>{
 const c=await fixture(t);
 const cases=[{schemaVersion:2},{requestId:'raw secret input'},{decision:'DENY'},{reason:'OTHER'},{appId:'app_'+'c'.repeat(32)},{walletAddress:'So11111111111111111111111111111111111111112'},{resourceKey:'other'},{resourceVersion:0},{policyEpoch:'01'},{offerAddress:'fake'},{programId:walletAddress},{network:'solana-mainnet'},{contextSlot:-1},{expiresAt:'1e20'},{chainTimestamp:'00'},{purchase:{}},{error:{}}];
 for(const changed of cases){c.value({...allow(),...changed});await assert.rejects(c.client.checkAccess(input),PactError);}
});
test('every original freshness field and BigInt expiry bound is enforced',async t=>{
 const c=await fixture(t);
 for(const change of [f=>{f.maxAgeMs=9000;},f=>{f.maxProgressAgeMs=13000;},f=>{f.readStartedAtMs=f.receivedAtMs+1;},f=>{f.receivedAtMs=f.verifiedAtMs+1;},f=>{f.lastProgressAtMs=f.verifiedAtMs+1;},f=>{f.verifiedAtMs++;},f=>{f.validUntilMs=f.readStartedAtMs+8001;},f=>{f.lastProgressAtMs-=5000;},f=>{f.readStartedAtMs-=9000;},f=>{f.validUntilMs=f.verifiedAtMs;},f=>{f.validUntilMs=1.1;}]){
  const v=allow();change(v.freshness);c.value(v);await assert.rejects(c.client.checkAccess(input),PactError);
 }
 for(const changed of [{expiresAt:'1'},{chainTimestamp:'18446744073709551615'},{expiresAt:'18446744073709551615',chainTimestamp:'18446744073709551615'}]){c.value({...allow(),...changed});await assert.rejects(c.client.checkAccess(input),PactError);}
});
test('receipt deadline expires without an additional request',async t=>{
 const c=await fixture(t),v=allow();v.freshness.validUntilMs=Date.now()+100;c.value(v);
 const r=await c.client.checkAccess(input);await new Promise(r=>setTimeout(r,110));assert.throws(()=>r.assertFresh(),{code:'STALE_DECISION'});
});
test('full roundtrip reduces the original monotonic budget',async t=>{
 const c=await fixture(t);c.set(async(_req,res)=>{const v=allow();v.freshness.validUntilMs=v.freshness.readStartedAtMs+50;await new Promise(r=>setTimeout(r,70));res.end(JSON.stringify(v));});
 await assert.rejects(c.client.checkAccess(input),{code:'STALE_DECISION'});
});
test('errors, denied hints, redirects and response bodies expose no raw provider secrets',async t=>{
 const c=await fixture(t),unsafe='provider-secret-'+apiKey;
 c.value(base({error:{code:'DATABASE_UNAVAILABLE',message:unsafe}}),503);
 let error=await c.client.checkAccess(input).catch(e=>e);assert.equal(error.code,'ACCESS_DENIED');assert.ok(!JSON.stringify(error).includes(apiKey));
 c.value(base({error:{code:'API_KEY_INVALID',message:'API_KEY_INVALID'}}),401);await assert.rejects(c.client.checkAccess(input),{code:'API_KEY_INVALID',status:401});
 const deny={...allow(),decision:'DENY',reason:'LICENSE_REQUIRED',expiresAt:null,purchase:{url:c.origin+'/?offer='+walletAddress,metadata:'SELLER_EXACT_BYTES_REQUIRED'}};
 c.value(deny,403);error=await c.client.checkAccess(input).catch(e=>e);assert.equal(error.purchase.url,deny.purchase.url);assert.ok(Object.isFrozen(error.purchase));
 c.value({...deny,purchase:{...deny.purchase,url:'https://attacker.invalid/'}},403);error=await c.client.checkAccess(input).catch(e=>e);assert.equal(error.purchase,undefined);
 c.value({...deny,walletAddress:'So11111111111111111111111111111111111111112'},403);error=await c.client.checkAccess(input).catch(e=>e);assert.equal(error.purchase,undefined);
 c.value({...deny,resourceVersion:0},403);error=await c.client.checkAccess(input).catch(e=>e);assert.equal(error.purchase,undefined);
 c.set((_req,res)=>{res.statusCode=302;res.setHeader('location','/target');res.end();});await assert.rejects(c.client.checkAccess(input),{code:'API_UNAVAILABLE'});assert.ok(c.seen.every(r=>r.url!=='/target'));
 c.set((_req,res)=>res.end(unsafe));await assert.rejects(c.client.checkAccess(input),{code:'RESPONSE_INVALID'});
 c.set((_req,res)=>res.end('a'.repeat(131073)));await assert.rejects(c.client.checkAccess(input),PactError);
});
test('one deadline includes slow streaming and never retries',async t=>{
 const c=await fixture(t),client=createPactClient({origin:c.origin,apiKey,appId,timeoutMs:60});
 c.set(async(_req,res)=>{res.write('{');await new Promise(r=>setTimeout(r,120));res.end('}');});
 await assert.rejects(client.checkAccess(input),{code:'REQUEST_TIMEOUT'});assert.equal(c.seen.length,1);
});
test('backend methods validate exact wire shapes and bindings',async t=>{
 const c=await fixture(t),state=randomBytes(32).toString('base64url'),redirectUri=c.origin+'/callback';
 const transactionId='con_'+'d'.repeat(32);c.value(base({transactionId,loginUrl:c.origin+'/connect?transactionId='+transactionId,expiresAt:Date.now()+290000,issuer:c.origin}));
 await c.client.startLogin({redirectUri,state,codeChallenge:state,codeChallengeMethod:'S256',purpose:'Sign in'});
 c.value(base({walletGrant,walletAddress,appId,environment:'devnet',expiresAt:Date.now()+890000,issuer:c.origin}));
 const grant=await c.client.exchangeCode({code:'pact_code_'+state,redirectUri,state,codeVerifier:state,issuer:c.origin});assert.equal(grant.walletAddress,walletAddress);
 c.value(base({revoked:true}));await c.client.revokeGrant({walletGrant});assert.equal(c.seen.at(-1).url,'/v1/connect/revoke');
 c.value(base({valid:true,appId,credentialId:'key_'+'b'.repeat(32),environment:'devnet',scopes:['access:check','connect:write']}));await c.client.validateCredential();
 await assert.rejects(c.client.startLogin({redirectUri:redirectUri+'?x=1',state,codeChallenge:state,codeChallengeMethod:'S256',purpose:'Login'}),{code:'INPUT_INVALID'});
 await assert.rejects(c.client.checkAccess({...input,offerAddress:walletAddress}),{code:'INPUT_INVALID'});
});
test('configuration rejects noncanonical origins, browser entry and invalid credentials',async()=>{
 for(const origin of ['http://example.com','https://example.com/','https://user@example.com','https://example.com/path','http://127.0.0.1:80'])assert.throws(()=>createPactClient({origin,apiKey,appId}),{code:'CONFIGURATION_INVALID'});
 await assert.rejects(import('../browser-denied.mjs'),/Node backend/);
 const browser=spawnSync(process.execPath,['--conditions=browser','--input-type=module','-e',"import '@pact/hosted-client'"],{cwd:new URL('..',import.meta.url),encoding:'utf8'});
 assert.notEqual(browser.status,0);assert.match(browser.stderr,/Node backend/);
});
test('observed local wall rollback invalidates an existing receipt',async t=>{
 const c=await fixture(t),receipt=await c.client.checkAccess(input),original=Date.now;
 try{Date.now=()=>original()-10000;assert.throws(()=>receipt.assertFresh(),{code:'CLOCK_UNAVAILABLE'});}
 finally{Date.now=original;}
});
