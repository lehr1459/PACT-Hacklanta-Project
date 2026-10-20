import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {fixture,client,wallet} from './fixtures.mjs';
const PROGRAM='EiiiWWsW2kkqP6nugHz6iBADvhnW5xnibAtZ82ZExVqy',OFFER='11111111111111111111111111111111';
async function setup(beforeReady){
  const state={mode:'active',seller:null,hold:null,quarantined:0,calls:0};let service;
  const reader={
    diagnostics:()=>({quarantined:state.quarantined}),
    async getOffer({offer}){return{offer,program:PROGRAM,seller:state.seller,active:true,contextSlot:100,
      startedAtMs:service.clock.value,receivedAtMs:service.clock.value};},
    async getLicenseStatus({offer,wallet}){
      state.calls++;const time=service.clock.value;
      const status={program:PROGRAM,offer,wallet,licensePda:OFFER,contextSlot:101,chainTimestamp:String(Math.floor(time/1000)),
        expiry:state.mode==='missing'?'0':String(Math.floor(time/1000)+(state.mode==='expired'?0:60)),state:state.mode,active:state.mode==='active',
        startedAtMs:time,receivedAtMs:time,lastProgressAtMs:time};
      if(state.hold)await state.hold();if(state.mode==='rpc-error')throw Error('private-provider-error');
      return status;
    },
    async readiness(){return{ready:true,network:'devnet',programId:PROGRAM,contextSlot:101,startedAtMs:service.clock.value,receivedAtMs:service.clock.value};},
  };
  service=await fixture({reader,beforeReady});
  const admin=await client(service);state.seller=admin.identity.address;
  const app=(await admin.request('POST','/v1/developer/apps',{name:'Access fixture',framework:'rest'})).json.app;
  const url=`/v1/developer/apps/${app.id}`;
  await admin.mutation('PATCH',url,'app.update',app.id,{status:'active'});
  assert.equal((await admin.mutation('POST',`${url}/resources`,'resource.bind',app.id,{resourceKey:'premium',offerAddress:OFFER})).status,200);
  const minted=(await admin.mutation('POST',`${url}/credentials`,'credential.create',app.id,
    {name:'Backend',scopes:['access:check','connect:write'],expiresAt:service.clock.value+3600000})).json;
  const buyer=wallet(),grant=`pact_grant_${randomBytes(32).toString('base64url')}`;
  // Explicit SQL identity fixture. Independent PG/HTTP tests exercise signed buyer login.
  await service.database.query(`INSERT INTO wallet_grants(id,token_hash,app_id,wallet,policy_epoch,provenance_login_id,created_at,expires_at)
    VALUES('test-grant',$1,$2,$3,1,'synthetic-proof-fixture',$4,$5)`,[service.hash('wallet-grant',grant),app.id,buyer.address,service.clock.value,service.clock.value+900000]);
  async function access(payload={walletGrant:grant,resourceKey:'premium'},headers={}){
    const response=await service.server.inject({method:'POST',url:'/v1/access/check',payload,headers:{authorization:`Bearer ${minted.secret}`,...headers}});
    return{status:response.statusCode,json:response.json()};
  }
  return{service,state,admin,app,url,minted,buyer,grant,access};
}
test('access binds server policy and proven fixture identity; strict ALLOW freshness, denial purchase metadata, redacted observations',async t=>{
  const {service,state,app,grant,access,admin,url,minted,buyer}=await setup();t.after(()=>service.cleanup());
  const allowed=await access();assert.equal(allowed.status,200,JSON.stringify(allowed.json));
  assert.equal(allowed.json.decision,'ALLOW');assert.equal(allowed.json.walletAddress,buyer.address);
  assert.equal(allowed.json.offerAddress,OFFER);assert.equal(allowed.json.freshness.readStartedAtMs,service.clock.value);
  assert.equal(allowed.json.freshness.validUntilMs,service.clock.value+8000);
  const grantLease=service.clock.value+2000;
  await service.database.query('UPDATE wallet_grants SET expires_at=$1',[grantLease]);
  const capped=await access();assert.equal(capped.status,200);assert.equal(capped.json.freshness.validUntilMs,grantLease);
  await service.database.query('UPDATE wallet_grants SET expires_at=$1',[service.clock.value+900000]);
  assert.equal((await access({walletGrant:grant,resourceKey:'premium',offerAddress:OFFER})).status,400);
  assert.equal((await access(undefined,{origin:'http://localhost:3000'})).status,403);
  assert.equal((await access({walletGrant:grant,resourceKey:'unknown'})).status,404);
  for(const[mode,reason]of[['missing','LICENSE_REQUIRED'],['expired','EXPIRED'],['rpc-error','CHAIN_UNAVAILABLE']]){
    state.mode=mode;const result=await access();assert.equal(result.status,mode==='rpc-error'?503:403);
    assert.equal(result.json.decision,'DENY');assert.equal(result.json.reason,reason);
    if(mode!=='rpc-error'){
      assert.equal(result.json.purchase.url,`http://localhost:3000/?offer=${OFFER}`);
      assert.equal(result.json.purchase.metadata,'SELLER_EXACT_BYTES_REQUIRED');
    }
  }
  await service.flushTelemetry();
  const usage=(await admin.request('GET',`${url}/usage`)).json;
  assert.equal(usage.buckets[0].allowed,2);assert.ok(usage.buckets[0].denied>=3);assert.equal(usage.buckets[0].errors,1);
  assert.ok(usage.reasons.some(row=>row.reason==='ACTIVE_LICENSE'));
  const events=(await admin.request('GET',`${url}/events`)).json.events;
  assert.ok(events.some(row=>row.type==='access.allow'));
  for(const secret of[grant,minted.secret,buyer.address])assert.ok(!JSON.stringify({usage,events}).includes(secret));
});
test('final post-RPC key/grant/policy checks and post-commit freshness fail closed',async t=>{
  for(const variant of['key-revoke','grant-revoke','policy','read-age','key-time']){
    const {service,state,admin,app,url,minted,grant,access}=await setup();
    try{
      if(variant==='read-age'||variant==='key-time'){
        const advance=variant==='read-age'?8000:1000;
        if(variant==='key-time')await service.database.query('UPDATE api_credentials SET expires_at=$1 WHERE id=$2',[service.clock.value+advance,minted.credential.id]);
        const original=service.database.protected.transaction;
        service.database.protected.transaction=async work=>{const result=await original(work);service.clock.value+=advance;return result;};
        const result=await access();assert.equal(result.status,variant==='read-age'?503:401);
        assert.notEqual(result.json.decision,'ALLOW');continue;
      }
      let release,reached;const gate=new Promise(resolve=>release=resolve),entered=new Promise(resolve=>reached=resolve);
      state.hold=()=>{reached();return gate;};const pending=access();await entered;
      if(variant==='key-revoke')await admin.mutation('POST',`${url}/credentials/${minted.credential.id}/revoke`,'credential.revoke',app.id,{credentialId:minted.credential.id});
      if(variant==='grant-revoke')await service.database.query('UPDATE wallet_grants SET revoked_at=$1 WHERE token_hash=$2',[service.clock.value,service.hash('wallet-grant',grant)]);
      if(variant==='policy')await admin.mutation('PATCH',`${url}/resources/premium`,'resource.update',app.id,{resourceKey:'premium',expectedVersion:1,enabled:false});
      release();const result=await pending;assert.equal(result.status,401);assert.notEqual(result.json.decision,'ALLOW');
    }finally{await service.cleanup();}
  }
});

test('response contract validation cannot extend the original access deadline or report a rejected ALLOW',async t=>{
  const {service,access}=await setup(instance=>{
    instance.server.addHook('preHandler',async req=>{
      if(req.url!=='/v1/access/check')return;
      const original=req.compileValidationSchema.bind(req);
      Object.defineProperty(req,'compileValidationSchema',{value:schema=>{
        const validate=original(schema);
        return value=>{
          const valid=validate(value);
          if(value?.decision==='ALLOW')service.clock.value+=8000;
          return valid;
        };
      }});
    });
  });t.after(()=>service.cleanup());
  const response=await access();assert.equal(response.status,503);assert.equal(response.json.error.code,'STALE_CHAIN');
  assert.notEqual(response.json.decision,'ALLOW');
  await service.flushTelemetry();
  assert.equal(Number((await service.database.query('SELECT COALESCE(SUM(allowed),0) AS allowed FROM usage_aggregates')).rows[0].allowed),0);
});
test('collector failure cannot alter ALLOW; chain reservations and schema readiness have bounded failure behavior',async t=>{
  const {service,state,access}=await setup();t.after(()=>service.cleanup());
  const original=service.database.transaction;
  service.database.transaction=async()=>{throw Error('collector outage');};
  const result=await access();assert.equal(result.status,200);await service.flushTelemetry();
  assert.equal(service.telemetry.diagnostics().failures,1);service.database.transaction=original;
  let release;const gate=new Promise(resolve=>release=resolve);
  const held=[service.chainRead('control',null,()=>gate),service.chainRead('control',null,()=>gate)];
  await assert.rejects(()=>service.chainRead('control',null,()=>Promise.resolve()),error=>error.status===503);
  assert.equal(await service.chainRead('access','other-app',async()=>true),true);
  release();await Promise.all(held);state.quarantined=2;
  await assert.rejects(()=>service.chainRead('control',null,async()=>true),error=>error.status===503);
  assert.equal(await service.chainRead('access','other-app',async()=>true),true);state.quarantined=0;
  assert.equal((await service.server.inject({url:'/v1/health/ready'})).statusCode,200);
  await service.database.query("UPDATE platform_migrations SET checksum='wrong'");
  assert.equal((await service.server.inject({url:'/v1/health/ready'})).statusCode,503);
});
