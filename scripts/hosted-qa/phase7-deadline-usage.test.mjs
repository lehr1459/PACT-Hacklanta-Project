import test from 'node:test';
import assert from 'node:assert/strict';
import {request as httpRequest} from 'node:http';
import {connect as connectSocket} from 'node:net';
import {setTimeout as delay} from 'node:timers/promises';
import {accessFixture} from './access-fixture.mjs';
import {Browser,ORIGIN} from './browser.mjs';
import {proxyHostedRequest} from '../../web/lib/hosted-gateway.mjs';

async function until(predicate){for(let i=0;i<100;i++){if(await predicate())return;await delay(10);}throw Error('Expected owned work to settle');}
function partial(url){return new Promise((resolve,reject)=>{
 let drip;
 const pending=httpRequest(url,{method:'POST',headers:{'content-type':'application/json','content-length':'100'}},response=>{
  clearInterval(drip);let body='';response.on('data',bytes=>body+=bytes);response.on('end',()=>resolve({status:response.statusCode,headers:response.headers,data:JSON.parse(body)}));
 });pending.on('error',error=>{clearInterval(drip);reject(error);});pending.setTimeout(11000,()=>pending.destroy(Error('Fixture transport ceiling exceeded')));pending.write('{');
 // Keep the socket active so this measures the absolute request deadline,
 // independently of the shorter five-second idle-connection ceiling.
 drip=setInterval(()=>pending.write(' '),500);
});}

test('Phase7 native HTTP default seven-second budget bounds incomplete bodies and releases admission',{timeout:15000},async t=>{
 const c=await accessFixture();t.after(()=>c.close());const started=performance.now(),response=await partial(c.base+'/v1/developer/auth/challenge');
 assert.equal(response.status,503);assert.equal(response.data.error.code,'REQUEST_DEADLINE');assert.equal(response.headers.connection,'close');
 const elapsed=performance.now()-started;assert.ok(elapsed>=6500&&elapsed<10500,'default deadline must be real and bounded');
 await until(()=>c.service.diagnostics().http.active===0);assert.equal((await new Browser(c.base).request('GET','/v1/health/live')).status,200);
});

test('Phase7 actual incomplete headers close within the independent five-second header ceiling',{timeout:12000},async t=>{
 const c=await accessFixture();t.after(()=>c.close());const address=new URL(c.base),started=performance.now();
 assert.ok(c.service.server.server.listenerCount('clientError')>0);
 // Fastify's timeout destruction may reach a writing peer before its408 bytes.
 const serverErrors=new Set(),observe=error=>serverErrors.add(error.code);c.service.server.server.on('clientError',observe);t.after(()=>c.service.server.server.off('clientError',observe));
 let requestEvents=0;const observeRequest=()=>requestEvents++;c.service.server.server.on('request',observeRequest);t.after(()=>c.service.server.server.off('request',observeRequest));
 const socket=connectSocket({host:address.hostname,port:Number(address.port)});let drip,ceiling;
 t.after(()=>{clearInterval(drip);clearTimeout(ceiling);socket.destroy();});
 const response=await new Promise((resolve,reject)=>{
  let data='',transportError=null;socket.on('data',bytes=>{data+=bytes.toString('ascii');clearInterval(drip);});socket.on('end',()=>clearInterval(drip));socket.on('error',error=>{clearInterval(drip);transportError=error.code??'UNCLASSIFIED';});socket.on('close',()=>resolve({data,transportError}));
  ceiling=setTimeout(()=>{socket.destroy();reject(Error('Owned incomplete-header fixture exceeded ceiling'));},8000);
  socket.on('connect',()=>{socket.write('POST /v1/developer/auth/challenge HTTP/1.1\r\nHost: '+address.host+'\r\nX-Slow: ');drip=setInterval(()=>socket.write('x'),500);});
 });clearInterval(drip);clearTimeout(ceiling);
 assert.ok(/^HTTP\/1\.1 408 /.test(response.data)||response.data===''&&response.transportError==='ECONNRESET','header timeout must return408 or its verified transport reset');
 assert.ok(response.transportError===null||response.transportError==='ECONNRESET');assert.ok(serverErrors.has('ERR_HTTP_REQUEST_TIMEOUT'));
 const elapsed=performance.now()-started;assert.ok(elapsed>=4500&&elapsed<7500,'header ceiling must bound an actively dripping peer');
 assert.equal(c.service.diagnostics().http.active,0);assert.equal(requestEvents,0);assert.equal((await new Browser(c.base).request('GET','/v1/health/live')).status,200);
});

test('Phase7 short actual deadline retains native SQL work and rolls back signed mutation/proof before commit',{timeout:10000},async t=>{
 let armed=false,release,entered;const held=new Promise(resolve=>release=resolve),reached=new Promise(resolve=>entered=resolve);
 const c=await accessFixture({serviceOptions:{requestDeadlineMs:300},wrapDatabase:native=>({...native,transaction:work=>native.transaction(tx=>work({query:async(sql,values)=>{
  const result=await tx.query(sql,values);if(armed&&sql.startsWith('INSERT INTO security_audit_events')){entered();await held;}return result;
 }}))})});t.after(async()=>{release();await c.close();});
 const before=(await c.admin.request('GET',c.own.path)).data.app.name,payload={name:'Deadline must not commit'},proof=await c.admin.proof(c.own.id,'app.update',payload);armed=true;
 const pending=c.admin.request('PATCH',c.own.path,{payload,proof});await reached;const response=await pending;
 assert.equal(response.status,503);assert.equal(response.data.error.code,'REQUEST_DEADLINE');assert.equal(c.service.diagnostics().http.active,1);
 assert.equal((await new Browser(c.base).request('GET','/v1/health/live')).status,200);release();
 await until(()=>c.service.diagnostics().http.active===0);
 assert.equal((await c.native.query('SELECT name FROM developer_applications WHERE id=$1',[c.own.id])).rows[0].name,before);
 assert.equal((await c.native.query('SELECT consumed_at FROM action_challenges WHERE id=$1',[proof.challengeId])).rows[0].consumed_at,null);
});

test('Phase7 worst-case native usage remains within96KiB through the actual fixed gateway',{timeout:10000},async t=>{
 const c=await accessFixture();t.after(()=>c.close());const now=c.clock.value,maximum=Number.MAX_SAFE_INTEGER;
 await c.native.query(`INSERT INTO usage_aggregates(app_id,bucket,requests,allowed,denied,errors,latency_total_ms,latency_max_ms)
  SELECT $1,$2::bigint-(n::bigint*3600000),$3,$3,$3,$3,$3,$3 FROM generate_series(0,719) n ON CONFLICT(app_id,bucket) DO UPDATE SET requests=EXCLUDED.requests`,[c.own.id,now,maximum]);
 await c.native.query(`INSERT INTO usage_reasons(app_id,bucket,reason,requests)
  SELECT $1,$2::bigint-(n::bigint*3600000),reason,$3 FROM generate_series(0,719) n CROSS JOIN(VALUES('ACTIVE_LICENSE'),('DATABASE_UNAVAILABLE'),('LICENSE_REQUIRED'),('STALE_CHAIN')) reasons(reason)
  ON CONFLICT(app_id,bucket,reason) DO UPDATE SET requests=EXCLUDED.requests`,[c.own.id,now,maximum]);
 const cookie=[...c.admin.jar].map(([name,value])=>name+'='+value).join('; ');
 const response=await proxyHostedRequest(new Request(ORIGIN+c.own.path+'/usage',{headers:{cookie,origin:ORIGIN}}),{upstream:c.base});
 assert.equal(response.status,200);const body=await response.text();assert.ok(Buffer.byteLength(body)<=96*1024);const data=JSON.parse(body);
 assert.equal(data.schemaVersion,1);assert.equal(data.buckets[0].bucket,now);assert.ok(data.buckets.length>0&&data.buckets.length<720);
 for(const rows of[data.buckets,data.reasons])for(let i=1;i<rows.length;i++)assert.ok(rows[i-1].bucket>=rows[i].bucket);
 assert.equal(/pact_sk_dev_key_|pact_grant_/.test(body),false);
});
