import test from 'node:test';
import assert from 'node:assert/strict';
import {accessFixture} from './access-fixture.mjs';
import {Browser,ORIGIN} from './browser.mjs';
import {PROGRAM,GENESIS} from './rpc-fixture.mjs';
import {assertSecretAbsent} from './helpers.mjs';
import {request as httpRequest} from 'node:http';

const denied=r=>{assert.ok(r.status>=400,`expected denial, received ${r.status}`);assert.notEqual(r.data.decision,'ALLOW');};
const allow=(r,c)=>{
 assert.equal(r.status,200,JSON.stringify(r.data));assert.equal(r.data.decision,'ALLOW');assert.equal(r.data.reason,'ACTIVE_LICENSE');
 assert.equal(r.data.appId,c.own.id);assert.equal(r.data.resourceKey,'premium');assert.equal(r.data.offerAddress,c.offer.address);
 assert.equal(r.data.walletAddress,c.buyer.identity.address);assert.equal(r.data.network,'solana-devnet');assert.equal(r.data.programId,PROGRAM);
 assert.equal(r.data.resourceVersion,1);assert.equal(r.data.policyEpoch,'1');assert.match(r.data.expiresAt,/^[0-9]+$/);
 const f=r.data.freshness;assert.equal(f.maxAgeMs,8000);assert.equal(f.maxProgressAgeMs,12000);
 assert.ok(f.readStartedAtMs<=f.receivedAtMs&&f.receivedAtMs<=f.verifiedAtMs);
 assert.ok(f.verifiedAtMs<f.validUntilMs&&f.validUntilMs<=f.readStartedAtMs+8000);
 assert.ok(f.validUntilMs<=Number(r.data.expiresAt)*1000);assert.equal(r.data.verifiedAt,new Date(f.verifiedAtMs).toISOString());
 assertSecretAbsent(r.data,[c.own.key,c.buyer.walletGrant]);
};
async function fixture(t,options){const c=await accessFixture(options);t.after(()=>c.close());return c;}
async function entered(gate){let timer;try{await Promise.race([gate.entered,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('RPC was not reached')),2000);})]);}finally{clearTimeout(timer);}}

test('Phase4 real authorization denies missing, allows fresh license, denies exact expiry, preserves deactivation',async t=>{
 const c=await fixture(t);let r=await c.check();assert.equal(r.status,403);assert.equal(r.data.decision,'DENY');assert.equal(r.data.reason,'LICENSE_REQUIRED');
 assert.equal(r.data.walletAddress,c.buyer.identity.address);assert.equal(r.data.offerAddress,c.offer.address);
 assert.equal(r.data.purchase.metadata,'SELLER_EXACT_BYTES_REQUIRED');
 const link=new URL(r.data.purchase.url);assert.equal(link.origin,ORIGIN);assert.equal(link.pathname,'/');assert.equal(link.searchParams.get('offer'),c.offer.address);
 const license=c.license();r=await c.check();allow(r,c);
 const previousReads=c.rpc.calls.length;c.offer.active=false;r=await c.check();allow(r,c);assert.ok(c.rpc.calls.length>previousReads,'each successful check must perform a fresh RPC read');
 c.offer.active=true;license.expirySeconds=BigInt(Math.floor(c.clock.value/1000));
 r=await c.check();assert.equal(r.status,403);assert.equal(r.data.decision,'DENY');assert.equal(r.data.reason,'EXPIRED');
});

test('Phase4 strict request and principal boundaries reject client policy/wallet and wrong credentials',async t=>{
 const c=await fixture(t);c.license();allow(await c.check(),c);
 for(const override of [{walletAddress:c.admin.wallet.address},{offerAddress:c.offer.address},{programId:PROGRAM},{network:'mainnet-beta'},{appId:c.own.id}])
  assert.equal((await c.check({walletGrant:c.buyer.walletGrant,resourceKey:'premium',...override})).status,400);
 assert.equal((await c.check({walletGrant:c.buyer.walletGrant,resourceKey:'unknown'})).status,404);
 assert.equal((await c.check(undefined,'invalid')).status,401);
 assert.equal((await c.check({walletGrant:'pact_grant_invalid',resourceKey:'premium'})).status,401);
 const withOrigin=await c.admin.request('POST','/v1/access/check',{walletGrant:c.buyer.walletGrant,resourceKey:'premium'},{Authorization:`Bearer ${c.own.key}`});assert.equal(withOrigin.status,403);
});

test('Phase4 same seller and buyer may share one offer across apps while keys/grants remain app scoped',async t=>{
 const c=await fixture(t);c.license();const b=await c.app();
 assert.equal((await c.admin.mutate('POST',b.path+'/resources',b.id,'resource.bind',{resourceKey:'premium',offerAddress:c.offer.address})).status,200);
 const grantB=await c.grant(b,c.buyer.identity);
 allow(await c.check(),c);
 const result=await c.check({walletGrant:grantB.walletGrant,resourceKey:'premium'},b.key);assert.equal(result.status,200);assert.equal(result.data.appId,b.id);assert.equal(result.data.walletAddress,c.buyer.identity.address);
 assert.equal((await c.check({walletGrant:c.buyer.walletGrant,resourceKey:'premium'},b.key)).status,401);
 assert.equal((await c.check({walletGrant:grantB.walletGrant,resourceKey:'premium'},c.own.key)).status,401);
 const unrelated=new Browser(c.base);await unrelated.login();const foreignApp=await c.app(unrelated);
 denied(await unrelated.mutate('POST',foreignApp.path+'/resources',foreignApp.id,'resource.bind',{resourceKey:'stolen',offerAddress:c.offer.address}));
});

test('Phase4 hardened SDK denies wrong genesis, owner, program, context, Clock and embedded buyer',async t=>{
 const c=await fixture(t);c.license();allow(await c.check(),c);
 const cases=[
  ['genesis','not-devnet',GENESIS],['owner','11111111111111111111111111111111',PROGRAM],
  ['licenseOwner','11111111111111111111111111111111',PROGRAM],['programExecutable',false,true],
  ['contextSlotOffset',1,0],['timestampSeconds',Math.floor(c.clock.value/1000)-120,Math.floor(c.clock.value/1000)],
  ['corruptSnapshot',snapshot=>{const row=snapshot.value[1],bytes=Buffer.from(row.data[0],'base64');bytes[40]^=1;row.data[0]=bytes.toString('base64');},null],
  ['corruptSnapshot',snapshot=>{const row=snapshot.value[1],bytes=Buffer.from(row.data[0],'base64');bytes[8]^=1;row.data[0]=bytes.toString('base64');},null],
  ['fail',true,false],
 ];
 for(const [field,value,reset]of cases){
  c.rpc.state[field]=value;
  try{const r=await c.check();assert.equal(r.status,503,field);assert.equal(r.data.decision,'DENY',field);}
  finally{c.rpc.state[field]=reset;}
 }
 allow(await c.check(),c);
});

test('Phase4 disabled resource and expired grant deny before protected RPC work',async t=>{
 const c=await fixture(t);c.license();
 assert.equal((await c.admin.mutate('DELETE',c.own.path+'/resources/premium',c.own.id,'resource.update',
  {resourceKey:'premium',expectedVersion:1,enabled:false})).status,200);
 const fresh=await c.grant(),before=c.rpc.calls.length;
 const r=await c.check({walletGrant:fresh.walletGrant,resourceKey:'premium'});
 assert.equal(r.status,403);assert.equal(r.data.decision,'DENY');assert.equal(r.data.reason,'RESOURCE_DISABLED');assert.equal(c.rpc.calls.length,before);
 c.clock.value+=900000;
 assert.equal((await c.check({walletGrant:fresh.walletGrant,resourceKey:'premium'})).status,401);assert.equal(c.rpc.calls.length,before);
});

test('Phase4 retained history denies backwards and frozen chain evidence, then recovers on progress',async t=>{
 const c=await fixture(t);c.license();allow(await c.check(),c);
 const slot=c.rpc.state.slot;c.rpc.state.slot=slot-10;
 let r=await c.check();assert.equal(r.status,503);assert.equal(r.data.decision,'DENY');c.rpc.state.slot=slot;
 c.rpc.state.advanceSlot=false;c.clock.value+=12000;
 r=await c.check();assert.equal(r.status,503);assert.equal(r.data.decision,'DENY');
 c.rpc.state.advanceSlot=true;c.rpc.state.timestampSeconds=Math.floor(c.clock.value/1000);
 allow(await c.check(),c);
});

for(const action of ['revoke-key','revoke-grant','pause-app','rebind-policy','disable-owner'])
 test(`Phase4 ${action} during awaited real RPC prevents a late ALLOW`,async t=>{
  const c=await fixture(t);c.license();const gate=c.rpc.holdNextSnapshot();
  const pending=c.check();await entered(gate);
  try{
   let r;
   if(action==='revoke-key')r=await c.admin.mutate('POST',c.own.path+`/credentials/${c.own.credentialId}/revoke`,c.own.id,'credential.revoke',{credentialId:c.own.credentialId});
   if(action==='revoke-grant')r=await c.admin.backend('/v1/connect/revoke',c.own.key,{walletGrant:c.buyer.walletGrant});
   if(action==='pause-app')r=await c.admin.mutate('PATCH',c.own.path,c.own.id,'app.update',{status:'paused'});
   if(action==='rebind-policy'){
    const next=c.rpc.addOffer({seller:c.admin.wallet,nonce:2n});
    r=await c.admin.mutate('PATCH',c.own.path+'/resources/premium',c.own.id,'resource.update',{resourceKey:'premium',expectedVersion:1,offerAddress:next.address});
   }
   if(action==='disable-owner'){
    await c.native.query("UPDATE developer_accounts SET status='disabled' WHERE wallet=$1",[c.admin.wallet.address]);r={status:200};
   }
   assert.equal(r.status,200);
  }finally{gate.release();}
  denied(await pending);
 });

test('Phase4 final SQL overhead cannot reset fresh-read age or permit stale ALLOW',async t=>{
 const observed={armed:false,mark:0,triggered:false};
 const c=await fixture(t,{wrapDatabase:(native,{rpc,clock})=>{
  const lane=selected=>({...selected,transaction:async work=>{
    const result=await selected.transaction(work);
    if(observed.armed&&!observed.triggered&&rpc.calls.length>observed.mark){observed.triggered=true;clock.value+=8000;}
    return result;
  }});
  return{...native,...lane(native),protected:lane(native.protected)};
 }});
 c.license();allow(await c.check(),c);observed.armed=true;observed.mark=c.rpc.calls.length;
 const r=await c.check();assert.equal(observed.triggered,true,'must exercise actual post-read SQL transaction overhead');
 assert.equal(r.status,503);assert.equal(r.data.decision,'DENY');
});

test('Phase4 RPC deadline denies and releases capacity when held transport settles',async t=>{
 const c=await fixture(t);c.license();const gate=c.rpc.holdNextSnapshot(),started=Date.now(),pending=c.check();await entered(gate);
 let result;try{result=await pending;}finally{gate.release();}
 assert.equal(result.status,503);assert.equal(result.data.decision,'DENY');assert.ok(Date.now()-started<7000);
 await new Promise(resolve=>setTimeout(resolve,50));allow(await c.check(),c);
});

test('Phase4 per-app fairness preserves another app and rejects excess held reads',async t=>{
 const c=await fixture(t);c.license();const other=await c.app();
 assert.equal((await c.admin.mutate('POST',other.path+'/resources',other.id,'resource.bind',{resourceKey:'premium',offerAddress:c.offer.address})).status,200);
 const grant=await c.grant(other,c.buyer.identity),gates=[c.rpc.holdNextSnapshot(),c.rpc.holdNextSnapshot()];
 const held=[c.check(),c.check()];await Promise.all(gates.map(entered));
 try{
  const before=c.rpc.calls.length,r=await c.check();assert.equal(r.status,503);assert.equal(r.data.decision,'DENY');assert.equal(r.data.reason,'OVERLOADED');
  assert.equal(c.rpc.calls.length,before,'excess app work must not enter RPC');
  const allowed=await c.check({walletGrant:grant.walletGrant,resourceKey:'premium'},other.key);assert.equal(allowed.status,200);assert.equal(allowed.data.decision,'ALLOW');
  assert.equal((await c.admin.request('GET','/v1/developer/auth/session')).status,200);
  assert.ok(c.service.diagnostics().chain.access<=2);
 }finally{for(const gate of gates)gate.release();}
 for(const result of await Promise.all(held))allow(result,c);
});

async function until(predicate,message){
 const deadline=Date.now()+2000;while(!predicate()){if(Date.now()>deadline)throw Error(message);await new Promise(resolve=>setTimeout(resolve,10));}
}
test('Phase4 HTTP reservation withstands saturated non-access ingress and releases aborted callers',async t=>{
 const c=await fixture(t);c.license();const url=new URL(c.base),requests=[];
 function slow(path){
  const req=httpRequest({hostname:url.hostname,port:url.port,path,method:'POST',agent:false,headers:{origin:ORIGIN,
   cookie:[...c.admin.jar].map(([k,v])=>`${k}=${v}`).join('; '),'x-pact-csrf':c.admin.csrf,'content-type':'application/json','content-length':'500'}});
  req.on('error',()=>{});req.on('response',response=>response.resume());req.flushHeaders();req.write('{');requests.push(req);
 }
 try{
  for(let i=0;i<8;i++)slow('/v1/developer/apps');
  await until(()=>c.service.diagnostics().http.control===8,'control ingress did not reach its bounded cap');
  for(let i=0;i<8;i++)slow('/v1/developer/auth/challenge');
  await until(()=>c.service.diagnostics().http.control===8&&c.service.diagnostics().http.auth===8,'non-access lanes did not reach their bounded caps');
  assert.equal((await c.admin.request('GET','/v1/developer/apps')).status,503);
  assert.equal((await c.admin.request('GET','/v1/developer/auth/session')).status,503);
  allow(await c.check(),c);assert.equal((await c.admin.request('GET','/v1/health/live')).status,200);
 }finally{for(const req of requests)req.destroy();}
 await until(()=>c.service.diagnostics().http.control===0&&c.service.diagnostics().http.auth===0,'aborted ingress retained admission capacity');
 allow(await c.check(),c);
});

test('Phase4 database reservation and nonblocking telemetry preserve protected access',async t=>{
 const c=await fixture(t);c.license();let completed=0;
 const blocked=[0,1].map(()=>c.native.transaction(async tx=>{await tx.query('SELECT pg_sleep(1.2)');completed++;}));
 await until(()=>c.native.diagnostics().pending>=2,'control SQL lane was not occupied');
 const r=await c.check();allow(r,c);assert.equal(completed,0,'protected response waited for saturated control SQL lane');
 await Promise.all(blocked);await c.service.flushTelemetry();
 const usage=await c.admin.request('GET',c.own.path+'/usage');assert.equal(usage.status,200);
 assert.ok(usage.data.buckets.some(x=>x.allowed>=1&&x.requests>=1));assert.ok(usage.data.reasons.some(x=>x.reason==='ACTIVE_LICENSE'&&x.requests>=1));
 assertSecretAbsent(usage.data,[c.own.key,c.buyer.walletGrant]);
 const events=await c.admin.request('GET',c.own.path+'/events');assert.ok(events.data.events.some(x=>x.type==='access.allow'));
 assertSecretAbsent(events.data,[c.own.key,c.buyer.walletGrant]);
});

test('Phase4 readiness verifies actual chain and complete migration checksums',async t=>{
 const c=await fixture(t);
 let r=await c.admin.request('GET','/v1/health/ready');assert.equal(r.status,200);assert.equal(r.data.ready,true);
 c.rpc.state.genesis='wrong-network';r=await c.admin.request('GET','/v1/health/ready');assert.equal(r.status,503);
 c.rpc.state.genesis=GENESIS;
 const row=(await c.native.query('SELECT name,checksum FROM platform_migrations ORDER BY name DESC LIMIT 1')).rows[0];
 try{
  await c.native.query('UPDATE platform_migrations SET checksum=$1 WHERE name=$2',['invalid-test-checksum',row.name]);
  assert.equal((await c.admin.request('GET','/v1/health/ready')).status,503);
 }finally{await c.native.query('UPDATE platform_migrations SET checksum=$1 WHERE name=$2',[row.checksum,row.name]);}
 assert.equal((await c.admin.request('GET','/v1/health/ready')).status,200);
});

test('Phase4 telemetry parent locks cannot deadlock legitimate protected access',{timeout:15000},async t=>{
 let armed=false,probe=false,telemetryPid,protectedPid,deadlocks=0;
 let releaseTelemetry,markTelemetry,markProtected;
 const held=new Promise(resolve=>releaseTelemetry=resolve),telemetryEntered=new Promise(resolve=>markTelemetry=resolve),protectedEntered=new Promise(resolve=>markProtected=resolve);
 const pending=[];
 async function bounded(promise){let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Owned SQL barrier did not progress')),2000);})]);}finally{clearTimeout(timer);}}
 const c=await accessFixture({wrapDatabase:native=>{
  const transaction=(lane,control)=>work=>lane.transaction(async tx=>{
   if(!control&&probe){protectedPid=Number((await tx.query('SELECT pg_backend_pid() AS pid')).rows[0].pid);markProtected();}
   return work({query:async(sql,values)=>{
    let result;
    try{result=await tx.query(sql,values);}catch(error){if(error?.code==='40P01')deadlocks++;throw error;}
    if(control&&armed&&sql.startsWith('INSERT INTO usage_aggregates')){
     armed=false;telemetryPid=Number((await tx.query('SELECT pg_backend_pid() AS pid')).rows[0].pid);markTelemetry();await held;
    }
    return result;
   }});
  });
  return{...native,transaction:transaction(native,true),protected:{...native.protected,transaction:transaction(native.protected,false)}};
 }});
 t.after(async()=>{releaseTelemetry();await Promise.allSettled(pending);await c.close();});
 c.license();armed=true;
 const first=c.check();pending.push(first);
 await bounded(telemetryEntered);
 assert.equal((await bounded(first)).status,200,'initial fresh access must succeed before the held telemetry transaction');
 probe=true;const second=c.check();pending.push(second);await bounded(protectedEntered);
 // Observe an actual PostgreSQL lock wait, not a scheduler delay. Before the
 // fix this waits on app after owner; afterward it safely waits on owner first.
 let blocked=false,blockedOnOwner=false,blockedOnApplication=false;const deadline=performance.now()+1500;
 while(performance.now()<deadline){
  const row=(await c.native.query(`SELECT wait_event_type='Lock' AND $1::integer=ANY(pg_blocking_pids(pid)) AS blocked,
    query LIKE 'SELECT id,status FROM developer_accounts%FOR UPDATE' AS owner_wait,
    query LIKE 'SELECT * FROM developer_applications%FOR UPDATE' AS app_wait
    FROM pg_stat_activity WHERE pid=$2::integer`,[telemetryPid,protectedPid])).rows[0];
  if(row?.blocked===true){blocked=true;blockedOnOwner=row.owner_wait;blockedOnApplication=row.app_wait;break;}
  await new Promise(resolve=>setTimeout(resolve,10));
 }
 assert.equal(blocked,true,'protected transaction must actually wait on the held telemetry parent lock');
 releaseTelemetry();const response=await second;await c.service.flushTelemetry();
 t.diagnostic(JSON.stringify({kind:'telemetry-parent-lock-regression',actualParentLockWait:blocked,blockedOnOwner,blockedOnApplication,sqlDeadlocks:deadlocks,
  protectedHttpStatus:response.status,telemetryFailures:c.service.telemetry.diagnostics().failures}));
 assert.equal(response.status,200,'legitimate protected access must survive concurrent telemetry');
 assert.equal(response.data.decision,'ALLOW');assert.equal(response.data.reason,'ACTIVE_LICENSE');
 assert.equal(deadlocks,0,'owner/application parent locking must not form a PostgreSQL deadlock');
 assert.equal(c.service.telemetry.diagnostics().failures,0,'telemetry must commit rather than win by being discarded');
});

test('Phase4 independent key and app quotas deny excess requests without chain work',async t=>{
 const c=await fixture(t),keys=[c.own.key];
 for(let i=0;i<2;i++){
  const issued=await c.admin.mutate('POST',c.own.path+'/credentials',c.own.id,'credential.create',
   {name:`quota key ${i}`,scopes:['access:check'],expiresAt:c.clock.value+3600000});assert.equal(issued.status,200);keys.push(issued.data.secret);
 }
 const body={walletGrant:c.buyer.walletGrant,resourceKey:'unknown'},before=c.rpc.calls.length;
 for(let i=0;i<60;i++)assert.equal((await c.check(body,keys[0])).status,404);
 assert.equal((await c.check(body,keys[0])).status,429);
 // The rejected 61st attempt consumed one app budget entry, leaving 59 for key two.
 for(let i=0;i<59;i++)assert.equal((await c.check(body,keys[1])).status,404);
 assert.equal((await c.check(body,keys[2])).status,429,'fresh key cannot bypass exhausted app quota');
 assert.equal(c.rpc.calls.length,before,'quota and unknown-resource denials must not reach RPC');
});

test('Phase4 positive freshness is capped by key/grant leases and exact auth expiry denies',async t=>{
 const c=await fixture(t);c.license();
 await c.native.query('UPDATE api_credentials SET expires_at=$1 WHERE id=$2',[c.clock.value+1000,c.own.credentialId]);
 let r=await c.check();allow(r,c);assert.equal(r.data.freshness.validUntilMs,c.clock.value+1000);
 await c.native.query('UPDATE api_credentials SET expires_at=$1 WHERE id=$2',[c.clock.value+3600000,c.own.credentialId]);
 await c.native.query('UPDATE wallet_grants SET expires_at=$1 WHERE app_id=$2',[c.clock.value+500,c.own.id]);
 r=await c.check();allow(r,c);assert.equal(r.data.freshness.validUntilMs,c.clock.value+500);
 await c.native.query('UPDATE api_credentials SET expires_at=$1 WHERE id=$2',[c.clock.value,c.own.credentialId]);
 assert.equal((await c.check()).status,401);
 await c.native.query('UPDATE api_credentials SET expires_at=$1 WHERE id=$2',[c.clock.value+3600000,c.own.credentialId]);
 await c.native.query('UPDATE wallet_grants SET expires_at=$1 WHERE app_id=$2',[c.clock.value,c.own.id]);
 assert.equal((await c.check()).status,401);
});
