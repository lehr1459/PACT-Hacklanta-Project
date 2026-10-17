import { Buffer } from 'buffer';
import { DEFAULT_RPC_URL, PACT_PROGRAM_ID, DEVNET_GENESIS, isLicenseStatusFresh } from './index.js';
import { createCheckoutClient, type CheckoutOptions } from './checkout.js';
import type { AuthenticatedSession, MetadataUnavailable, ProtectedResult, VerifiedMetadata, WalletChallenge } from './platform-types.js';
import * as contract from './internal/api-contract.js';
import { PactApiError } from './internal/api-error.js';
export * from './platform-types.js';
export { createCheckoutClient, isLicenseStatusFresh, PACT_PROGRAM_ID, PactApiError };

export type PlatformClientOptions = {network:'devnet';apiUrl:string;rpcUrl?:string;programId?:string;fetch?:typeof globalThis.fetch;timeoutMs?:number};
export type MessageWallet = {getPublicKey():string|null;signMessage(message:Uint8Array):Promise<Uint8Array>};
const errorCodes = new Set(['INVALID_INPUT','WRONG_NETWORK','RPC_ERROR','TIMEOUT','INVALID_ACCOUNT','STALE','LICENSE_REQUIRED','METADATA_UNAVAILABLE',
  'AUTH_REQUIRED','AUTH_UNAVAILABLE','AUTH_INVALID','FORBIDDEN','RATE_LIMITED','BODY_TOO_LARGE','OFFER_INACTIVE','ALREADY_LICENSED','NOT_CONFIGURED','NOT_FOUND','INTERNAL_ERROR','BUSY','CANCELLED']);

/** HTTP responses cross a runtime contract boundary before becoming public SDK values. */
export class PactClient {
  readonly network = 'devnet' as const;
  private readonly base: URL;
  private readonly fetcher: typeof globalThis.fetch;
  private readonly timeout: number;
  private readonly rpcUrl: string;
  constructor(options: PlatformClientOptions) {
    if(options?.network!=='devnet'||options.programId!==undefined&&options.programId!==PACT_PROGRAM_ID) throw new PactApiError('WRONG_NETWORK','Only the reviewed PACT Solana Devnet program is supported.');
    try { this.base = new URL(options.apiUrl,typeof location==='undefined'?undefined:location.origin); }
    catch { throw new PactApiError('INVALID_INPUT','Provide an absolute API URL on the server, or a same-origin path in a browser.'); }
    if(!['https:','http:'].includes(this.base.protocol)||this.base.protocol==='http:'&&!['localhost','127.0.0.1','[::1]'].includes(this.base.hostname)
      ||this.base.username||this.base.password||this.base.search||this.base.hash) throw new PactApiError('INVALID_INPUT','API URL requires HTTPS or local HTTP without credentials, query or fragment.');
    this.base.pathname=this.base.pathname.replace(/\/$/,'')||'/api/v1';
    this.fetcher=options.fetch??globalThis.fetch;this.timeout=options.timeoutMs??10000;this.rpcUrl=options.rpcUrl??DEFAULT_RPC_URL;
    if(!Number.isSafeInteger(this.timeout)||this.timeout<1||this.timeout>30000) throw new PactApiError('INVALID_INPUT','API timeout must be 1–30000 milliseconds.');
  }
  private async request(path:string, body?:unknown, auth=false, deadline=performance.now()+this.timeout):Promise<unknown> {
    const ownErrors=new Set<unknown>();
    const error=(code:string,message:string,status=0)=>{const value=new PactApiError(code,message,status);ownErrors.add(value);return value;};
    const controller=new AbortController();let closed=false,timer:ReturnType<typeof setTimeout>|undefined;
    const alive=()=>{if(closed||controller.signal.aborted||performance.now()>=deadline) throw error('TIMEOUT','API request timed out.');};
    try {
      alive();
      return await Promise.race([(async()=>{
        const send=this.fetcher;
        const response=await send(this.base.href.replace(/\/$/,'')+path,{method:body===undefined?'GET':'POST',headers:{accept:'application/json',...(body===undefined?{}:{'content-type':'application/json'})},
          body:body===undefined?undefined:JSON.stringify(body),credentials:auth?'include':'omit',signal:controller.signal,cache:'no-store',redirect:'error'});
        alive();
        const maximum=response.ok?1024*1024:16384;
        const declared=response.headers.get('content-length');
        if(declared&&(!/^\d+$/.test(declared)||Number(declared)>maximum)) throw error('BODY_TOO_LARGE','API response exceeds the limit.',response.status);
        if(!/^application\/json(?:;|$)/i.test(response.headers.get('content-type')??'')) throw error('RPC_ERROR','API returned an invalid response.',response.status);
        const reader=response.body?.getReader();if(!reader) throw error('RPC_ERROR','API response body is missing.',response.status);
        const chunks:Uint8Array[]=[];let size=0;
        const cancel=()=>{try{void reader.cancel().catch(()=>{});}catch{}};
        controller.signal.addEventListener('abort',cancel,{once:true});
        let data:unknown;
        try {
          for(;;){const next=await reader.read();alive();if(next.done)break;size+=next.value.byteLength;if(size>maximum){cancel();throw error('BODY_TOO_LARGE','API response exceeds the limit.',response.status);}chunks.push(next.value);}
          data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));
        } finally {controller.signal.removeEventListener('abort',cancel);reader.releaseLock();}
        alive();
        if(!response.ok) {
          let code='RPC_ERROR';
          try {const failure=contract.object(contract.object(data).error);if(typeof failure.code==='string'&&errorCodes.has(failure.code)&&typeof failure.message==='string'&&Buffer.byteLength(failure.message)<=1024)code=failure.code;}catch{}
          // Server/transport text is not trusted display content, including errors
          // thrown using the exported PactApiError class by a custom fetch.
          throw error(code,'API request failed.',response.status);
        }
        return contract.object(data);
      })(),new Promise<never>((_,reject)=>{timer=setTimeout(()=>{closed=true;controller.abort();reject(error('TIMEOUT','API request timed out.'));},Math.max(1,deadline-performance.now()));})]);
    } catch(value) {
      if(ownErrors.has(value)) throw value;
      throw new PactApiError('RPC_ERROR','API request failed.');
    } finally {closed=true;clearTimeout(timer);controller.abort();}
  }
  private async readOffer(offerAddress:string, deadline?:number) {
    return contract.offer(await this.request('/offers/'+encodeURIComponent(offerAddress),undefined,false,deadline),offerAddress);
  }
  readonly offers = {
    get:(offerAddress:string)=>this.readOffer(contract.address(offerAddress)),
    metadata:async(offerAddress:string):Promise<VerifiedMetadata|MetadataUnavailable>=>{
      const expected=contract.address(offerAddress),deadline=performance.now()+this.timeout;
      let value:unknown;
      try {value=await this.request('/offers/'+encodeURIComponent(expected)+'/metadata',undefined,false,deadline);}
      catch(error){if(error instanceof PactApiError&&error.code==='METADATA_UNAVAILABLE'&&error.status===404)return{available:false,offerAddress:expected,reason:'METADATA_UNAVAILABLE'};throw error;}
      const v=contract.object(value);
      if(v.available!==true||v.offerAddress!==expected||typeof v.metadataJson!=='string'||typeof v.verifiedAt!=='string') contract.invalid();
      const quote=await this.readOffer(expected,deadline),m=contract.bindMetadata(v.metadataJson,quote),time=Date.parse(v.verifiedAt);
      if(v.title!==m.title||v.terms!==m.terms||!contract.integer(time)||new Date(time).toISOString()!==v.verifiedAt||time>Date.now()||Date.now()-time>=8000) contract.invalid();
      return {available:true,offerAddress:expected,metadataJson:v.metadataJson,title:m.title,terms:m.terms,verifiedAt:v.verifiedAt};
    },
    prepare:async(input:{sellerWallet:string;nonce:string;metadataJson:string})=>{
      const captured={sellerWallet:contract.address(input.sellerWallet),nonce:contract.decimal(input.nonce,18446744073709551615n,false,'INVALID_INPUT'),metadataJson:contract.metadata(input.metadataJson).json};
      return contract.preparedOffer(await this.request('/offers/prepare',{...captured,network:this.network,programId:PACT_PROGRAM_ID}),captured);
    },
  };
  readonly checkout = {
    prepare:async(input:{offerAddress:string;walletAddress:string;metadataJson:string})=>{
      const captured={offerAddress:contract.address(input.offerAddress),walletAddress:contract.address(input.walletAddress),metadataJson:contract.metadata(input.metadataJson).json};
      return contract.preparedCheckout(await this.request('/checkout/prepare',{...captured,network:this.network,programId:PACT_PROGRAM_ID}),captured);
    },
    createClient:(options:Omit<CheckoutOptions,'programId'|'rpcUrl'>={})=>createCheckoutClient({...options,programId:PACT_PROGRAM_ID,rpcUrl:this.rpcUrl}),
  };
  readonly licenses = {
    verify:async(input:{offerAddress:string;walletAddress:string})=>{
      const captured={offerAddress:contract.address(input.offerAddress),walletAddress:contract.address(input.walletAddress)};
      return contract.publicLicense(await this.request('/licenses/verify',{...captured,network:this.network}),captured);
    },
    get:async(offerAddress:string,walletAddress:string)=>{
      const captured={offerAddress:contract.address(offerAddress),walletAddress:contract.address(walletAddress)};
      return contract.publicLicense(await this.request('/licenses/'+encodeURIComponent(captured.offerAddress)+'/'+encodeURIComponent(captured.walletAddress)),captured);
    },
  };
  readonly auth = {
    challenge:async(walletAddress:string):Promise<WalletChallenge>=>{
      const expected=contract.address(walletAddress),v=contract.object(await this.request('/auth/challenge',{walletAddress:expected},true));
      const time=Date.now(),lines=typeof v.message==='string'?v.message.split('\n'):[],issued=Number(lines[8]?.slice('Issued at: '.length));
      if(!contract.token(v.challengeId)||typeof v.message!=='string'||Buffer.byteLength(v.message)>4096||!contract.integer(v.expiresAt)||v.expiresAt<=time||v.expiresAt>time+300000
        ||lines.length!==11||lines[0]!=='PACT wallet authentication v1'||lines[1]!==`Origin: ${this.base.origin}`||lines[2]!=='Network: solana-devnet'||lines[3]!==`Genesis: ${DEVNET_GENESIS}`
        ||lines[4]!==`Program: ${PACT_PROGRAM_ID}`||lines[5]!==`Wallet: ${expected}`||lines[6]!==`Challenge: ${v.challengeId}`||!/^Session binding: [A-Za-z0-9_-]{43}$/.test(lines[7]??'')
        ||!contract.token(lines[7]?.slice('Session binding: '.length))||!/^Issued at: [1-9]\d*$/.test(lines[8]??'')||!contract.integer(issued)||issued>time||time-issued>=300000
        ||v.expiresAt-issued>300000||lines[9]!==`Expires at: ${v.expiresAt}`||lines[10]!=='Purpose: prove wallet control; no transaction or license purchase.') contract.invalid('AUTH_INVALID');
      return Object.freeze({challengeId:v.challengeId,message:v.message,expiresAt:v.expiresAt});
    },
    verify:async(input:{challengeId:string;signatureBase64:string}):Promise<AuthenticatedSession>=>{
      const captured={challengeId:input.challengeId,signatureBase64:input.signatureBase64};
      if(!contract.token(captured.challengeId)||typeof captured.signatureBase64!=='string'||!/^[A-Za-z0-9+/]{86}==$/.test(captured.signatureBase64)
        ||Buffer.from(captured.signatureBase64,'base64').toString('base64')!==captured.signatureBase64) contract.invalid('AUTH_INVALID');
      const value=contract.session(await this.request('/auth/verify',captured,true),true);
      return value as AuthenticatedSession;
    },
    session:async()=>contract.session(await this.request('/auth/session',undefined,true)),
    logout:async():Promise<{authenticated:false}>=>{
      const v=contract.object(await this.request('/auth/logout',{},true));
      if(v.authenticated!==false||Object.keys(v).some(key=>key!=='authenticated')) contract.invalid('AUTH_INVALID');
      return {authenticated:false};
    },
    authenticate:async(wallet:MessageWallet):Promise<AuthenticatedSession>=>{
      const address=wallet.getPublicKey();if(!address)throw new PactApiError('AUTH_REQUIRED','Connect your wallet first.');contract.address(address);
      const challenge=await this.auth.challenge(address);if(wallet.getPublicKey()!==address)contract.invalid('AUTH_INVALID');
      const signature=await wallet.signMessage(new TextEncoder().encode(challenge.message));
      if(wallet.getPublicKey()!==address||!(signature instanceof Uint8Array)||signature.length!==64)contract.invalid('AUTH_INVALID');
      const value=await this.auth.verify({challengeId:challenge.challengeId,signatureBase64:Buffer.from(signature).toString('base64')});
      if(wallet.getPublicKey()!==address||value.walletAddress!==address){await this.auth.logout();contract.invalid('AUTH_INVALID');}
      return value;
    },
  };
  readonly protected = {
    get:async():Promise<ProtectedResult>=>{
      const v=contract.object(await this.request('/protected',undefined,true));
      if(v.authorized!==true||typeof v.payload!=='string')contract.invalid('AUTH_INVALID');
      const walletAddress=contract.address(v.walletAddress,'AUTH_INVALID'),offerAddress=contract.address(v.offerAddress,'AUTH_INVALID');
      const verification=contract.publicLicense(v.verification,{offerAddress,walletAddress});
      if(!verification.valid||v.expiresAt!==verification.status.expiry)contract.invalid('LICENSE_REQUIRED');
      return {authorized:true,walletAddress,offerAddress,expiresAt:verification.status.expiry,payload:v.payload,verification};
    },
  };
  readonly transactions = {
    get:async(signature:string)=>{const expected=contract.signature(signature);return contract.transactionStatus(await this.request('/transactions/'+encodeURIComponent(expected)),expected);},
  };
}
