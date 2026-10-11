import {test,expect} from '@playwright/test';
import {ComputeBudgetProgram,TransactionMessage,VersionedTransaction} from '@solana/web3.js';
import {createReviewedTransaction,assertReviewedTransaction,captureReviewedTransaction} from '../../lib/solana/transaction';
import {createOfferInstruction,metadataHash} from '../../lib/solana/protocol';
import {program,seller,buyer,metadata} from './fixtures';

test.skip(()=>['setup','live'].includes(process.env.PACT_SOLANA_QA_MODE??''),'Synthetic transaction helpers only');
const instruction=()=>createOfferInstruction(program,seller,1n,1000000n,180n,metadataHash(metadata));
// Model documented Phantom fee enhancement, not a captured extension session.
function phantom(transaction:VersionedTransaction,clone=false){
  const result=clone?VersionedTransaction.deserialize(transaction.serialize()):transaction;
  if(!result.message.staticAccountKeys.some(key=>key.equals(ComputeBudgetProgram.programId))){
    const decoded=TransactionMessage.decompile(result.message);
    decoded.instructions.unshift(ComputeBudgetProgram.setComputeUnitLimit({units:200000}),ComputeBudgetProgram.setComputeUnitPrice({microLamports:1000}));
    result.message=decoded.compileToV0Message();
  }
  result.signatures[0]=new Uint8Array(64).fill(1); // Noncryptographic fixture bytes.
  return result;
}
test('documented unsigned fee enhancement reproduces old exact-message rejection',()=>{
  const legacy=new VersionedTransaction(new TransactionMessage({payerKey:seller,recentBlockhash:program.toBase58(),instructions:[instruction()]}).compileToV0Message());
  const original=Uint8Array.from(legacy.message.serialize());
  expect(()=>assertReviewedTransaction(original,phantom(legacy))).toThrow('wallet changed');
});
for(const clone of [false,true])test(`predeclared budget survives legitimate ${clone?'reconstructed':'in-place'} synthetic Phantom return`,()=>{
  const reviewed=createReviewedTransaction(seller,program.toBase58(),instruction());
  expect(reviewed.transaction.message.compiledInstructions).toHaveLength(3);
  expect(()=>assertReviewedTransaction(reviewed.messageBytes,phantom(reviewed.transaction,clone))).not.toThrow();
});
const mutations={
  payer:(tx:VersionedTransaction)=>{tx.message.staticAccountKeys[0]=buyer;},
  blockhash:(tx:VersionedTransaction)=>{tx.message.recentBlockhash=buyer.toBase58();},
  accountOrder:(tx:VersionedTransaction)=>{[tx.message.staticAccountKeys[1],tx.message.staticAccountKeys[2]]=[tx.message.staticAccountKeys[2],tx.message.staticAccountKeys[1]];},
  programId:(tx:VersionedTransaction)=>{tx.message.compiledInstructions[2].programIdIndex=0;},
  amount:(tx:VersionedTransaction)=>{tx.message.compiledInstructions[2].data[16]^=1;},
  terms:(tx:VersionedTransaction)=>{tx.message.compiledInstructions[2].data[32]^=1;},
  accounts:(tx:VersionedTransaction)=>{tx.message.compiledInstructions[2].accountKeyIndexes[0]=1;},
  limit:(tx:VersionedTransaction)=>{tx.message.compiledInstructions[0].data[1]^=1;},
  fee:(tx:VersionedTransaction)=>{tx.message.compiledInstructions[1].data[1]=1;},
  extra:(tx:VersionedTransaction)=>{tx.message.compiledInstructions.push({...tx.message.compiledInstructions[0]});},
  header:(tx:VersionedTransaction)=>{tx.message.header.numReadonlyUnsignedAccounts-=1;},
  lookups:(tx:VersionedTransaction)=>{if(tx.message.version===0)tx.message.addressTableLookups.push({accountKey:buyer,writableIndexes:[],readonlyIndexes:[0]});},
};
for(const [name,mutate] of Object.entries(mutations))test(`strict snapshot rejects synthetic ${name} tampering before mock send`,()=>{
  const reviewed=createReviewedTransaction(seller,program.toBase58(),instruction());const signed=phantom(reviewed.transaction);mutate(signed);
  let sends=0;expect(()=>{assertReviewedTransaction(reviewed.messageBytes,signed);sends++;}).toThrow('Nothing was submitted');expect(sends).toBe(0);
});
test('legacy message version replacement is rejected',()=>{
  const reviewed=createReviewedTransaction(seller,program.toBase58(),instruction());
  const altered=new VersionedTransaction(TransactionMessage.decompile(reviewed.transaction.message).compileToLegacyMessage());
  expect(()=>assertReviewedTransaction(reviewed.messageBytes,altered)).toThrow('version');
});
test('serialized wire tampering cannot hide behind a benign message property',()=>{
  const reviewed=createReviewedTransaction(seller,program.toBase58(),instruction());const signed=phantom(reviewed.transaction);
  const malicious=VersionedTransaction.deserialize(signed.serialize());malicious.message.recentBlockhash=buyer.toBase58();
  signed.serialize=()=>malicious.serialize();
  expect(()=>captureReviewedTransaction(reviewed.messageBytes,signed)).toThrow('Nothing was submitted');
});
test('captured signed wire remains immutable after provider object mutates',()=>{
  const reviewed=createReviewedTransaction(seller,program.toBase58(),instruction());const signed=phantom(reviewed.transaction);
  const capture=captureReviewedTransaction(reviewed.messageBytes,signed);const original=Uint8Array.from(capture.wireBytes);
  signed.message.recentBlockhash=buyer.toBase58();signed.signatures[0].fill(2);
  expect(capture.wireBytes).toEqual(original);expect(()=>assertReviewedTransaction(reviewed.messageBytes,VersionedTransaction.deserialize(capture.wireBytes))).not.toThrow();
});
test('noncanonical wire with appended bytes is rejected',()=>{
  const reviewed=createReviewedTransaction(seller,program.toBase58(),instruction());const signed=phantom(reviewed.transaction);const wire=signed.serialize();
  signed.serialize=()=>new Uint8Array([...wire,0]);expect(()=>captureReviewedTransaction(reviewed.messageBytes,signed)).toThrow();
});
