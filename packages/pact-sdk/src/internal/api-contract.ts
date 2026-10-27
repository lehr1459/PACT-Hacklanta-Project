import { Buffer } from 'buffer';
import { PublicKey, TransactionInstruction, TransactionMessage, VersionedTransaction, ComputeBudgetProgram } from '@solana/web3.js';
import { keccak_256 } from '@noble/hashes/sha3';
import { PACT_PROGRAM_ID, FRESHNESS_MS, SLOT_PROGRESS_MS, isLicenseStatusFresh, type LicenseStatus } from '../index.js';
import type { OfferInfo } from '../checkout.js';
import type { APIQuote, PublicLicenseResult, PreparedOfferResponse, PreparedCheckoutResponse, TransactionStatus, WalletSession, AuthenticatedSession } from '../platform-types.js';
import { PactApiError } from './api-error.js';
import { isTransactionError } from './transaction-error.js';

const program = new PublicKey(PACT_PROGRAM_ID), system = '11111111111111111111111111111111';
const U64 = 18446744073709551615n, I64 = 9223372036854775807n;
export function invalid(code = 'INVALID_ACCOUNT'): never { throw new PactApiError(code, 'API response does not match the required contract.'); }
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))
    || Object.keys(value).some(key => ['__proto__', 'constructor', 'prototype'].includes(key))) invalid();
  return value as Record<string, unknown>;
}
export function integer(value: unknown): value is number { return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0; }
export function address(value: unknown, code = 'INVALID_INPUT'): string {
  try {
    if (typeof value !== 'string' || value.length < 32 || value.length > 44) throw Error();
    if (new PublicKey(value).toBase58() !== value) throw Error();
    return value;
  } catch { return invalid(code); }
}
export function decimal(value: unknown, maximum = U64, positive = false, code = 'INVALID_ACCOUNT'): string {
  if (typeof value !== 'string' || !/^(?:0|[1-9]\d{0,19})$/.test(value) || BigInt(value) > maximum || positive && BigInt(value) === 0n) invalid(code);
  return value;
}
export function base64(value: unknown, maximum: number, exact?: number): Uint8Array {
  if (typeof value !== 'string' || value.length > Math.ceil(maximum / 3) * 4 || value.length % 4) invalid();
  const bytes = Buffer.from(value, 'base64');
  if (bytes.length > maximum || exact !== undefined && bytes.length !== exact || bytes.toString('base64') !== value) invalid();
  return bytes;
}
export function signature(value: unknown): string {
  if (typeof value !== 'string' || !/^[1-9A-HJ-NP-Za-km-z]{64,88}$/.test(value)) invalid('INVALID_INPUT');
  const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let number = 0n;
  for (const char of value) number = number * 58n + BigInt(alphabet.indexOf(char));
  const hex = number ? number.toString(16) : '';
  const size = hex ? Math.ceil(hex.length / 2) : 0;
  const leading = value.length - value.replace(/^1+/, '').length;
  if (size + leading !== 64) invalid('INVALID_INPUT');
  return value;
}
export function token(value: unknown): value is string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(value)) return false;
  // The published browser Buffer supports base64, but not Node's base64url encoding.
  const bytes=Buffer.from(value.replace(/-/g,'+').replace(/_/g,'/')+'=','base64');
  return bytes.length===32 && bytes.toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')===value;
}
export function metadata(value: unknown, code = 'INVALID_INPUT') {
  if (typeof value !== 'string' || value.length > 65536 || Buffer.byteLength(value) > 65536 || Buffer.from(value,'utf8').toString('utf8') !== value) invalid(code);
  let m: Record<string,unknown>;
  try { m = object(JSON.parse(value)); } catch { return invalid(code); }
  if (m.schema !== 'pact-solana-license-v1' || typeof m.title !== 'string' || !m.title.trim() || typeof m.terms !== 'string' || !m.terms.trim()) invalid(code);
  return { json: value, title: m.title, terms: m.terms,
    priceLamports: decimal(m.priceLamports,U64,true,code), durationSeconds: decimal(m.durationSeconds,31536000n,true,code),
    termsHash: '0x'+Buffer.from(keccak_256(Buffer.from(value,'utf8'))).toString('hex') };
}
export function snapshot(value: Record<string,unknown>, now = Date.now()) {
  if (!integer(now) || !integer(value.contextSlot) || !integer(value.startedAtMs) || !integer(value.receivedAtMs)) invalid();
  const chainTimestamp = decimal(value.chainTimestamp,I64);
  if (value.startedAtMs > value.receivedAtMs || value.receivedAtMs > now || now - value.startedAtMs >= FRESHNESS_MS
    || BigInt(chainTimestamp)*1000n < BigInt(now)-60000n || BigInt(chainTimestamp)*1000n > BigInt(now)+60000n) invalid('STALE');
  return { contextSlot: value.contextSlot, chainTimestamp, startedAtMs: value.startedAtMs, receivedAtMs: value.receivedAtMs };
}
function offerPda(seller: string, nonce: string) {
  const bytes=Buffer.alloc(8);bytes.writeBigUInt64LE(BigInt(nonce));
  return PublicKey.findProgramAddressSync([Buffer.from('offer'),new PublicKey(seller).toBuffer(),bytes],program)[0].toBase58();
}
function licensePda(offer: string, wallet: string) {
  return PublicKey.findProgramAddressSync([Buffer.from('license'),new PublicKey(offer).toBuffer(),new PublicKey(wallet).toBuffer()],program)[0].toBase58();
}
export function offer(value: unknown, expected: string, now = Date.now()): APIQuote {
  const v=object(value), seller=address(v.seller,'INVALID_ACCOUNT'), nonce=decimal(v.nonce);
  if (v.program !== PACT_PROGRAM_ID || v.offer !== expected || offerPda(seller,nonce) !== expected
    || typeof v.active !== 'boolean' || typeof v.termsHash !== 'string' || !/^0x[0-9a-f]{64}$/.test(v.termsHash) || /^0x0+$/.test(v.termsHash)) invalid();
  return {program:PACT_PROGRAM_ID,offer:expected,seller,nonce,priceLamports:decimal(v.priceLamports,U64,true),
    durationSeconds:decimal(v.durationSeconds,31536000n,true),termsHash:v.termsHash,active:v.active,...snapshot(v,now)};
}
export function publicLicense(value: unknown, input: {offerAddress:string;walletAddress:string}, now = Date.now()): PublicLicenseResult {
  const v=object(value), s=object(v.status), f=object(v.freshness), context=snapshot(s,now);
  const expiry=decimal(s.expiry,I64), active=BigInt(expiry)>BigInt(context.chainTimestamp);
  if (v.network!=='devnet'||v.program!==PACT_PROGRAM_ID||v.offerAddress!==input.offerAddress||v.walletAddress!==input.walletAddress
    ||v.walletControlProven!==false||v.authorized!==false||s.program!==PACT_PROGRAM_ID||s.offer!==input.offerAddress||s.wallet!==input.walletAddress
    ||s.licensePda!==licensePda(input.offerAddress,input.walletAddress)||typeof s.state!=='string'||!['active','expired','missing'].includes(s.state)
    ||s.active!==active||v.valid!==active||v.state!==s.state||(s.state==='active')!==active
    ||s.state==='missing'&&expiry!=='0'||!integer(s.lastProgressAtMs)||s.lastProgressAtMs>context.receivedAtMs||now-s.lastProgressAtMs>=SLOT_PROGRESS_MS
    ||v.reason!==(s.state==='active'?'VALID':s.state==='missing'?'MISSING':'EXPIRED')||v.expiration!==(s.state==='missing'?null:expiry)
    ||f.maxAgeMs!==FRESHNESS_MS||f.contextSlot!==context.contextSlot||f.chainTimestamp!==context.chainTimestamp
    ||!integer(f.verifiedAtMs)||f.verifiedAtMs<context.receivedAtMs||f.verifiedAtMs>now
    ||typeof v.verifiedAt!=='string'||new Date(f.verifiedAtMs).toISOString()!==v.verifiedAt) invalid();
  const status:LicenseStatus={program:PACT_PROGRAM_ID,offer:input.offerAddress,wallet:input.walletAddress,licensePda:s.licensePda as string,
    ...context,expiry,state:s.state as LicenseStatus['state'],active,lastProgressAtMs:s.lastProgressAtMs as number};
  if(active&&(!isLicenseStatusFresh(status,now)||BigInt(expiry)<=BigInt(Math.floor(now/1000)))) invalid('STALE');
  return {network:'devnet',program:PACT_PROGRAM_ID,offerAddress:input.offerAddress,walletAddress:input.walletAddress,valid:active,state:status.state,
    expiration:status.state==='missing'?null:expiry,verifiedAt:v.verifiedAt as string,reason:status.state==='active'?'VALID':status.state==='missing'?'MISSING':'EXPIRED',
    walletControlProven:false,authorized:false,freshness:{verifiedAtMs:f.verifiedAtMs as number,maxAgeMs:FRESHNESS_MS,...{contextSlot:context.contextSlot,chainTimestamp:context.chainTimestamp}},status};
}
export function session(value: unknown, requireAuthenticated = false, now = Date.now()): WalletSession | AuthenticatedSession {
  const v=object(value);
  if(v.authenticated===false&&!requireAuthenticated) {
    if(Object.keys(v).some(key=>key!=='authenticated')) invalid('AUTH_INVALID');
    return {authenticated:false};
  }
  if(v.authenticated!==true||!integer(v.expiresAt)||v.expiresAt<=now||v.expiresAt>now+3600000) invalid('AUTH_INVALID');
  return {authenticated:true,walletAddress:address(v.walletAddress,'AUTH_INVALID'),expiresAt:v.expiresAt};
}
export function transactionStatus(value: unknown, expected: string): TransactionStatus {
  const v=object(value);
  if(v.network!=='devnet'||v.signature!==expected||!integer(v.contextSlot)||typeof v.state!=='string'||!['not-found','processed','confirmed','finalized','failed'].includes(v.state)) invalid();
  if(v.state==='not-found') { if(v.slot!==null||v.error!==null) invalid(); }
  else if(!integer(v.slot)||v.slot>v.contextSlot||(v.state==='failed'?!isTransactionError(v.error):v.error!==null)) invalid();
  return {network:'devnet',signature:expected,state:v.state as TransactionStatus['state'],slot:v.slot as number|null,error:v.error,contextSlot:v.contextSlot};
}
function bindMetadata(text: string, quote: Pick<OfferInfo,'termsHash'|'priceLamports'|'durationSeconds'>) {
  const m=metadata(text,'INVALID_ACCOUNT');
  if(m.termsHash!==quote.termsHash||m.priceLamports!==quote.priceLamports||m.durationSeconds!==quote.durationSeconds) invalid();
  return m;
}
function unsigned(value: unknown, payer: string, blockhash: string, instruction: TransactionInstruction) {
  try {
    const bytes=base64(value,1232),tx=VersionedTransaction.deserialize(bytes),message=tx.message;
    if(message.version!==0||tx.signatures.length!==1||tx.signatures.some(s=>s.some(b=>b!==0))||message.addressTableLookups.length!==0
      ||!Buffer.from(tx.serialize()).equals(Buffer.from(bytes))) invalid();
    const expected=new VersionedTransaction(new TransactionMessage({payerKey:new PublicKey(payer),recentBlockhash:blockhash,
      instructions:[ComputeBudgetProgram.setComputeUnitLimit({units:200000}),ComputeBudgetProgram.setComputeUnitPrice({microLamports:0}),instruction]}).compileToV0Message());
    function semantics(transaction:VersionedTransaction) {
      const m=transaction.message;if(m.version!==0) invalid();
      const keys=m.staticAccountKeys.map(k=>k.toBase58());
      if(new Set(keys).size!==keys.length) invalid();
      const privilege=(i:number)=>{if(!integer(i)||i>=keys.length) invalid();return{address:keys[i],signer:m.isAccountSigner(i),writable:m.isAccountWritable(i)};};
      return JSON.stringify({payer:keys[0],header:m.header,blockhash:m.recentBlockhash,keys:keys.map((_,i)=>privilege(i)).sort((a,b)=>a.address.localeCompare(b.address)),
        instructions:m.compiledInstructions.map(ix=>({program:privilege(ix.programIdIndex),accounts:Array.from(ix.accountKeyIndexes,privilege),data:Buffer.from(ix.data).toString('hex')}))});
    }
    if(semantics(tx)!==semantics(expected)) invalid();
  } catch { invalid(); }
}
export function preparedCheckout(value: unknown, input:{offerAddress:string;walletAddress:string;metadataJson:string}, now=Date.now()): PreparedCheckoutResponse {
  const v=object(value),quote=offer(v.quote,input.offerAddress,now),buyer=input.walletAddress,license=licensePda(input.offerAddress,buyer);
  if(v.network!=='devnet'||v.programId!==PACT_PROGRAM_ID||v.buyer!==buyer||v.licensePda!==license||!quote.active||!integer(v.lastValidBlockHeight)) invalid();
  bindMetadata(input.metadataJson,quote);const blockhash=address(v.blockhash,'INVALID_ACCOUNT');
  const ix=new TransactionInstruction({programId:program,keys:[
    {pubkey:new PublicKey(buyer),isSigner:true,isWritable:true},{pubkey:new PublicKey(quote.offer),isSigner:false,isWritable:false},
    {pubkey:new PublicKey(quote.seller),isSigner:false,isWritable:true},{pubkey:new PublicKey(license),isSigner:false,isWritable:true},
    {pubkey:new PublicKey(system),isSigner:false,isWritable:false}],data:Buffer.from('ff518198a9c9e869','hex')});
  unsigned(v.transactionBase64,buyer,blockhash,ix);
  return {network:'devnet',programId:PACT_PROGRAM_ID,quote,buyer,licensePda:license,blockhash,lastValidBlockHeight:v.lastValidBlockHeight,transactionBase64:v.transactionBase64 as string};
}
export function preparedOffer(value: unknown, input:{sellerWallet:string;nonce:string;metadataJson:string}, now=Date.now()): PreparedOfferResponse {
  const v=object(value),m=metadata(input.metadataJson),seller=input.sellerWallet,nonce=input.nonce,expected=offerPda(seller,nonce),context=snapshot(v,now);
  if(v.network!=='devnet'||v.programId!==PACT_PROGRAM_ID||v.seller!==seller||v.nonce!==nonce||v.offer!==expected
    ||v.priceLamports!==m.priceLamports||v.durationSeconds!==m.durationSeconds||v.termsHash!==m.termsHash||!integer(v.lastValidBlockHeight)) invalid();
  const blockhash=address(v.blockhash,'INVALID_ACCOUNT'),n=Buffer.alloc(8),price=Buffer.alloc(8),duration=Buffer.alloc(8);
  n.writeBigUInt64LE(BigInt(nonce));price.writeBigUInt64LE(BigInt(m.priceLamports));duration.writeBigUInt64LE(BigInt(m.durationSeconds));
  const ix=new TransactionInstruction({programId:program,keys:[{pubkey:new PublicKey(seller),isSigner:true,isWritable:true},
    {pubkey:new PublicKey(expected),isSigner:false,isWritable:true},{pubkey:new PublicKey(system),isSigner:false,isWritable:false}],
    data:Buffer.concat([Buffer.from('ede9c0a8f807f9f1','hex'),n,price,duration,Buffer.from(m.termsHash.slice(2),'hex')])});
  unsigned(v.transactionBase64,seller,blockhash,ix);
  return {network:'devnet',programId:PACT_PROGRAM_ID,seller,nonce,offer:expected,transactionBase64:v.transactionBase64 as string,blockhash,
    lastValidBlockHeight:v.lastValidBlockHeight,termsHash:m.termsHash,priceLamports:m.priceLamports,durationSeconds:m.durationSeconds,...context};
}
export { bindMetadata };
