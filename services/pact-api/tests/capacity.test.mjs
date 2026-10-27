import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,client,wallet} from './fixtures.mjs';
const OFFER='11111111111111111111111111111111',PROGRAM='EiiiWWsW2kkqP6nugHz6iBADvhnW5xnibAtZ82ZExVqy';

test('account hard cap serializes the final registration slot and preserves existing wallet login',async t=>{
  const service=await fixture();t.after(()=>service.cleanup());const admin=await client(service);
  await service.database.query(`INSERT INTO developer_accounts(id,wallet,created_at)
    SELECT 'capacity-'||i,'synthetic-capacity-wallet-'||i,$1 FROM generate_series(1,998) AS i`,[service.clock.value]);
  const requests=[];
  for(const identity of[wallet(),wallet()]){
    const proof=(await admin.request('POST','/v1/developer/auth/challenge',{walletAddress:identity.address})).json;
    requests.push({challengeId:proof.challengeId,signatureBase64:identity.sign(proof.message)});
  }
  const results=await Promise.all(requests.map(body=>admin.request('POST','/v1/developer/auth/verify',body)));
  assert.deepEqual(results.map(result=>result.status).sort(),[200,429]);
  assert.equal(results.find(result=>result.status===429).json.error.code,'ACCOUNT_CAPACITY');
  assert.equal(Number((await service.database.query('SELECT COUNT(*) AS count FROM developer_accounts')).rows[0].count),1000);
  assert.equal((await admin.login()).status,200);
});

test('credential metadata cap denies mint/rotation without shortening the existing key; revoke remains available',async t=>{
  const service=await fixture();t.after(()=>service.cleanup());const admin=await client(service);
  const app=(await admin.request('POST','/v1/developer/apps',{name:'Credential capacity',framework:'rest'})).json.app,path=`/v1/developer/apps/${app.id}`;
  await admin.mutation('PATCH',path,'app.update',app.id,{status:'active'});
  const issued=(await admin.mutation('POST',`${path}/credentials`,'credential.create',app.id,{name:'Current key',scopes:['access:check'],expiresAt:service.clock.value+3600000})).json;
  await service.database.query(`INSERT INTO api_credentials(id,app_id,creator_id,name,prefix,token_hash,scopes,created_at,expires_at,revoked_at,authority_uuid)
    SELECT 'key_'||lpad(to_hex(i),32,'0'),$1,(SELECT owner_id FROM developer_applications WHERE id=$1),'Expired fixture','fixture','capacity-'||i,'["access:check"]',$2::bigint-1000,$2::bigint-1,$2::bigint-1,$3
    FROM generate_series(1,999) AS i`,[app.id,service.clock.value,service.clockAuthority.uuid]);
  const payload={name:'Overflow key',scopes:['access:check'],expiresAt:service.clock.value+3600000};
  const mint=await admin.mutation('POST',`${path}/credentials`,'credential.create',app.id,payload);
  assert.equal(mint.status,429);assert.equal(mint.json.error.code,'CREDENTIAL_HISTORY_LIMIT');
  const rotation=await admin.mutation('POST',`${path}/credentials/${issued.credential.id}/rotate`,'credential.rotate',app.id,
    {credentialId:issued.credential.id,expiresAt:service.clock.value+3600000,overlapSeconds:0});
  assert.equal(rotation.status,429);assert.equal(rotation.json.error.code,'CREDENTIAL_HISTORY_LIMIT');
  const valid=await service.server.inject({method:'POST',url:'/v1/credentials/validate',payload:{},headers:{authorization:`Bearer ${issued.secret}`}});
  assert.equal(valid.statusCode,200,'failed rotation must roll back old-key expiry');
  assert.equal((await admin.mutation('POST',`${path}/credentials/${issued.credential.id}/revoke`,'credential.revoke',app.id,{credentialId:issued.credential.id})).status,200);
});

for(const scope of['per-resource','global']){
  test(`${scope} history cap preserves finite emergency disable and blocks re-enable/rebind`,async t=>{
    let service,seller;
    service=await fixture({reader:{async getOffer({offer}){return{offer,program:PROGRAM,seller,active:true,contextSlot:100,startedAtMs:service.clock.value,receivedAtMs:service.clock.value};}}});
    t.after(()=>service.cleanup());const admin=await client(service);seller=admin.identity.address;
    const app=(await admin.request('POST','/v1/developer/apps',{name:'Policy capacity',framework:'rest'})).json.app,path=`/v1/developer/apps/${app.id}/resources/premium`;
    assert.equal((await admin.mutation('POST',`/v1/developer/apps/${app.id}/resources`,'resource.bind',app.id,{resourceKey:'premium',offerAddress:OFFER})).status,200);
    const principal=(await service.database.query('SELECT owner_id FROM developer_applications WHERE id=$1',[app.id])).rows[0].owner_id;
    let expectedVersion=1;
    if(scope==='per-resource'){
      await service.database.query(`INSERT INTO resource_versions(app_id,resource_key,version,offer_address,enabled,verified_at,context_slot,actor_id,actor_wallet,action_challenge_id,signature_hash,created_at)
        SELECT $1,'premium',i,$2,true,$3,100,$4,$5,'capacity-proof',repeat('a',64),$3 FROM generate_series(2,1000) AS i`,[app.id,OFFER,service.clock.value,principal,seller]);
      await service.database.query("UPDATE app_resources SET version=1000 WHERE app_id=$1 AND resource_key='premium'",[app.id]);expectedVersion=1000;
    }else{
      await service.database.query(`INSERT INTO app_resources(app_id,resource_key,offer_address,version,enabled,created_at,updated_at,verified_at,context_slot)
        SELECT $1,'quota-'||i,$2,CASE WHEN i=9 THEN 999 ELSE 1000 END,false,$3,$3,$3,100 FROM generate_series(0,9) AS i`,[app.id,OFFER,service.clock.value]);
      await service.database.query(`INSERT INTO resource_versions(app_id,resource_key,version,offer_address,enabled,verified_at,context_slot,actor_id,actor_wallet,action_challenge_id,signature_hash,created_at)
        SELECT $1,'quota-'||((i-1)/1000),((i-1)%1000)+1,$2,false,$3,100,$4,$5,'capacity-proof',repeat('a',64),$3 FROM generate_series(1,9999) AS i`,[app.id,OFFER,service.clock.value,principal,seller]);
    }
    const denied=await admin.mutation('PATCH',path,'resource.update',app.id,{resourceKey:'premium',expectedVersion,enabled:true});
    assert.equal(denied.status,429);assert.equal(denied.json.error.code,'RESOURCE_HISTORY_LIMIT');
    const disabled=await admin.mutation('DELETE',path,'resource.update',app.id,{resourceKey:'premium',expectedVersion,enabled:false});
    assert.equal(disabled.status,200);expectedVersion++;assert.equal(disabled.json.resource.version,expectedVersion);
    const count=Number((await service.database.query('SELECT COUNT(*) AS count FROM resource_versions')).rows[0].count);
    const again=await admin.mutation('DELETE',path,'resource.update',app.id,{resourceKey:'premium',expectedVersion,enabled:false});
    assert.equal(again.status,200);assert.equal(again.json.resource.version,expectedVersion);
    assert.equal(Number((await service.database.query('SELECT COUNT(*) AS count FROM resource_versions')).rows[0].count),count);
    const enabled=await admin.mutation('PATCH',path,'resource.update',app.id,{resourceKey:'premium',expectedVersion,enabled:true});
    assert.equal(enabled.status,429);assert.equal(enabled.json.error.code,'RESOURCE_HISTORY_LIMIT');
  });
}

test('global resource capacity denies a new tenant binding while existing policies remain available',async t=>{
  let service,seller;service=await fixture({reader:{async getOffer({offer}){return{offer,program:PROGRAM,seller,active:true,contextSlot:100,startedAtMs:service.clock.value,receivedAtMs:service.clock.value};}}});
  t.after(()=>service.cleanup());const admin=await client(service),other=await client(service);seller=admin.identity.address;
  const app=(await admin.request('POST','/v1/developer/apps',{name:'Resource capacity',framework:'rest'})).json.app;
  const otherApp=(await other.request('POST','/v1/developer/apps',{name:'Other tenant',framework:'rest'})).json.app;
  assert.equal((await admin.mutation('POST',`/v1/developer/apps/${app.id}/resources`,'resource.bind',app.id,{resourceKey:'premium',offerAddress:OFFER})).status,200);
  await service.database.query(`INSERT INTO developer_applications(id,owner_id,name,framework,created_at,updated_at)
    SELECT 'app_'||lpad(to_hex(i),32,'0'),(SELECT owner_id FROM developer_applications WHERE id=$1),'Capacity fixture','rest',$2,$2 FROM generate_series(1,19) AS i`,[app.id,service.clock.value]);
  await service.database.query(`INSERT INTO app_resources(app_id,resource_key,offer_address,version,enabled,created_at,updated_at,verified_at,context_slot)
    SELECT CASE WHEN i<50 THEN $1 ELSE 'app_'||lpad(to_hex(i/50),32,'0') END,'cap-'||i,$2,1,true,$3,$3,$3,100 FROM generate_series(1,999) AS i`,[app.id,OFFER,service.clock.value]);
  seller=other.identity.address;
  const denied=await other.mutation('POST',`/v1/developer/apps/${otherApp.id}/resources`,'resource.bind',otherApp.id,{resourceKey:'overflow',offerAddress:OFFER});
  assert.equal(denied.status,429);assert.equal(denied.json.error.code,'RESOURCE_CAPACITY');
  assert.equal(Number((await service.database.query('SELECT COUNT(*) AS count FROM app_resources')).rows[0].count),1000);
  const existing=await admin.request('GET',`/v1/developer/apps/${app.id}/resources/premium`);assert.equal(existing.status,200);
});
