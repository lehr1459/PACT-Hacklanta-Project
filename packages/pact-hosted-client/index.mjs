import {performance} from 'node:perf_hooks';
// Private Node-only convenience adapter. The REST API remains the public contract.
if (typeof window !== 'undefined') throw new Error('PACT hosted credentials require a Node backend.');
const PROGRAM='EiiiWWsW2kkqP6nugHz6iBADvhnW5xnibAtZ82ZExVqy';
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const APP=/^app_[a-f0-9]{32}$/, RESOURCE=/^[a-z][a-z0-9-]{0,63}$/;
const ALPHABET='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const integer=value=>Number.isSafeInteger(value)&&value>=0;
const decimal=value=>typeof value==='string'&&/^(?:0|[1-9]\d{0,19})$/.test(value);
const token=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{43}$/.test(value)&&Buffer.from(value,'base64url').toString('base64url')===value;
const opaque=(value,prefix)=>typeof value==='string'&&value.startsWith(prefix)&&token(value.slice(prefix.length));
function object(value,keys){return !!value&&Object.getPrototypeOf(value)===Object.prototype&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));}
function address(value){
  if(typeof value!=='string'||!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value))return false;
  let n=0n;for(const c of value)n=n*58n+BigInt(ALPHABET.indexOf(c));
  const hex=n?n.toString(16):'';
  return value.length-value.replace(/^1+/,'').length+Math.ceil(hex.length/2)===32;
}
function originValue(value){
  try {const u=new URL(value);if(u.origin!==value||u.username||u.password||u.protocol!=='https:'&&!(u.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(u.hostname)))throw Error();return value;}
  catch {throw new PactError('CONFIGURATION_INVALID');}
}
function freeze(value){if(value&&typeof value==='object'){for(const item of Object.values(value))freeze(item);Object.freeze(value);}return value;}
export class PactError extends Error {
  constructor(code='ACCESS_UNAVAILABLE',status=503,requestId,purchase){
    super(code);this.name='PactError';this.code=code;this.status=status;
    if(requestId&&UUID.test(requestId))this.requestId=requestId;
    if(purchase)this.purchase=freeze(purchase);
  }
}
function fail(code='RESPONSE_INVALID'){throw new PactError(code);}
const requireValue=value=>{if(!value)fail('INPUT_INVALID');};
const envelope=(data,keys)=>object(data,['schemaVersion','requestId',...keys])&&data.schemaVersion===1&&UUID.test(data.requestId);
function freshness(data,active=true){
  const f=data.freshness;
  if(!object(f,['readStartedAtMs','receivedAtMs','lastProgressAtMs','verifiedAtMs','maxAgeMs','maxProgressAgeMs','validUntilMs'])
    ||!Object.values(f).every(integer)||f.maxAgeMs!==8000||f.maxProgressAgeMs!==12000
    ||f.readStartedAtMs>f.receivedAtMs||f.receivedAtMs>f.verifiedAtMs||f.lastProgressAtMs>f.verifiedAtMs
    ||f.verifiedAtMs>=f.validUntilMs||f.validUntilMs>f.readStartedAtMs+8000||f.validUntilMs>f.lastProgressAtMs+12000
    ||data.verifiedAt!==new Date(f.verifiedAtMs).toISOString()
    ||active&&(BigInt(f.validUntilMs)>BigInt(data.expiresAt)*1000n
    ||BigInt(f.validUntilMs)>BigInt(f.readStartedAtMs)+(BigInt(data.expiresAt)-BigInt(data.chainTimestamp))*1000n))fail();
  return f;
}
export function createPactClient({origin,apiKey,appId,timeoutMs=7500}={}){
  origin=originValue(origin);
  if(typeof apiKey!=='string'||!/^pact_sk_dev_key_[a-f0-9]{32}_[A-Za-z0-9_-]{43}$/.test(apiKey)
    ||!token(apiKey.slice(-43))||!APP.test(appId)||!Number.isSafeInteger(timeoutMs)||timeoutMs<50||timeoutMs>8000)throw new PactError('CONFIGURATION_INVALID');
  let lastWall=0;
  function wall(){const n=Date.now();if(!integer(n)||n<lastWall)fail('CLOCK_UNAVAILABLE');lastWall=n;return n;}
  async function request(path,body,validate,expectedWallet){
    const startedWall=wall(),started=performance.now(),controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),timeoutMs);timer.unref?.();
    try{
      const serialized=JSON.stringify(body);requireValue(Buffer.byteLength(serialized)<=16384);
      const response=await fetch(origin+path,{method:'POST',headers:{authorization:`Bearer ${apiKey}`,'content-type':'application/json',accept:'application/json'},
        body:serialized,redirect:'error',cache:'no-store',signal:controller.signal});
      if(!response.headers.get('content-type')?.match(/^application\/json(?:;|$)/i)||response.headers.get('cache-control')!=='no-store')fail();
      const parts=[];let size=0,count=0;
      if(!response.body)fail();
      for await(const chunk of response.body){size+=chunk.length;if(size>131072||++count>4096){controller.abort();fail();}parts.push(chunk);}
      const ended=performance.now(),endedWall=wall();
      if(ended-started>=timeoutMs||endedWall<startedWall||controller.signal.aborted)fail('REQUEST_TIMEOUT');
      let data;try{data=JSON.parse(Buffer.concat(parts).toString('utf8'));}catch{fail();}
      if(response.status!==200){
        if(envelope(data,['error'])&&object(data.error,['code','message'])&&/^[A-Z][A-Z0-9_]{0,63}$/.test(data.error.code)&&data.error.message===data.error.code)
          throw new PactError(data.error.code,response.status,data.requestId);
        // A purchase link is informational and accepted only on a fully bound known denial.
        let purchase;
        if(path==='/v1/access/check'&&response.status===403&&envelope(data,['decision','reason','appId','resourceKey','resourceVersion','policyEpoch','offerAddress','walletAddress','network','programId','expiresAt','verifiedAt','contextSlot','chainTimestamp','freshness','purchase'])
          &&data.decision==='DENY'&&['LICENSE_REQUIRED','EXPIRED'].includes(data.reason)&&data.appId===appId&&data.resourceKey===body.resourceKey&&data.walletAddress===expectedWallet&&integer(data.resourceVersion)&&data.resourceVersion>0&&decimal(data.policyEpoch)&&integer(data.contextSlot)&&decimal(data.chainTimestamp)
          &&(data.reason==='LICENSE_REQUIRED'?data.expiresAt===null:decimal(data.expiresAt))&&data.network==='solana-devnet'&&data.programId===PROGRAM&&address(data.offerAddress)
          &&object(data.purchase,['url','metadata'])&&data.purchase.metadata==='SELLER_EXACT_BYTES_REQUIRED'){
          const expected=new URL('/',origin);expected.searchParams.set('offer',data.offerAddress);
          try{freshness(data,false);if(data.purchase.url===expected.href)purchase={...data.purchase};}catch{/* Unsupported denial remains denied without a link. */}
        }
        throw new PactError(purchase?data.reason:'ACCESS_DENIED',response.status,data?.requestId,purchase);
      }
      if(!validate(data,{started,ended,startedWall,endedWall}))fail();
      if(performance.now()-started>=timeoutMs||controller.signal.aborted)fail('REQUEST_TIMEOUT');wall();
      return{data,started,ended,startedWall,endedWall};
    }catch(error){if(error instanceof PactError)throw error;throw new PactError(controller.signal.aborted?'REQUEST_TIMEOUT':'API_UNAVAILABLE');}
    finally{clearTimeout(timer);}
  }
  const methods={
    async validateCredential(){
      const {data}=await request('/v1/credentials/validate',{},d=>envelope(d,['valid','appId','credentialId','environment','scopes'])&&d.valid===true&&d.appId===appId&&d.environment==='devnet'&&d.credentialId==='key_'+apiKey.match(/^pact_sk_dev_key_([a-f0-9]{32})_/)[1]&&Array.isArray(d.scopes)&&d.scopes.length>0&&d.scopes.length<=2&&new Set(d.scopes).size===d.scopes.length&&d.scopes.every(s=>['access:check','connect:write'].includes(s)));
      return freeze(data);
    },
    async startLogin(input){
      requireValue(object(input,['redirectUri','state','codeChallenge','codeChallengeMethod','purpose'])&&token(input.state)&&token(input.codeChallenge)&&input.codeChallengeMethod==='S256'&&typeof input.purpose==='string'&&input.purpose.length>0&&input.purpose.length<=200);
      callback(input.redirectUri);
      const {data}=await request('/v1/connect/transactions',input,(d,t)=>{
        if(!envelope(d,['transactionId','loginUrl','expiresAt','issuer'])||!/^con_[a-f0-9]{32}$/.test(d.transactionId)||d.issuer!==origin||!integer(d.expiresAt)||d.expiresAt<=t.endedWall||d.expiresAt>t.endedWall+300000)return false;
        const u=new URL('/connect',origin);u.searchParams.set('transactionId',d.transactionId);return d.loginUrl===u.href;
      });return freeze(data);
    },
    async exchangeCode(input){
      requireValue(object(input,['code','redirectUri','state','codeVerifier','issuer'])&&opaque(input.code,'pact_code_')&&token(input.state)&&/^[A-Za-z0-9._~-]{43,128}$/.test(input.codeVerifier)&&input.issuer===origin);callback(input.redirectUri);
      const {data}=await request('/v1/connect/token',input,(d,t)=>envelope(d,['walletGrant','walletAddress','appId','environment','expiresAt','issuer'])&&opaque(d.walletGrant,'pact_grant_')&&address(d.walletAddress)&&d.appId===appId&&d.environment==='devnet'&&d.issuer===origin&&integer(d.expiresAt)&&d.expiresAt>t.endedWall&&d.expiresAt<=t.endedWall+900000);
      return freeze(data);
    },
    async revokeGrant(input){
      requireValue(object(input,['walletGrant'])&&opaque(input.walletGrant,'pact_grant_'));
      const {data}=await request('/v1/connect/revoke',input,d=>envelope(d,['revoked'])&&d.revoked===true);return freeze(data);
    },
    async checkAccess(input){
      requireValue(object(input,['walletGrant','resourceKey','walletAddress'])&&opaque(input.walletGrant,'pact_grant_')&&typeof input.resourceKey==='string'&&RESOURCE.test(input.resourceKey)&&address(input.walletAddress));
      const {walletGrant,resourceKey,walletAddress}=input;
      const {data,started,endedWall}=await request('/v1/access/check',{walletGrant,resourceKey},d=>{
        if(!envelope(d,['decision','reason','appId','resourceKey','resourceVersion','policyEpoch','offerAddress','walletAddress','network','programId','expiresAt','verifiedAt','contextSlot','chainTimestamp','freshness'])||d.decision!=='ALLOW'||d.reason!=='ACTIVE_LICENSE'||d.appId!==appId||d.resourceKey!==resourceKey||d.walletAddress!==walletAddress||!address(d.offerAddress)||d.network!=='solana-devnet'||d.programId!==PROGRAM||!integer(d.resourceVersion)||d.resourceVersion<1||!decimal(d.policyEpoch)||!decimal(d.expiresAt)||!decimal(d.chainTimestamp)||BigInt(d.expiresAt)<=BigInt(d.chainTimestamp)||!integer(d.contextSlot))return false;
        freshness(d);return true;
      },walletAddress);
      const f=data.freshness,deadline=started+(f.validUntilMs-f.readStartedAtMs);
      // Synchronized host clocks are required; an ahead/stale service clock denies.
      if(f.readStartedAtMs>endedWall||f.verifiedAtMs>endedWall||f.lastProgressAtMs>endedWall)fail('CLOCK_UNAVAILABLE');
      function assertFresh(){const n=wall();if(performance.now()>=deadline||n>=f.validUntilMs||BigInt(n)>=BigInt(data.expiresAt)*1000n)fail('STALE_DECISION');}
      freeze(data);assertFresh();return Object.freeze({...data,assertFresh});
    }
  };
  return Object.freeze(methods);
}
function callback(value){
  try{const u=new URL(value);originValue(u.origin);if(u.href!==value||u.username||u.password||u.search||u.hash||/%/.test(value))throw Error();}
  catch{fail('INPUT_INVALID');}
}
