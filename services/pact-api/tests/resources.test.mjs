import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,client,wallet} from './fixtures.mjs';
const OFFER='11111111111111111111111111111111';
const PROGRAM='EiiiWWsW2kkqP6nugHz6iBADvhnW5xnibAtZ82ZExVqy';
async function setup(){
  const identity=wallet(),state={seller:identity.address,active:true,fail:false,reads:0,program:PROGRAM};
  let service;
  service=await fixture({reader:{
    async getOffer({offer}){
      state.reads++;if(state.fail)throw Error('private-RPC-detail');
      return{offer,seller:state.seller,program:state.program,active:state.active,contextSlot:100,
        startedAtMs:service.clock.value,receivedAtMs:service.clock.value};
    },
  }});
  const owner=await client(service,identity),other=await client(service);
  const app=(await owner.request('POST','/v1/developer/apps',{name:'Resource app',framework:'rest'})).json.app;
  const url=`/v1/developer/apps/${app.id}/resources`;
  return{service,state,owner,other,app,url};
}
test('seller proof and tenant boundaries, immutable policy key/version and history',async t=>{
  const {service,state,owner,other,app,url}=await setup();t.after(()=>service.cleanup());
  let response=await owner.mutation('POST',url,'resource.bind',app.id,{resourceKey:'premium',offerAddress:OFFER});
  assert.equal(response.status,200,JSON.stringify(response.json));assert.equal(response.json.resource.version,1);
  assert.equal((await other.request('GET',url)).status,404);
  assert.equal((await owner.request('GET',url)).json.resources.length,1);
  state.seller=other.identity.address;
  response=await owner.mutation('POST',url,'resource.bind',app.id,{resourceKey:'stolen',offerAddress:OFFER});
  assert.equal(response.status,403);state.seller=owner.identity.address;
  state.active=false;
  assert.equal((await owner.mutation('POST',url,'resource.bind',app.id,{resourceKey:'inactive',offerAddress:OFFER})).status,409);
  assert.equal((await owner.request('GET',`${url}/premium`)).json.resource.enabled,true,'deactivation must not silently revoke existing policy');
  const reads=state.reads;state.fail=true;
  response=await owner.mutation('DELETE',`${url}/premium`,'resource.update',app.id,{resourceKey:'premium',expectedVersion:1,enabled:false});
  assert.equal(response.status,200);assert.equal(response.json.resource.version,2);assert.equal(state.reads,reads,'disable works without RPC');
  assert.equal((await owner.mutation('PATCH',`${url}/premium`,'resource.update',app.id,{resourceKey:'premium',expectedVersion:1,enabled:true})).status,409);
  assert.equal((await owner.mutation('PATCH',`${url}/premium`,'resource.update',app.id,{resourceKey:'premium',expectedVersion:2,enabled:true})).status,503);
  state.fail=false;state.active=true;
  assert.equal((await owner.mutation('PATCH',`${url}/premium`,'resource.update',app.id,{resourceKey:'premium',expectedVersion:2,enabled:true})).status,200);
  const detail=(await owner.request('GET',`${url}/premium`)).json;
  assert.deepEqual(detail.versions.map(v=>v.version),[3,2,1]);assert.equal(detail.resource.enabled,true);
  assert.equal(Number((await service.database.query('SELECT policy_epoch FROM developer_applications WHERE id=$1',[app.id])).rows[0].policy_epoch),3);
  assert.equal((await owner.request('POST','/v1/developer/actions/challenge',{action:'resource.update',appId:app.id,
    payload:{resourceKey:'premium',expectedVersion:3,enabled:true,walletAddress:other.identity.address}})).status,400);
});
test('resource proof cannot rename key or overwrite intervening version; stale final chain snapshot rolls back',async t=>{
  const {service,state,owner,app,url}=await setup();t.after(()=>service.cleanup());
  const payload={resourceKey:'premium',offerAddress:OFFER};
  const proof=await owner.proof('resource.bind',app.id,payload);
  const concurrent=await Promise.all([owner.request('POST',url,{payload,proof}),owner.request('POST',url,{payload,proof})]);
  assert.deepEqual(concurrent.map(r=>r.status).sort(),[200,401]);
  assert.equal((await owner.mutation('PATCH',`${url}/other`,'resource.update',app.id,{resourceKey:'premium',expectedVersion:1,enabled:false})).status,400);
  const update={resourceKey:'premium',expectedVersion:1,enabled:false};
  const proofs=await Promise.all([owner.proof('resource.update',app.id,update),owner.proof('resource.update',app.id,update)]);
  const results=await Promise.all(proofs.map(proof=>owner.request('PATCH',`${url}/premium`,{payload:update,proof})));
  assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
  state.program='11111111111111111111111111111111';
  assert.equal((await owner.mutation('POST',url,'resource.bind',app.id,{resourceKey:'wrong-program',offerAddress:OFFER})).status,403);
  state.program=PROGRAM;
  const originalQuery=service.database.query.bind(service.database);
  const originalTx=service.database.transaction.bind(service.database);
  let ageDuringHistory=false;
  service.database.transaction=work=>originalTx(tx=>work({query:async(sql,values)=>{
    const result=await tx.query(sql,values);
    if(ageDuringHistory&&sql.includes('INSERT INTO security_audit_events'))service.clock.value+=8000;
    return result;
  }}));
  const stale={resourceKey:'stale',offerAddress:OFFER};
  const staleProof=await owner.proof('resource.bind',app.id,stale);ageDuringHistory=true;
  const rejected=await owner.request('POST',url,{payload:stale,proof:staleProof});
  assert.equal(rejected.status,503);
  assert.equal((await originalQuery('SELECT COUNT(*) AS count FROM app_resources WHERE resource_key=$1',['stale'])).rows[0].count,0);
});
