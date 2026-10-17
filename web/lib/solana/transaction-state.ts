import { SendTransactionError } from '@solana/web3.js';
import { Buffer } from 'buffer';
import { parsePublicKey,decodeLicense,deriveLicense } from './protocol';
import { FRESHNESS_MS,type RpcSource,type LicenseBaseline,type SolanaSnapshot } from './rpc';

export const PENDING_ATTEMPTS_KEY='pact.solana.pending.v1';
export const CHECKOUT_ATTEMPTS_KEY='pact.solana.checkout.v1';
const MAX_JOURNAL_LENGTH=4096;
export type AttemptState='wallet-signed'|'rpc-accepted'|'unknown'|'confirmed';
export type PendingAttempt={network:'devnet';program:string;buyer:string;offer:string;action:string;signature:string;blockhash:string;lastValidBlockHeight:number;state:AttemptState;createdOffer?:string;version?:1;baseline?:LicenseBaseline};
const memoryAttempts=new Map<string,PendingAttempt>();
const stateRank:Record<AttemptState,number>={'wallet-signed':0,unknown:1,'rpc-accepted':2,confirmed:3};
export function attemptKey(program:string,buyer:string,offer:string,action:string){return `${program}:${buyer}:${action==='Purchase license'?offer:'seller-action:'+action}`;}
export function pendingStorageKey(key:string){return `${PENDING_ATTEMPTS_KEY}:${key}`;}
export function checkoutStorageKey(key:string){return `${CHECKOUT_ATTEMPTS_KEY}:${key}`;}
function hasBaseline(item:PendingAttempt){return item.action==='Purchase license'&&item.version===1&&item.baseline!==undefined;}
function sameBaseline(left:LicenseBaseline|undefined,right:LicenseBaseline|undefined){return left?.kind===right?.kind&&left?.expiry===right?.expiry&&left?.data===right?.data;}
function sameIncarnation(left:PendingAttempt,right:PendingAttempt){return left.signature===right.signature&&left.blockhash===right.blockhash&&left.lastValidBlockHeight===right.lastValidBlockHeight&&left.program===right.program&&left.buyer===right.buyer&&left.offer===right.offer&&left.action===right.action&&left.createdOffer===right.createdOffer;}
function validAttempt(key:string,value:unknown,primary=false):PendingAttempt{
  const item=value as PendingAttempt;
  const fields=['network','program','buyer','offer','action','signature','blockhash','lastValidBlockHeight','state',...(primary?['version','baseline']:['createdOffer'])];
  if(!item||typeof item!=='object'||Array.isArray(item)||Object.keys(item).some(field=>!fields.includes(field))||item.network!=='devnet'||!parsePublicKey(item.program)||!parsePublicKey(item.buyer)||!parsePublicKey(item.blockhash)||!parsePublicKey(item.offer)||typeof item.action!=='string'||!['Purchase license','Create offer','Deactivate offer'].includes(item.action)||typeof item.signature!=='string'||!/^[1-9A-HJ-NP-Za-km-z]{64,88}$/.test(item.signature)||!Number.isSafeInteger(item.lastValidBlockHeight)||item.lastValidBlockHeight<0||!['wallet-signed','rpc-accepted','unknown','confirmed'].includes(item.state)||(item.createdOffer!==undefined&&!parsePublicKey(item.createdOffer))||attemptKey(item.program,item.buyer,item.offer,item.action)!==key)throw new Error('Pending transaction storage is invalid. Transaction protection remains closed.');
  if(primary){
    const baseline=item.baseline;
    if(!hasBaseline(item)||!baseline||typeof baseline!=='object'||Array.isArray(baseline)||Object.keys(baseline).some(field=>!['kind','expiry','data'].includes(field))||typeof baseline.expiry!=='string'||!/^(0|[1-9]\d{0,18})$/.test(baseline.expiry))throw new Error('Pending purchase baseline is invalid. Transaction protection remains closed.');
    if(baseline.kind==='missing'){
      if(baseline.expiry!=='0'||baseline.data!==null)throw new Error('Pending missing-license baseline is invalid.');
    }else if(baseline.kind==='initialized'){
      if(typeof baseline.data!=='string'||baseline.data.length!==108)throw new Error('Pending entitlement baseline is invalid.');
      const bytes=Buffer.from(baseline.data,'base64');
      const program=parsePublicKey(item.program)!,offer=parsePublicKey(item.offer)!,buyer=parsePublicKey(item.buyer)!;
      if(bytes.toString('base64')!==baseline.data||decodeLicense(bytes,program,deriveLicense(program,offer,buyer)[0],offer,buyer).toString()!==baseline.expiry)throw new Error('Pending entitlement baseline does not match its identity and expiry.');
    }else throw new Error('Pending purchase baseline kind is invalid.');
  }
  return item;
}
function storedAttempts(key:string){
  const mirrorRaw=localStorage.getItem(pendingStorageKey(key)),primaryRaw=localStorage.getItem(checkoutStorageKey(key));
  if((mirrorRaw?.length??0)>MAX_JOURNAL_LENGTH||(primaryRaw?.length??0)>MAX_JOURNAL_LENGTH)throw new Error('Pending transaction storage exceeds its size limit. Transaction protection remains closed.');
  const mirror=mirrorRaw===null?undefined:validAttempt(key,JSON.parse(mirrorRaw));
  const primary=primaryRaw===null?undefined:validAttempt(key,JSON.parse(primaryRaw),true);
  if(primary&&mirror&&!sameIncarnation(primary,mirror))throw new Error('Pending journals disagree. Transaction protection remains closed.');
  return{mirror,primary};
}
export function readPendingAttempt(key:string){
  const {mirror,primary}=storedAttempts(key);
  const remembered=memoryAttempts.get(key);
  const stored=primary??mirror;
  if(primary&&remembered&&sameIncarnation(primary,remembered)&&remembered.baseline&&!sameBaseline(primary.baseline,remembered.baseline))throw new Error('Pending purchase baseline changed. Transaction protection remains closed.');
  let result=stored??remembered;
  if(result){
    if(remembered&&sameIncarnation(result,remembered)&&!primary&&hasBaseline(remembered))result=remembered;
    for(const record of [mirror,primary,remembered])if(record&&sameIncarnation(result,record)&&stateRank[record.state]>stateRank[result.state])result={...result,state:record.state};
    memoryAttempts.set(key,result);
  }
  return result;
}
function assertStoredIncarnation(key:string,expected:PendingAttempt,allowConfirmed=true,requireCurrentState=false){
  const stored=storedAttempts(key);
  for(const record of [stored.mirror,stored.primary,memoryAttempts.get(key)])if(record){
    if(!sameIncarnation(record,expected)||(record.baseline&&!sameBaseline(record.baseline,expected.baseline)))throw new Error('The protected pending incarnation changed. Its state was not replaced or cleared.');
    if(stateRank[record.state]>stateRank[expected.state]){
      const remembered=memoryAttempts.get(key);
      if(!remembered||stateRank[record.state]>stateRank[remembered.state])memoryAttempts.set(key,{...expected,state:record.state});
      if(requireCurrentState)throw new Error('Pending transaction progress changed. Its newer state remains protected.');
    }
    if(!allowConfirmed&&record.state==='confirmed')throw new Error('The protected pending incarnation was confirmed. Its state was not cleared.');
  }
  return stored;
}
function mirrorRecord(item:PendingAttempt):PendingAttempt{return{network:item.network,program:item.program,buyer:item.buyer,offer:item.offer,action:item.action,signature:item.signature,blockhash:item.blockhash,lastValidBlockHeight:item.lastValidBlockHeight,state:item.state,...(item.createdOffer?{createdOffer:item.createdOffer}:{})};}
export function storePendingAttempt(key:string,attempt:PendingAttempt){
  validAttempt(key,attempt,hasBaseline(attempt));
  const existing=readPendingAttempt(key);
  if(existing&&(!sameIncarnation(existing,attempt)||!sameBaseline(existing.baseline,attempt.baseline)))throw new Error('A different pending incarnation or baseline is protected. Its state was not replaced.');
  const record={...attempt,state:existing&&stateRank[existing.state]>stateRank[attempt.state]?existing.state:attempt.state,...(attempt.baseline?{baseline:{kind:attempt.baseline.kind,expiry:attempt.baseline.expiry,data:attempt.baseline.data}}:{})};
  memoryAttempts.set(key,record);
  assertStoredIncarnation(key,record,true,true);
  const encoded=hasBaseline(record)?JSON.stringify(record):undefined;
  if(encoded!==undefined)localStorage.setItem(checkoutStorageKey(key),encoded);
  assertStoredIncarnation(key,record,true,true);
  const mirror=JSON.stringify(mirrorRecord(record));localStorage.setItem(pendingStorageKey(key),mirror);
  assertStoredIncarnation(key,record,true,true);
  if(localStorage.getItem(pendingStorageKey(key))!==mirror||(encoded!==undefined&&localStorage.getItem(checkoutStorageKey(key))!==encoded))throw new Error('Could not preserve pending transaction state. Its retry protection remains active.');
}
export function clearPendingAttempt(key:string,expected:PendingAttempt,{allowConfirmed=true}:{allowConfirmed?:boolean}={}){
  const current=readPendingAttempt(key);
  if(current&&(!sameIncarnation(current,expected)||!sameBaseline(current.baseline,expected.baseline)||(!allowConfirmed&&current.state==='confirmed')))throw new Error('The protected pending incarnation changed or was confirmed. Its state was not cleared.');
  assertStoredIncarnation(key,expected,allowConfirmed);
  localStorage.removeItem(pendingStorageKey(key));if(localStorage.getItem(pendingStorageKey(key))!==null)throw new Error('Could not clear resolved transaction storage. Retry protection remains active.');
  assertStoredIncarnation(key,expected,allowConfirmed);
  localStorage.removeItem(checkoutStorageKey(key));if(localStorage.getItem(checkoutStorageKey(key))!==null||localStorage.getItem(pendingStorageKey(key))!==null)throw new Error('Could not clear resolved paired storage. Retry protection remains active.');
  assertStoredIncarnation(key,expected,allowConfirmed);
  const remembered=memoryAttempts.get(key);
  if(remembered&&sameIncarnation(remembered,expected))memoryAttempts.delete(key);
}
export function expiredAttemptMatchesSnapshot(attempt:PendingAttempt,snapshot:SolanaSnapshot,statusContextSlot:number,now:number){
  const age=now-snapshot.startedAtMs;
  return hasBaseline(attempt)&&attempt.state!=='confirmed'&&Number.isSafeInteger(statusContextSlot)&&statusContextSlot>=0&&snapshot.commitment==='finalized'&&snapshot.slot>=BigInt(statusContextSlot)&&snapshot.program===attempt.program&&snapshot.offerAddress===attempt.offer&&snapshot.holder===attempt.buyer&&Number.isFinite(age)&&age>=0&&age<FRESHNESS_MS&&snapshot.receivedAtMs>=snapshot.startedAtMs&&now>=snapshot.receivedAtMs&&!snapshot.valid&&sameBaseline(attempt.baseline,snapshot.licenseBaseline);
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
export type ReconciledAttempt={state:'finalized'|'failed'|'expired';statusContextSlot:number;diagnostic?:string}|{state:'confirmed-pending'|'unknown';diagnostic?:string};
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
    if(status?.confirmationStatus==='finalized')return status.err?{state:'failed' as const,statusContextSlot:statusSlot,diagnostic:transactionDiagnostic({message:'Transaction failed on Solana Devnet.',detail:status.err})}:{state:'finalized' as const,statusContextSlot:statusSlot};
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
        if(!confirmed&&finalStatus===null){const validity=await source('isBlockhashValid',[attempt.blockhash,{commitment:'finalized'}]) as {value?:unknown};if(typeof validity?.value!=='boolean')throw new Error('Invalid blockhash validity response.');if(validity.value===false)return{state:'expired',statusContextSlot:statusSlot,diagnostic:'Blockhash expired with no observed transaction confirmation.'};}
      }
      failures=0;
    }catch(error){diagnostic=transactionDiagnostic(error);failures++;}
    if(clock()<deadline)await sleep(Math.min(1000*Math.max(1,failures),4000,Math.max(0,deadline-clock())));
  }
  return{state:confirmed?'confirmed-pending':'unknown',diagnostic};
}
