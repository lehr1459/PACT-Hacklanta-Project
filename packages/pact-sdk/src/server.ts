export { createPlatformReader } from './server-chain.js';
export type { PlatformReaderOptions, PrepareOfferInput, PrepareCheckoutInput } from './server-chain.js';
export { createWalletAuth, PlatformError } from './server-auth.js';
export type { WalletAuthOptions } from './server-auth.js';
export {resolvePactEnvironment,publicEnvironmentBinding,PactEnvironmentError} from './environment.js';
export type {PactEnvironmentProfile,PactEnvironmentApplication,PactBuildEnvironmentBinding,ResolvedPactEnvironment} from './environment.js';
export type { ApiDiagnosticEvent, ApiDiagnosticsOptions, ApiFailure, ApiOperation } from './internal/observability.js';
import {createApiObservability,apiOperation,apiFailure,type ApiDiagnosticsOptions} from './internal/observability.js';
import { createEndpointHistory, createPlatformReaderPool, type PlatformReaderOptions } from './server-chain.js';
import { createWalletAuth, PlatformError, canonicalOrigin, canonicalAddress } from './server-auth.js';
import { PACT_PROGRAM_ID, FRESHNESS_MS, isLicenseStatusFresh, type LicenseStatus, PactError } from './index.js';
import {types as nodeTypes} from 'node:util';

const typedArrayPrototype=Object.getPrototypeOf(Uint8Array.prototype);
const arrayLength=Object.getOwnPropertyDescriptor(typedArrayPrototype,'byteLength')!.get!;
const arrayOffset=Object.getOwnPropertyDescriptor(typedArrayPrototype,'byteOffset')!.get!;
const arrayBuffer=Object.getOwnPropertyDescriptor(typedArrayPrototype,'buffer')!.get!;
const promiseThen=Promise.prototype.then;
function discardInvalidCommitResult(value:unknown){
 // An invalid async host commit must fail, but its rejected return must not
 // become an unhandled rejection. Never await or treat it as a successful commit.
 try{if(nodeTypes.isPromise(value))void promiseThen.call(value,()=>{},()=>{});}catch{/* Invalid host return contract. */}
}

export type ResourceContext = Readonly<{walletAddress:string;offerAddress:string;signal:AbortSignal}>;
/** Prepare has no effects. Commit must be synchronous, nonthrowing and atomic in the host application. */
export type PreparedResource = {body:string|Uint8Array;contentType?:string;commit?:()=>undefined};
export type ResourcePolicy = {offer:string;method?:'GET'|'POST';prepare:(context:ResourceContext)=>PreparedResource|Promise<PreparedResource>};
type Budget={perMinute?:number;maxConcurrent?:number};
export type PactApiOptions=PlatformReaderOptions&{
 origin:string;prefix?:string;cookiePath?:string;authMode?:'single-process'|'disabled';protectedOffer?:string;
 challengeTtlMs?:number;sessionTtlMs?:number;capacity?:number;
 resources?:Readonly<Record<string,ResourcePolicy>>;
 requestBudgets?:{public?:Budget;auth?:Budget;protected?:Budget};
 diagnostics?:ApiDiagnosticsOptions;
};
function positiveFresh(s:LicenseStatus,now:number){return isLicenseStatusFresh(s,now)&&BigInt(s.expiry)>BigInt(Math.floor(now/1000));}
function verification(s:LicenseStatus,now:number){
 if(s.active&&!positiveFresh(s,now))throw new PlatformError('STALE','License verification is stale.',503);
 return{network:'devnet' as const,program:PACT_PROGRAM_ID,offerAddress:s.offer,walletAddress:s.wallet,valid:isLicenseStatusFresh(s,now),state:s.state,expiration:s.state==='missing'?null:s.expiry,verifiedAt:new Date(now).toISOString(),reason:s.state==='active'?'VALID' as const:s.state==='expired'?'EXPIRED' as const:'MISSING' as const,walletControlProven:false as const,authorized:false as const,freshness:{verifiedAtMs:now,maxAgeMs:FRESHNESS_MS,contextSlot:s.contextSlot,chainTimestamp:s.chainTimestamp},status:s};
}
function capacity(input:Budget|undefined,defaults:number){
 const perMinute=input?.perMinute??180,maxConcurrent=input?.maxConcurrent??defaults;
 if(!Number.isSafeInteger(perMinute)||perMinute<1||perMinute>100000||!Number.isSafeInteger(maxConcurrent)||maxConcurrent<1||maxConcurrent>64)throw new PlatformError('INVALID_INPUT','Invalid request capacity bounds.');
 return{perMinute,maxConcurrent,active:0,responding:0,requests:0,start:-Infinity,lastNow:-Infinity};
}
/** One persistent same-origin Node process. Public lookup never authenticates or authorizes its supplied wallet. */
export function createPactApiHandler(options:PactApiOptions){
 const settings={...options},origin=canonicalOrigin(settings.origin),prefix=settings.prefix??'/api/v1',cookiePath=settings.cookiePath??prefix,now=settings.now??Date.now;
 if(!/^\/[A-Za-z0-9/_-]+$/.test(prefix)||!/^\/[A-Za-z0-9/_-]+$/.test(cookiePath))throw new PlatformError('INVALID_INPUT','Invalid API or cookie path.');
 const protectedOffer=settings.protectedOffer?canonicalAddress(settings.protectedOffer):undefined;
 const policies=new Map<string,Readonly<ResourcePolicy>>();
 if(Object.keys(settings.resources??{}).length>64)throw new PlatformError('INVALID_INPUT','At most 64 resource policies are supported.');
 for(const[id,p]of Object.entries(settings.resources??{})){
  if(!/^[A-Za-z0-9_-]{1,64}$/.test(id)||!p||typeof p.prepare!=='function'||!['GET','POST'].includes(p.method??'GET'))throw new PlatformError('INVALID_INPUT','Invalid resource policy.');
  policies.set(id,Object.freeze({offer:canonicalAddress(p.offer),method:p.method??'GET',prepare:p.prepare}));
 }
 const history=createEndpointHistory();
 const reader=createPlatformReaderPool(settings,{history,activeLimit:4,queueLimit:8});
 const protectedReader=createPlatformReaderPool(settings,{history,activeLimit:4,queueLimit:8});
 const auth=createWalletAuth({...settings,origin});
 const observability=createApiObservability(settings.diagnostics);
 const budgets={public:capacity(settings.requestBudgets?.public,32),auth:capacity(settings.requestBudgets?.auth,16),protected:capacity(settings.requestBudgets?.protected,4)};
 const cookie=(name:string,value:string,maxAge:number)=>`${name}=${value}; Path=${cookiePath}; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${origin.startsWith('https:')?'; Secure':''}`;
 function cookies(req:Request){
  const raw=req.headers.get('cookie')??'';if(raw.length>8192)throw new PlatformError('AUTH_INVALID','Authentication cookies exceed the limit.',401);
  const out:Record<string,string>=Object.create(null);
  for(const item of raw.split(';')){const i=item.indexOf('=');if(i<0)continue;const key=item.slice(0,i).trim(),value=item.slice(i+1).trim();if(Object.hasOwn(out,key))throw new PlatformError('AUTH_INVALID','Duplicate authentication cookie.',401);out[key]=value;}
  return out;
 }
 function alive(signal:AbortSignal){if(signal.aborted)throw new PlatformError('TIMEOUT','Request was cancelled or timed out.',408);}
 async function emptyBody(req:Request,signal:AbortSignal){
  alive(signal);
  const stated=req.headers.get('content-length');
  if(stated!==null&&(!/^\d+$/.test(stated)||Number(stated)!==0)){void req.body?.cancel().catch(()=>{});throw new PlatformError('INVALID_INPUT','Resource requests do not accept input bytes.');}
  if(req.body===null)return;
  const stream=req.body.getReader(),cancel=()=>{void stream.cancel().catch(()=>{});};
  signal.addEventListener('abort',cancel,{once:true});
  try{
   // Node/Next may expose an empty POST as a stream. Inspect bytes, not stream presence.
   for(let reads=0;reads<32;reads++){const part=await stream.read();alive(signal);if(part.done)return;if(part.value.byteLength>0){cancel();throw new PlatformError('INVALID_INPUT','Resource requests do not accept caller-supplied policy or input.');}}
   cancel();throw new PlatformError('INVALID_INPUT','Invalid empty request stream.');
  }finally{signal.removeEventListener('abort',cancel);stream.releaseLock();}
 }
 async function body(req:Request,keys:string[],signal:AbortSignal){
  alive(signal);const content=req.headers.get('content-type')??'';if(!/^application\/json(?:;|$)/i.test(content))throw new PlatformError('INVALID_INPUT','Use application/json.');
  const stated=req.headers.get('content-length');if(stated&&(!/^\d+$/.test(stated)||Number(stated)>131072))throw new PlatformError('BODY_TOO_LARGE','Request exceeds 128 KiB.',413);
  const chunks:Uint8Array[]=[];let total=0;const stream=req.body?.getReader();if(!stream)throw new PlatformError('INVALID_INPUT','JSON body is required.');
  const cancel=()=>{void stream.cancel().catch(()=>{});};signal.addEventListener('abort',cancel,{once:true});
  try{while(true){const part=await stream.read();alive(signal);if(part.done)break;total+=part.value.length;if(total>131072){cancel();throw new PlatformError('BODY_TOO_LARGE','Request exceeds 128 KiB.',413);}chunks.push(part.value);}}
  finally{signal.removeEventListener('abort',cancel);stream.releaseLock();}
  let value:Record<string,unknown>;try{value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));}catch{throw new PlatformError('INVALID_INPUT','Invalid UTF-8 JSON body.');}
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!keys.includes(k)))throw new PlatformError('INVALID_INPUT','Unsupported request fields.');return value;
 }
 function session(token:string|undefined){const s=auth.session(token);if(!s.authenticated)throw new PlatformError('AUTH_REQUIRED','Prove wallet control before requesting protected access.',401);return s;}
 async function entitlement(token:string|undefined,offer:string,wallet:string,signal:AbortSignal,note:(status:LicenseStatus)=>void){
  alive(signal);if(session(token).walletAddress!==wallet)throw new PlatformError('AUTH_REQUIRED','Wallet session changed.',401);
  const status=await protectedReader.getLicenseStatus({offer,wallet},{signal});
  note(status);
  alive(signal);if(session(token).walletAddress!==wallet)throw new PlatformError('AUTH_REQUIRED','Session changed during verification.',401);
  if(!positiveFresh(status,now()))throw new PlatformError('LICENSE_REQUIRED','An active verified license is required.',403);
  return status;
 }
 const handle=async(req:Request,record:ReturnType<typeof observability.begin>):Promise<Response>=>{
  const headers=new Headers({'content-type':'application/json','cache-control':'no-store','x-content-type-options':'nosniff','x-pact-request-id':record.requestId});
  const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers});
  const note=(status:LicenseStatus)=>{record.failure=status.state==='expired'||BigInt(status.expiry)>0n&&BigInt(status.expiry)<=BigInt(Math.floor(now()/1000))?'license-expired':status.state==='missing'?'license-invalid':positiveFresh(status,now())?'success':'chain-invalid';};
  let release:(()=>void)|undefined,timer:ReturnType<typeof setTimeout>|undefined,removeAbort:(()=>void)|undefined,occupiedBudget:typeof budgets.public|undefined;
  try{
   const url=new URL(req.url);if(url.pathname!==prefix&&!url.pathname.startsWith(prefix+'/'))throw new PlatformError('NOT_FOUND','Unknown API route.',404);
   const path=url.pathname.slice(prefix.length),kind=path.startsWith('/auth/')?'auth':path==='/protected'||path.startsWith('/resources/')?'protected':'public';
   record.operation=apiOperation(path,req.method);
   if(kind==='public'){headers.set('access-control-allow-origin','*');headers.set('access-control-allow-methods','GET, POST, OPTIONS');headers.set('access-control-allow-headers','content-type');headers.set('access-control-expose-headers','x-pact-request-id');}
   if(url.search)throw new PlatformError('INVALID_INPUT','Query parameters are not supported.');
   if(kind!=='public'){const supplied=req.headers.get('origin');if(url.origin!==origin||req.method==='POST'&&supplied!==origin||supplied!==null&&supplied!==origin)throw new PlatformError('FORBIDDEN','Same-origin authentication required.',403);}
   if(req.method==='OPTIONS'){if(kind!=='public')throw new PlatformError('FORBIDDEN','Authentication does not support cross-origin access.',403);return new Response(null,{status:204,headers});}
   // Cheap liveness has no RPC, authentication, or shared worker claim.
   // Reverse-proxy connection/URI budgets still apply outside this handler.
   if(path==='/health/live'&&req.method==='GET')return json({live:true});
   const budget=budgets[kind],t=now();if(!Number.isSafeInteger(t)||t<0||t<budget.lastNow)throw new PlatformError('STALE','Server clock moved backwards.',503);budget.lastNow=t;
   if(t-budget.start>=60000){budget.start=t;budget.requests=0;}
   if(++budget.requests>budget.perMinute)throw new PlatformError('RATE_LIMITED','Request capacity reached. Try later.',429);
   if(budget.active>=budget.maxConcurrent)throw new PlatformError('BUSY','Request concurrency capacity reached. Try later.',503);
   if(req.signal.aborted)throw new PlatformError('TIMEOUT','Request was cancelled.',408);
   budget.active++;budget.responding++;occupiedBudget=budget;release=()=>{budget.active--;};
   const controller=new AbortController(),signal=controller.signal;
   let rejectDeadline!:(reason:unknown)=>void;
   const deadline=new Promise<never>((_,reject)=>{rejectDeadline=reject;});
   const cancel=()=>{controller.abort();rejectDeadline(new PlatformError('TIMEOUT','Request was cancelled or timed out.',408));};
   req.signal.addEventListener('abort',cancel,{once:true});removeAbort=()=>req.signal.removeEventListener('abort',cancel);
   timer=setTimeout(cancel,5000);
   const dispatch=async():Promise<Response>=>{
    alive(signal);
    if(path==='/health/ready'&&req.method==='GET'){
     const capabilities=auth.diagnostics();
     if(settings.authMode==='single-process'||protectedOffer||policies.size){
      if(!capabilities.enabled)throw new PlatformError('AUTH_UNAVAILABLE','Configured wallet authentication is unavailable.',503);
      auth.session(undefined); // Exercise the configured auth clock/store without granting a session.
     }
     const result=await reader.readiness({signal});alive(signal);
     return json({...result,authMode:capabilities.enabled?'single-process':'disabled'});
    }
    if(path==='/auth/challenge'&&req.method==='POST'){const x=await body(req,['walletAddress'],signal),a=auth.challenge(canonicalAddress(x.walletAddress),cookies(req).pact_binding);headers.append('set-cookie',cookie('pact_binding',a.binding,300));return json({challengeId:a.challengeId,message:a.message,expiresAt:a.expiresAt});}
    if(path==='/auth/verify'&&req.method==='POST'){const x=await body(req,['challengeId','signatureBase64'],signal);if(typeof x.challengeId!=='string'||x.challengeId.length!==43||typeof x.signatureBase64!=='string')throw new PlatformError('INVALID_INPUT','Invalid wallet proof.');const existing=cookies(req),a=auth.verify(x.challengeId,x.signatureBase64,existing.pact_binding);auth.logout(existing.pact_session);headers.append('set-cookie',cookie('pact_session',a.sessionId,Math.floor((a.expiresAt-now())/1000)));return json({walletAddress:a.walletAddress,authenticated:true,expiresAt:a.expiresAt});}
    if(path==='/auth/session'&&req.method==='GET')return json(auth.session(cookies(req).pact_session));
    if(path==='/auth/logout'&&req.method==='POST'){const result=auth.logout(cookies(req).pact_session);headers.append('set-cookie',cookie('pact_session','',0));headers.append('set-cookie',cookie('pact_binding','',0));return json(result);}
    if(path==='/protected'&&req.method==='GET'){
     if(!protectedOffer)throw new PlatformError('NOT_CONFIGURED','Protected offer is not configured.',503);
     const token=cookies(req).pact_session,s=session(token),status=await entitlement(token,protectedOffer,s.walletAddress,signal,note);
     const response=json({authorized:true,walletAddress:s.walletAddress,offerAddress:protectedOffer,expiresAt:status.expiry,payload:'PACT protected server-side demo content.',verification:verification(status,now())});
     // Returning from entitlement crosses a promise boundary. Revalidate the
     // original session and expiry at the synchronous delivery decision too.
     alive(signal);if(session(token).walletAddress!==s.walletAddress)throw new PlatformError('AUTH_REQUIRED','Wallet session changed.',401);
     if(!positiveFresh(status,now())){note(status);throw new PlatformError('LICENSE_REQUIRED','The entitlement expired before delivery.',403);}
     return response;
    }
    const resource=/^\/resources\/([A-Za-z0-9_-]{1,64})$/.exec(path);
    if(resource){
     const policy=policies.get(resource[1]);if(!policy||req.method!==policy.method)throw new PlatformError('NOT_FOUND','Unknown resource or method.',404);
     const token=cookies(req).pact_session,s=session(token);
     await emptyBody(req,signal);
     await entitlement(token,policy.offer,s.walletAddress,signal,note);
     let prepared:PreparedResource;
     try{prepared=await policy.prepare(Object.freeze({walletAddress:s.walletAddress,offerAddress:policy.offer,signal}));}
     catch{throw new PlatformError('INTERNAL_ERROR','Resource preparation failed.',500);}
     alive(signal);
     let resourceBody:unknown,resourceType:unknown,resourceCommit:unknown;
     try{resourceBody=prepared?.body;resourceType=prepared?.contentType;resourceCommit=prepared?.commit;}
     catch{throw new PlatformError('INTERNAL_ERROR','Invalid prepared resource.',500);}
     let bytes:Buffer<ArrayBuffer>,contentType:string,commit:(()=>undefined)|undefined,tooLarge=false;
     try{
      if(!(typeof resourceBody==='string'||resourceBody instanceof Uint8Array)||resourceCommit!==undefined&&typeof resourceCommit!=='function')throw Error();
      const size=typeof resourceBody==='string'?Buffer.byteLength(resourceBody):arrayLength.call(resourceBody) as number;
      if(size>1048576){tooLarge=true;throw Error();}
      bytes=typeof resourceBody==='string'?Buffer.from(resourceBody):Buffer.from(new Uint8Array(arrayBuffer.call(resourceBody),arrayOffset.call(resourceBody),size));
      const type=resourceType===undefined?'application/octet-stream':resourceType;
      if(typeof type!=='string'||type.length>128||!/^[\x20-\x7e]+$/.test(type)||resourceCommit&&nodeTypes.isAsyncFunction(resourceCommit))throw Error();
      contentType=type;commit=resourceCommit as (()=>undefined)|undefined;
     }catch{
      if(tooLarge)throw new PlatformError('BODY_TOO_LARGE','Prepared resource exceeds 1 MiB.',500);
      throw new PlatformError('INTERNAL_ERROR','Invalid prepared resource contract.',500);
     }
     const finalStatus=await entitlement(token,policy.offer,s.walletAddress,signal,note);
     // No await between the final check, synchronous host commit and response construction.
     headers.set('content-type',contentType);
     const response=new Response(bytes,{headers});
     alive(signal);session(token);
     if(!positiveFresh(finalStatus,now())){note(finalStatus);throw new PlatformError('LICENSE_REQUIRED','The entitlement expired before delivery.',403);}
     if(commit){let result:unknown;try{result=commit();}catch{throw new PlatformError('INTERNAL_ERROR','Resource commit failed.',500);}if(result!==undefined){discardInvalidCommitResult(result);throw new PlatformError('INTERNAL_ERROR','Resource commit must return undefined synchronously.',500);}}
     return response;
    }
    if(path==='/offers/prepare'&&req.method==='POST'){const x=await body(req,['network','programId','sellerWallet','nonce','metadataJson'],signal);return json(await reader.prepareOffer(x as Parameters<typeof reader.prepareOffer>[0],{signal}));}
    if(path==='/checkout/prepare'&&req.method==='POST'){const x=await body(req,['network','programId','offerAddress','walletAddress','metadataJson'],signal);return json(await reader.prepareCheckout(x as Parameters<typeof reader.prepareCheckout>[0],{signal}));}
    if(path==='/licenses/verify'&&req.method==='POST'){const x=await body(req,['offerAddress','walletAddress','network'],signal);if(x.network!==undefined&&x.network!=='devnet')throw new PlatformError('WRONG_NETWORK','Only Solana Devnet is supported.');const status=await reader.getLicenseStatus({offer:canonicalAddress(x.offerAddress),wallet:canonicalAddress(x.walletAddress)},{signal});note(status);return json(verification(status,now()));}
    const segments=path.split('/');
    if(req.method==='GET'&&segments.length===3&&segments[1]==='offers')return json(await reader.getOffer({offer:canonicalAddress(segments[2])},{signal}));
    if(req.method==='GET'&&segments.length===4&&segments[1]==='offers'&&segments[3]==='metadata'){await reader.getOffer({offer:canonicalAddress(segments[2])},{signal});throw new PlatformError('METADATA_UNAVAILABLE','Metadata is not registered. Obtain the complete seller buyer link; a commitment cannot reconstruct its original JSON.',404);}
    if(req.method==='GET'&&segments.length===4&&segments[1]==='licenses'){const status=await reader.getLicenseStatus({offer:canonicalAddress(segments[2]),wallet:canonicalAddress(segments[3])},{signal});note(status);return json(verification(status,now()));}
    if(req.method==='GET'&&segments.length===3&&segments[1]==='transactions')return json(await reader.getTransactionStatus({signature:segments[2]},{signal}));
    throw new PlatformError('NOT_FOUND','Unknown API route or method.',404);
   };
   const heldRelease=release;release=undefined;
   const running=dispatch().finally(heldRelease);
   return await Promise.race([running,deadline]);
  }catch(e){
   if(e instanceof PlatformError){record.failure=apiFailure(e.code,record.failure,e.status);return json({error:{code:e.code,message:e.message}},e.status);}
   if(e instanceof PactError){record.failure=apiFailure(e.code,record.failure);return json({error:{code:e.code,message:e.message}},['INVALID_INPUT','WRONG_NETWORK'].includes(e.code)?400:503);}
   record.failure='application';
   return json({error:{code:'INTERNAL_ERROR',message:'The request could not be completed safely.'}},500);
  }finally{clearTimeout(timer);removeAbort?.();release?.();if(occupiedBudget)occupiedBudget.responding--;}
 };
 const handler=async(req:Request):Promise<Response>=>{
  const record=observability.begin(req.method);let response:Response|undefined;
  try{return response=await handle(req,record);}
  finally{observability.complete(record,response?.status??500);}
 };
 const httpGauges=(budget:typeof budgets.public)=>({active:budget.active,inflight:Math.min(budget.active,budget.responding),quarantined:Math.max(0,budget.active-budget.responding),limit:budget.maxConcurrent});
 return Object.assign(handler,{metrics:()=>observability.metrics({
  http:{public:httpGauges(budgets.public),auth:httpGauges(budgets.auth),protected:httpGauges(budgets.protected)},
  rpc:{public:reader.diagnostics(),protected:protectedReader.diagnostics()},auth:auth.diagnostics(),
 })});
}
