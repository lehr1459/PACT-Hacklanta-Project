import { ComputeBudgetProgram,MessageV0,TransactionMessage,VersionedTransaction,type PublicKey,type TransactionInstruction } from '@solana/web3.js';
import { signatureBase58 } from './protocol';

export const PACT_COMPUTE_UNIT_LIMIT=200000;
export function createReviewedTransaction(payer:PublicKey,blockhash:string,instruction:TransactionInstruction){
  // Phantom enhances unsigned messages without an explicit compute budget.
  // Set the reviewed budget before simulation/signing, retaining exact equality.
  const message=new TransactionMessage({payerKey:payer,recentBlockhash:blockhash,instructions:[
    ComputeBudgetProgram.setComputeUnitLimit({units:PACT_COMPUTE_UNIT_LIMIT}),
    ComputeBudgetProgram.setComputeUnitPrice({microLamports:0}),
    instruction,
  ]}).compileToV0Message();
  const transaction=VersionedTransaction.deserialize(new VersionedTransaction(message).serialize());
  return{transaction,messageBytes:Uint8Array.from(transaction.message.serialize())};
}
function sameBytes(left:Uint8Array,right:Uint8Array){return left.length===right.length&&left.every((byte,index)=>byte===right[index]);}
function changedFields(original:Uint8Array,signed:VersionedTransaction):string[]{
  if(signed.version!==0)return['version'];
  const before=MessageV0.deserialize(original);const after=signed.message as MessageV0;const fields:string[]=[];
  if(before.header.numRequiredSignatures!==after.header.numRequiredSignatures||before.header.numReadonlySignedAccounts!==after.header.numReadonlySignedAccounts||before.header.numReadonlyUnsignedAccounts!==after.header.numReadonlyUnsignedAccounts)fields.push('header');
  if(!after.staticAccountKeys[0]||!before.staticAccountKeys[0]?.equals(after.staticAccountKeys[0]))fields.push('payer');
  if(before.recentBlockhash!==after.recentBlockhash)fields.push('blockhash');
  if(before.staticAccountKeys.length!==after.staticAccountKeys.length||before.staticAccountKeys.some((key,index)=>!after.staticAccountKeys[index]||!key.equals(after.staticAccountKeys[index])))fields.push('account keys');
  if(before.compiledInstructions.length!==after.compiledInstructions.length||before.compiledInstructions.some((instruction,index)=>{
    const next=after.compiledInstructions[index];return !next||instruction.programIdIndex!==next.programIdIndex||instruction.accountKeyIndexes.length!==next.accountKeyIndexes.length||instruction.accountKeyIndexes.some((key,offset)=>key!==next.accountKeyIndexes[offset])||!sameBytes(instruction.data,next.data);
  }))fields.push('instructions');
  if(before.addressTableLookups.length!==after.addressTableLookups.length||before.addressTableLookups.some((lookup,index)=>{
    const next=after.addressTableLookups[index];return !next||!lookup.accountKey.equals(next.accountKey)||lookup.readonlyIndexes.length!==next.readonlyIndexes.length||lookup.writableIndexes.length!==next.writableIndexes.length||lookup.readonlyIndexes.some((key,offset)=>key!==next.readonlyIndexes[offset])||lookup.writableIndexes.some((key,offset)=>key!==next.writableIndexes[offset]);
  }))fields.push('address lookups');
  return fields.length?fields:['serialized bytes'];
}
export function assertReviewedTransaction(messageBytes:Uint8Array,signed:VersionedTransaction){
  if(!sameBytes(messageBytes,signed.message.serialize()))throw new Error(`The wallet changed the transaction message (${changedFields(messageBytes,signed).join(', ')}). Nothing was submitted.`);
}
export function captureReviewedTransaction(messageBytes:Uint8Array,signed:VersionedTransaction){
  // Copy the actual returned wire before any further await. Never trust a
  // provider object's message getter separately from the bytes it submits.
  const wireBytes=Uint8Array.from(signed.serialize());
  const canonical=VersionedTransaction.deserialize(wireBytes);
  if(!sameBytes(wireBytes,canonical.serialize()))throw new Error('The wallet returned a noncanonical transaction encoding. Nothing was submitted.');
  assertReviewedTransaction(messageBytes,canonical);
  return{wireBytes,signature:signatureBase58(canonical.signatures[0])};
}
