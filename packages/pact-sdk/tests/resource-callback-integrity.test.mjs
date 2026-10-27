import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {setImmediate as immediate} from 'node:timers/promises';
import {createPactApiHandler,PlatformError} from '../dist/server.js';
import {PactError} from '../dist/index.js';
import {controlledRpc,signer,offer,ORIGIN} from '../../../web/tests/platform/fixtures.mjs';

const PRIVATE='SYNTHETIC_PRIVATE_CALLBACK_CANARY_29d0';
const ASSET='Server-owned licensed bytes.\n';
const address=offer.toBase58();
function environment(t,prepare){
  const identity=signer(),rpc=controlledRpc(identity.wallet),counts={prepare:0,commit:0},jar=new Map();
  const handler=createPactApiHandler({origin:ORIGIN,authMode:'single-process',now:()=>1000000,fetch:rpc.fetch,
    resources:{asset:{offer:address,prepare:context=>{counts.prepare++;return prepare?prepare({context,counts}):{body:ASSET,commit:()=>{counts.commit++;}};}}}});
  t.after(()=>assert.ok(rpc.calls.every(q=>['getGenesisHash','getMultipleAccounts'].includes(q.method)),'Only read-only RPC methods may be attempted'));
  async function call(path='/resources/asset',body){
    const response=await handler(new Request(ORIGIN+'/api/v1'+path,{method:body===undefined?'GET':'POST',
      headers:{origin:ORIGIN,cookie:[...jar].map(([k,v])=>k+'='+v).join('; '),...(body===undefined?{}:{'content-type':'application/json'})},
      ...(body===undefined?{}:{body:JSON.stringify(body)})}));
    for(const item of response.headers.getSetCookie()){const[k,v]=item.split(';')[0].split('=');if(v)jar.set(k,v);else jar.delete(k);}
    const text=await response.text();return{status:response.status,text,response};
  }
  async function authenticate(){
    const challenge=await call('/auth/challenge',{walletAddress:identity.wallet});assert.equal(challenge.status,200);
    const c=JSON.parse(challenge.text),verified=await call('/auth/verify',{challengeId:c.challengeId,signatureBase64:identity.signMessage(c.message)});
    assert.equal(verified.status,200);assert.equal(JSON.parse(verified.text).walletAddress,identity.wallet);
  }
  return{identity,rpc,handler,counts,call,authenticate};
}
function redacted500(result){
  assert.equal(result.status,500);assert.equal(JSON.parse(result.text).error.code,'INTERNAL_ERROR');
  assert.equal(result.text.includes(PRIVATE),false);assert.equal(result.text.includes(ASSET),false);
}

test('positive control proves offline wallet authentication and actual licensed resource delivery',async t=>{
  const e=environment(t);
  assert.equal((await e.call()).status,401);assert.equal(e.counts.prepare,0);assert.equal(e.rpc.calls.length,0);
  e.rpc.state.fail=true;await e.authenticate();assert.equal(e.rpc.calls.length,0,'Message authentication performs no chain read');
  const unavailable=await e.call();assert.equal(unavailable.status,503);assert.equal(unavailable.text.includes(ASSET),false);assert.equal(e.counts.prepare,0);
  e.rpc.state.fail=false;const result=await e.call();assert.equal(result.status,200);assert.equal(result.text,ASSET);
  assert.deepEqual(e.counts,{prepare:1,commit:1});
  assert.equal(e.rpc.calls.filter(q=>q.method==='getMultipleAccounts').length,2,'Two successful read boundaries precede delivery');
});

test('valid synchronous commit never reads a hostile constructor getter',async t=>{
  let getters=0;const e=environment(t,({counts})=>{
    const commit=()=>{counts.commit++;};
    Object.defineProperty(commit,'constructor',{get(){getters++;throw new PlatformError('AUTH_INVALID',PRIVATE,401);}});
    return{body:ASSET,commit};
  });
  await e.authenticate();const result=await e.call();
  assert.equal(result.text.includes(PRIVATE),false);assert.equal(result.status,200);assert.equal(result.text,ASSET);
  assert.equal(getters,0);assert.deepEqual(e.counts,{prepare:1,commit:1});
});

for(const property of ['byteLength','length','byteOffset','buffer'])test(`typed-array payload copies intrinsic bytes without accessing hostile ${property}`,async t=>{
  let getters=0;
  class HostBytes extends Uint8Array{}
  Object.defineProperty(HostBytes.prototype,property,{get(){getters++;throw new PactError('RPC_ERROR',PRIVATE);}});
  const e=environment(t,({counts})=>({body:new HostBytes(new TextEncoder().encode(ASSET)),commit:()=>{counts.commit++;}}));
  await e.authenticate();const result=await e.call();
  assert.equal(result.text.includes(PRIVATE),false);assert.equal(result.status,200);assert.equal(result.text,ASSET);
  assert.equal(getters,0);assert.deepEqual(e.counts,{prepare:1,commit:1});
});

test('actual oversized typed-array view is rejected before copying despite spoofed small lengths',async t=>{
  let getters=0;class HostBytes extends Uint8Array{}
  for(const property of ['byteLength','length'])Object.defineProperty(HostBytes.prototype,property,{get(){getters++;return 1;}});
  const e=environment(t,({counts})=>({body:new HostBytes(1048577),commit:()=>{counts.commit++;}}));
  await e.authenticate();const result=await e.call();
  assert.equal(result.status,500);assert.equal(JSON.parse(result.text).error.code,'BODY_TOO_LARGE');
  assert.equal(e.counts.commit,0);assert.equal(getters,0);
});

for(const phase of ['prepare','dto-getter','commit'])for(const kind of ['platform','pact'])test(`${phase} ${kind} exception is a static redacted application failure`,async t=>{
  const error=()=>kind==='platform'?new PlatformError('AUTH_INVALID',PRIVATE,401):new PactError('RPC_ERROR',PRIVATE);
  const e=environment(t,()=>{
    if(phase==='prepare')throw error();
    if(phase==='dto-getter')return{get body(){throw error();}};
    return{body:ASSET,commit(){throw error();}};
  });
  await e.authenticate();redacted500(await e.call());
});

for(const kind of ['getter','guarded-cycle'])test(`invalid ${kind} commit thenable is rejected without executing any then access`,async t=>{
  let calls=0;
  const thenable=kind==='getter'?Object.defineProperty({},'then',{get(){calls++;throw new Error(PRIVATE);}}):{
    then(resolve){calls++;if(calls<2)resolve(this);else throw new Error(PRIVATE);},
  };
  const e=environment(t,()=>({body:ASSET,commit:()=>thenable}));
  await e.authenticate();redacted500(await e.call());await immediate();await immediate();
  assert.equal(calls,0,'Unsupported return values must not be assimilated or invoked');
});

for(const hostileThen of [false,true])test(`invalid rejected native Promise commit return is drained in an isolated process${hostileThen?' without reading its own then getter':''}`,()=>{
  const server=new URL('../dist/server.js',import.meta.url).href,fixtures=new URL('../../../web/tests/platform/fixtures.mjs',import.meta.url).href;
  const source=`
    import assert from 'node:assert/strict';
    import {setImmediate as immediate} from 'node:timers/promises';
    import {createPactApiHandler} from ${JSON.stringify(server)};
    import {controlledRpc,signer,offer,ORIGIN} from ${JSON.stringify(fixtures)};
    const canary=${JSON.stringify(PRIVATE)},identity=signer(),rpc=controlledRpc(identity.wallet);
    let cookie='',getters=0,unhandled=0,commits=0;
    process.on('unhandledRejection',()=>{unhandled++;});
    const handler=createPactApiHandler({origin:ORIGIN,authMode:'single-process',now:()=>1000000,fetch:rpc.fetch,
      resources:{asset:{offer:offer.toBase58(),prepare:()=>({body:'PRIVATE_ASSET',commit(){
        commits++;const result=Promise.reject(new Error(canary));
        if(${hostileThen})Object.defineProperty(result,'then',{get(){getters++;throw new Error(canary);}});
        return result;
      }})}}});
    async function call(path,body){
      const r=await handler(new Request(ORIGIN+'/api/v1'+path,{method:body===undefined?'GET':'POST',headers:{origin:ORIGIN,cookie,...(body===undefined?{}:{'content-type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})}));
      for(const entry of r.headers.getSetCookie())cookie=[cookie,entry.split(';')[0]].filter(Boolean).join('; ');
      return{status:r.status,text:await r.text()};
    }
    const c=JSON.parse((await call('/auth/challenge',{walletAddress:identity.wallet})).text);
    assert.equal((await call('/auth/verify',{challengeId:c.challengeId,signatureBase64:identity.signMessage(c.message)})).status,200);
    const result=await call('/resources/asset');assert.equal(result.status,500);assert.equal(JSON.parse(result.text).error.code,'INTERNAL_ERROR');assert.equal(result.text.includes(canary),false);
    await immediate();await immediate();assert.equal(unhandled,0);assert.equal(getters,0);assert.equal(commits,1);
    assert.ok(rpc.calls.every(q=>['getGenesisHash','getMultipleAccounts'].includes(q.method)));
    console.log(JSON.stringify({status:result.status,unhandled,getters,commits}));
  `;
  const env={...process.env};delete env.NODE_OPTIONS;delete env.NODE_TEST_CONTEXT;
  const result=spawnSync(process.execPath,['--input-type=module','-e',source],{env,encoding:'utf8',timeout:10000,windowsHide:true});
  assert.equal(result.error,undefined);assert.equal(result.status,0,result.stderr);
  assert.deepEqual(JSON.parse(result.stdout),{status:500,unhandled:0,getters:0,commits:1});
});
