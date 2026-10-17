export { createPlatformReader } from './server-chain.js';
export type { PlatformReaderOptions, PrepareOfferInput, PrepareCheckoutInput } from './server-chain.js';
export { createWalletAuth, PlatformError } from './server-auth.js';
export type { WalletAuthOptions } from './server-auth.js';
import { createEndpointHistory, createPlatformReaderPool, type PlatformReaderOptions } from './server-chain.js';
import { createWalletAuth, PlatformError, canonicalOrigin, canonicalAddress } from './server-auth.js';
import { PACT_PROGRAM_ID, FRESHNESS_MS, isLicenseStatusFresh, type LicenseStatus, PactError } from './index.js';

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
};
function verification(s:LicenseStatus,now:number){
 if(s.active&&!isLicenseStatusFresh(s,now))throw new PlatformError('STALE','License verification is stale.',503);
 return{network:'devnet' as const,program:PACT_PROGRAM_ID,offerAddress:s.offer,walletAddress:s.wallet,valid:isLicenseStatusFresh(s,now),state:s.state,expiration:s.state==='missing'?null:s.expiry,verifiedAt:new Date(now).toISOString(),reason:s.state==='active'?'VALID' as const:s.state==='expired'?'EXPIRED' as const:'MISSING' as const,walletControlProven:false as const,authorized:false as const,freshness:{verifiedAtMs:now,maxAgeMs:FRESHNESS_MS,contextSlot:s.contextSlot,chainTimestamp:s.chainTimestamp},status:s};
}
function capacity(input:Budget|undefined,defaults:number){
 const perMinute=input?.perMinute??180,maxConcurrent=input?.maxConcurrent??defaults;
 if(!Number.isSafeInteger(perMinute)||perMinute<1||perMinute>100000||!Number.isSafeInteger(maxConcurrent)||maxConcurrent<1||maxConcurrent>64)throw new PlatformError('INVALID_INPUT','Invalid request capacity bounds.');
 return{perMinute,maxConcurrent,active:0,requests:0,start:-Infinity,lastNow:-Infinity};
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
 const budgets={public:capacity(settings.requestBudgets?.public,32),auth:capacity(settings.requestBudgets?.auth,16),protected:capacity(settings.requestBudgets?.protected,4)};
 const cookie=(name:string,value:string,maxAge:number)=>`${name}=${value}; Path=${cookiePath}; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${origin.startsWith('https:')?'; Secure':''}`;
 function cookies(req:Request){
  const raw=req.headers.get('cookie')??'';if(raw.length>8192)throw new PlatformError('AUTH_INVALID','Authentication cookies exceed the limit.',401);
  const out:Record<string,string>=Object.create(null);
  for(const item of raw.split(';')){const i=item.indexOf('=');if(i<0)continue;const key=item.slice(0,i).trim(),value=item.slice(i+1).trim();if(Object.hasOwn(out,key))throw new PlatformError('AUTH_INVALID','Duplicate authentication cookie.',401);out[key]=value;}
  return out;
 }
 function alive(signal:AbortSignal){if(signal.aborted)throw new PlatformError('TIMEOUT','Request was cancelled or timed out.',408);}
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
 async function entitlement(token:string|undefined,offer:string,wallet:string,signal:AbortSignal){
  alive(signal);if(session(token).walletAddress!==wallet)throw new PlatformError('AUTH_REQUIRED','Wallet session changed.',401);
  const status=await protectedReader.getLicenseStatus({offer,wallet},{signal});
  alive(signal);if(session(token).walletAddress!==wallet)throw new PlatformError('AUTH_REQUIRED','Session changed during verification.',401);
  if(!isLicenseStatusFresh(status,now()))throw new PlatformError('LICENSE_REQUIRED','An active verified license is required.',403);
  return status;
 }
 return async(req:Request):Promise<Response>=>{
  const headers=new Headers({'content-type':'application/json','cache-control':'no-store','x-content-type-options':'nosniff'});
  const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers});
  let release:(()=>void)|undefined,timer:ReturnType<typeof setTimeout>|undefined,removeAbort:(()=>void)|undefined;
  try{
   const url=new URL(req.url);if(url.pathname!==prefix&&!url.pathname.startsWith(prefix+'/'))throw new PlatformError('NOT_FOUND','Unknown API route.',404);
   const path=url.pathname.slice(prefix.length),kind=path.startsWith('/auth/')?'auth':path==='/protected'||path.startsWith('/resources/')?'protected':'public';
   if(kind==='public'){headers.set('access-control-allow-origin','*');headers.set('access-control-allow-methods','GET, POST, OPTIONS');headers.set('access-control-allow-headers','content-type');}
   if(url.search)throw new PlatformError('INVALID_INPUT','Query parameters are not supported.');
   if(kind!=='public'){const supplied=req.headers.get('origin');if(url.origin!==origin||req.method==='POST'&&supplied!==origin||supplied!==null&&supplied!==origin)throw new PlatformError('FORBIDDEN','Same-origin authentication required.',403);}
   if(req.method==='OPTIONS'){if(kind!=='public')throw new PlatformError('FORBIDDEN','Authentication does not support cross-origin access.',403);return new Response(null,{status:204,headers});}
   const budget=budgets[kind],t=now();if(!Number.isFinite(t)||t<budget.lastNow)throw new PlatformError('STALE','Server clock moved backwards.',503);budget.lastNow=t;
   if(t-budget.start>=60000){budget.start=t;budget.requests=0;}
   if(++budget.requests>budget.perMinute)throw new PlatformError('RATE_LIMITED','Request capacity reached. Try later.',429);
   if(budget.active>=budget.maxConcurrent)throw new PlatformError('BUSY','Request concurrency capacity reached. Try later.',503);
   if(req.signal.aborted)throw new PlatformError('TIMEOUT','Request was cancelled.',408);
   budget.active++;release=()=>{budget.active--;};
   const controller=new AbortController(),signal=controller.signal;
   let rejectDeadline!:(reason:unknown)=>void;
   const deadline=new Promise<never>((_,reject)=>{rejectDeadline=reject;});
   const cancel=()=>{controller.abort();rejectDeadline(new PlatformError('TIMEOUT','Request was cancelled or timed out.',408));};
   req.signal.addEventListener('abort',cancel,{once:true});removeAbort=()=>req.signal.removeEventListener('abort',cancel);
   timer=setTimeout(cancel,5000);
   const dispatch=async():Promise<Response>=>{
    alive(signal);
    if(path==='/auth/challenge'&&req.method==='POST'){const x=await body(req,['walletAddress'],signal),a=auth.challenge(canonicalAddress(x.walletAddress),cookies(req).pact_binding);headers.append('set-cookie',cookie('pact_binding',a.binding,300));return json({challengeId:a.challengeId,message:a.message,expiresAt:a.expiresAt});}
    if(path==='/auth/verify'&&req.method==='POST'){const x=await body(req,['challengeId','signatureBase64'],signal);if(typeof x.challengeId!=='string'||x.challengeId.length!==43||typeof x.signatureBase64!=='string')throw new PlatformError('INVALID_INPUT','Invalid wallet proof.');const existing=cookies(req),a=auth.verify(x.challengeId,x.signatureBase64,existing.pact_binding);auth.logout(existing.pact_session);headers.append('set-cookie',cookie('pact_session',a.sessionId,Math.floor((a.expiresAt-now())/1000)));return json({walletAddress:a.walletAddress,authenticated:true,expiresAt:a.expiresAt});}
    if(path==='/auth/session'&&req.method==='GET')return json(auth.session(cookies(req).pact_session));
    if(path==='/auth/logout'&&req.method==='POST'){const result=auth.logout(cookies(req).pact_session);headers.append('set-cookie',cookie('pact_session','',0));headers.append('set-cookie',cookie('pact_binding','',0));return json(result);}
    if(path==='/protected'&&req.method==='GET'){
     if(!protectedOffer)throw new PlatformError('NOT_CONFIGURED','Protected offer is not configured.',503);
     const token=cookies(req).pact_session,s=session(token),status=await entitlement(token,protectedOffer,s.walletAddress,signal);
     return json({authorized:true,walletAddress:s.walletAddress,offerAddress:protectedOffer,expiresAt:status.expiry,payload:'PACT protected server-side demo content.',verification:verification(status,now())});
    }
    const resource=/^\/resources\/([A-Za-z0-9_-]{1,64})$/.exec(path);
    if(resource){
     const policy=policies.get(resource[1]);if(!policy||req.method!==policy.method)throw new PlatformError('NOT_FOUND','Unknown resource or method.',404);
     if(req.body!==null)throw new PlatformError('INVALID_INPUT','Resource requests do not accept caller-supplied policy or input.');
     const token=cookies(req).pact_session,s=session(token);
     await entitlement(token,policy.offer,s.walletAddress,signal);
     const prepared=await policy.prepare(Object.freeze({walletAddress:s.walletAddress,offerAddress:policy.offer,signal}));
     alive(signal);
     if(!prepared||!(typeof prepared.body==='string'||prepared.body instanceof Uint8Array)||prepared.commit!==undefined&&typeof prepared.commit!=='function')throw new PlatformError('INTERNAL_ERROR','Invalid prepared resource.',500);
     const size=typeof prepared.body==='string'?Buffer.byteLength(prepared.body):prepared.body.byteLength;
     if(size>1048576)throw new PlatformError('BODY_TOO_LARGE','Prepared resource exceeds 1 MiB.',500);
     const bytes=typeof prepared.body==='string'?Buffer.from(prepared.body):Buffer.from(prepared.body);
     const contentType=prepared.contentType??'application/octet-stream',commit=prepared.commit;
     if(contentType.length>128||!/^[\x20-\x7e]+$/.test(contentType)||commit?.constructor.name==='AsyncFunction')throw new PlatformError('INTERNAL_ERROR','Invalid prepared resource contract.',500);
     await entitlement(token,policy.offer,s.walletAddress,signal);
     // No await between the final check, synchronous host commit and response construction.
     alive(signal);session(token);
     headers.set('content-type',contentType);
     const response=new Response(bytes,{headers});
     if(commit&&commit()!==undefined)throw new PlatformError('INTERNAL_ERROR','Resource commit must return undefined synchronously.',500);
     return response;
    }
    if(path==='/offers/prepare'&&req.method==='POST'){const x=await body(req,['network','programId','sellerWallet','nonce','metadataJson'],signal);return json(await reader.prepareOffer(x as Parameters<typeof reader.prepareOffer>[0],{signal}));}
    if(path==='/checkout/prepare'&&req.method==='POST'){const x=await body(req,['network','programId','offerAddress','walletAddress','metadataJson'],signal);return json(await reader.prepareCheckout(x as Parameters<typeof reader.prepareCheckout>[0],{signal}));}
    if(path==='/licenses/verify'&&req.method==='POST'){const x=await body(req,['offerAddress','walletAddress','network'],signal);if(x.network!==undefined&&x.network!=='devnet')throw new PlatformError('WRONG_NETWORK','Only Solana Devnet is supported.');return json(verification(await reader.getLicenseStatus({offer:canonicalAddress(x.offerAddress),wallet:canonicalAddress(x.walletAddress)},{signal}),now()));}
    const segments=path.split('/');
    if(req.method==='GET'&&segments.length===3&&segments[1]==='offers')return json(await reader.getOffer({offer:canonicalAddress(segments[2])},{signal}));
    if(req.method==='GET'&&segments.length===4&&segments[1]==='offers'&&segments[3]==='metadata'){await reader.getOffer({offer:canonicalAddress(segments[2])},{signal});throw new PlatformError('METADATA_UNAVAILABLE','Metadata is not registered. Obtain the complete seller buyer link; a commitment cannot reconstruct its original JSON.',404);}
    if(req.method==='GET'&&segments.length===4&&segments[1]==='licenses')return json(verification(await reader.getLicenseStatus({offer:canonicalAddress(segments[2]),wallet:canonicalAddress(segments[3])},{signal}),now()));
    if(req.method==='GET'&&segments.length===3&&segments[1]==='transactions')return json(await reader.getTransactionStatus({signature:segments[2]},{signal}));
    throw new PlatformError('NOT_FOUND','Unknown API route or method.',404);
   };
   const heldRelease=release;release=undefined;
   const running=dispatch().finally(heldRelease);
   return await Promise.race([running,deadline]);
  }catch(e){
   if(e instanceof PlatformError)return json({error:{code:e.code,message:e.message}},e.status);
   if(e instanceof PactError)return json({error:{code:e.code,message:e.message}},['INVALID_INPUT','WRONG_NETWORK'].includes(e.code)?400:503);
   return json({error:{code:'INTERNAL_ERROR',message:'The request could not be completed safely.'}},500);
  }finally{clearTimeout(timer);removeAbort?.();release?.();}
 };
}
