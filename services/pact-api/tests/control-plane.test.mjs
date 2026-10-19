import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fixture,client,wallet} from './fixtures.mjs';
import {createDatabase,migrate} from '../src/database.mjs';
import {configuration} from '../src/config.mjs';

async function app(owner,name='Example'){
  const response=await owner.request('POST','/v1/developer/apps',{name,framework:'rest'});
  assert.equal(response.status,200,JSON.stringify(response.json));return response.json.app;
}
test('two admins cannot enumerate or mutate another tenant; CSRF and strict input fail closed',async t=>{
  const service=await fixture();t.after(()=>service.cleanup());
  const a=await client(service),b=await client(service),owned=await app(a);
  assert.deepEqual((await b.request('GET','/v1/developer/apps')).json.apps,[]);
  for(const suffix of ['', '/credentials','/callback-uris','/events','/usage']){
    assert.equal((await b.request('GET',`/v1/developer/apps/${owned.id}${suffix}`)).status,404);
  }
  assert.equal((await b.request('POST','/v1/developer/actions/challenge',{action:'app.update',appId:owned.id,payload:{name:'Stolen'}})).status,404);
  assert.equal((await a.request('POST','/v1/developer/apps',{name:'Bad',framework:'rest',ownerId:'forged'})).status,400);
  assert.equal((await a.request('POST','/v1/developer/apps',{name:'Bad',framework:'rest'},{'x-pact-csrf':'wrong'})).status,403);
  assert.equal((await a.request('POST','/v1/developer/apps',{name:'Bad',framework:'rest'},{origin:'https://evil.example'})).status,403);
});
test('signed admin proof one-use, bound to exact payload and session incarnation; concurrent mutation exactly once',async t=>{
  const service=await fixture();t.after(()=>service.cleanup());const a=await client(service),owned=await app(a);
  const payload={name:'Renamed'},proof=await a.proof('app.update',owned.id,payload),url=`/v1/developer/apps/${owned.id}`;
  assert.equal((await a.request('PATCH',url,{payload:{name:'Tampered'},proof})).status,401);
  const responses=await Promise.all([a.request('PATCH',url,{payload,proof}),a.request('PATCH',url,{payload,proof})]);
  assert.deepEqual(responses.map(r=>r.status).sort(),[200,401]);
  const stale=await a.proof('app.update',owned.id,{name:'AfterLogin'});
  await a.login();
  assert.equal((await a.request('PATCH',url,{payload:{name:'AfterLogin'},proof:stale})).status,401);
  const bad=await a.proof('app.update',owned.id,payload);
  assert.equal((await a.request('PATCH',url,{payload,proof:{...bad,signatureBase64:wallet().sign('bad')}})).status,401);
  assert.equal((await a.request('PATCH',url,{payload,proof:bad})).status,401);
});
test('admin exact-message invalid proof consumed, browser-bound and expiry',async t=>{
  const service=await fixture();t.after(()=>service.cleanup());const a=await client(service),b=await client(service),identity=wallet();
  const challenge=(await a.request('POST','/v1/developer/auth/challenge',{walletAddress:identity.address})).json;
  const payload={challengeId:challenge.challengeId,signatureBase64:identity.sign(challenge.message)};
  assert.equal((await b.request('POST','/v1/developer/auth/verify',payload)).status,401);
  assert.equal((await a.request('POST','/v1/developer/auth/verify',{...payload,signatureBase64:'bad'})).status,401);
  assert.equal((await a.request('POST','/v1/developer/auth/verify',payload)).status,401);
  const expired=(await a.request('POST','/v1/developer/auth/challenge',{walletAddress:identity.address})).json;
  service.clock.value+=120000;
  assert.equal((await a.request('POST','/v1/developer/auth/verify',{challengeId:expired.challengeId,signatureBase64:identity.sign(expired.message)})).status,401);
});
test('callback validation and expiring DNS proof; never fetch callbacks',async t=>{
  let txt=[];const service=await fixture({resolveTxt:async()=>txt});t.after(()=>service.cleanup());const a=await client(service),owned=await app(a);
  const url=`/v1/developer/apps/${owned.id}/callback-uris`;
  for(const uri of ['https://user:pass@example.com/callback','https://example.com/callback?next=https://evil.example',
    'https://example.com/callback#fragment','https://127.0.0.2/callback','http://example.com/callback',
    'https://example.com/a/../callback','https://example.com/%63allback','https://*.example.com/callback']){
    assert.equal((await a.request('POST','/v1/developer/actions/challenge',{action:'callback.create',appId:owned.id,payload:{uri,websiteOrigin:'https://example.com'}})).status,400,uri);
  }
  const loopback=await a.mutation('POST',url,'callback.create',owned.id,{uri:'http://localhost:3008/callback',websiteOrigin:'http://localhost:3008'});
  assert.equal(loopback.status,200);assert.equal(loopback.json.callback.status,'verified');
  const remote=await a.mutation('POST',url,'callback.create',owned.id,{uri:'https://consumer.example/callback',websiteOrigin:'https://consumer.example'});
  assert.equal(remote.status,200);assert.equal(remote.json.callback.status,'pending');
  const payload={callbackId:remote.json.callback.id};
  assert.equal((await a.mutation('POST',`${url}/verify`,'callback.verify',owned.id,payload)).status,403);
  txt=[[remote.json.dnsToken]];
  const verified=await a.mutation('POST',`${url}/verify`,'callback.verify',owned.id,payload);
  assert.equal(verified.status,200,JSON.stringify(verified.json));assert.equal(verified.json.callback.status,'verified');
  const revoked=await a.mutation('POST',`${url}/${payload.callbackId}/revoke`,'callback.revoke',owned.id,payload);
  assert.equal(revoked.status,200);assert.equal(revoked.json.callback.status,'revoked');
  assert.equal((await a.mutation('POST',`${url}/verify`,'callback.verify',owned.id,payload)).status,409);
  const renewed=await a.mutation('POST',`${url}/${payload.callbackId}/renew-proof`,'callback.renew',owned.id,payload);
  assert.equal(renewed.status,200);assert.notEqual(renewed.json.dnsToken,remote.json.dnsToken);
  assert.equal((await a.mutation('POST',`${url}/verify`,'callback.verify',owned.id,payload)).status,403);
  txt=[[renewed.json.dnsToken]];
  assert.equal((await a.mutation('POST',`${url}/verify`,'callback.verify',owned.id,payload)).status,200);
});
test('server-only once-secret credentials, rotation overlap, revoke, expiry, pause and scope',async t=>{
  const service=await fixture();t.after(()=>service.cleanup());const a=await client(service),owned=await app(a),url=`/v1/developer/apps/${owned.id}`;
  await a.mutation('PATCH',url,'app.update',owned.id,{status:'active'});
  const created=await a.mutation('POST',`${url}/credentials`,'credential.create',owned.id,
    {name:'Backend',scopes:['access:check','connect:write'],expiresAt:service.clock.value+3600000});
  assert.equal(created.status,200,JSON.stringify(created.json));const key=created.json;
  const stored=(await service.database.query('SELECT * FROM api_credentials WHERE id=$1',[key.credential.id])).rows[0];
  assert.ok(!JSON.stringify(stored).includes(key.secret));
  const listed=await a.request('GET',`${url}/credentials`);
  assert.ok(!JSON.stringify(listed.json).includes(key.secret));assert.equal(listed.json.credentials[0].id,key.credential.id);
  async function validate(secret,extra={}){return service.server.inject({method:'POST',url:'/v1/credentials/validate',payload:{},headers:{authorization:`Bearer ${secret}`,...extra}});}
  assert.equal((await validate(key.secret)).statusCode,200);
  assert.equal((await validate(key.secret,{origin:'http://localhost:3000'})).statusCode,403);
  const rotated=await a.mutation('POST',`${url}/credentials/${key.credential.id}/rotate`,'credential.rotate',owned.id,
    {credentialId:key.credential.id,expiresAt:service.clock.value+3600000,overlapSeconds:60});
  assert.equal(rotated.status,200);assert.equal((await validate(key.secret)).statusCode,200);
  service.clock.value+=60000;assert.equal((await validate(key.secret)).statusCode,401);
  assert.equal((await validate(rotated.json.secret)).statusCode,200);
  await a.mutation('PATCH',url,'app.update',owned.id,{status:'paused'});
  assert.equal((await validate(rotated.json.secret)).statusCode,403);
  await a.mutation('POST',`${url}/credentials/${rotated.json.credential.id}/revoke`,'credential.revoke',owned.id,{credentialId:rotated.json.credential.id});
  assert.equal((await validate(rotated.json.secret)).statusCode,401);
  const events=(await a.request('GET',`${url}/events`)).json.events;
  assert.ok(events.length>3);assert.ok(!JSON.stringify(events).includes(key.secret));
});
test('file-backed SQL persists sessions and apps across service/database restart and schema drift denies',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'pact-hosted-'));
  t.after(()=>rm(directory,{recursive:true,force:true}));
  let service=await fixture({localPath:directory});const a=await client(service),owned=await app(a),pepper=service.pepper;
  const cookie=[...a.jar].map(([k,v])=>`${k}=${v}`).join('; ');
  await service.cleanup();service=await fixture({localPath:directory,pepper});t.after(()=>service.cleanup());
  const result=await service.server.inject({url:`/v1/developer/apps/${owned.id}`,headers:{cookie}});
  assert.equal(result.statusCode,200);assert.equal(result.json().app.id,owned.id);
  await service.database.query("UPDATE platform_migrations SET checksum='drift'");
  await assert.rejects(()=>migrate(service.database),error=>error.code==='SCHEMA_DRIFT');
});
test('DB outage, monotonic clock, explicit topology and overload fail closed',async t=>{
  const service=await fixture({rateLimit:3});t.after(()=>service.close());
  for(let i=0;i<3;i++)assert.equal((await service.server.inject({url:'/v1/health/ready'})).statusCode,200);
  assert.equal((await service.server.inject({url:'/v1/health/ready'})).statusCode,429);
  service.clock.value--;
  assert.equal((await service.server.inject({url:'/v1/health/ready'})).statusCode,503);
  await service.database.close();
  assert.equal((await service.server.inject({url:'/v1/health/ready'})).statusCode,503);
  assert.equal((await service.server.inject({url:'/v1/health/live'})).statusCode,200);
  assert.throws(()=>configuration({PACT_HOSTED_PROFILE:'hosted',PACT_HOSTED_PROCESS_MODEL:'single-persistent-process',VERCEL:'1'}));
  await assert.rejects(()=>createDatabase({profile:'hosted'}));
  await assert.rejects(()=>createDatabase({maxPending:0}));
});
test('DNS work is signed before admission and retains bounded capacity after cancellation-ignoring timeout',async t=>{
  const pending=[];
  const service=await fixture({resolveTxt:()=>new Promise(resolve=>pending.push(resolve))});
  t.after(()=>service.cleanup());
  const a=await client(service),owned=await app(a),url=`/v1/developer/apps/${owned.id}/callback-uris`;
  const remote=await a.mutation('POST',url,'callback.create',owned.id,
    {uri:'https://consumer.example/callback',websiteOrigin:'https://consumer.example'});
  const payload={callbackId:remote.json.callback.id};
  const bad=await a.proof('callback.verify',owned.id,payload);
  assert.equal((await a.request('POST',`${url}/verify`,{payload,proof:{...bad,signatureBase64:'bad'}})).status,401);
  assert.equal(pending.length,0);
  const results=await Promise.all([a.mutation('POST',`${url}/verify`,'callback.verify',owned.id,payload),
    a.mutation('POST',`${url}/verify`,'callback.verify',owned.id,payload)]);
  assert.deepEqual(results.map(r=>r.status),[503,503]);assert.equal(pending.length,2);
  assert.equal((await a.mutation('POST',`${url}/verify`,'callback.verify',owned.id,payload)).status,503);
  assert.equal(pending.length,2,'cancel-ignoring operations cannot free admission capacity');
  for(const resolve of pending)resolve([[remote.json.dnsToken]]);
  await Promise.resolve();
});
