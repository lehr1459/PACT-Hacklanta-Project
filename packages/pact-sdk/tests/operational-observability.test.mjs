import test from 'node:test';
import assert from 'node:assert/strict';
import {setImmediate as immediate} from 'node:timers/promises';
import {execFileSync} from 'node:child_process';
import {createPactApiHandler,PlatformError} from '../dist/server.js';
import {PactError} from '../dist/index.js';
import {controlledRpc,signer,offer,ORIGIN} from '../../../web/tests/platform/fixtures.mjs';

const OFFER=offer.toBase58(),PRIVATE='PRIVATE_DIAGNOSTIC_SENTINEL',UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const OPERATIONS=['unknown','preflight','health.live','health.ready','auth.challenge','auth.verify','auth.session','auth.logout','offer.get','offer.metadata','offer.prepare','checkout.prepare','license.get','license.verify','transaction.get','protected.get','resource.get','resource.post'];
const FAILURES=['success','license-expired','license-invalid','auth','rpc-outage','chain-invalid','timeout','overload','metadata','application','input','not-found','configuration'];
const ALLOWED=['getGenesisHash','getMultipleAccounts','getLatestBlockhash','getSignatureStatuses','getBlockHeight','isBlockhashValid'];
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve};};
async function flush(){await immediate();await immediate();}
function harness(t,options={}){
 const identity=signer(),rpc=controlledRpc(identity.wallet),jar=new Map();
 const e={identity,rpc,events:[],calls:[],sensitive:[PRIVATE,identity.wallet],now:1000000,preparations:0,commits:0,override:undefined,prepare:undefined,onEvent:undefined};
 const fetch=async(url,init)=>{
  const q=JSON.parse(init.body);e.calls.push({q,url:String(url),signal:init.signal});
  const custom=await e.override?.({q,url:String(url),signal:init.signal});if(custom!==undefined)return custom;
  const response=await rpc.fetch(url,init);
  if(q.method==='getMultipleAccounts'&&q.params[0].length===2){const body=await response.json();body.result.value=[body.result.value[2],body.result.value[3]];return Response.json(body);}
  return response;
 };
 e.handler=createPactApiHandler({origin:ORIGIN,authMode:'single-process',now:()=>e.now,rpcUrl:'https://provider.invalid/?credential='+PRIVATE,fetch,
  resources:{asset:{offer:OFFER,prepare:context=>{e.preparations++;return e.prepare?e.prepare(context):{body:PRIVATE,commit:()=>{e.commits++;}};}}},
  diagnostics:{onEvent:event=>{e.events.push(event);return e.onEvent?.(event);}},...options});
 e.send=async(path,{method='GET',body,headers={},signal,authenticated=true}={})=>{
  const h=new Headers(headers);h.set('origin',ORIGIN);
  if(authenticated)h.set('cookie',[...jar].map(([key,value])=>key+'='+value).join('; '));
  if(body!==undefined)h.set('content-type','application/json');
  const response=await e.handler(new Request(ORIGIN+'/api/v1'+path,{method,headers:h,signal,...(body!==undefined?{body:typeof body==='string'?body:JSON.stringify(body)}:{})}));
  for(const cookie of response.headers.getSetCookie()){const pair=cookie.split(';')[0],i=pair.indexOf('=');if(pair.slice(i+1)){jar.set(pair.slice(0,i),pair.slice(i+1));e.sensitive.push(pair.slice(i+1));}else jar.delete(pair.slice(0,i));}
  return response;
 };
 e.authenticate=async()=>{
  const challenge=await e.send('/auth/challenge',{method:'POST',body:{walletAddress:identity.wallet}});assert.equal(challenge.status,200);
  const data=await challenge.json(),signatureBase64=identity.signMessage(data.message);e.sensitive.push(data.challengeId,signatureBase64,data.message);
  const proof=await e.send('/auth/verify',{method:'POST',body:{challengeId:data.challengeId,signatureBase64}});
  assert.equal(proof.status,200);assert.equal((await proof.json()).walletAddress,identity.wallet);
 };
 t.after(()=>assert.deepEqual(e.calls.filter(({q})=>!ALLOWED.includes(q.method)),[],'No signing, simulation or transaction submission RPC'));
 return e;
}
function eventContract(event){
 assert.deepEqual(Object.keys(event).sort(),['schemaVersion','requestId','operation','method','status','durationMs','failure'].sort());
 assert.equal(event.schemaVersion,1);assert.match(event.requestId,UUID);assert.ok(OPERATIONS.includes(event.operation));assert.ok(FAILURES.includes(event.failure));
 assert.ok(['GET','POST','OPTIONS','OTHER'].includes(event.method));assert.ok(Number.isInteger(event.status)&&event.status>=200&&event.status<=599);
 assert.ok(Number.isFinite(event.durationMs)&&event.durationMs>=0&&event.durationMs<=86400000);assert.equal(Object.isFrozen(event),true);
}
function deeplyFrozen(value){if(value&&typeof value==='object'){assert.equal(Object.isFrozen(value),true);for(const item of Object.values(value))deeplyFrozen(item);}}

test('all response paths receive distinct server UUIDs and finite immutable terminal events',async t=>{
 const e=harness(t),ids=[];
 for(const [path,init,status] of [
  ['/health/live',{},200],['/unknown-'+PRIVATE,{},404],['/health/live',{method:'PATCH'},404],
  ['/offers/'+OFFER,{method:'OPTIONS'},204],['/resources/asset',{authenticated:false},401],
  ['/offers/'+OFFER+'?private='+PRIVATE,{},400],['/auth/challenge',{method:'POST',body:'{'},400],
 ]){
  const before=e.events.length,response=await e.send(path,{...init,headers:{'x-pact-request-id':PRIVATE.repeat(1000),'x-request-id':PRIVATE}});
  assert.equal(response.status,status);assert.equal(e.events.length,before+1);const id=response.headers.get('x-pact-request-id');assert.match(id,UUID);ids.push(id);
  const event=e.events.at(-1);eventContract(event);assert.equal(event.requestId,id);assert.equal(event.status,status);
 }
 assert.equal(new Set(ids).size,ids.length);assert.equal(e.events[2].method,'OTHER');assert.equal(e.events[3].operation,'preflight');
 assert.equal(e.handler.metrics().requests,ids.length);assert.ok(!JSON.stringify(e.events).includes(PRIVATE));
});

test('real wallet proof and private commit remain independent of diagnostic failures',async t=>{
 for(const kind of ['plain','platform','pact','rejected','then-getter','fulfilled-native-then-getter','mutation'])await t.test(kind,async t=>{
  const e=harness(t),unhandled=[];const listener=value=>unhandled.push(value);process.on('unhandledRejection',listener);t.after(()=>process.off('unhandledRejection',listener));
  e.onEvent=event=>{
   if(kind==='plain')throw Error(PRIVATE);
   if(kind==='platform')throw new PlatformError('AUTH_INVALID',PRIVATE,401);
   if(kind==='pact')throw new PactError('RPC_ERROR',PRIVATE);
   if(kind==='rejected')return Promise.reject(Error(PRIVATE));
   if(kind==='mutation'){event.failure='auth';return;}
   const value=kind==='fulfilled-native-then-getter'?Promise.resolve():{};
   Object.defineProperty(value,'then',{get(){throw Error(PRIVATE);}});return value;
  };
  await e.authenticate();const response=await e.send('/resources/asset');assert.equal(response.status,200);assert.equal(await response.text(),PRIVATE);
  assert.equal(e.preparations,1);assert.equal(e.commits,1);await flush();assert.deepEqual(unhandled,[]);
  if(kind!=='fulfilled-native-then-getter')assert.ok(e.handler.metrics().observer.failures>0);
  assert.equal(e.events.at(-1).failure,'success');assert.ok(!JSON.stringify(e.events).includes(PRIVATE));
 });
});

test('a rejected native Promise with hostile own then getter never becomes unhandled',()=>{
 // Isolate Node's unhandled-rejection reporting; this is the actual exported handler.
 const module=new URL('../dist/server.js',import.meta.url).href;
 const script=`const {createPactApiHandler}=await import(${JSON.stringify(module)});let errors=0,getters=0;process.on('unhandledRejection',()=>errors++);const h=createPactApiHandler({origin:'http://localhost:3100',diagnostics:{onEvent(){const p=Promise.reject(Error('private'));Object.defineProperty(p,'then',{get(){getters++;throw Error('private getter')}});return p;}}});const r=await h(new Request('http://localhost:3100/api/v1/health/live'));await new Promise(resolve=>setTimeout(resolve,20));if(r.status!==200||errors!==0||getters!==0||h.metrics().observer.pending!==0)throw Error('Diagnostic Promise escaped isolation');`;
 assert.doesNotThrow(()=>execFileSync(process.execPath,['--input-type=module','-e',script],{stdio:'pipe',windowsHide:true,timeout:5000}));
});

test('invalid cyclic thenables are refused without reading a getter or invoking a resolution loop',()=>{
 const module=new URL('../dist/server.js',import.meta.url).href;
 // A future regression is killed in this child rather than starving the test runner.
 const script=`const {createPactApiHandler}=await import(${JSON.stringify(module)});let getters=0,calls=0;const value={};Object.defineProperty(value,'then',{get(){getters++;return resolve=>{calls++;resolve(value)}}});const h=createPactApiHandler({origin:'http://localhost:3100',diagnostics:{onEvent(){return value;}}});const r=await h(new Request('http://localhost:3100/api/v1/health/live'));await new Promise(resolve=>setImmediate(resolve));const m=h.metrics();if(r.status!==200||getters!==0||calls!==0||m.observer.failures!==1||m.observer.pending!==0)throw Error('Invalid diagnostic thenable was assimilated');`;
 assert.doesNotThrow(()=>execFileSync(process.execPath,['--input-type=module','-e',script],{stdio:'pipe',windowsHide:true,timeout:5000}));
});

test('unsettled diagnostic hooks are capped at four and dropped without delaying grants',async t=>{
 const e=harness(t),held=deferred();t.after(()=>held.resolve());e.onEvent=()=>held.promise;
 await e.authenticate();assert.equal((await e.send('/resources/asset')).status,200);
 for(let i=0;i<9;i++)assert.equal((await e.send('/health/live')).status,200);
 const snapshot=e.handler.metrics();assert.equal(snapshot.requests,12);assert.equal(snapshot.observer.pending,4);assert.equal(snapshot.observer.dropped,8);assert.equal(e.commits,1);
 held.resolve();await flush();assert.equal(e.handler.metrics().observer.pending,0);assert.equal(e.handler.metrics().requests,12);
});

test('failure classification distinguishes successful negative lookup, authorization and upstream failures',async t=>{
 for(const kind of ['expired-public','missing-public','expired-protected','missing-protected','auth','rpc','stale','metadata','overload','application','prepared-oversize','input','configuration','not-found'])await t.test(kind,async t=>{
  const e=harness(t,kind==='overload'?{requestBudgets:{public:{perMinute:1}}}:{});let path='/resources/asset',status=403,failure;
  if(kind.endsWith('protected')||kind==='application'||kind==='prepared-oversize')await e.authenticate();
  if(kind.startsWith('expired')){e.rpc.state.expiry=999n;failure='license-expired';}
  if(kind.startsWith('missing')){e.rpc.state.missing=true;failure='license-invalid';}
  if(kind.endsWith('public')){path='/licenses/'+OFFER+'/'+e.identity.wallet;status=200;}
  if(kind==='auth'){status=401;failure='auth';}
  if(kind==='rpc'){e.rpc.state.fail=true;path='/offers/'+OFFER;status=503;failure='rpc-outage';}
  if(kind==='stale'){e.rpc.state.timestamp=900n;path='/offers/'+OFFER;status=503;failure='chain-invalid';}
  if(kind==='metadata'){path='/offers/'+OFFER+'/metadata';status=404;failure='metadata';}
  if(kind==='overload'){path='/offers/'+OFFER;assert.equal((await e.send(path)).status,200);status=429;failure='overload';}
  if(kind==='application'){e.prepare=()=>{throw new PlatformError('AUTH_INVALID',PRIVATE,401);};status=500;failure='application';}
  if(kind==='prepared-oversize'){e.prepare=()=>({body:'x'.repeat(1048577)});status=500;failure='application';}
  if(kind==='input'){path='/offers/'+OFFER+'?wallet='+PRIVATE;status=400;failure='input';}
  if(kind==='configuration'){path='/protected';status=503;failure='configuration';}
  if(kind==='not-found'){path='/unknown-'+PRIVATE;status=404;failure='not-found';}
  const response=await e.send(path);assert.equal(response.status,status);assert.equal(e.events.at(-1).failure,failure);eventContract(e.events.at(-1));
  assert.equal(e.commits,0);assert.ok(!JSON.stringify(e.events).includes(PRIVATE));assert.ok(!JSON.stringify(e.handler.metrics()).includes(e.identity.wallet));
 });
});

test('metrics snapshots are deeply immutable, fixed-cardinality and isolated per handler',async t=>{
 const e=harness(t),other=harness(t),before=e.handler.metrics();deeplyFrozen(before);
 await e.authenticate();for(let i=0;i<40;i++)await e.send('/unknown-'+PRIVATE+i,{method:i%2?'PATCH':'GET'});
 const after=e.handler.metrics();deeplyFrozen(after);
 assert.equal(before.requests,0);assert.equal(other.handler.metrics().requests,0);assert.equal(after.requests,42);
 for(const key of ['byOperation','byFailure','byStatus','latencyMs'])assert.deepEqual(Object.keys(after[key]),Object.keys(before[key]));
 assert.equal(Object.values(after.byOperation).reduce((a,b)=>a+b,0),after.requests);assert.equal(Object.values(after.byStatus).reduce((a,b)=>a+b,0),after.requests);
 assert.equal(Object.values(after.latencyMs).reduce((a,b)=>a+b,0),after.requests);
 assert.throws(()=>{after.gauges.auth.storedSessions=999;},TypeError);assert.equal(e.handler.metrics().gauges.auth.storedSessions,1);
 assert.throws(()=>{after.byOperation.unknown=999;},TypeError);assert.ok(!JSON.stringify(after).includes(PRIVATE));assert.ok(!JSON.stringify(after).includes(e.identity.wallet));
});

test('diagnostics, metrics and failure output exclude cookies, proofs, private bytes and provider URLs',async t=>{
 const e=harness(t),logged=[],original={log:console.log,warn:console.warn,error:console.error};
 for(const key of Object.keys(original))console[key]=(...args)=>logged.push(args.map(String).join(' '));
 t.after(()=>Object.assign(console,original));
 await e.authenticate();assert.equal((await e.send('/resources/asset')).status,200);
 e.prepare=()=>{throw new PlatformError('INTERNAL_ERROR',PRIVATE,500);};const failure=await e.send('/resources/asset');assert.equal(failure.status,500);
 e.rpc.state.fail=true;const outage=await e.send('/offers/'+OFFER);assert.equal(outage.status,503);
 const exposed=JSON.stringify({events:e.events,metrics:e.handler.metrics(),logged,failure:await failure.text(),outage:await outage.text()});
 for(const secret of [...e.sensitive,'provider.invalid'])assert.ok(!exposed.includes(secret),'Operational output exposed private diagnostic material');
 assert.equal(e.commits,1);assert.equal(e.events.at(-1).failure,'rpc-outage');
});

for(const kind of ['fetch','body','prepare'])test(`cancelled ignored ${kind} work retains its true gauge and emits one terminal event`,async t=>{
 const e=harness(t),held=deferred(),entered=deferred(),abort=new AbortController();t.after(()=>held.resolve());
 await e.authenticate();const baseline=e.events.length;
 if(kind==='prepare')e.prepare=async()=>{entered.resolve();await held.promise;return{body:PRIVATE,commit:()=>{e.commits++;}};};
 else e.override=async({q})=>{
  if(q.method!=='getMultipleAccounts')return;
  if(kind==='fetch'){entered.resolve();await held.promise;throw Error(PRIVATE);}
  return{ok:true,headers:new Headers(),body:{getReader:()=>({read:async()=>{entered.resolve();await held.promise;return{done:true};},cancel:async()=>{},releaseLock(){}})}};
 };
 const pending=e.send('/resources/asset',{signal:abort.signal});await entered.promise;abort.abort();
 const response=await pending;assert.equal(response.status,408);await flush();assert.equal(e.events.length,baseline+1);assert.equal(e.events.at(-1).failure,'timeout');
 const gauges=e.handler.metrics().gauges;
 if(kind==='prepare'){assert.equal(gauges.http.protected.quarantined,1);assert.equal(gauges.http.protected.inflight,0);}
 else assert.equal(gauges.rpc.protected.quarantined,1);
 held.resolve();await flush();await flush();assert.equal(e.events.length,baseline+1);assert.equal(e.commits,0);
 assert.equal(e.handler.metrics().gauges.http.protected.active,0);assert.equal(e.handler.metrics().gauges.rpc.protected.quarantined,0);
});

test('actual five-second resource timeout reports held preparation and late cleanup once',async t=>{
 const e=harness(t),held=deferred(),entered=deferred();t.after(()=>held.resolve());await e.authenticate();
 e.prepare=async()=>{entered.resolve();await held.promise;return{body:PRIVATE,commit:()=>{e.commits++;}};};
 const start=performance.now(),pending=e.send('/resources/asset');await entered.promise;const before=e.events.length;
 const response=await pending;assert.equal(response.status,408);assert.ok(performance.now()-start>=4900&&performance.now()-start<7000);
 assert.equal(e.events.length,before+1);assert.equal(e.handler.metrics().gauges.http.protected.quarantined,1);
 held.resolve();await flush();assert.equal(e.events.length,before+1);assert.equal(e.handler.metrics().gauges.http.protected.active,0);assert.equal(e.commits,0);
});

test('readiness is fresh and public saturation leaves liveness, authentication and protected workers available',async t=>{
 const e=harness(t),held=deferred(),entered=deferred();t.after(()=>held.resolve());
 assert.equal((await e.send('/health/live')).status,200);assert.equal(e.calls.length,0);
 assert.equal((await e.send('/health/ready')).status,200);assert.equal((await e.send('/health/ready')).status,200);
 assert.equal(e.calls.filter(({q})=>q.method==='getGenesisHash').length,2);
 assert.ok(e.calls.filter(({q})=>q.method==='getMultipleAccounts').every(({q})=>q.params[0].length===2));
 const before=e.calls.length;let blocked=0;
 e.override=async({q})=>{if(q.method==='getGenesisHash'&&blocked<4){blocked++;if(blocked===4)entered.resolve();await held.promise;throw Error(PRIVATE);}};
 const controllers=Array.from({length:4},()=>new AbortController());const waiting=controllers.map(c=>e.send('/health/ready',{signal:c.signal}));await entered.promise;
 assert.equal(e.handler.metrics().gauges.rpc.public.inflight,4);assert.equal(e.handler.metrics().gauges.rpc.protected.inflight,0);
 assert.equal((await e.send('/health/live')).status,200);assert.equal(e.calls.length,before+4);
 await e.authenticate();assert.equal((await e.send('/resources/asset')).status,200);assert.equal(e.commits,1);
 controllers.forEach(c=>c.abort());assert.ok((await Promise.all(waiting)).every(r=>r.status===408));await flush();
 assert.equal(e.handler.metrics().gauges.rpc.public.quarantined,4);assert.equal(e.handler.metrics().gauges.rpc.protected.quarantined,0);
 held.resolve();await flush();assert.equal(e.handler.metrics().gauges.rpc.public.quarantined,0);
 e.override=undefined;e.rpc.state.fail=true;assert.equal((await e.send('/health/ready')).status,503);e.rpc.state.fail=false;
 assert.equal((await e.send('/health/ready')).status,200);
});
