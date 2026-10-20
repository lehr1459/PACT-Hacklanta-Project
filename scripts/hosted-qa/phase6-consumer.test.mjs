import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer,request as httpRequest} from 'node:http';
import {spawn} from 'node:child_process';
import {access} from 'node:fs/promises';
import path from 'node:path';
import {accessFixture} from './access-fixture.mjs';
import {Browser} from './browser.mjs';
import {wallet} from './helpers.mjs';
import {createPactClient} from '../../packages/pact-hosted-client/index.mjs';
import {createExpressExample} from '../../examples/pact-hosted-express/server.mjs';

async function listener(server){await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});return `http://127.0.0.1:${server.address().port}`;}
async function close(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
function hostileHost(origin,cookie){return new Promise((resolve,reject)=>{
 const request=httpRequest(origin+'/api/session',{headers:{host:'evil.invalid',cookie}},response=>{response.resume();response.on('end',()=>resolve(response.statusCode));});
 request.on('error',()=>reject(Error('Host probe transport failure')));request.end();
});}
async function fixture(t){
 let upstream;const proxy=createServer(async(req,res)=>{
  try{let body='';for await(const bytes of req){body+=bytes;if(body.length>16384)throw Error();}
   const headers={'content-type':'application/json'};for(const name of ['authorization','cookie','origin','x-pact-csrf'])if(req.headers[name])headers[name]=req.headers[name];
   const response=await fetch(upstream+req.url,{method:req.method,headers,redirect:'manual',...(body?{body}:{})});
   res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
  }catch{res.writeHead(503,{'content-type':'application/json','cache-control':'no-store'});res.end('{}');}
 });
 const pactOrigin=await listener(proxy),c=await accessFixture({serviceOptions:{origin:pactOrigin}});upstream=c.base;
 t.after(async()=>{await close(proxy);await c.close();});
 return {...c,pactOrigin,client:createPactClient({origin:pactOrigin,apiKey:c.own.key,appId:c.own.id})};
}
function browser(origin){
 const jar=new Map();let csrf;
 async function request(method,route,body,overrides={}){
  const headers={cookie:[...jar].map(([k,v])=>k+'='+v).join('; '),...(body?{'content-type':'application/json',origin,'x-pact-csrf':csrf}:{})};
  for(const[key,value]of Object.entries(overrides)){if(value===null)delete headers[key];else headers[key]=value;}
  const response=await fetch(new URL(route,origin),{method,headers,redirect:'manual',...(body?{body:JSON.stringify(body)}:{})});
  for(const cookie of response.headers.getSetCookie()){const pair=cookie.split(';')[0],index=pair.indexOf('=');jar.set(pair.slice(0,index),pair.slice(index+1));}
  const text=await response.text();assert.equal(/pact_grant_|pact_sk_dev_key_/.test(text),false,'browser response must not contain server secrets');
  const data=text?JSON.parse(text):null;return{status:response.status,headers:response.headers,data};
 }
 async function session(){const r=await request('GET','/api/session');assert.equal(r.status,200);csrf=r.data.csrfToken;return r;}
 return{request,session,get cookie(){return [...jar].map(([k,v])=>k+'='+v).join('; ');}};
}
async function prove(c,loginUrl,identity){
 const transactionId=new URL(loginUrl).searchParams.get('transactionId'),buyer=new Browser(c.base,c.pactOrigin);
 let r=await buyer.request('GET','/v1/connect/transactions/'+transactionId);assert.equal(r.status,200);buyer.csrf=r.data.csrfToken;
 r=await buyer.request('POST','/v1/connect/challenge',{transactionId,walletAddress:identity.address});assert.equal(r.status,200);
 r=await buyer.request('POST','/v1/connect/verify',{transactionId,challengeId:r.data.challengeId,signatureBase64:identity.sign(r.data.message)});
 assert.equal(r.status,200);return r.data.callbackUrl;
}
async function exercise(t,c,origin,restart){
 const callback=origin+'/api/login/callback';assert.equal((await c.admin.mutate('POST',c.own.path+'/callback-uris',c.own.id,'callback.create',{uri:callback,websiteOrigin:origin})).status,200);
 const app=browser(origin),identity=wallet();let response=await app.session();assert.equal(response.data.authenticated,false);
 assert.match(response.headers.get('set-cookie'),/HttpOnly/);assert.match(response.headers.get('set-cookie'),/SameSite=Lax/);
 assert.equal(await hostileHost(origin,app.cookie),400);
 response=await app.request('GET','/api/session',undefined,{'x-forwarded-host':'evil.invalid','x-forwarded-proto':'https'});assert.equal(response.status,200);assert.equal(response.data.appId,c.own.id);
 assert.equal((await app.request('GET','/api/protected')).status,401);
 assert.equal((await app.request('POST','/api/login/start',{}, {'x-pact-csrf':null})).status,403);
 assert.equal((await app.request('POST','/api/login/start',{}, {origin:'http://evil.invalid'})).status,403);
 assert.equal((await app.request('POST','/api/login/start',{walletGrant:'caller-override'})).status,400);
 response=await app.request('POST','/api/login/start',{});assert.equal(response.status,200);const beforeCookie=app.cookie,callbackUrl=await prove(c,response.data.loginUrl,identity);
 const tampered=new URL(callbackUrl);tampered.searchParams.set('iss','http://evil.invalid');assert.equal((await app.request('GET',tampered.href)).status,303);assert.equal((await app.session()).data.authenticated,false);
 response=await app.request('GET',callbackUrl);assert.equal(response.status,303);assert.equal(response.headers.get('location'),origin+'/');assert.notEqual(app.cookie,beforeCookie);
 response=await app.session();assert.equal(response.data.authenticated,true);assert.equal(response.data.walletAddress,identity.address);
 assert.equal((await app.request('GET','/api/protected')).status,403);
 const license=c.rpc.addLicense({offer:c.offer,buyer:identity,expirySeconds:BigInt(Math.floor(Date.now()/1000)+60)});
 const tick=()=>{c.clock.value=Date.now();c.rpc.state.timestampSeconds=Math.floor(c.clock.value/1000);};tick();
 assert.equal((await app.request('GET','/api/protected')).status,200);tick();
 assert.equal((await app.request('POST','/api/action',{})).data.actionCount,1);
 assert.equal((await app.request('POST','/api/action',{}, {'x-pact-csrf':null})).status,403);
 assert.equal((await app.request('GET',callbackUrl,undefined,{cookie:beforeCookie})).status,303);
 assert.equal((await app.session()).data.authenticated,true,'replay cannot replace or mint local authority');
 assert.equal(Number((await c.native.query('SELECT COUNT(*) AS count FROM wallet_grants WHERE app_id=$1 AND wallet=$2',[c.own.id,identity.address])).rows[0].count),1);
 tick();license.expirySeconds=BigInt(c.rpc.state.timestampSeconds);assert.equal((await app.request('GET','/api/protected')).status,403);
 license.expirySeconds+=60n;tick();c.rpc.state.fail=true;assert.notEqual((await app.request('GET','/api/protected')).status,200);c.rpc.state.fail=false;
 tick();assert.equal((await app.request('GET','/api/protected')).status,200);
 if(restart){
  const cookie=app.cookie;await restart();assert.equal((await app.request('GET','/api/protected',undefined,{cookie})).status,401,'restart loses a previously licensed local session');
  tick();await app.session();const started=await app.request('POST','/api/login/start',{});assert.equal(started.status,200);
  const nextCallback=await prove(c,started.data.loginUrl,identity);assert.equal((await app.request('GET',nextCallback)).status,303);await app.session();tick();
  assert.equal((await app.request('GET','/api/protected')).status,200);
 }
 const gate=c.rpc.holdNextSnapshot();t.after(()=>gate.release());tick();const pending=app.request('GET','/api/protected');await gate.entered;
 const logout=await app.request('POST','/api/logout',{});assert.equal(logout.status,200);assert.equal(logout.data.grantRevocationConfirmed,true);gate.release();
 assert.notEqual((await pending).status,200,'late result cannot revive logged-out local session');assert.equal((await app.request('GET','/api/protected')).status,401);
 assert.ok((await c.native.query('SELECT revoked_at FROM wallet_grants WHERE app_id=$1 AND wallet=$2',[c.own.id,identity.address])).rows.some(row=>row.revoked_at!==null));
 const anonymous=await app.session();assert.equal(anonymous.data.authenticated,false);
 assert.equal((await app.request('POST','/api/action',{}, {origin:'http://evil.invalid'})).status,403);
}

test('Phase6 actual Express + private client + native PG + hardened RPC denies and enforces real consumer flow',{timeout:20000},async t=>{
 const c=await fixture(t),server=createServer(),origin=await listener(server);
 const {app}=createExpressExample({config:{origin,pactOrigin:c.pactOrigin,appId:c.own.id,resourceKey:'premium'},client:c.client});server.on('request',app);t.after(()=>close(server));
 await exercise(t,c,origin);
});

test('Phase6 actual production Next BFF + private client + native PG + hardened RPC enforces real consumer flow',{skip:!process.env.PACT_QA_NEXT_EXAMPLE_BUILD,timeout:45000},async t=>{
 const directory=path.resolve(process.env.PACT_QA_NEXT_EXAMPLE_BUILD);await access(path.join(directory,'.next/BUILD_ID'));
 for(const name of ['.env','.env.local','.env.production','.env.production.local']){
  try{await access(path.join(directory,name));throw Error('Active example environment exists; contents were not read');}catch(error){if(error.code!=='ENOENT')throw error;}
 }
 const c=await fixture(t),reservation=createServer(),origin=await listener(reservation);await close(reservation);let child;
 async function start(){
  child=spawn(process.execPath,[path.join(directory,'node_modules/next/dist/bin/next'),'start','--hostname','127.0.0.1','--port',new URL(origin).port],{
   cwd:directory,windowsHide:true,stdio:'ignore',env:{...process.env,NODE_ENV:'production',NEXT_TELEMETRY_DISABLED:'1',PACT_API_BASE_URL:c.pactOrigin,
    PACT_API_KEY:c.own.key,PACT_APP_ID:c.own.id,PACT_RESOURCE_KEY:'premium',PACT_CONSUMER_ORIGIN:origin,WEB_CONCURRENCY:'1'}});
  let observed='no response';
  for(let i=0;i<120;i++){if(child.exitCode!==null)throw Error('Isolated Next consumer exited');try{const response=await fetch(origin+'/api/session');if(response.ok)return;const data=await response.json();const code=/^[A-Z][A-Z0-9_]{0,79}$/.test(data.error?.code??'')?data.error.code:'UNSUPPORTED_ERROR';observed=response.status+' '+code;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}throw Error('Isolated Next consumer not ready: '+observed);
 }
 async function stop(){if(child&&child.exitCode===null){const ended=new Promise(resolve=>child.once('exit',resolve));child.kill();await ended;}}
 t.after(stop);await start();await exercise(t,c,origin,async()=>{await stop();await start();});
});
