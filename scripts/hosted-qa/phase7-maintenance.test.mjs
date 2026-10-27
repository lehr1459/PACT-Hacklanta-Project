import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {accessFixture} from './access-fixture.mjs';
import {Browser,ORIGIN} from './browser.mjs';
import {maintainDatabase,quarantineDeveloper,deleteDeveloper} from '../../services/pact-api/src/maintenance.mjs';
import {attachClock} from '../../services/pact-api/src/clock.mjs';
import {createService} from '../../services/pact-api/src/service.mjs';

const DAY=86400000,hex=()=>randomBytes(16).toString('hex');
test('Phase7 native ninety-day credential lineage cleanup preserves current keys and exact boundary',{timeout:15000},async t=>{
 const c=await accessFixture();t.after(()=>c.close());const now=c.clock.value,parent='key_'+hex(),child='key_'+hex(),boundary='key_'+hex();
 async function metadata(id,expiresAt,rotatedFrom=null){
  await c.native.query(`INSERT INTO api_credentials(id,app_id,creator_id,name,prefix,token_hash,scopes,created_at,expires_at,rotated_from,authority_uuid)
   SELECT $1,app_id,creator_id,'Disposable retention metadata',$2,$3,scopes,$4,$5,$6,authority_uuid FROM api_credentials WHERE id=$7`,
   [id,'pact_sk_dev_'+id,hex(),now-100*DAY,expiresAt,rotatedFrom,c.own.credentialId]);
 }
 await metadata(parent,now-90*DAY-1);await metadata(child,now+DAY,parent);await metadata(boundary,now-90*DAY);
 const dry=await maintainDatabase({database:c.native,now,batchSize:1000});assert.equal(dry.mode,'dry-run');
 assert.equal((await c.native.query('SELECT rotated_from FROM api_credentials WHERE id=$1',[child])).rows[0].rotated_from,parent);
 const applied=await maintainDatabase({database:c.native,now,apply:true,batchSize:1000});assert.ok(applied.results.find(row=>row.table==='credential_lineage').removed>=1);
 assert.equal((await c.native.query('SELECT rotated_from FROM api_credentials WHERE id=$1',[child])).rows[0].rotated_from,null);
 assert.equal(Number((await c.native.query('SELECT COUNT(*) AS n FROM api_credentials WHERE id=$1',[parent])).rows[0].n),0);
 assert.equal(Number((await c.native.query('SELECT COUNT(*) AS n FROM api_credentials WHERE id=ANY($1::text[])',[[child,boundary,c.own.credentialId]])).rows[0].n),3);
 c.license();assert.equal((await c.check()).status,200);assert.equal((await c.admin.key(c.own.key)).status,200);
});

test('Phase7 native retention dry run/batches respect FK order, exact TTL and current authority',{timeout:20000},async t=>{
 const c=await accessFixture();t.after(()=>c.close());const now=c.clock.value,ids=Array.from({length:8},()=>`adm_${hex()}`),boundary=`adm_${hex()}`;
 for(const id of ids)await c.native.query('INSERT INTO admin_challenges(id,wallet,binding_hash,message,created_at,expires_at) VALUES($1,$2,$3,$4,$5,$6)',[id,c.admin.wallet.address,hex(),'Disposable expired proof',now-3*DAY,now-DAY-1]);
 await c.native.query('INSERT INTO admin_challenges(id,wallet,binding_hash,message,created_at,expires_at) VALUES($1,$2,$3,$4,$5,$6)',[boundary,c.admin.wallet.address,hex(),'Exact retention boundary',now-2*DAY,now-DAY]);
 const account=(await c.admin.request('GET','/v1/developer/auth/session')).data.account.id,session=hex(),action=`act_${hex()}`;
 await c.native.query('INSERT INTO admin_sessions(token_hash,account_id,binding_hash,created_at,expires_at) VALUES($1,$2,$3,$4,$5)',[session,account,hex(),now-3*DAY,now-2*DAY]);
 await c.native.query(`INSERT INTO action_challenges(id,account_id,session_hash,app_id,action,payload_hash,message,created_at,expires_at)
  VALUES($1,$2,$3,$4,'app.update',$5,'Expired linked proof',$6,$7)`,[action,account,session,c.own.id,hex(),now-3*DAY,now-2*DAY]);
 const dry=await maintainDatabase({database:c.native,now,batchSize:3});assert.equal(dry.mode,'dry-run');assert.equal(dry.results.every(row=>row.removed===0),true);
 assert.equal(Number((await c.native.query('SELECT COUNT(*) AS n FROM admin_challenges WHERE id=ANY($1::text[])',[ids])).rows[0].n),8);
 for(let i=0;i<3;i++){const result=await maintainDatabase({database:c.native,now,apply:true,batchSize:3});assert.equal(result.results.every(row=>row.removed<=3),true);}
 assert.equal(Number((await c.native.query('SELECT COUNT(*) AS n FROM admin_challenges WHERE id=ANY($1::text[])',[ids])).rows[0].n),0);
 assert.equal(Number((await c.native.query('SELECT COUNT(*) AS n FROM admin_challenges WHERE id=$1',[boundary])).rows[0].n),1);
 assert.equal(Number((await c.native.query('SELECT COUNT(*) AS n FROM action_challenges WHERE id=$1',[action])).rows[0].n),0);
 assert.equal(Number((await c.native.query('SELECT COUNT(*) AS n FROM admin_sessions WHERE token_hash=$1',[session])).rows[0].n),0);
 c.license();assert.equal((await c.check()).status,200);assert.equal((await c.admin.key(c.own.key)).status,200);
});

test('Phase7 native operator quarantine/delete purges only the confirmed owner after stopped ingress',{timeout:15000},async t=>{
 const pepper=randomBytes(32).toString('base64url'),c=await accessFixture({serviceOptions:{pepper}});let keeper,reopened;
 t.after(async()=>{await reopened?.close();keeper?.close();await c.close();});const other=new Browser(c.base,ORIGIN);await other.login();const b=await c.app(other),offer=c.rpc.addOffer({seller:other.wallet});
 assert.equal((await other.mutate('POST',b.path+'/resources',b.id,'resource.bind',{resourceKey:'premium',offerAddress:offer.address})).status,200);
 const grant=await c.grant(b);c.rpc.addLicense({offer,buyer:grant.identity,expirySeconds:BigInt(Math.floor(c.clock.value/1000)+60)});
 const checkB=()=>other.backend('/v1/access/check',b.key,{walletGrant:grant.walletGrant,resourceKey:'premium'});assert.equal((await checkB()).status,200);
 const owner=(await c.admin.request('GET','/v1/developer/auth/session')).data.account.id;
 const dry=await deleteDeveloper({database:c.native,accountId:owner});assert.equal(dry.mode,'dry-run');assert.ok(dry.totalRows>0);
 await assert.rejects(deleteDeveloper({database:c.native,accountId:owner,expectedWallet:c.admin.wallet.address,apply:true}),{code:'OWNER_QUIESCENCE_REQUIRED'});
 await assert.rejects(deleteDeveloper({database:c.native,accountId:owner,expectedWallet:c.admin.wallet.address,apply:true,ingressQuiesced:true}),{code:'OWNER_QUARANTINE_REQUIRED'});
 await assert.rejects(quarantineDeveloper({database:c.native,accountId:owner,expectedWallet:other.wallet.address,apply:true}),{code:'OWNER_CONFIRMATION_REQUIRED'});
 await quarantineDeveloper({database:c.native,accountId:owner,expectedWallet:c.admin.wallet.address,apply:true});assert.notEqual((await c.check()).status,200);assert.equal((await checkB()).status,200);
 keeper=await attachClock(c.service.clockAuthority,{database:c.native,namespace:c.service.clockAuthority.namespace});
 await c.service.close();const deleted=await deleteDeveloper({database:c.native,accountId:owner,expectedWallet:c.admin.wallet.address,apply:true,ingressQuiesced:true});
 assert.equal(deleted.backupsAndPublicChainErased,false);assert.ok(deleted.deletedRows<=10000);
 for(const[table,column,value]of[['developer_accounts','id',owner],['developer_applications','id',c.own.id],['app_resources','app_id',c.own.id],['api_credentials','app_id',c.own.id]])
  assert.equal(Number((await c.native.query(`SELECT COUNT(*) AS n FROM ${table} WHERE ${column}=$1`,[value])).rows[0].n),0);
 assert.equal(Number((await c.native.query('SELECT COUNT(*) AS n FROM developer_applications WHERE id=$1',[b.id])).rows[0].n),1);
 assert.equal((await c.native.query('SELECT revoked_at FROM wallet_grants WHERE app_id=$1',[b.id])).rows[0].revoked_at,null);
 reopened=await createService({database:c.native,origin:ORIGIN,pepper,profile:'test',clock:keeper,rateLimit:1000,readerOptions:{rpcUrl:c.rpc.url}});
 other.base=await reopened.server.listen({host:'127.0.0.1',port:0});assert.equal((await checkB()).status,200,'unrelated current grant still allows after actual owner purge and ingress restart');
});

test('Phase7 native oversized and late public-challenge purge effects roll back without partial owner loss',{timeout:20000},async t=>{
 const c=await accessFixture();t.after(()=>c.close());const owner=(await c.admin.request('GET','/v1/developer/auth/session')).data.account.id,seed=hex(),marker='Owned oversize fixture '+seed;
 await quarantineDeveloper({database:c.native,accountId:owner,expectedWallet:c.admin.wallet.address,apply:true});await c.service.close();
 const insert=()=>c.native.query(`INSERT INTO admin_challenges(id,wallet,binding_hash,message,created_at,expires_at)
  SELECT 'adm_'||md5($1||n::text),$2,repeat('0',64),$3,$4::bigint,$4::bigint+120000 FROM generate_series(1,10001) n`,[seed,c.admin.wallet.address,marker,c.clock.value]);
 const cleanup=()=>c.native.query('DELETE FROM admin_challenges WHERE wallet=$1 AND message=$2',[c.admin.wallet.address,marker]);
 const apply={database:c.native,accountId:owner,expectedWallet:c.admin.wallet.address,apply:true,ingressQuiesced:true};
 try{
  await insert();await assert.rejects(deleteDeveloper(apply),{code:'OWNER_DELETE_LIMIT'});
  assert.equal(Number((await c.native.query('SELECT COUNT(*) AS n FROM admin_challenges WHERE wallet=$1 AND message=$2',[c.admin.wallet.address,marker])).rows[0].n),10001);
  await cleanup();let injected=false;
  const raced={...c.native,transaction:work=>c.native.transaction(tx=>work({query:async(sql,values)=>{
   if(!injected&&sql.startsWith('DELETE FROM ')){injected=true;await insert();}return tx.query(sql,values);
  }}))};
  await assert.rejects(deleteDeveloper({...apply,database:raced}),{code:'OWNER_DELETE_LIMIT'});assert.equal(injected,true);
  assert.equal(Number((await c.native.query('SELECT COUNT(*) AS n FROM developer_applications WHERE id=$1',[c.own.id])).rows[0].n),1);
  assert.equal(Number((await c.native.query('SELECT COUNT(*) AS n FROM api_credentials WHERE id=$1',[c.own.credentialId])).rows[0].n),1);
  assert.equal(Number((await c.native.query('SELECT COUNT(*) AS n FROM admin_challenges WHERE wallet=$1 AND message=$2',[c.admin.wallet.address,marker])).rows[0].n),10001);
 }finally{await cleanup();}
});
