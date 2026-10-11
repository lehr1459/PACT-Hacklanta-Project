import { PublicKey, SystemProgram, type FetchFn } from '@solana/web3.js';
import { Buffer } from 'buffer';
import { CLOCK_ADDRESS, decodeLicense, decodeOffer, deriveLicense, DEVNET_GENESIS, parsePublicKey, SYSVAR_OWNER, type SolanaOffer } from './protocol';
export const RPC_URL = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.devnet.solana.com';
export const programId = parsePublicKey(process.env.NEXT_PUBLIC_PACT_SOLANA_PROGRAM_ID ?? '');
export const READ_TIMEOUT_MS = 5000;
export const FRESHNESS_MS = 8000;
export const SLOT_PROGRESS_MS = 12000;
// SDK blockhash, simulation and submission requests share the bounded HTTP policy.
// Aborting a submission cannot undo it; callers must preserve the signed signature.
export const boundedSolanaFetch: FetchFn = async (input, init) => {
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),READ_TIMEOUT_MS);
  const upstream=init?.signal;const abort=()=>controller.abort();upstream?.addEventListener('abort',abort);
  if(upstream?.aborted)controller.abort();
  try{
    const response=await (globalThis.fetch as FetchFn)(input,{...init,signal:controller.signal});
    // Keep the deadline through the body read, not merely until headers arrive.
    const body=await response.text();
    return new Response(body,{status:response.status,statusText:response.statusText,headers:response.headers as HeadersInit}) as Awaited<ReturnType<FetchFn>>;
  }
  finally{clearTimeout(timer);upstream?.removeEventListener('abort',abort);}
};
export type RpcSource = (method: string, params?: unknown[]) => Promise<unknown>;
let requestId = 0;
export const rpc: RpcSource = async (method, params = []) => {
  const controller = new AbortController(); const timer=setTimeout(() => controller.abort(), READ_TIMEOUT_MS);
  try {
    const response = await fetch(RPC_URL,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:++requestId,method,params}),signal:controller.signal,cache:'no-store'});
    if (!response.ok) throw new Error(`Solana RPC HTTP ${response.status}.`);
    const body = await response.json() as {result?:unknown;error?:{message:string}};
    if (body.error) throw new Error(body.error.message); if (!('result' in body)) throw new Error('RPC response is missing its result.'); return body.result;
  } finally {clearTimeout(timer);}
};
export async function assertDevnet(source: RpcSource = rpc) {if (await source('getGenesisHash') !== DEVNET_GENESIS) throw new Error('Wrong cluster. Only Solana Devnet is supported.');return DEVNET_GENESIS;}
export type RawAccount = {data:[string,string];owner:string;executable:boolean;lamports:number};
const LOADERS = new Set(['BPFLoaderUpgradeab1e11111111111111111111111','BPFLoader2111111111111111111111111111111111','LoaderV411111111111111111111111111111111111']);
function accountBytes(account: RawAccount, owner: string, description: string): Buffer {
  if (!account || account.owner !== owner || account.executable !== false || !Array.isArray(account.data) || account.data[1] !== 'base64' || typeof account.data[0] !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(account.data[0])) throw new Error(`${description} owner or encoding is invalid.`);
  return Buffer.from(account.data[0],'base64');
}
export function assertProgramAccount(account: RawAccount | null) {if (!account || account.executable !== true || !LOADERS.has(account.owner)) throw new Error('No executable PACT program exists at the configured Devnet address.');}
export async function assertProgram(source: RpcSource = rpc) {
  if (!programId) throw new Error('Configure an approved deployed Solana program ID.');
  await assertDevnet(source);
  const result = await source('getAccountInfo',[programId.toBase58(),{encoding:'base64',commitment:'confirmed'}]) as {value:RawAccount|null};
  assertProgramAccount(result?.value); return programId;
}
export type SolanaSnapshot = {program:string;offerAddress:string;holder:string;licenseAddress:string;session:number;slot:bigint;clockSlot:bigint;chainTimestamp:bigint;expiry:bigint;offer:SolanaOffer;valid:boolean;startedAtMs:number;receivedAtMs:number};
export async function acquireSolanaSnapshot({program,offerAddress,holder,session,clock,source=rpc,minContextSlot}: {program:PublicKey;offerAddress:string;holder:string;session:number;clock:()=>number;source?:RpcSource;minContextSlot?:number}):Promise<SolanaSnapshot> {
  const offerKey=parsePublicKey(offerAddress);const buyer=parsePublicKey(holder);
  if (!offerKey || !buyer) throw new Error('Enter a canonical offer address and wallet public key.');
  const startedAtMs=clock(); let timer: ReturnType<typeof setTimeout>;
  return Promise.race([(async () => {
    await assertDevnet(source);
    const [license]=deriveLicense(program,offerKey,buyer);
    const config:Record<string,unknown>={encoding:'base64',commitment:'confirmed'};if(minContextSlot!==undefined)config.minContextSlot=minContextSlot;
    const result=await source('getMultipleAccounts',[[offerAddress,license.toBase58(),CLOCK_ADDRESS.toBase58(),program.toBase58()],config]) as {context:{slot:number};value:(RawAccount|null)[]};
    if (!result?.context || !Number.isSafeInteger(result.context.slot) || result.context.slot<0 || !Array.isArray(result.value) || result.value.length!==4) throw new Error('Invalid account snapshot context.');
    if (minContextSlot !== undefined && result.context.slot < minContextSlot) throw new Error('The RPC returned a snapshot below the required context slot.');
    const [offerAccount,licenseAccount,clockAccount,programAccount]=result.value;
    assertProgramAccount(programAccount);
    if (!offerAccount) throw new Error('This offer does not exist.');
    const offer=decodeOffer(accountBytes(offerAccount,program.toBase58(),'Offer'),program,offerKey);
    if (!clockAccount) throw new Error('Clock sysvar is missing.');
    const clockBytes=accountBytes(clockAccount,SYSVAR_OWNER,'Clock');if(clockBytes.length!==40)throw new Error('Clock sysvar layout is invalid.');
    const clockSlot=clockBytes.readBigUInt64LE(0);const chainTimestamp=clockBytes.readBigInt64LE(32);const slot=BigInt(result.context.slot);
    if (chainTimestamp<0n || clockSlot!==slot) throw new Error('Clock sysvar is inconsistent with the account context slot.');
    // Rust can initialize a canonical PDA that was pre-funded with SOL. An empty
    // system-owned account is uninitialized, never evidence of an entitlement.
    let expiry=0n;
    if(licenseAccount){
      if(licenseAccount.owner===SystemProgram.programId.toBase58()){
        if(accountBytes(licenseAccount,SystemProgram.programId.toBase58(),'Uninitialized license').length!==0)throw new Error('Uninitialized license account must be empty.');
      }else expiry=decodeLicense(accountBytes(licenseAccount,program.toBase58(),'License'),program,license,offerKey,buyer);
    }
    return {program:program.toBase58(),offerAddress,holder,licenseAddress:license.toBase58(),session,slot,clockSlot,chainTimestamp,expiry,offer,valid:expiry>chainTimestamp,startedAtMs,receivedAtMs:clock()};
  })(),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('Devnet check timed out. Access is closed until a fresh snapshot succeeds.')),READ_TIMEOUT_MS);})]).finally(()=>clearTimeout(timer));
}
export function snapshotHasAccess(snapshot:SolanaSnapshot,now:number,lastProgress:number){const age=now-snapshot.startedAtMs;if(!Number.isFinite(age)||age<0||age>=FRESHNESS_MS||now-lastProgress>=SLOT_PROGRESS_MS)return false;return snapshot.valid&&snapshot.expiry>snapshot.chainTimestamp+BigInt(Math.floor(age/1000));}
export function errorText(error:unknown){return error instanceof Error?error.message.split('\n')[0]:'The request failed. Try again.';}
export function shortKey(value:string){return `${value.slice(0,6)}…${value.slice(-4)}`;}
export function explorerAddress(value:string){return `https://explorer.solana.com/address/${value}?cluster=devnet`;}
export function explorerTransaction(value:string){return `https://explorer.solana.com/tx/${value}?cluster=devnet`;}
