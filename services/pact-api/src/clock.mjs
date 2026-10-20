import {openSync,closeSync,readSync,writeSync,fsyncSync,fstatSync,lstatSync,realpathSync,unlinkSync} from 'node:fs';
import {resolve,join,dirname} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {ApiError,fail} from './security.mjs';

const SIZE=256,WINDOW=100;
const clocks=new Map(),leases=new WeakMap();
const wallSource=Date.now,monotonicSource=()=>performance.now();
function checksum(bytes){return createHash('sha256').update(bytes).digest('hex');}
function encode(magic,uuid,namespace,ceiling){
  const prefix=Buffer.from(`${magic}\n${uuid}\n${namespace}\n${String(ceiling).padStart(16,'0')}\n`,'ascii');
  if(prefix.length!==128)fail('CLOCK_RECORD_INVALID',503);
  const record=Buffer.alloc(SIZE);prefix.copy(record);record.write(checksum(prefix),128,64,'ascii');return record;
}
function decode(record,magic,namespace){
  const prefix=record.subarray(0,128),parts=prefix.toString('ascii').split('\n');
  if(record.length!==SIZE||parts.length!==5||parts[0]!==magic||!/^[a-f0-9-]{36}$/.test(parts[1])
    ||parts[2]!==namespace||!/^\d{16}$/.test(parts[3])||record.subarray(128,192).toString('ascii')!==checksum(prefix)
    ||record.subarray(192).some(byte=>byte!==0))fail('CLOCK_RECORD_INVALID',503);
  const ceiling=Number(parts[3]);if(!Number.isSafeInteger(ceiling)||ceiling<0)fail('CLOCK_RECORD_INVALID',503);
  return{uuid:parts[1],ceiling};
}
function identity(stat){return`${stat.dev}:${stat.ino}`;}
const pathStat=path=>lstatSync(path,{bigint:true});
const fdStat=fd=>fstatSync(fd,{bigint:true});
function privateFile(stat){return stat.isFile()&&(process.platform==='win32'||(Number(stat.mode)&0o077)===0);}
async function binding(database,namespace){
  if(database.kind==='postgres'){
    const fsync=(await database.query('SHOW fsync')).rows[0]?.fsync;
    const synchronous=(await database.query('SHOW synchronous_commit')).rows[0]?.synchronous_commit;
    if(fsync!=='on'||synchronous!=='on')fail('CLOCK_DATABASE_DURABILITY_REQUIRED',503);
  }
  return(await database.query('SELECT * FROM clock_bindings WHERE namespace_hash=$1',[namespace])).rows[0];
}
export async function openClock({database,directory,namespace,wallNow=wallSource,monotonicNow=monotonicSource}){
  if(typeof directory!=='string'||directory.length<1||typeof wallNow!=='function'||typeof monotonicNow!=='function'
    ||typeof namespace!=='string'||!/^[a-f0-9]{64}$/.test(namespace))fail('CLOCK_CONFIGURATION_REQUIRED',503);
  let path;
  try{
    const absolute=resolve(directory),stat=pathStat(absolute);
    if(!stat.isDirectory()||stat.isSymbolicLink()||dirname(absolute)===absolute
      ||process.platform!=='win32'&&(Number(stat.mode)&0o077)!==0)throw Error();
    path=realpathSync.native(absolute);
  }catch{fail('CLOCK_DIRECTORY_REQUIRED',503);}
  const shared=clocks.get(path);
  if(shared){
    if(shared.namespace!==namespace||shared.wallNow!==wallNow||shared.monotonicNow!==monotonicNow)fail('CLOCK_CONTEXT_MISMATCH',503);
    return attachState(shared,database,namespace);
  }
  const state={path,namespace,wallNow,monotonicNow,file:join(path,'authority.bin'),lock:join(path,'owner.lock'),
    fd:undefined,lockFd:undefined,refs:0,failed:false,lastWall:-1,lastMono:-1,maxOffset:-Infinity,ceiling:0,writes:0,totalWriteMs:0,maxWriteMs:0};
  function unavailable(code){state.failed=true;throw new ApiError(code,503);}
  state.sample=()=>{
    if(state.failed)fail('CLOCK_UNAVAILABLE',503);
    for(let attempt=0;attempt<3;attempt++){
      const before=monotonicNow(),wall=wallNow(),after=monotonicNow();
      if(!Number.isSafeInteger(wall)||wall<0||!Number.isFinite(before)||!Number.isFinite(after)
        ||before<0||after<before||wall<state.lastWall||before<state.lastMono||after<state.lastMono)unavailable('CLOCK_UNAVAILABLE');
      state.lastWall=wall;state.lastMono=after;
      // A scheduler pause makes this pair uncertain. Preserve observed rollback
      // bounds and the retained offset, then seek a tight pair with bounded work.
      if(after-before>1)continue;
      // The wall read lies within this monotonic interval. Retain only its lower
      // offset bound, never resetting that bound when the wall later lags.
      if(Math.floor(before+state.maxOffset)>wall+1)unavailable('CLOCK_UNAVAILABLE');
      state.maxOffset=Math.max(state.maxOffset,wall-after);
      return wall;
    }
    unavailable('CLOCK_UNAVAILABLE');
  };
  state.io=work=>{try{const value=work();state.sample();return value;}catch(error){state.failed=true;throw error instanceof ApiError?error:new ApiError('CLOCK_STORAGE_UNAVAILABLE',503);}};
  state.checkIdentity=()=>{
    const file=state.io(()=>pathStat(state.file)),lock=state.io(()=>pathStat(state.lock));
    const fd=state.io(()=>fdStat(state.fd)),lockFd=state.io(()=>fdStat(state.lockFd));
    if(!privateFile(file)||!privateFile(lock)||file.isSymbolicLink()||lock.isSymbolicLink()||Number(file.size)!==SIZE||Number(lock.size)!==SIZE
      ||identity(file)!==state.fileIdentity||identity(fd)!==state.fileIdentity||identity(lock)!==state.lockIdentity||identity(lockFd)!==state.lockIdentity)unavailable('CLOCK_RECORD_INVALID');
    const record=Buffer.alloc(SIZE),lockRecord=Buffer.alloc(SIZE);
    if(state.io(()=>readSync(state.fd,record,0,SIZE,0))!==SIZE||state.io(()=>readSync(state.lockFd,lockRecord,0,SIZE,0))!==SIZE)unavailable('CLOCK_RECORD_INVALID');
    let parsed,owner;
    try{parsed=decode(record,'PACTCLK1',namespace);owner=decode(lockRecord,'PACTLCK1',namespace);}
    catch{unavailable('CLOCK_RECORD_INVALID');}
    if(parsed.uuid!==state.uuid||parsed.ceiling!==state.ceiling||owner.uuid!==state.lockUuid||owner.ceiling!==0)unavailable('CLOCK_RECORD_INVALID');
  };
  state.persist=wall=>{
    const ceiling=wall+WINDOW;if(!Number.isSafeInteger(ceiling))unavailable('CLOCK_UNAVAILABLE');
    const record=encode('PACTCLK1',state.uuid,namespace,ceiling),started=monotonicNow();
    const written=state.io(()=>writeSync(state.fd,record,0,SIZE,0));if(written!==SIZE)unavailable('CLOCK_STORAGE_UNAVAILABLE');
    state.io(()=>fsyncSync(state.fd));state.ceiling=ceiling;
    state.checkIdentity();const sampled=state.sample();
    const elapsed=monotonicNow()-started;state.writes++;state.totalWriteMs+=elapsed;state.maxWriteMs=Math.max(state.maxWriteMs,elapsed);
    if(sampled>=ceiling)unavailable('CLOCK_STORAGE_OVERRUN');return sampled;
  };
  state.now=()=>{
    const wall=state.sample();state.checkIdentity();
    const checked=state.sample();if(checked>=state.ceiling)return state.persist(checked);
    return checked;
  };
  try{
    state.sample();
    try{state.lockFd=state.io(()=>openSync(state.lock,'wx+',0o600));}catch(error){if(error.code==='CLOCK_STORAGE_UNAVAILABLE')fail('CLOCK_OWNER_LOCKED',503);throw error;}
    state.lockUuid=randomUUID();const lockRecord=encode('PACTLCK1',state.lockUuid,namespace,0);
    if(state.io(()=>writeSync(state.lockFd,lockRecord,0,SIZE,0))!==SIZE)unavailable('CLOCK_STORAGE_UNAVAILABLE');
    state.io(()=>fsyncSync(state.lockFd));state.lockIdentity=identity(state.io(()=>fdStat(state.lockFd)));
    const bound=await binding(database,namespace);state.sample();
    let existing=true;
    try{pathStat(state.file);state.sample();}
    catch(error){if(error.code!=='ENOENT')throw error;state.sample();existing=false;}
    if(Boolean(bound)!==existing)unavailable('CLOCK_BINDING_MISMATCH');
    if(existing){
      state.fd=state.io(()=>openSync(state.file,'r+'));
      const stat=state.io(()=>fdStat(state.fd));if(!privateFile(stat)||Number(stat.size)!==SIZE)unavailable('CLOCK_RECORD_INVALID');
      const record=Buffer.alloc(SIZE);if(state.io(()=>readSync(state.fd,record,0,SIZE,0))!==SIZE)unavailable('CLOCK_RECORD_INVALID');
      const parsed=decode(record,'PACTCLK1',namespace);state.uuid=parsed.uuid;state.ceiling=parsed.ceiling;
      if(bound.clock_uuid!==state.uuid)unavailable('CLOCK_BINDING_MISMATCH');
      if(state.sample()<state.ceiling)unavailable('CLOCK_RESTART_QUARANTINED');
    }else{
      state.uuid=randomUUID();state.fd=state.io(()=>openSync(state.file,'wx+',0o600));
    }
    state.fileIdentity=identity(state.io(()=>fdStat(state.fd)));
    // First creation has no fixed-size record yet; persist before identity checks.
    if(!existing){const record=encode('PACTCLK1',state.uuid,namespace,state.sample()+WINDOW);
      if(state.io(()=>writeSync(state.fd,record,0,SIZE,0))!==SIZE)unavailable('CLOCK_STORAGE_UNAVAILABLE');
      state.io(()=>fsyncSync(state.fd));state.ceiling=decode(record,'PACTCLK1',namespace).ceiling;
      if(process.platform!=='win32'){
        const dir=state.io(()=>openSync(path,'r'));try{state.io(()=>fsyncSync(dir));}finally{closeSync(dir);state.sample();}
      }
      if(state.sample()>=state.ceiling)unavailable('CLOCK_STORAGE_OVERRUN');
      state.checkIdentity();
      await database.transaction(async tx=>{
        if(database.kind==='postgres')await tx.query('SET LOCAL synchronous_commit=on');
        await tx.query('INSERT INTO clock_bindings(namespace_hash,clock_uuid,created_at) VALUES($1,$2,$3)',[namespace,state.uuid,state.now()]);
        await tx.query('UPDATE api_credentials SET revoked_at=COALESCE(revoked_at,$1) WHERE authority_uuid IS NULL',[state.now()]);
      });
      state.sample();
    }
    state.now();clocks.set(path,state);return newLease(state);
  }catch(error){
    // A failed bootstrap keeps any authority record for explicit recovery. Only
    // this process's fresh lock is removed; an existing owner lock is untouched.
    if(state.fd!==undefined)try{closeSync(state.fd);}catch{}
    if(state.lockFd!==undefined){try{closeSync(state.lockFd);}catch{}try{if(identity(pathStat(state.lock))===state.lockIdentity)unlinkSync(state.lock);}catch{}}
    throw error instanceof ApiError?error:new ApiError('CLOCK_STORAGE_UNAVAILABLE',503);
  }
}
function newLease(state){
  state.refs++;let closed=false;
  const lease={uuid:state.uuid,namespace:state.namespace,now:()=>{if(closed)fail('CLOCK_UNAVAILABLE',503);return state.now();},
    diagnostics:()=>({available:!state.failed,windowMs:WINDOW,writes:state.writes,totalWriteMs:state.totalWriteMs,maxWriteMs:state.maxWriteMs}),
    close(){if(closed)return;closed=true;leases.delete(lease);if(--state.refs)return;
      clocks.delete(state.path);
      try{state.checkIdentity();closeSync(state.fd);closeSync(state.lockFd);unlinkSync(state.lock);}catch{state.failed=true;try{closeSync(state.fd);}catch{}try{closeSync(state.lockFd);}catch{}}
    }};
  leases.set(lease,state);return Object.freeze(lease);
}
async function attachState(state,database,namespace){
  if(state.failed||state.namespace!==namespace)fail('CLOCK_CONTEXT_MISMATCH',503);
  const bound=await binding(database,namespace);
  if(!bound||bound.clock_uuid!==state.uuid)fail('CLOCK_BINDING_MISMATCH',503);
  state.now();return newLease(state);
}
export async function attachClock(lease,{database,namespace}){
  const state=leases.get(lease);if(!state)fail('CLOCK_CONFIGURATION_REQUIRED',503);
  return attachState(state,database,namespace);
}
