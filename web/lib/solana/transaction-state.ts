import { SendTransactionError } from '@solana/web3.js';
import { parsePublicKey } from './protocol';
import type { RpcSource } from './rpc';

export const PENDING_ATTEMPTS_KEY='pact.solana.pending.v1';
export type AttemptState='wallet-signed'|'rpc-accepted'|'unknown'|'confirmed';
export type PendingAttempt={network:'devnet';program:string;buyer:string;offer:string;action:string;signature:string;blockhash:string;lastValidBlockHeight:number;state:AttemptState;createdOffer?:string};
const memoryAttempts=new Map<string,PendingAttempt>();
const stateRank:Record<AttemptState,number>={'wallet-signed':0,unknown:1,'rpc-accepted':2,confirmed:3};
export function attemptKey(program:string,buyer:string,offer:string,action:string){return `${program}:${buyer}:${action==='Purchase license'?offer:'seller-action:'+action}`;}
export function pendingStorageKey(key:string){return `${PENDING_ATTEMPTS_KEY}:${key}`;}
function validAttempt(key:string,value:unknown):PendingAttempt{
  const item=value as PendingAttempt;
  if(!item||typeof item!=='object'||Array.isArray(item)||Object.keys(item).some(field=>!['network','program','buyer','offer','action','signature','blockhash','lastValidBlockHeight','state','createdOffer'].includes(field))||item.network!=='devnet'||!parsePublicKey(item.program)||!parsePublicKey(item.buyer)||!parsePublicKey(item.blockhash)||!parsePublicKey(item.offer)||typeof item.action!=='string'||!['Purchase license','Create offer','Deactivate offer'].includes(item.action)||typeof item.signature!=='string'||!/^[1-9A-HJ-NP-Za-km-z]{64,88}$/.test(item.signature)||!Number.isSafeInteger(item.lastValidBlockHeight)||item.lastValidBlockHeight<0||!['wallet-signed','rpc-accepted','unknown','confirmed'].includes(item.state)||(item.createdOffer!==undefined&&!parsePublicKey(item.createdOffer))||attemptKey(item.program,item.buyer,item.offer,item.action)!==key)throw new Error('Pending transaction storage is invalid. Transaction protection remains closed.');
  return item;
}
export function readPendingAttempt(key:string){
  const remembered=memoryAttempts.get(key);
  try{
    const raw=localStorage.getItem(pendingStorageKey(key));const stored=raw?validAttempt(key,JSON.parse(raw)):undefined;
    const result=remembered&&(!stored||(remembered.signature===stored.signature&&stateRank[remembered.state]>stateRank[stored.state]))?remembered:stored??remembered;
    if(result)memoryAttempts.set(key,result);return result;
  }catch(error){if(remembered)return remembered;throw error;}
}
export function storePendingAttempt(key:string,attempt:PendingAttempt){
  validAttempt(key,attempt);
  const remembered=memoryAttempts.get(key);
  const record=remembered?.signature===attempt.signature&&stateRank[remembered.state]>stateRank[attempt.state]?{...attempt,state:remembered.state}:{...attempt};
  memoryAttempts.set(key,record);
  const existing=localStorage.getItem(pendingStorageKey(key));
  if(existing){const stored=validAttempt(key,JSON.parse(existing));if(stored.signature!==attempt.signature){memoryAttempts.set(key,stored);throw new Error('A different pending signature is protected for this attempt. Its state was not replaced.');}}
  // Each attempt has its own entry: unrelated tab writes cannot replace it.
  const encoded=JSON.stringify(record);localStorage.setItem(pendingStorageKey(key),encoded);
  if(localStorage.getItem(pendingStorageKey(key))!==encoded)throw new Error('Could not preserve pending transaction state. Its retry protection remains active.');
}
export function clearPendingAttempt(key:string,expectedSignature:string){
  const raw=localStorage.getItem(pendingStorageKey(key));const stored=raw?validAttempt(key,JSON.parse(raw)):undefined;
  if((stored&&stored.signature!==expectedSignature)||(!stored&&memoryAttempts.get(key)&&memoryAttempts.get(key)!.signature!==expectedSignature))throw new Error('The protected pending signature changed. Its state was not cleared.');
  localStorage.removeItem(pendingStorageKey(key));if(localStorage.getItem(pendingStorageKey(key))!==null)throw new Error('Could not clear resolved transaction storage. Retry protection remains active.');
  if(memoryAttempts.get(key)?.signature===expectedSignature)memoryAttempts.delete(key);
}
function clean(value:string,max=420){return value.replace(/[\u0000-\u001f\u007f]/g,' ').replace(/https?:\/\/\S+/gi,'[RPC endpoint]').replace(/\b(?:private key|seed phrase|recovery phrase|mnemonic|api[_ -]?key|authorization|bearer)\b[^.;]*/gi,'[redacted]').replace(/[A-Za-z0-9+/=_-]{100,}/g,'[encoded data omitted]').slice(0,max);}
export function transactionDiagnostic(error:unknown):string{
  try{
  const item=error as {message?:unknown;logs?:unknown;code?:unknown;detail?:unknown};let message=typeof item?.message==='string'?item.message:'Solana request failed.';let logs=item?.logs;
  if(error instanceof SendTransactionError){message=error.transactionError.message;logs=error.transactionError.logs;}
  const code=typeof item?.code==='number'?` (RPC ${item.code})`:'';
  const seen=new WeakSet<object>();let count=0;
  const detail=item?.detail===undefined?'':` ${clean(JSON.stringify(item.detail,(_key,value:unknown)=>{if(++count>100)return'[omitted]';if(typeof value==='bigint')return value.toString();if(value&&typeof value==='object'){if(seen.has(value))return'[circular]';seen.add(value);}return value;})??'',220)}`;
  const lines=Array.isArray(logs)?logs.filter((line):line is string=>typeof line==='string').slice(-8).map(line=>clean(line,180)):[];
  return `${clean(message)}${code}${detail}${lines.length?' Logs: '+lines.join(' | '):''}`;
  }catch{return'Solana request failed; additional diagnostic details are unavailable.';}
}
export function isDefiniteRpcRejection(error:unknown){
  if(!(error instanceof SendTransactionError))return false;
  const message=error.transactionError.message;
  return /^Transaction simulation failed\b/i.test(message)||/^Transaction signature verification failure\b/i.test(message)||/^Signature verification failed\b/i.test(message);
}
export type Observation={state:'confirmed'|'processed';failed:boolean};
export type ReconciledAttempt={state:'finalized'|'failed'|'expired'|'confirmed-pending'|'unknown';diagnostic?:string};
function statusFrom(result:unknown){
  const item=result as {value?:unknown;context?:{slot?:unknown}};
  if(typeof item?.context?.slot!=='number'||!Number.isSafeInteger(item.context.slot)||item.context.slot<0||!Array.isArray(item?.value)||item.value.length!==1)throw new Error('Invalid transaction status response.');
  const status=item.value[0] as {err:unknown;confirmationStatus:string}|null;
  if(status!==null&&(!status||!Object.prototype.hasOwnProperty.call(status,'err')||(status.err!==null&&!(typeof status.err==='string'&&status.err.length>0)&&!(typeof status.err==='object'&&status.err!==null&&!Array.isArray(status.err)))||!['processed','confirmed','finalized'].includes(status.confirmationStatus)))throw new Error('Invalid transaction status response.');
  return{slot:item.context.slot,status};
}
function heightFrom(value:unknown){if(typeof value!=='number'||!Number.isSafeInteger(value)||value<0)throw new Error('Invalid block height response.');return value;}
export async function reconcileAttempt(attempt:PendingAttempt,source:RpcSource,{clock=()=>performance.now(),sleep=(ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms)),onObservation=()=>{},timeoutMs=120000}:{clock?:()=>number;sleep?:(ms:number)=>Promise<void>;onObservation?:(state:Observation)=>void;timeoutMs?:number}={}):Promise<ReconciledAttempt>{
  const deadline=clock()+timeoutMs;let confirmed=attempt.state==='confirmed';let diagnostic:string|undefined;let failures=0;let statusSlot=-1;
  const readStatus=async()=>{
    const result=statusFrom(await source('getSignatureStatuses',[[attempt.signature],{searchTransactionHistory:true}]));
    if(result.slot<statusSlot)throw new Error('Transaction status context moved backwards.');statusSlot=result.slot;return result.status;
  };
  const observe=(status:ReturnType<typeof statusFrom>['status'])=>{
    if(status?.confirmationStatus==='finalized')return status.err?{state:'failed' as const,diagnostic:transactionDiagnostic({message:'Transaction failed on Solana Devnet.',detail:status.err})}:{state:'finalized' as const};
    if(status?.confirmationStatus==='confirmed'){confirmed=true;onObservation({state:'confirmed',failed:Boolean(status.err)});}
    else if(status?.confirmationStatus==='processed')onObservation({state:'processed',failed:Boolean(status.err)});
    return undefined;
  };
  while(clock()<deadline){
    try{
      const status=await readStatus();const outcome=observe(status);if(outcome)return outcome;
      if(!confirmed&&status===null&&heightFrom(await source('getBlockHeight',[{commitment:'finalized'}]))>attempt.lastValidBlockHeight){
        // Re-read history after the finalized height check. A confirmed result
        // is sticky and can never be recast as expiration because of a timeout.
        const finalStatus=await readStatus();const finalOutcome=observe(finalStatus);if(finalOutcome)return finalOutcome;
        if(!confirmed&&finalStatus===null){const validity=await source('isBlockhashValid',[attempt.blockhash,{commitment:'finalized'}]) as {value?:unknown};if(typeof validity?.value!=='boolean')throw new Error('Invalid blockhash validity response.');if(validity.value===false)return{state:'expired',diagnostic:'Blockhash expired with no observed transaction confirmation.'};}
      }
      failures=0;
    }catch(error){diagnostic=transactionDiagnostic(error);failures++;}
    if(clock()<deadline)await sleep(Math.min(1000*Math.max(1,failures),4000,Math.max(0,deadline-clock())));
  }
  return{state:confirmed?'confirmed-pending':'unknown',diagnostic};
}
