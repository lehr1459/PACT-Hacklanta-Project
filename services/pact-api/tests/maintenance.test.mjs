import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,client} from './fixtures.mjs';
import {maintainDatabase,quarantineDeveloper,deleteDeveloper} from '../src/maintenance.mjs';
const DAY=86400000;
async function setup(t){
 const c=await fixture();t.after(()=>c.cleanup());const admin=await client(c),other=await client(c);
 const create=async(who,name)=>(await who.request('POST','/v1/developer/apps',{name,framework:'rest'})).json.app;
 const app=await create(admin,'Maintenance owner'),foreign=await create(other,'Unrelated owner');
 const account=(await c.database.query('SELECT id,wallet FROM developer_accounts WHERE wallet=$1',[admin.identity.address])).rows[0];
 const path='/v1/developer/apps/'+app.id;
 const callback=(await admin.mutation('POST',path+'/callback-uris','callback.create',app.id,{uri:'http://127.0.0.1:4300/callback',websiteOrigin:'http://127.0.0.1:4300'})).json.callback;
 const minted=(await admin.mutation('POST',path+'/credentials','credential.create',app.id,{name:'Disposable maintenance fixture',scopes:['access:check'],expiresAt:c.clock.value+3600000})).json;
 return{...c,admin,other,app,foreign,account,callback,minted};
}
async function history(c,appId=c.app.id){
 const n=c.clock.value;
 await c.database.query('INSERT INTO app_resources(app_id,resource_key,offer_address,version,enabled,created_at,updated_at,verified_at,context_slot) VALUES($1,$2,$3,1,true,$4,$4,$4,1)',[appId,'premium',c.admin.identity.address,n]);
 await c.database.query('INSERT INTO resource_versions(app_id,resource_key,version,offer_address,enabled,verified_at,context_slot,actor_id,actor_wallet,action_challenge_id,signature_hash,created_at) VALUES($1,$2,1,$3,true,$4,1,$5,$3,$6,$7,$4)',[appId,'premium',c.admin.identity.address,n,c.account.id,'expired-retention-fixture-proof','a'.repeat(64)]);
}
test('operator retention defaults to dry run, bounds each batch and preserves current authority/history',async t=>{
 const c=await setup(t),db=c.database,n=c.clock.value;await history(c);
 await db.query('INSERT INTO admin_sessions(token_hash,account_id,binding_hash,created_at,expires_at) VALUES($1,$2,$3,$4,$5)',['retention-old-session',c.account.id,'fixture-binding',n-2*DAY,n-DAY-1]);
 for(let i=0;i<5;i++)await db.query('INSERT INTO action_challenges(id,account_id,session_hash,app_id,action,payload_hash,message,created_at,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[
  'retention-action-'+i,c.account.id,'retention-old-session',c.app.id,'fixture','fixture','Disposable retention proof',n-2*DAY,n-DAY-1]);
 await db.query('INSERT INTO login_transactions(id,app_id,creator_credential_id,callback_id,redirect_uri,policy_epoch,purpose,state,state_hash,code_challenge,created_at,expires_at) VALUES($1,$2,$3,$4,$5,0,$6,$7,$8,$9,$10,$11)',[
  'retention-login',c.app.id,c.minted.credential.id,c.callback.id,c.callback.uri,'Disposable retention flow','public-test-state','fixture','fixture',n-2*DAY,n-DAY-1]);
 await db.query('INSERT INTO wallet_challenges(id,transaction_id,wallet,binding_hash,message,created_at,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7)',[
  'retention-wallet-proof','retention-login',c.admin.identity.address,'fixture','Disposable retention proof',n-2*DAY,n-DAY-1]);
 for(const[id,expiry]of[['retention-old-grant',n-DAY-1],['retention-current-grant',n+60000]])await db.query('INSERT INTO wallet_grants(id,token_hash,app_id,wallet,policy_epoch,provenance_login_id,created_at,expires_at) VALUES($1,$2,$3,$4,0,$5,$6,$7)',[
  id,id,c.app.id,c.admin.identity.address,'retention-login',n-2*DAY,expiry]);
 await db.query('INSERT INTO usage_aggregates(app_id,bucket) VALUES($1,$2)',[c.app.id,n-31*DAY]);
 await db.query('INSERT INTO usage_reasons(app_id,bucket,reason,requests) VALUES($1,$2,$3,1)',[c.app.id,n-31*DAY,'LICENSE_REQUIRED']);
 await db.query('INSERT INTO security_audit_events(id,owner_id,app_id,type,request_id,outcome,created_at) VALUES($1,$2,$3,$4,$5,$6,$7)',[
  'retention-old-event',c.account.id,c.app.id,'fixture','fixture','fixture',n-91*DAY]);
 await db.query('INSERT INTO request_budgets(budget_key,window_start,hits) VALUES($1,$2,1)',['retention-old-budget',Math.floor(n/60000)-3]);
 const dry=await maintainDatabase({database:db,now:n,batchSize:2});assert.equal(dry.mode,'dry-run');assert.ok(dry.results.every(r=>r.removed===0));
 const first=await maintainDatabase({database:db,now:n,apply:true,batchSize:2});assert.ok(first.results.every(r=>r.removed<=2));
 assert.equal(Number((await db.query("SELECT count(*) AS count FROM admin_sessions WHERE token_hash='retention-old-session'")).rows[0].count),1,'remaining child proofs must keep their session');
 for(let i=0;i<3;i++)await maintainDatabase({database:db,now:n,apply:true,batchSize:2});
 for(const table of['login_transactions','wallet_challenges'])assert.equal(Number((await db.query(`SELECT count(*) AS count FROM ${table}`)).rows[0].count),0);
 assert.equal(Number((await db.query("SELECT count(*) AS count FROM admin_sessions WHERE token_hash='retention-old-session'")).rows[0].count),0);
 assert.equal(Number((await db.query("SELECT count(*) AS count FROM wallet_grants WHERE id='retention-current-grant'")).rows[0].count),1);
 assert.equal(Number((await db.query('SELECT count(*) AS count FROM resource_versions')).rows[0].count),1);
 assert.equal((await c.admin.request('GET','/v1/developer/apps/'+c.app.id)).status,200);
 assert.equal((await c.other.request('GET','/v1/developer/apps/'+c.foreign.id)).status,200);
 await assert.rejects(maintainDatabase({database:db,batchSize:1001}),{code:'MAINTENANCE_CONFIGURATION_REQUIRED'});
});
test('owner purge requires exact confirmation and prior quarantine; it removes only owned data atomically',async t=>{
 const c=await setup(t);await history(c);const options={database:c.database,accountId:c.account.id,expectedWallet:c.account.wallet,ingressQuiesced:true};
 const dry=await deleteDeveloper(options);assert.equal(dry.mode,'dry-run');assert.ok(dry.totalRows>0);
 await assert.rejects(deleteDeveloper({...options,apply:true,ingressQuiesced:false}),{code:'OWNER_QUIESCENCE_REQUIRED'});
 await assert.rejects(deleteDeveloper({...options,apply:true}),{code:'OWNER_QUARANTINE_REQUIRED'});
 await assert.rejects(quarantineDeveloper({...options,expectedWallet:'wrong',apply:true}),{code:'OWNER_CONFIRMATION_REQUIRED'});
 await quarantineDeveloper({...options,apply:true});assert.equal((await c.admin.request('GET','/v1/developer/apps/'+c.app.id)).status,401);
 const result=await deleteDeveloper({...options,apply:true});assert.equal(result.backupsAndPublicChainErased,false);
 for(const table of['developer_accounts','developer_applications','api_credentials','app_resources','resource_versions']){
  const count=Number((await c.database.query(`SELECT count(*) AS count FROM ${table}`)).rows[0].count);assert.equal(count,table==='developer_accounts'||table==='developer_applications'?1:0);
 }
 assert.equal((await c.other.request('GET','/v1/developer/apps/'+c.foreign.id)).status,200);
});
test('foreign provenance dependencies roll back owner erasure without deleting another app',async t=>{
 const c=await setup(t);await history(c,c.foreign.id);const options={database:c.database,accountId:c.account.id,expectedWallet:c.account.wallet,apply:true,ingressQuiesced:true};
 await quarantineDeveloper(options);await assert.rejects(deleteDeveloper(options));
 assert.equal(Number((await c.database.query('SELECT count(*) AS count FROM developer_applications WHERE id=$1',[c.app.id])).rows[0].count),1);
 assert.equal(Number((await c.database.query('SELECT count(*) AS count FROM api_credentials WHERE app_id=$1',[c.app.id])).rows[0].count),1);
 assert.equal(Number((await c.database.query('SELECT count(*) AS count FROM resource_versions WHERE app_id=$1',[c.foreign.id])).rows[0].count),1);
});
test('oversized owner deletion refuses before any erasure and leaves quarantine intact',async t=>{
 const c=await setup(t);await c.database.query(`INSERT INTO admin_challenges(id,wallet,binding_hash,message,created_at,expires_at)
  SELECT 'delete-bound-'||i,$1,'fixture','Disposable bounded fixture',$2,$3 FROM generate_series(1,10001) AS i`,[c.account.wallet,c.clock.value,c.clock.value+60000]);
 const options={database:c.database,accountId:c.account.id,expectedWallet:c.account.wallet,apply:true,ingressQuiesced:true};await quarantineDeveloper(options);
 await assert.rejects(deleteDeveloper(options),{code:'OWNER_DELETE_LIMIT'});
 assert.equal(Number((await c.database.query('SELECT count(*) AS count FROM admin_challenges WHERE wallet=$1',[c.account.wallet])).rows[0].count),10002);
 assert.equal((await c.database.query('SELECT status FROM developer_accounts WHERE id=$1',[c.account.id])).rows[0].status,'disabled');
});
test('late public challenge insertions cannot bypass the actual erasure effect bound',async t=>{
 const c=await setup(t),options={database:c.database,accountId:c.account.id,expectedWallet:c.account.wallet,apply:true,ingressQuiesced:true};await quarantineDeveloper(options);
 const transaction=c.database.transaction.bind(c.database);let inserted=false;
 c.database.transaction=work=>transaction(tx=>work({query:async(sql,values)=>{
  if(!inserted&&sql.startsWith('DELETE FROM admin_challenges')){
   inserted=true;await tx.query(`INSERT INTO admin_challenges(id,wallet,binding_hash,message,created_at,expires_at)
    SELECT 'late-bound-'||i,$1,'fixture','Disposable concurrent fixture',$2,$3 FROM generate_series(1,10001) AS i`,[c.account.wallet,c.clock.value,c.clock.value+60000]);
  }
  return tx.query(sql,values);
 }}));
 await assert.rejects(deleteDeveloper(options),{code:'OWNER_DELETE_LIMIT'});assert.equal(inserted,true);
 assert.equal(Number((await c.database.query('SELECT count(*) AS count FROM developer_applications WHERE id=$1',[c.app.id])).rows[0].count),1);
 assert.equal(Number((await c.database.query('SELECT count(*) AS count FROM api_credentials WHERE app_id=$1',[c.app.id])).rows[0].count),1);
});
test('credential metadata retention unlinks only aged lineage in bounded batches, preserving valid descendants',async t=>{
 const c=await setup(t),db=c.database,n=c.clock.value,old='key_'+'d'.repeat(32);
 await db.query(`INSERT INTO api_credentials(id,app_id,creator_id,name,prefix,token_hash,scopes,created_at,expires_at)
  VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,[old,c.app.id,c.account.id,'Old metadata','public-prefix','old-fixture-hash','["access:check"]',n-100*DAY,n-91*DAY]);
 await db.query('UPDATE api_credentials SET rotated_from=$1 WHERE id=$2',[old,c.minted.credential.id]);
 const dry=await maintainDatabase({database:db,now:n,batchSize:1});assert.equal(dry.results.find(r=>r.table==='credential_lineage').eligibleInBatch,1);
 assert.equal((await db.query('SELECT rotated_from FROM api_credentials WHERE id=$1',[c.minted.credential.id])).rows[0].rotated_from,old);
 const applied=await maintainDatabase({database:db,now:n,apply:true,batchSize:1});assert.ok(applied.results.every(r=>r.removed<=1));
 assert.equal(Number((await db.query('SELECT count(*) AS count FROM api_credentials WHERE id=$1',[old])).rows[0].count),0);
 assert.equal((await db.query('SELECT rotated_from FROM api_credentials WHERE id=$1',[c.minted.credential.id])).rows[0].rotated_from,null);
 assert.equal(Number((await db.query('SELECT count(*) AS count FROM api_credentials WHERE id=$1',[c.minted.credential.id])).rows[0].count),1);
});
