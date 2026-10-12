import {Buffer} from 'buffer';
import {DEFAULT_RPC_URL,PACT_PROGRAM_ID,DEVNET_GENESIS,FRESHNESS_MS,isLicenseStatusFresh} from './index.js';
import {createCheckoutClient,type CheckoutOptions,type OfferInfo} from './checkout.js';
import {canonicalWallet} from './adapter.js';
import type {AuthenticatedSession,MetadataUnavailable,PreparedCheckoutResponse,PreparedOfferResponse,ProtectedResult,PublicLicenseResult,TransactionStatus,VerifiedMetadata,WalletChallenge,WalletSession} from './platform-types.js';
export * from './platform-types.js';
export {createCheckoutClient,isLicenseStatusFresh,PACT_PROGRAM_ID};
export class PactApiError extends Error {
 readonly name='PactApiError';
 constructor(public readonly code:string,message:string,public readonly status=0){super(message);}
}
export type PlatformClientOptions={network:'devnet';apiUrl:string;rpcUrl?:string;programId?:string;fetch?:typeof globalThis.fetch;timeoutMs?:number};
export type MessageWallet={getPublicKey():string|null;signMessage(message:Uint8Array):Promise<Uint8Array>};
/** Additive v1 HTTP client. The original @pact/sdk exports are unchanged. */
export class PactClient {
 readonly network='devnet' as const;
 private readonly base:URL;
 private readonly fetcher:typeof globalThis.fetch;
 private readonly timeout:number;
 private readonly rpcUrl:string;
 constructor(options:PlatformClientOptions){
  if(options?.network!=='devnet'||(options.programId!==undefined&&options.programId!==PACT_PROGRAM_ID))throw new PactApiError('WRONG_NETWORK','Only the reviewed PACT Solana Devnet program is supported.');
  try{this.base=new URL(options.apiUrl,typeof location==='undefined'?undefined:location.origin);}catch{throw new PactApiError('INVALID_INPUT','Provide an absolute API URL on the server, or a same-origin path in a browser.');}
  if(!['https:','http:'].includes(this.base.protocol)||this.base.protocol==='http:'&&!['localhost','127.0.0.1','[::1]'].includes(this.base.hostname)||this.base.username||this.base.password||this.base.search||this.base.hash)throw new PactApiError('INVALID_INPUT','API URL requires HTTPS or local HTTP, without credentials, query or fragment.');
  this.base.pathname=this.base.pathname.replace(/\/$/,'')||'/api/v1';this.fetcher=options.fetch??globalThis.fetch;this.timeout=options.timeoutMs??10000;this.rpcUrl=options.rpcUrl??DEFAULT_RPC_URL;
  if(!Number.isSafeInteger(this.timeout)||this.timeout<1||this.timeout>30000)throw new PactApiError('INVALID_INPUT','API timeout must be 1–30000 milliseconds.');
 }
 private address(value:string){if(!canonicalWallet(value))throw new PactApiError('INVALID_INPUT','Expected a canonical Solana public address.');return encodeURIComponent(value);}
 private async request<T>(path:string,body?:unknown,auth=false):Promise<T>{
  const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;
  try{return await Promise.race([(async()=>{
   // Invoke as a standalone function: Window.fetch rejects a PactClient receiver.
   const send=this.fetcher;
   const response=await send(this.base.href.replace(/\/$/,'')+path,{method:body===undefined?'GET':'POST',headers:{accept:'application/json',...(body===undefined?{}:{'content-type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body),credentials:auth?'include':'omit',signal:controller.signal,cache:'no-store',redirect:'error'});
   const maximum=1024*1024;const declared=Number(response.headers?.get('content-length'));if(Number.isFinite(declared)&&declared>maximum)throw new PactApiError('BODY_TOO_LARGE','API response exceeds the limit.');
   let text='';if(response.body?.getReader){const reader=response.body.getReader(),decoder=new TextDecoder();let size=0;try{for(;;){const next=await reader.read();if(next.done)break;size+=next.value.byteLength;if(size>maximum)throw new PactApiError('BODY_TOO_LARGE','API response exceeds the limit.');text+=decoder.decode(next.value,{stream:true});}text+=decoder.decode();}finally{await reader.cancel();}}else{text=await response.text();if(new TextEncoder().encode(text).byteLength>maximum)throw new PactApiError('BODY_TOO_LARGE','API response exceeds the limit.');}
   let data:unknown;try{data=JSON.parse(text);}catch{throw new PactApiError('RPC_ERROR','API returned malformed JSON.',response.status);}
   if(!response.ok){const error=(data as {error?:{code?:unknown;message?:unknown}})?.error;throw new PactApiError(typeof error?.code==='string'?error.code:'RPC_ERROR',typeof error?.message==='string'?error.message:'API request failed.',response.status);}
   if(!data||typeof data!=='object'||Array.isArray(data))throw new PactApiError('RPC_ERROR','API returned an invalid response.',response.status);
   return data as T;
  })(),new Promise<never>((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new PactApiError('TIMEOUT','API request timed out.'));},this.timeout);})]);}
  catch(error){if(error instanceof PactApiError)throw error;throw new PactApiError('RPC_ERROR','API request failed.');}finally{clearTimeout(timer);controller.abort();}
 }
 readonly offers={
  get:(offerAddress:string)=>this.request<OfferInfo>('/offers/'+this.address(offerAddress)),
  metadata:async(offerAddress:string):Promise<VerifiedMetadata|MetadataUnavailable>=>{try{return await this.request<VerifiedMetadata>('/offers/'+this.address(offerAddress)+'/metadata');}catch(error){if(error instanceof PactApiError&&error.code==='METADATA_UNAVAILABLE')return{available:false,offerAddress,reason:'METADATA_UNAVAILABLE'};throw error;}},
  prepare:(input:{sellerWallet:string;nonce:string;metadataJson:string})=>{this.address(input.sellerWallet);return this.request<PreparedOfferResponse>('/offers/prepare',{...input,network:this.network,programId:PACT_PROGRAM_ID});}
 };
 readonly checkout={
  prepare:(input:{offerAddress:string;walletAddress:string;metadataJson:string})=>{this.address(input.offerAddress);this.address(input.walletAddress);return this.request<PreparedCheckoutResponse>('/checkout/prepare',{...input,network:this.network,programId:PACT_PROGRAM_ID});},
  /** Wallet-authorized signing/submission uses the existing hardened client, never a server key. */
  createClient:(options:Omit<CheckoutOptions,'programId'|'rpcUrl'>={})=>createCheckoutClient({...options,programId:PACT_PROGRAM_ID,rpcUrl:this.rpcUrl})
 };
 readonly licenses={
  verify:async(input:{offerAddress:string;walletAddress:string})=>{this.address(input.offerAddress);this.address(input.walletAddress);return this.publicLicense(await this.request<PublicLicenseResult>('/licenses/verify',{...input,network:this.network}),input);},
  get:async(offerAddress:string,walletAddress:string)=>this.publicLicense(await this.request<PublicLicenseResult>('/licenses/'+this.address(offerAddress)+'/'+this.address(walletAddress)),{offerAddress,walletAddress})
 };
 private publicLicense(value:PublicLicenseResult,input:{offerAddress:string;walletAddress:string}){
  if(!value||typeof value!=='object'||value.network!=='devnet'||value.program!==PACT_PROGRAM_ID||value.offerAddress!==input.offerAddress||value.walletAddress!==input.walletAddress||value.walletControlProven!==false||value.authorized!==false||typeof value.valid!=='boolean'||value.status?.program!==PACT_PROGRAM_ID||value.status.offer!==input.offerAddress||value.status.wallet!==input.walletAddress||!['active','expired','missing'].includes(value.state)||value.state!==value.status.state||value.freshness?.maxAgeMs!==FRESHNESS_MS||value.freshness.contextSlot!==value.status.contextSlot)throw new PactApiError('INVALID_ACCOUNT','Public lookup identity, snapshot or authentication claims are invalid.');
  if(value.valid&&!isLicenseStatusFresh(value.status,Date.now()))throw new PactApiError('STALE','The positive license snapshot expired before the API response arrived.');
  return value;
 }
 readonly auth={
  challenge:async(walletAddress:string)=>{
   this.address(walletAddress);const value=await this.request<WalletChallenge>('/auth/challenge',{walletAddress},true);const time=Date.now(),lines=typeof value.message==='string'?value.message.split('\n'):[];
   const issued=Number(lines[8]?.slice('Issued at: '.length));
   if(!/^[A-Za-z0-9_-]{43}$/.test(value.challengeId)||typeof value.message!=='string'||new TextEncoder().encode(value.message).length>4096||!Number.isSafeInteger(value.expiresAt)||value.expiresAt<=time||value.expiresAt>time+300000||lines.length!==11||lines[0]!=='PACT wallet authentication v1'||lines[1]!==`Origin: ${this.base.origin}`||lines[2]!=='Network: solana-devnet'||lines[3]!==`Genesis: ${DEVNET_GENESIS}`||lines[4]!==`Program: ${PACT_PROGRAM_ID}`||lines[5]!==`Wallet: ${walletAddress}`||lines[6]!==`Challenge: ${value.challengeId}`||!/^Session binding: [A-Za-z0-9_-]{43}$/.test(lines[7]??'')||!/^Issued at: [1-9]\d*$/.test(lines[8]??'')||!Number.isSafeInteger(issued)||issued>time||time-issued>=300000||value.expiresAt-issued>300000||lines[9]!==`Expires at: ${value.expiresAt}`||lines[10]!=='Purpose: prove wallet control; no transaction or license purchase.')throw new PactApiError('AUTH_INVALID','Authentication challenge is malformed, expired or bound to a different identity.');
   return Object.freeze({...value});
  },
  verify:async(input:{challengeId:string;signatureBase64:string})=>{const value=await this.request<AuthenticatedSession>('/auth/verify',input,true);if(value.authenticated!==true||!canonicalWallet(value.walletAddress)||!Number.isFinite(value.expiresAt)||value.expiresAt<=Date.now()||value.expiresAt>Date.now()+3600000)throw new PactApiError('AUTH_INVALID','Authentication session is invalid.');return value;},
  session:async()=>{const value=await this.request<WalletSession>('/auth/session',undefined,true);if(value.authenticated!==false&&(value.authenticated!==true||!canonicalWallet(value.walletAddress)||!Number.isFinite(value.expiresAt)||value.expiresAt!<=Date.now()))throw new PactApiError('AUTH_INVALID','Authentication session is invalid.');return value;},
  logout:()=>this.request<{authenticated:false}>('/auth/logout',{},true),
  authenticate:async(wallet:MessageWallet):Promise<AuthenticatedSession>=>{
   const address=wallet.getPublicKey();if(!address)throw new PactApiError('AUTH_REQUIRED','Connect your wallet first.');this.address(address);
   const challenge=await this.auth.challenge(address);if(wallet.getPublicKey()!==address)throw new PactApiError('AUTH_INVALID','Wallet changed before message signing.');
   const signature=await wallet.signMessage(new TextEncoder().encode(challenge.message));if(wallet.getPublicKey()!==address||!(signature instanceof Uint8Array)||signature.length!==64)throw new PactApiError('AUTH_INVALID','Wallet identity or signature changed.');
   const session=await this.auth.verify({challengeId:challenge.challengeId,signatureBase64:Buffer.from(signature).toString('base64')});
   if(wallet.getPublicKey()!==address||session.walletAddress!==address||session.authenticated!==true){await this.auth.logout();throw new PactApiError('AUTH_INVALID','Wallet changed during authentication.');}return session;
  }
 };
 readonly protected={get:async()=>{const result=await this.request<ProtectedResult>('/protected',undefined,true);if(result.authorized!==true||!canonicalWallet(result.walletAddress)||!canonicalWallet(result.offerAddress)||typeof result.payload!=='string')throw new PactApiError('AUTH_INVALID','Protected response identity is invalid.');const verified=this.publicLicense(result.verification,{offerAddress:result.offerAddress,walletAddress:result.walletAddress});if(!verified.valid||result.expiresAt!==verified.status.expiry)throw new PactApiError('LICENSE_REQUIRED','A fresh active entitlement is required.');return result;}};
 readonly transactions={get:(signature:string)=>{if(!/^[1-9A-HJ-NP-Za-km-z]{64,88}$/.test(signature))throw new PactApiError('INVALID_INPUT','Invalid transaction signature.');return this.request<TransactionStatus>('/transactions/'+encodeURIComponent(signature));}};
}
