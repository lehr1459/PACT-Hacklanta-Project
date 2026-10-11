import {test,expect} from '@playwright/test';
import {PublicKey} from '@solana/web3.js';
import {Buffer} from 'buffer';
import {deriveOffer,deriveLicense,decodeOffer,decodeLicense,metadataHash,metadataWithinLimit,parseMetadata,metadataMatches,parseLamports,signatureBase58,createOfferInstruction,buyLicenseInstruction,DEVNET_GENESIS,SYSVAR_OWNER} from '../../lib/solana/protocol';
import {acquireSolanaSnapshot,snapshotHasAccess,boundedSolanaFetch,READ_TIMEOUT_MS,type RpcSource} from '../../lib/solana/rpc';

import {program,seller,buyer,metadata,offer,license,offerBytes,licenseBytes,accounts} from './fixtures';
test.skip(()=>process.env.PACT_SOLANA_QA_MODE==='setup'||process.env.PACT_SOLANA_QA_MODE==='live','Helpers run in fixture acceptance');
test('wire layout and PDA binding agree with frozen native program',()=>{
  const parsed=decodeOffer(offerBytes(),program,offer);expect(parsed.priceLamports).toBe(1000000n);expect(decodeLicense(licenseBytes(),program,license,offer,buyer)).toBe(1060n);
  expect(createOfferInstruction(program,seller,1n,1000000n,60n,metadataHash(metadata)).data.length).toBe(64);
  const ix=buyLicenseInstruction(program,buyer,parsed);expect(ix.data.toString('hex')).toBe('ff518198a9c9e869');expect(ix.keys.map(k=>[k.isSigner,k.isWritable])).toEqual([[true,true],[false,false],[false,true],[false,true],[false,false]]);
  for(const offset of [0,8,40,97]){const corrupt=offerBytes();corrupt[offset]^=1;expect(()=>decodeOffer(corrupt,program,offer)).toThrow();}
  for(const offset of [0,8,40,80]){const corrupt=licenseBytes();corrupt[offset]^=1;expect(()=>decodeLicense(corrupt,program,license,offer,buyer)).toThrow();}
});
test('metadata uses exact UTF8 bytes, approval parameters and shared 64KiB limit',()=>{
  const parsed=decodeOffer(offerBytes(),program,offer);expect(metadataMatches(metadata,parsed)).toBe(true);expect(metadataMatches(metadata+' ',parsed)).toBe(false);
  const base=JSON.parse(metadata);const empty=JSON.stringify({...base,terms:''});const exact=JSON.stringify({...base,terms:'x'.repeat(65536-Buffer.byteLength(empty))});expect(Buffer.byteLength(exact)).toBe(65536);expect(parseMetadata(exact)).toBeDefined();expect(metadataWithinLimit(exact+' ')).toBe(false);expect(parseMetadata(exact+' ')).toBeUndefined();
  expect(metadataWithinLimit('é'.repeat(32768))).toBe(true);expect(metadataWithinLimit('é'.repeat(32769))).toBe(false);expect(parseLamports('0.000000001')).toBe(1n);expect(parseLamports('1.0000000001')).toBeUndefined();expect(parseLamports('18446744074')).toBeUndefined();
});
test('one coherent account context validates program, owners and chain Clock',async()=>{
  const calls:{method:string;params?:unknown[]}[]=[];const source:RpcSource=async(method,params)=>{calls.push({method,params});return method==='getGenesisHash'?DEVNET_GENESIS:{context:{slot:100},value:accounts()};};
  const s=await acquireSolanaSnapshot({program,offerAddress:offer.toBase58(),holder:buyer.toBase58(),session:3,clock:()=>10,source,minContextSlot:99});expect(s.valid).toBe(true);expect(s.slot).toBe(100n);expect(s.session).toBe(3);expect(calls.map(c=>c.method)).toEqual(['getGenesisHash','getMultipleAccounts']);expect((calls[1].params![0] as string[])).toHaveLength(4);expect(calls[1].params![1]).toMatchObject({minContextSlot:99});
  expect(snapshotHasAccess(s,8009,10)).toBe(true);expect(snapshotHasAccess(s,8010,10)).toBe(false);expect(snapshotHasAccess({...s,startedAtMs:12010},12010,10)).toBe(false);expect(snapshotHasAccess({...s,expiry:1001n},1010,10)).toBe(false);
});
test('wrong genesis, owner, executable, corrupt accounts, future Clock and old context fail closed',async()=>{
  const run=(value:unknown,genesis=DEVNET_GENESIS,minContextSlot?:number)=>acquireSolanaSnapshot({program,offerAddress:offer.toBase58(),holder:buyer.toBase58(),session:0,clock:()=>0,minContextSlot,source:async m=>m==='getGenesisHash'?genesis:value});
  await expect(run({context:{slot:100},value:accounts()},'mainnet')).rejects.toThrow('Wrong cluster');
  for(const index of [0,1,2,3]){const value=accounts();value[index]={...value[index],owner:seller.toBase58()};await expect(run({context:{slot:100},value})).rejects.toThrow();}
  const bad=accounts();bad[3].executable=false;await expect(run({context:{slot:100},value:bad})).rejects.toThrow('executable');
  await expect(run({context:{slot:99},value:accounts()})).rejects.toThrow('Clock');
  await expect(run({context:{slot:101},value:accounts()})).rejects.toThrow('Clock');
  await expect(run({context:{slot:100},value:accounts()},DEVNET_GENESIS,101)).rejects.toThrow();
});

test('prefunded canonical empty system license remains uninitialized; malformed variants fail closed',async()=>{const value=accounts();value[1]={data:['','base64'],owner:'11111111111111111111111111111111',executable:false,lamports:1};const get=()=>acquireSolanaSnapshot({program,offerAddress:offer.toBase58(),holder:buyer.toBase58(),session:0,clock:()=>0,source:async m=>m==='getGenesisHash'?DEVNET_GENESIS:{context:{slot:100},value}});const snapshot=await get();expect(snapshot.expiry).toBe(0n);expect(snapshot.valid).toBe(false);value[1].data=['AQ==','base64'];await expect(get()).rejects.toThrow();value[1].data=['','base64'];value[1].executable=true;await expect(get()).rejects.toThrow();value[1].executable=false;value[1].owner=seller.toBase58();await expect(get()).rejects.toThrow();});
test('signature identifier validates nonzero64bytes and independently known base58 encoding',()=>{expect(signatureBase58(new Uint8Array(64).fill(1))).toBe('2AXDGYSE4f2sz7tvMMzyHvUfcoJmxudvdhBcmiUSo6ijwfYmfZYsKRxboQMPh3R4kUhXRVdtSXFXMheka4Rc4P2');expect(()=>signatureBase58(new Uint8Array(64))).toThrow();expect(()=>signatureBase58(new Uint8Array(63).fill(1))).toThrow();});
test('SDK deadline includes a stalled response body after headers arrive',async()=>{const original=globalThis.fetch;let bodyStarted=false;globalThis.fetch=async(_input,init)=>({status:200,statusText:'OK',headers:new Headers(),text:()=>{bodyStarted=true;return new Promise<string>((_resolve,reject)=>{init?.signal?.addEventListener('abort',()=>reject(new Error('Controlled body aborted')));});}} as Response);const started=performance.now();try{await expect(boundedSolanaFetch('http://127.0.0.1:8548',{method:'POST'})).rejects.toThrow('Controlled body aborted');expect(bodyStarted).toBe(true);expect(READ_TIMEOUT_MS).toBe(5000);expect(performance.now()-started).toBeGreaterThanOrEqual(4900);expect(performance.now()-started).toBeLessThan(6500);}finally{globalThis.fetch=original;}});