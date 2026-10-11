import {PublicKey} from '@solana/web3.js';
import {Buffer} from 'buffer';
export const PACT_PROGRAM_ID='EiiiWWsW2kkqP6nugHz6iBADvhnW5xnibAtZ82ZExVqy';
export const DEVNET_GENESIS='EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG';
export const DEFAULT_RPC_URL='https://api.devnet.solana.com';
export const FRESHNESS_MS=8000, SLOT_PROGRESS_MS=12000, READ_TIMEOUT_MS=5000;
const program=new PublicKey(PACT_PROGRAM_ID), clockAddress='SysvarC1ock11111111111111111111111111111111';
const system='11111111111111111111111111111111',sysvar='Sysvar1111111111111111111111111111111111111',loader='BPFLoaderUpgradeab1e11111111111111111111111';
export type PactErrorCode='INVALID_INPUT'|'WRONG_NETWORK'|'RPC_ERROR'|'TIMEOUT'|'INVALID_ACCOUNT'|'STALE'|'LICENSE_REQUIRED';
export class PactError extends Error {readonly name='PactError';constructor(public readonly code:PactErrorCode,message:string){super(message);}}
export type LicenseInput={offer:string;wallet:string};
/** Decimal strings preserve on-chain integers and allow JSON serialization. */
export type LicenseStatus={program:string;offer:string;wallet:string;licensePda:string;contextSlot:number;chainTimestamp:string;expiry:string;state:'active'|'expired'|'missing';active:boolean;startedAtMs:number;receivedAtMs:number;lastProgressAtMs:number};
export type PactClientOptions={rpcUrl?:string;fetch?:typeof globalThis.fetch;/** Clock in milliseconds; defaults to Date.now. Must not move backwards. */now?:()=>number};
export interface PactClient {getLicenseStatus(input:LicenseInput):Promise<LicenseStatus>;verifyLicense(input:LicenseInput):Promise<boolean>;requireLicense(input:LicenseInput):Promise<LicenseStatus>}
function fail(code:PactErrorCode,message:string):never{throw new PactError(code,message);}
function key(value:string){try{const k=new PublicKey(value);if(k.toBase58()!==value)throw Error();return k;}catch{ return fail('INVALID_INPUT','Expected a canonical public address.');}}
function numeric(value:unknown):value is number{return typeof value==='number'&&Number.isSafeInteger(value)&&value>=0;}
type Account={owner:string;executable:boolean;data:[string,string];lamports:number};
function bytes(value:unknown,owner:string):Buffer{
 const a=value as Account;if(!a||a.owner!==owner||a.executable!==false||!numeric(a.lamports)||!Array.isArray(a.data)||a.data.length!==2||a.data[1]!=='base64'||typeof a.data[0]!=='string'||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(a.data[0]))fail('INVALID_ACCOUNT','Invalid account owner or encoding.');
 const b=Buffer.from(a.data[0],'base64');if(b.toString('base64')!==a.data[0])fail('INVALID_ACCOUNT','Noncanonical account encoding.');return b;
}
export function isLicenseStatusFresh(status:LicenseStatus,nowMs=Date.now()):boolean{
 try{const age=nowMs-status.startedAtMs,progress=nowMs-status.lastProgressAtMs;return Number.isFinite(nowMs)&&Number.isFinite(age)&&Number.isFinite(progress)&&age>=0&&age<FRESHNESS_MS&&progress>=0&&progress<SLOT_PROGRESS_MS&&status.receivedAtMs>=status.startedAtMs&&nowMs>=status.receivedAtMs&&status.active&&status.state==='active'&&BigInt(status.expiry)>BigInt(status.chainTimestamp)+BigInt(Math.floor(age/1000));}catch{return false;}
}
export function createPactClient(options:PactClientOptions={}):PactClient{
 const url=options.rpcUrl??DEFAULT_RPC_URL;let parsed:URL;try{parsed=new URL(url);}catch{return fail('INVALID_INPUT','Invalid RPC URL.');}if(parsed.protocol!=='https:'&&!(parsed.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(parsed.hostname)))fail('INVALID_INPUT','RPC requires HTTPS or local HTTP.');if(parsed.username||parsed.password)fail('INVALID_INPUT','RPC URL must not contain credentials.');
 const fetcher=options.fetch??globalThis.fetch,now=options.now??Date.now;let lastNow=-Infinity,lastSlot=-1,lastTimestamp=-1n,lastProgress=0,id=0;let busy=false;
 function time(){const t=now();if(!Number.isFinite(t)||t<lastNow)fail('STALE','Local clock moved backwards.');lastNow=t;return t;}
 async function read(input:LicenseInput):Promise<LicenseStatus>{
 const started=time(),offer=key(input.offer),wallet=key(input.wallet);const [license,bump]=PublicKey.findProgramAddressSync([Buffer.from('license'),offer.toBuffer(),wallet.toBuffer()],program);
 const controller=new AbortController();let timer:ReturnType<typeof setTimeout>;let closed=false;
 async function rpc(method:'getGenesisHash'|'getMultipleAccounts',params:unknown[]=[]){
  if(closed)fail('TIMEOUT','License read timed out.');const requestId=++id;const response=await fetcher(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:requestId,method,params}),signal:controller.signal,cache:'no-store'});if(!response.ok)fail('RPC_ERROR',`RPC HTTP ${response.status}.`);const body=await response.json() as {jsonrpc?:string;id?:number;error?:unknown;result?:unknown};if(body.jsonrpc!=='2.0'||body.id!==requestId||body.error||!Object.hasOwn(body,'result'))fail('RPC_ERROR','Invalid RPC response.');return body.result;
 }
 try{return await Promise.race([(async()=>{
  if(await rpc('getGenesisHash')!==DEVNET_GENESIS)fail('WRONG_NETWORK','Only Solana Devnet is supported.');
  const config:Record<string,unknown>={encoding:'base64',commitment:'confirmed'};if(lastSlot>=0)config.minContextSlot=lastSlot;
  const result=await rpc('getMultipleAccounts',[[input.offer,license.toBase58(),clockAddress,PACT_PROGRAM_ID],config]) as {context:{slot:number};value:unknown[]};
  if(!result?.context||!numeric(result.context.slot)||result.context.slot<lastSlot||!Array.isArray(result.value)||result.value.length!==4)fail('INVALID_ACCOUNT','Invalid or backwards snapshot context.');
  const [oa,la,ca,pa]=result.value;const p=pa as Account;if(!p||p.executable!==true||p.owner!==loader)fail('INVALID_ACCOUNT','Expected executable deployed PACT program.');
  const o=bytes(oa,PACT_PROGRAM_ID);if(o.length!==98||o.subarray(0,8).toString('hex')!=='d7583c47aaa249e5')fail('INVALID_ACCOUNT','Invalid offer layout.');const nonce=o.subarray(40,48),seller=o.subarray(8,40);const [expected,offerBump]=PublicKey.findProgramAddressSync([Buffer.from('offer'),seller,nonce],program);
  if(!expected.equals(offer)||o[97]!==offerBump||o.readBigUInt64LE(48)===0n||o.readBigUInt64LE(56)<1n||o.readBigUInt64LE(56)>31536000n||o[96]>1||o.subarray(64,96).every(b=>b===0))fail('INVALID_ACCOUNT','Invalid offer PDA or terms.');
  const c=bytes(ca,sysvar);if(c.length!==40||c.readBigUInt64LE(0)!==BigInt(result.context.slot))fail('INVALID_ACCOUNT','Clock does not match snapshot context.');const timestamp=c.readBigInt64LE(32);if(timestamp<0n||timestamp<lastTimestamp)fail('STALE','Chain time moved backwards.');
  let expiry=0n,missing=true;if(la!==null){const a=la as Account;const l=bytes(la,a?.owner===system?system:PACT_PROGRAM_ID);if(a.owner===system){if(l.length!==0)fail('INVALID_ACCOUNT','Uninitialized license must be empty.');}else{if(l.length!==81||l.subarray(0,8).toString('hex')!=='f898c364b96cb0e7'||!l.subarray(8,40).equals(offer.toBuffer())||!l.subarray(40,72).equals(wallet.toBuffer())||l[80]!==bump)fail('INVALID_ACCOUNT','Invalid license identity or layout.');expiry=l.readBigInt64LE(72);if(expiry<0n)fail('INVALID_ACCOUNT','Invalid license expiry.');missing=false;}}
  const received=time();if(closed||received-started>=READ_TIMEOUT_MS)fail('TIMEOUT','License read timed out.');const progress=result.context.slot>lastSlot?received:lastProgress;if(received-progress>=SLOT_PROGRESS_MS)fail('STALE','RPC slot stopped progressing.');
  lastSlot=result.context.slot;lastTimestamp=timestamp;lastProgress=progress;const active=expiry>timestamp;
  const status:LicenseStatus={program:PACT_PROGRAM_ID,offer:input.offer,wallet:input.wallet,licensePda:license.toBase58(),contextSlot:lastSlot,chainTimestamp:timestamp.toString(),expiry:expiry.toString(),state:active?'active':missing?'missing':'expired',active,startedAtMs:started,receivedAtMs:received,lastProgressAtMs:progress};if(active&&!isLicenseStatusFresh(status,received))fail('STALE','License snapshot is stale.');return status;
 })(),new Promise<never>((_,reject)=>{timer=setTimeout(()=>{closed=true;controller.abort();reject(new PactError('TIMEOUT','License read timed out.'));},READ_TIMEOUT_MS);})]);}catch(e){if(e instanceof PactError)throw e;throw new PactError('RPC_ERROR','License read failed.');}finally{closed=true;clearTimeout(timer!);controller.abort();}
 }
 async function getLicenseStatus(input:LicenseInput){const captured={offer:input?.offer,wallet:input?.wallet};if(busy)fail('RPC_ERROR','A license read is already in progress.');busy=true;try{return await read(captured);}finally{busy=false;}}
 return{getLicenseStatus,async verifyLicense(input){try{return isLicenseStatusFresh(await getLicenseStatus(input),time());}catch{return false;}},async requireLicense(input){const status=await getLicenseStatus(input);if(!isLicenseStatusFresh(status,time()))fail('LICENSE_REQUIRED','An active license is required.');return status;}};
}
