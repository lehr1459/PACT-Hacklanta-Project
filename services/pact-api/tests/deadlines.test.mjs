import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import {setTimeout as delay} from 'node:timers/promises';
import {fixture,client} from './fixtures.mjs';

function request(url,{method='GET',headers={},partialBody,body}={}){
  return new Promise((resolve,reject)=>{
    const pending=http.request(url,{method,headers},response=>{
      let body='';response.setEncoding('utf8');response.on('data',chunk=>body+=chunk);
      response.on('end',()=>{pending.destroy();resolve({status:response.statusCode,headers:response.headers,json:JSON.parse(body)});});
    });
    pending.on('error',reject);pending.setTimeout(3000,()=>pending.destroy(Error('test transport ceiling')));
    if(partialBody!==undefined)pending.write(partialBody);else pending.end(body===undefined?undefined:JSON.stringify(body));
  });
}

test('actual HTTP slow body receives bounded safe deadline and releases its admission',async t=>{
  const service=await fixture({requestDeadlineMs:200});t.after(()=>service.cleanup());
  await service.server.listen({host:'127.0.0.1',port:0});
  const url=`http://127.0.0.1:${service.server.server.address().port}`;
  const started=performance.now();
  const response=await request(`${url}/v1/developer/auth/challenge`,{method:'POST',headers:{'content-type':'application/json','content-length':'100'},partialBody:'{'});
  assert.equal(response.status,503);assert.equal(response.json.error.code,'REQUEST_DEADLINE');
  assert.equal(response.headers.connection,'close');assert.ok(performance.now()-started<2000);
  await delay(20);assert.equal(service.diagnostics().http.active,0);
  assert.equal((await request(`${url}/v1/health/live`)).status,200);
});

test('actual HTTP timeout retains running handler and chain capacity until uncooperative work settles',async t=>{
  let entered,release;const reached=new Promise(resolve=>entered=resolve),held=new Promise(resolve=>release=resolve);
  const service=await fixture({requestDeadlineMs:200,activeLimit:4,reader:{async readiness(){entered();await held;
    return{ready:true,network:'devnet',programId:'EiiiWWsW2kkqP6nugHz6iBADvhnW5xnibAtZ82ZExVqy',contextSlot:100,startedAtMs:Date.now()};}}});
  t.after(()=>service.cleanup());await service.server.listen({host:'127.0.0.1',port:0});
  const url=`http://127.0.0.1:${service.server.server.address().port}`;
  const pending=request(`${url}/v1/health/ready`);await reached;
  const response=await pending;assert.equal(response.status,503);assert.equal(response.json.error.code,'REQUEST_DEADLINE');
  assert.equal(service.diagnostics().http.active,1);assert.equal(service.diagnostics().chain.control,1);
  assert.equal((await request(`${url}/v1/health/ready`)).json.error.code,'OVERLOADED');
  assert.equal((await request(`${url}/v1/health/live`)).status,200);
  release();await delay(30);assert.equal(service.diagnostics().http.active,0);assert.equal(service.diagnostics().chain.control,0);
});

test('expired handler cannot commit a signed mutation after its final SQL work settles',async t=>{
  const service=await fixture({requestDeadlineMs:250});let release,entered;
  t.after(async()=>{release?.();await service.cleanup();});const admin=await client(service);
  const app=(await admin.request('POST','/v1/developer/apps',{name:'Deadline fixture',framework:'rest'})).json.app;
  const payload={name:'Must roll back'},proof=await admin.proof('app.update',app.id,payload);
  const original=service.database.transaction.bind(service.database);
  const held=new Promise(resolve=>release=resolve),reached=new Promise(resolve=>entered=resolve);
  service.database.transaction=work=>original(tx=>work({query:async(sql,values)=>{
    const result=await tx.query(sql,values);
    if(sql.startsWith('INSERT INTO security_audit_events')){entered();await held;}
    return result;
  }}));
  const base=await service.server.listen({host:'127.0.0.1',port:0}),started=performance.now();
  const pending=request(`${base}/v1/developer/apps/${app.id}`,{method:'PATCH',body:{payload,proof},headers:{
    'content-type':'application/json',origin:service.options.origin,'x-pact-csrf':admin.csrf,
    cookie:[...admin.jar].map(([key,value])=>`${key}=${value}`).join('; ')}});await reached;
  const response=await pending;assert.equal(response.status,503);assert.equal(response.json.error.code,'REQUEST_DEADLINE');
  assert.ok(performance.now()-started<1500,'completed body must not cancel the handler deadline and wait for5s socket idle');
  assert.equal(service.diagnostics().http.active,1,'a sent timeout must not release running SQL work');
  release();await delay(30);
  const row=(await service.database.query('SELECT name FROM developer_applications WHERE id=$1',[app.id])).rows[0];
  assert.equal(row.name,'Deadline fixture');assert.equal(service.diagnostics().http.active,0);
  assert.equal((await service.database.query('SELECT consumed_at FROM action_challenges WHERE id=$1',[proof.challengeId])).rows[0].consumed_at,null);
});

test('actual HTTP incomplete headers cannot extend receipt indefinitely by trickling bytes',async t=>{
  const service=await fixture();t.after(()=>service.cleanup());await service.server.listen({host:'127.0.0.1',port:0});
  assert.ok(service.server.server.listenerCount('clientError')>0,'observe the existing framework handler without replacing timeout behavior');
  // Fastify writes408 then destroys the socket; a writing peer may see reset
  // before response bytes. Verify the timeout itself, not a delivery guarantee.
  const serverErrors=new Set(),observe=error=>serverErrors.add(error.code);service.server.server.on('clientError',observe);t.after(()=>service.server.server.off('clientError',observe));
  let requestEvents=0;const observeRequest=()=>requestEvents++;service.server.server.on('request',observeRequest);t.after(()=>service.server.server.off('request',observeRequest));
  const started=performance.now();let timer,ceiling,socket;
  const result=await new Promise(resolve=>{
    socket=net.createConnection({host:'127.0.0.1',port:service.server.server.address().port});let body='',transportError=null;
    socket.setEncoding('utf8');ceiling=setTimeout(()=>socket.destroy(Object.assign(Error('header test absolute transport ceiling'),{code:'FIXTURE_TRANSPORT_CEILING'})),8000);
    socket.on('connect',()=>{socket.write('POST /v1/developer/auth/challenge HTTP/1.1\r\nHost: localhost\r\nX-Trickle: ');
      timer=setInterval(()=>socket.write('a'),100);});
    socket.on('data',chunk=>{body+=chunk;clearInterval(timer);});socket.on('end',()=>clearInterval(timer));socket.on('error',error=>{clearInterval(timer);transportError=error.code??'UNCLASSIFIED';});socket.on('close',()=>resolve({body,transportError}));
  }).finally(()=>{clearInterval(timer);clearTimeout(ceiling);socket?.destroy();});
  assert.ok(/^HTTP\/1\.1 408 /.test(result.body)||result.body===''&&result.transportError==='ECONNRESET','header timeout must send408 or close with the observed timeout reset');
  assert.ok(result.transportError===null||result.transportError==='ECONNRESET');assert.ok(serverErrors.has('ERR_HTTP_REQUEST_TIMEOUT'));
  const elapsed=performance.now()-started;assert.ok(elapsed>=4500&&elapsed<7500,'the configured five-second deadline must cause the denial');
  assert.equal(service.diagnostics().http.active,0,'incomplete headers must not acquire application admission');
  assert.equal(requestEvents,0,'incomplete headers must not reach a request handler');
  assert.equal((await service.server.inject({method:'GET',url:'/v1/health/live'})).statusCode,200);
});
