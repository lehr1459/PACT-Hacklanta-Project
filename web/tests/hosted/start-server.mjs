import {createServer} from 'node:http';
import {randomBytes,createHash,timingSafeEqual} from 'node:crypto';
import {spawn} from 'node:child_process';
import {access} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createDatabase,migrate} from '../../../services/pact-api/src/database.mjs';
import {createService} from '../../../services/pact-api/src/service.mjs';
import {prepareDatabase,nonce,wallet as disposableWallet} from '../../../scripts/hosted-qa/helpers.mjs';
import {Browser} from '../../../scripts/hosted-qa/browser.mjs';
import {validationEnv} from '../../../scripts/validation/common.mjs';
import {rpcFixture} from '../../../scripts/hosted-qa/rpc-fixture.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
if(process.env.PACT_HOSTED_QA_CLEAN!=='1')throw Error('Run only in an explicitly approved isolated clean test checkout');
for(const project of ['', 'web','services/pact-api'])for(const name of ['.env','.env.local','.env.production','.env.production.local','.env.test','.env.test.local']){
 try{await access(path.join(root,project,name));throw Error('Active environment file exists; contents were not read');}
 catch(error){if(error.code!=='ENOENT')throw error;}
}
await access(path.join(root,'web/.next/BUILD_ID'));
const ORIGIN='http://127.0.0.1:3112',CONSUMER='http://127.0.0.1:3113',CALLBACK=CONSUMER+'/callback';
const random=()=>randomBytes(32).toString('base64url');
const same=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.length===b.length&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
const db=await createDatabase({connectionString:await prepareDatabase(),profile:'test'});await migrate(db);
const rpc=await rpcFixture();
const service=await createService({database:db,origin:ORIGIN,pepper:random(),profile:'test',rateLimit:1000,readerOptions:{rpcUrl:rpc.url}});
const upstream=await service.server.listen({port:0,host:'127.0.0.1'}),admin=new Browser(upstream,ORIGIN);await admin.login();
let r=await admin.request('POST','/v1/developer/apps',{name:`Independent browser consumer ${nonce()}`,framework:'rest'});
if(r.status!==200)throw Error('App fixture failed');const appId=r.data.app.id;
r=await admin.mutate('POST',`/v1/developer/apps/${appId}/callback-uris`,appId,'callback.create',{uri:CALLBACK,websiteOrigin:CONSUMER});
if(r.status!==200)throw Error('Callback fixture failed');
r=await admin.mutate('PATCH',`/v1/developer/apps/${appId}`,appId,'app.update',{status:'active'});
if(r.status!==200)throw Error('App activation fixture failed');
r=await admin.mutate('POST',`/v1/developer/apps/${appId}/credentials`,appId,'credential.create',
 {name:'private browser-fixture backend key',scopes:['connect:write','access:check'],expiresAt:Date.now()+3600000});
if(r.status!==200)throw Error('Credential fixture failed');
const key=r.data.secret,sessions=new Map();let ready=false;
async function backend(route,body){
 const response=await fetch(upstream+route,{method:'POST',headers:{authorization:`Bearer ${key}`,'content-type':'application/json'},body:JSON.stringify(body)});
 let data;try{data=await response.json();}catch{throw Error('Invalid service response');}
 if(!response.ok||data.schemaVersion!==1)throw Error('Service denied consumer operation');return data;
}
function sessionId(req){return (req.headers.cookie??'').split(';').map(x=>x.trim()).find(x=>x.startsWith('qa_consumer_sid='))?.slice(16);}
function json(res,value,status=200){res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(value));}
const consumer=createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,CONSUMER);
  if(url.pathname==='/qa/ready')return json(res,{ready},ready?200:503);
  if(req.method==='POST'&&['/qa/seller-offer','/qa/rpc-state','/qa/expire-admin','/qa/validate-key','/qa/exercise-access'].includes(url.pathname)){
   let bytes='';for await(const chunk of req){bytes+=chunk;if(bytes.length>4096)throw Error('Fixture request too large');}
   const body=JSON.parse(bytes);
   if(url.pathname==='/qa/seller-offer'){
    const publicKeyBytes=Buffer.from(body.publicKeyBase64??'','base64');if(publicKeyBytes.length!==32)throw Error('Invalid fixture public key');
    const offer=rpc.addOffer({seller:{address:body.walletAddress,publicKeyBytes},nonce:1n});
    return json(res,{offerAddress:offer.address});
   }
   if(url.pathname==='/qa/rpc-state'){
    if(typeof body.fail!=='boolean')throw Error('Invalid fixture RPC state');rpc.state.fail=body.fail;return json(res,{updated:true});
   }
   if(url.pathname==='/qa/expire-admin'){
    if(typeof body.walletAddress!=='string'||!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(body.walletAddress))throw Error('Invalid fixture wallet');
    await db.query(`UPDATE admin_sessions SET expires_at=$1 WHERE account_id IN(SELECT id FROM developer_accounts WHERE wallet=$2)`,[Date.now()-1,body.walletAddress]);
    return json(res,{updated:true});
   }
   if(typeof body.secret!=='string'||body.secret.length>200)throw Error('Invalid fixture credential');
   if(url.pathname==='/qa/exercise-access'){
    const api=new Browser(upstream,ORIGIN),identity=disposableWallet(),verifier=random(),state=random();
    let answer=await api.backend('/v1/connect/transactions',body.secret,{redirectUri:CALLBACK,state,
     codeChallenge:createHash('sha256').update(verifier).digest('base64url'),codeChallengeMethod:'S256',purpose:'Independent console monitoring fixture'});
    if(answer.status!==200)throw Error('Fixture transaction denied');const transactionId=answer.data.transactionId,buyer=new Browser(upstream,ORIGIN);
    answer=await buyer.request('GET',`/v1/connect/transactions/${transactionId}`);buyer.csrf=answer.data.csrfToken;
    answer=await buyer.request('POST','/v1/connect/challenge',{transactionId,walletAddress:identity.address});
    answer=await buyer.request('POST','/v1/connect/verify',{transactionId,challengeId:answer.data.challengeId,signatureBase64:identity.sign(answer.data.message)});
    if(answer.status!==200)throw Error('Fixture proof denied');
    answer=await api.backend('/v1/connect/token',body.secret,{code:new URL(answer.data.callbackUrl).searchParams.get('code'),redirectUri:CALLBACK,state,codeVerifier:verifier,issuer:ORIGIN});
    if(answer.status!==200)throw Error('Fixture grant denied');const walletGrant=answer.data.walletGrant;
    const denied=await api.backend('/v1/access/check',body.secret,{walletGrant,resourceKey:body.resourceKey});
    const offer=rpc.offers.get(body.offerAddress);if(!offer)throw Error('Missing fixture offer');
    rpc.addLicense({offer,buyer:identity,expirySeconds:BigInt(Math.floor(Date.now()/1000)+60)});
    const allowed=await api.backend('/v1/access/check',body.secret,{walletGrant,resourceKey:body.resourceKey});
    await service.flushTelemetry();
    return json(res,{denyStatus:denied.status,allowStatus:allowed.status,appId:allowed.data.appId??null});
   }
   const checked=await fetch(upstream+'/v1/credentials/validate',{method:'POST',headers:{authorization:`Bearer ${body.secret}`,'content-type':'application/json'},body:'{}'});
   const metadata=await checked.json();return json(res,{valid:checked.ok,status:checked.status,appId:metadata.appId??null,credentialId:metadata.credentialId??null});
  }
  if(url.pathname==='/start'){
   const sid=random(),state=random(),verifier=random(),codeChallenge=createHash('sha256').update(verifier).digest('base64url');
   const tx=await backend('/v1/connect/transactions',{redirectUri:CALLBACK,state,codeChallenge,codeChallengeMethod:'S256',purpose:'Sign in to the independent browser consumer'});
   if(url.searchParams.get('mode')==='expired')await db.query('UPDATE login_transactions SET expires_at=$1 WHERE id=$2',[Date.now()-1,tx.transactionId]);
   sessions.set(sid,{state,verifier,issuer:ORIGIN,transactionId:tx.transactionId,completed:false,denied:false,exchanges:0});
   res.writeHead(303,{location:tx.loginUrl,'set-cookie':`qa_consumer_sid=${sid}; HttpOnly; SameSite=Lax; Path=/; Max-Age=600`,
    'cache-control':'no-store','referrer-policy':'no-referrer'});res.end();return;
  }
  const s=sessions.get(sessionId(req));
  if(url.pathname==='/callback'){
   if(!s||s.completed||!same(url.searchParams.get('state'),s.state)||url.searchParams.get('iss')!==s.issuer
    ||['code','state','iss'].some(k=>url.searchParams.getAll(k).length!==1)
    ||[...url.searchParams.keys()].some(k=>!['code','state','iss'].includes(k)))throw Error('Consumer state/issuer mismatch');
   const result=await backend('/v1/connect/token',{code:url.searchParams.get('code'),redirectUri:CALLBACK,state:s.state,codeVerifier:s.verifier,issuer:s.issuer});
   if(result.appId!==appId||result.environment!=='devnet'||result.issuer!==ORIGIN||!/^pact_grant_[A-Za-z0-9_-]{43}$/.test(result.walletGrant)
    ||result.expiresAt<=Date.now())throw Error('Invalid consumer grant');
   s.grant=result.walletGrant;s.wallet=result.walletAddress;s.completed=true;s.exchanges++;delete s.state;delete s.verifier;
   res.writeHead(303,{location:'/result','cache-control':'no-store','referrer-policy':'no-referrer'});res.end();return;
  }
  if(url.pathname==='/qa/status')return json(res,{completed:s?.completed??false,denied:s?.denied??false,exchanges:s?.exchanges??0,
   walletAddress:s?.wallet??null,serverSessionHasGrant:Boolean(s?.grant)});
  if(url.pathname==='/result'){
   res.writeHead(s?.completed?200:401,{'content-type':'text/html; charset=utf-8','cache-control':'no-store','referrer-policy':'no-referrer'});
   res.end(s?.completed?'<h1>Consumer signed in</h1><p>Wallet identity is proven. Licensing access requires a separate backend check.</p>':'<h1>Consumer access denied</h1>');return;
  }
  json(res,{error:'not found'},404);
 }catch{const s=sessions.get(sessionId(req));if(s)s.denied=true;json(res,{error:'Consumer sign-in denied'},401);}
});
await new Promise((resolve,reject)=>{consumer.once('error',reject);consumer.listen(3113,'127.0.0.1',resolve);});
const next=spawn(process.execPath,[path.join(root,'web/node_modules/next/dist/bin/next'),'start','--hostname','127.0.0.1','--port','3112'],{
 cwd:path.join(root,'web'),stdio:'inherit',windowsHide:true,env:validationEnv({NODE_ENV:'production',NEXT_TELEMETRY_DISABLED:'1',
  PACT_ENV_PROFILE:'test',PACT_APP_ORIGIN:ORIGIN,PACT_AUTH_MODE:'disabled',PACT_SERVER_POLICY:'disabled',PACT_PROCESS_MODEL:'stateless',
  NEXT_PUBLIC_PACT_SOLANA_PROGRAM_ID:'EiiiWWsW2kkqP6nugHz6iBADvhnW5xnibAtZ82ZExVqy',
  NEXT_PUBLIC_SOLANA_RPC_URL:'https://api.devnet.solana.com',NEXT_PUBLIC_PACT_CONTRACT_ADDRESS:'',PACT_HOSTED_API_INTERNAL_URL:upstream}),
});
let stopping=false;
async function stop(){if(stopping)return;stopping=true;next.kill();await new Promise(resolve=>consumer.close(resolve));await service.close();await db.close();await rpc.close();}
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{void stop().finally(()=>process.exit());});
next.once('exit',code=>{void stop().finally(()=>process.exit(code??1));});
for(let i=0;i<120;i++){
 try{const response=await fetch(ORIGIN+'/connect',{signal:AbortSignal.timeout(1000)});if(response.ok){ready=true;break;}}
 catch{}
 await new Promise(resolve=>setTimeout(resolve,250));
}
if(!ready){await stop();throw Error('Prebuilt isolated Next server failed readiness');}
console.log('Hosted browser fixture ready: Next3112, independent consumer3113, native PostgreSQL, synthetic wallets only');
