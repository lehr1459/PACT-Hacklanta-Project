import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {fixture,client} from './fixtures.mjs';

test('older active credentials remain discoverable and revocable beyond the bounded history window',async t=>{
  const service=await fixture();t.after(()=>service.cleanup());
  const admin=await client(service);
  const app=(await admin.request('POST','/v1/developer/apps',{name:'Long-lived integration',framework:'rest'})).json.app;
  const path=`/v1/developer/apps/${app.id}/credentials`;
  const result=await admin.mutation('POST',path,'credential.create',app.id,
    {name:'Old active key',scopes:['access:check'],expiresAt:service.clock.value+3600000});
  assert.equal(result.status,200);
  const oldest=result.json.credential;
  // Populate metadata-only expired history; no usable bearer secret is created.
  for(let i=0;i<55;i++){
    service.clock.value++;
    await service.database.query(`INSERT INTO api_credentials
      (id,app_id,creator_id,name,prefix,token_hash,scopes,created_at,expires_at)
      SELECT $1,app_id,creator_id,'Expired fixture history',$2,$3,scopes,$4,$4 FROM api_credentials WHERE id=$5`,
      [`key_${randomBytes(16).toString('hex')}`,'synthetic-expired-history',randomBytes(32).toString('hex'),service.clock.value,oldest.id]);
  }
  const listed=await admin.request('GET',path);
  assert.equal(listed.status,200);assert.equal(listed.json.credentials.length,50);
  assert.equal(listed.json.credentials[0].id,oldest.id);
  assert.equal(listed.json.credentials.some(row=>Object.hasOwn(row,'secret')),false);
  const revoked=await admin.mutation('POST',`${path}/${oldest.id}/revoke`,'credential.revoke',app.id,{credentialId:oldest.id});
  assert.equal(revoked.status,200);assert.equal(revoked.json.credential.revokedAt,service.clock.value);
});
