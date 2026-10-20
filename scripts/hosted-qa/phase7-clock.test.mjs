import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {readFile,writeFile,copyFile,unlink} from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createDatabase,migrate} from '../../services/pact-api/src/database.mjs';
import {openClock} from '../../services/pact-api/src/clock.mjs';
import {createService} from '../../services/pact-api/src/service.mjs';
import {prepareDatabase} from './helpers.mjs';
import {Browser,ORIGIN} from './browser.mjs';
import {accessFixture} from './access-fixture.mjs';
import {clockDirectory} from './phase7-clock-fixture.mjs';

const random=()=>randomBytes(32).toString('base64url');
async function native(t){const connectionString=await prepareDatabase(),database=await createDatabase({connectionString,profile:'test'});await migrate(database);t.after(()=>database.close());return{database,connectionString};}
async function context(t){
 const {database,connectionString}=await native(t),directory=await clockDirectory(),namespace=randomBytes(32).toString('hex'),timeline={wall:Date.now(),mono:0};
 const options={database,directory,namespace,wallNow:()=>timeline.wall,monotonicNow:()=>timeline.mono};
 return{database,connectionString,directory,namespace,timeline,options};
}

test('Phase7 native durable authority persists UUID/ceiling and rejects an immediate cold reopen',async t=>{
 const c=await context(t),first=await openClock(c.options),uuid=first.uuid;assert.equal(first.now(),c.timeline.wall);
 const record=await readFile(path.join(c.directory,'authority.bin'));assert.equal(record.length,256);const ceiling=Number(record.subarray(0,128).toString('ascii').split('\n')[3]);
 assert.ok(ceiling>c.timeline.wall);first.close();
 await assert.rejects(openClock(c.options),{code:'CLOCK_RESTART_QUARANTINED'});
 c.timeline.mono+=ceiling-c.timeline.wall;c.timeline.wall=ceiling;const reopened=await openClock(c.options);t.after(()=>reopened.close());
 assert.equal(reopened.uuid,uuid);assert.equal(reopened.now(),c.timeline.wall);
 assert.equal((await c.database.query('SELECT clock_uuid FROM clock_bindings WHERE namespace_hash=$1',[c.namespace])).rows[0].clock_uuid,uuid);
});

test('Phase7 frozen/backward wall and backward monotonic sources latch unavailable without re-anchoring',async t=>{
 for(const mode of ['frozen-wall','backward-wall','backward-monotonic'])await t.test(mode,async()=>{
  const c=await context(t),authority=await openClock(c.options);t.after(()=>authority.close());authority.now();
  if(mode==='frozen-wall')c.timeline.mono+=20;else if(mode==='backward-wall')c.timeline.wall--;else{c.timeline.wall++;c.timeline.mono=-1;}
  assert.throws(()=>authority.now(),{code:'CLOCK_UNAVAILABLE'});assert.equal(authority.diagnostics().available,false);
  c.timeline.wall+=1000;c.timeline.mono=1000;assert.throws(()=>authority.now(),{code:'CLOCK_UNAVAILABLE'});
 });
});

test('Phase7 missing, orphan, corrupted and replaced real files fail closed against native SQL binding',async t=>{
 for(const mode of ['missing-record','missing-binding','corrupt-record','replaced-live-file'])await t.test(mode,async()=>{
  const c=await context(t),authority=await openClock(c.options),file=path.join(c.directory,'authority.bin');
  if(mode==='replaced-live-file'){
   const saved=await readFile(file);await unlink(file);await writeFile(file,saved,{mode:0o600});assert.throws(()=>authority.now());authority.close();return;
  }
  authority.close();c.timeline.wall+=1000;c.timeline.mono+=1000;
  if(mode==='missing-record')await unlink(file);
  if(mode==='missing-binding')await c.database.query('DELETE FROM clock_bindings WHERE namespace_hash=$1',[c.namespace]);
  if(mode==='corrupt-record'){const record=await readFile(file);record[128]^=1;await writeFile(file,record);}
  await assert.rejects(openClock(c.options),error=>['CLOCK_BINDING_MISMATCH','CLOCK_RECORD_INVALID'].includes(error.code));
 });
});

test('Phase7 copied real authority without its native binding cannot initialize new authority',async t=>{
 const c=await context(t),authority=await openClock(c.options);authority.close();const copied=await clockDirectory();
 await copyFile(path.join(c.directory,'authority.bin'),path.join(copied,'authority.bin'));c.timeline.wall+=1000;c.timeline.mono+=1000;
 await assert.rejects(openClock({...c.options,directory:copied,namespace:randomBytes(32).toString('hex')}));
});

test('Phase7 another OS process cannot own the same real durable clock store',async t=>{
 const c=await context(t),authority=await openClock(c.options);t.after(()=>authority.close());
 const script=`import {createDatabase} from './services/pact-api/src/database.mjs';import {openClock} from './services/pact-api/src/clock.mjs';const database=await createDatabase({connectionString:process.env.PACT_QA_CLOCK_DB,profile:'test'});try{const clock=await openClock({database,directory:process.env.PACT_QA_CLOCK_DIR,namespace:process.env.PACT_QA_CLOCK_NAMESPACE});clock.close();process.stdout.write('UNEXPECTED_OWNER');}catch(error){process.stdout.write(/^[A-Z_]+$/.test(error.code??'')?error.code:'UNSAFE_ERROR');}finally{await database.close();}`;
 const child=spawn(process.execPath,['--input-type=module','-e',script],{cwd:process.cwd(),windowsHide:true,env:{...process.env,PACT_QA_CLOCK_DB:c.connectionString,PACT_QA_CLOCK_DIR:c.directory,PACT_QA_CLOCK_NAMESPACE:c.namespace},stdio:['ignore','pipe','ignore']});
 let output='';child.stdout.on('data',bytes=>output+=bytes);const exit=await new Promise(resolve=>child.once('exit',resolve));assert.equal(exit,0);assert.equal(output,'CLOCK_OWNER_LOCKED');assert.equal(authority.now(),c.timeline.wall);
});

test('Phase7 abruptly exited OS owner leaves a lock requiring explicit recovery and retained ceiling',{timeout:10000},async t=>{
 const c=await context(t);
 const script=`import {createDatabase} from './services/pact-api/src/database.mjs';import {openClock} from './services/pact-api/src/clock.mjs';const database=await createDatabase({connectionString:process.env.PACT_QA_CLOCK_DB,profile:'test'});const clock=await openClock({database,directory:process.env.PACT_QA_CLOCK_DIR,namespace:process.env.PACT_QA_CLOCK_NAMESPACE,wallNow:()=>Number(process.env.PACT_QA_CLOCK_WALL),monotonicNow:()=>0});clock.now();process.stdout.write('READY');setInterval(()=>{},1000);`;
 const child=spawn(process.execPath,['--input-type=module','-e',script],{cwd:process.cwd(),windowsHide:true,env:{...process.env,PACT_QA_CLOCK_DB:c.connectionString,PACT_QA_CLOCK_DIR:c.directory,PACT_QA_CLOCK_NAMESPACE:c.namespace,PACT_QA_CLOCK_WALL:String(c.timeline.wall)},stdio:['ignore','pipe','ignore']});
 let exited=false;const stopped=new Promise(resolve=>child.once('exit',()=>{exited=true;resolve();}));t.after(async()=>{if(!exited){child.kill('SIGKILL');await stopped;}});
 await new Promise((resolve,reject)=>{let output='';const timer=setTimeout(()=>reject(Error('Owned clock child did not become ready')),5000);child.stdout.on('data',bytes=>{output+=bytes;if(output==='READY'){clearTimeout(timer);resolve();}});child.once('exit',()=>{clearTimeout(timer);reject(Error('Owned clock child exited before ready'));});});
 const record=await readFile(path.join(c.directory,'authority.bin')),parts=record.subarray(0,128).toString('ascii').split('\n'),uuid=parts[1],ceiling=Number(parts[3]);
 child.kill('SIGKILL');await stopped;assert.equal(exited,true);
 await assert.rejects(openClock(c.options),{code:'CLOCK_OWNER_LOCKED'});assert.equal((await readFile(path.join(c.directory,'owner.lock'))).length,256);
 // Explicit recovery of this disposable fixture only, after observing OS exit.
 await unlink(path.join(c.directory,'owner.lock'));
 await assert.rejects(openClock(c.options),{code:'CLOCK_RESTART_QUARANTINED'});
 c.timeline.mono+=ceiling-c.timeline.wall;c.timeline.wall=ceiling;
 const recovered=await openClock(c.options);t.after(()=>recovered.close());assert.equal(recovered.uuid,uuid);assert.equal(recovered.now(),ceiling);
});

test('Phase7 real HTTP clock failure denies existing key/grant while liveness remains independent',async t=>{
 const timeline={wall:Date.now(),mono:0},c=await accessFixture({serviceOptions:{now:()=>timeline.wall,monotonicNow:()=>timeline.mono}});t.after(()=>c.close());c.license();
 assert.equal((await c.check()).status,200);timeline.mono+=20;const denied=await c.check();assert.equal(denied.status,503);assert.equal(denied.data.error.code,'CLOCK_UNAVAILABLE');
 timeline.wall+=1000;timeline.mono+=1000;assert.equal((await c.check()).status,503);
 assert.equal((await new Browser(c.base).request('GET','/v1/health/live')).status,200);
});

test('Phase7 new durable namespace explicitly revokes legacy NULL-authority credential metadata only',async t=>{
 const c=await accessFixture();t.after(()=>c.close());const legacy='key_'+randomBytes(16).toString('hex');
 await c.native.query(`INSERT INTO api_credentials(id,app_id,name,prefix,token_hash,scopes,creator_id,created_at,expires_at,authority_uuid)
  SELECT $1,app_id,'Legacy metadata',$2,$3,scopes,creator_id,created_at,expires_at,NULL FROM api_credentials WHERE id=$4`,[legacy,'pact_sk_dev_'+legacy,randomBytes(32).toString('hex'),c.own.credentialId]);
 const service=await createService({database:c.native,origin:ORIGIN,pepper:random(),profile:'test',clockDirectory:await clockDirectory(),rateLimit:1000});t.after(()=>service.close());
 const rows=(await c.native.query('SELECT id,revoked_at FROM api_credentials WHERE id=ANY($1::text[])',[[legacy,c.own.credentialId]])).rows;
 assert.ok(rows.find(row=>row.id===legacy).revoked_at!==null);assert.equal(rows.find(row=>row.id===c.own.credentialId).revoked_at,null);
});
