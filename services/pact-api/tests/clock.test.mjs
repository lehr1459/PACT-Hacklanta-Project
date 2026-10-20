import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {mkdtemp,rm,readFile,writeFile,unlink,mkdir,copyFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomBytes} from 'node:crypto';
import {syncBuiltinESMExports} from 'node:module';
import {spawn} from 'node:child_process';
import {createDatabase,migrate} from '../src/database.mjs';
import {openClock,attachClock} from '../src/clock.mjs';
import {keyed} from '../src/security.mjs';
import {createService} from '../src/service.mjs';
import {wallet} from './fixtures.mjs';

const nonce=()=>randomBytes(32).toString('hex');
async function setup(t){
  const directory=await mkdtemp(join(tmpdir(),'pact-authority-test-'));
  const database=await createDatabase({profile:'test'});await migrate(database);
  const sources={wall:Date.now(),mono:1000},wallNow=()=>sources.wall,monotonicNow=()=>sources.mono,namespace=nonce();
  const leases=[];
  t.after(async()=>{for(const lease of leases)lease.close();await database.close();
    assert.ok(directory.startsWith(join(tmpdir(),'pact-authority-test-')));await rm(directory,{recursive:true,force:true});});
  async function open(extra={}){const lease=await openClock({database,directory,namespace,wallNow,monotonicNow,...extra});leases.push(lease);return lease;}
  return{directory,database,sources,wallNow,monotonicNow,namespace,open,leases};
}

test('clock persists its ceiling before returning, shares exact authority, cold restart quarantines then resumes',async t=>{
  const f=await setup(t),clock=await f.open();const first=clock.now();
  const record=await readFile(join(f.directory,'authority.bin'));assert.equal(record.length,256);
  const ceiling=Number(record.subarray(111,127).toString('ascii'));assert.ok(first<ceiling);
  const second=await attachClock(clock,{database:f.database,namespace:f.namespace});f.leases.push(second);
  assert.equal(second.uuid,clock.uuid);assert.equal(second.now(),first);
  await assert.rejects(()=>f.open({wallNow:()=>f.sources.wall}),error=>error.code==='CLOCK_CONTEXT_MISMATCH');
  second.close();clock.close();
  await assert.rejects(()=>f.open(),error=>error.code==='CLOCK_RESTART_QUARANTINED');
  f.sources.wall=ceiling;f.sources.mono+=100;
  const resumed=await f.open();assert.equal(resumed.uuid,clock.uuid);assert.equal(resumed.now(),ceiling);
  await assert.rejects(()=>attachClock(resumed,{database:f.database,namespace:nonce()}),error=>error.code==='CLOCK_CONTEXT_MISMATCH');
});

test('clock missing/recreated/orphan/corrupt/torn files never bootstrap an existing namespace or fall back',async t=>{
  const f=await setup(t),clock=await f.open();clock.close();
  const file=join(f.directory,'authority.bin'),original=await readFile(file);
  f.sources.wall+=100;f.sources.mono+=100;
  await unlink(file);
  await assert.rejects(()=>f.open(),error=>error.code==='CLOCK_BINDING_MISMATCH');
  assert.equal(fs.existsSync(file),false);
  for(const invalid of[original.subarray(0,100),Buffer.alloc(256),Buffer.concat([original,Buffer.from('x')]),
    Buffer.from(original).fill(120,140,141)]){
    await writeFile(file,invalid,{mode:0o600});
    await assert.rejects(()=>f.open(),error=>error.code==='CLOCK_RECORD_INVALID');
  }
  await writeFile(file,original,{mode:0o600});
  const orphan=join(f.directory,'orphan');await mkdir(orphan,{mode:0o700});await copyFile(file,join(orphan,'authority.bin'));
  await assert.rejects(()=>f.open({directory:orphan,namespace:nonce()}),error=>error.code==='CLOCK_BINDING_MISMATCH');
});

for(const kind of['wall-backward','mono-backward','frozen-wall','forward-then-freeze','short-write','fsync-failure','slow-disk','corrupt-record','replaced-file','replaced-lock']){
  test(`clock ${kind} latches unavailable and cannot revive TTLs`,async t=>{
    const f=await setup(t),clock=await f.open();const previous=clock.now();
    const originalWrite=fs.writeSync,originalSync=fs.fsyncSync;
    try{
      if(kind==='wall-backward')f.sources.wall--;
      if(kind==='mono-backward')f.sources.mono--;
      if(kind==='frozen-wall')f.sources.mono+=3;
      if(kind==='forward-then-freeze'){f.sources.wall+=10000;f.sources.mono+=1;assert.ok(clock.now()>previous);f.sources.mono+=3;}
      if(kind==='short-write'){f.sources.wall+=101;f.sources.mono+=101;fs.writeSync=()=>1;syncBuiltinESMExports();}
      if(kind==='fsync-failure'){f.sources.wall+=101;f.sources.mono+=101;fs.fsyncSync=()=>{throw Error('synthetic disk failure');};syncBuiltinESMExports();}
      if(kind==='slow-disk'){f.sources.wall+=101;f.sources.mono+=101;fs.fsyncSync=fd=>{originalSync(fd);f.sources.wall+=101;f.sources.mono+=101;};syncBuiltinESMExports();}
      if(kind==='corrupt-record'){
        const path=join(f.directory,'authority.bin'),bytes=await readFile(path);bytes[140]^=1;await writeFile(path,bytes);
      }
      if(kind.startsWith('replaced-')){
        const path=join(f.directory,kind==='replaced-file'?'authority.bin':'owner.lock'),bytes=await readFile(path);
        await unlink(path);await writeFile(path,bytes,{mode:0o600});
      }
      assert.throws(()=>clock.now(),error=>error.status===503);
      f.sources.wall+=100000;f.sources.mono+=100000;
      assert.throws(()=>clock.now(),error=>error.code==='CLOCK_UNAVAILABLE','failure must latch until explicit recovery');
    }finally{fs.writeSync=originalWrite;fs.fsyncSync=originalSync;syncBuiltinESMExports();}
  });
}

test('actual second Node process cannot claim an actively locked clock volume',async t=>{
  const f=await setup(t);await f.open();
  const source=`import {openClock} from ${JSON.stringify(new URL('../src/clock.mjs',import.meta.url).href)};
    try{await openClock({database:{kind:'test'},directory:process.argv[1],namespace:process.argv[2]});process.exitCode=2;}
    catch(error){process.stdout.write(error.code??'UNEXPECTED');process.exitCode=error.code==='CLOCK_OWNER_LOCKED'?0:3;}`;
  const result=await new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,['--input-type=module','-e',source,f.directory,f.namespace],{stdio:['ignore','pipe','pipe'],windowsHide:true});let output='';
    child.stdout.on('data',chunk=>output+=chunk);child.on('error',reject);child.on('exit',code=>resolve({code,output}));
  });
  assert.equal(result.code,0);assert.equal(result.output,'CLOCK_OWNER_LOCKED');
});

test('real wall/monotonic clock integrates fixed record I/O without future verification timestamps',async t=>{
  const f=await setup(t),clock=await f.open({wallNow:Date.now,monotonicNow:()=>performance.now()});
  const durations=[];
  for(let i=0;i<1500;i++){
    const started=performance.now(),time=clock.now();durations.push(performance.now()-started);
    assert.ok(time<=Date.now());
  }
  durations.sort((a,b)=>a-b);
  t.diagnostic(JSON.stringify({calls:durations.length,p50Ms:durations[750],p95Ms:durations[1425],p99Ms:durations[1485],maxMs:durations.at(-1),...clock.diagnostics()}));
});

test('clock bootstrap retires pre-clock key metadata and UUID epoch invalidates legacy authentication without deleting apps',async t=>{
  const f=await setup(t),pepper=randomBytes(32).toString('base64url'),origin='http://localhost:3000',identity=wallet();
  const namespace=keyed(pepper,'clock-namespace',origin),secret=`pact_sk_dev_key_${'a'.repeat(32)}_${randomBytes(32).toString('base64url')}`;
  const oldHash=keyed(pepper,`${origin}\0api-key`,secret);
  await f.database.query("INSERT INTO developer_accounts(id,wallet,created_at) VALUES('legacy-admin',$1,$2)",[identity.address,f.sources.wall]);
  await f.database.query("INSERT INTO developer_applications(id,owner_id,name,framework,status,created_at,updated_at) VALUES('legacy-app','legacy-admin','Legacy fixture','rest','active',$1,$1)",[f.sources.wall]);
  await f.database.query(`INSERT INTO api_credentials(id,app_id,creator_id,name,prefix,token_hash,scopes,created_at,expires_at)
    VALUES($1,'legacy-app','legacy-admin','Legacy key','legacy',$2,'["access:check"]',$3,$4)`,[`key_${'a'.repeat(32)}`,oldHash,f.sources.wall,f.sources.wall+3600000]);
  const clock=await f.open({namespace});
  const service=await createService({database:f.database,profile:'test',origin,pepper,clock,reader:{}});t.after(()=>service.close());
  assert.equal((await service.server.inject({method:'POST',url:'/v1/credentials/validate',payload:{},headers:{authorization:`Bearer ${secret}`}})).statusCode,401);
  const row=(await f.database.query('SELECT revoked_at FROM api_credentials WHERE token_hash=$1',[oldHash])).rows[0];assert.ok(row.revoked_at!==null);
  assert.equal(Number((await f.database.query('SELECT COUNT(*) AS count FROM developer_applications')).rows[0].count),1);
  for(const purpose of['api-key','admin-session','browser','buyer-browser','wallet-grant','login-code','login-state','dns']){
    assert.notEqual(service.hash(purpose,'synthetic-value'),keyed(pepper,`${origin}\0${purpose}`,'synthetic-value'));
  }
});
