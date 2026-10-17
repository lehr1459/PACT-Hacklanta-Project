import {test,expect} from '@playwright/test';
import {Buffer} from 'buffer';
import {PublicKey,VersionedTransaction} from '@solana/web3.js';
import {createCheckoutClient} from '@pact/sdk/checkout';
import {PACT_PROGRAM_ID} from '@pact/sdk';
import {deriveOffer,deriveLicense,DEVNET_GENESIS} from '../../lib/solana/protocol';
import {acquireSolanaSnapshot,type RpcSource,type LicenseBaseline} from '../../lib/solana/rpc';
import {attemptKey,pendingStorageKey,checkoutStorageKey,storePendingAttempt,readPendingAttempt,clearPendingAttempt,reconcileAttempt,expiredAttemptMatchesSnapshot,type PendingAttempt} from '../../lib/solana/transaction-state';
import {accounts,offerBytes,licenseBytes,seller,buyer,metadata,program as fixtureProgram} from './fixtures';

test.skip(()=>['setup','live'].includes(process.env.PACT_SOLANA_QA_MODE??''),'Synthetic recovery helpers only');
let nextNonce=300;
function fixture(missing=false,expiry=900n,program=fixtureProgram){
  const nonce=BigInt(nextNonce++),[offer,bump]=deriveOffer(program,seller,nonce),[license,licenseBump]=deriveLicense(program,offer,buyer);
  const offerData=offerBytes();offerData.writeBigUInt64LE(nonce,40);offerData[97]=bump;
  const licenseData=licenseBytes(expiry);offer.toBuffer().copy(licenseData,8);licenseData[80]=licenseBump;
  const baseline:LicenseBaseline=missing?{kind:'missing',expiry:'0',data:null}:{kind:'initialized',expiry:expiry.toString(),data:licenseData.toString('base64')};
  const attempt:PendingAttempt={version:1,network:'devnet',program:program.toBase58(),buyer:buyer.toBase58(),offer:offer.toBase58(),action:'Purchase license',signature:'2AXDGYSE4f2sz7tvMMzyHvUfcoJmxudvdhBcmiUSo6ijwfYmfZYsKRxboQMPh3R4kUhXRVdtSXFXMheka4Rc4P2',blockhash:program.toBase58(),lastValidBlockHeight:100,state:'unknown',baseline};
  const key=attemptKey(attempt.program,attempt.buyer,attempt.offer,attempt.action);
  const snapshot=(slot=100)=>{
    const value=accounts();value[0]={...value[0],owner:attempt.program,data:[offerData.toString('base64'),'base64']};
    value[1]=missing?null as never:{...value[1],owner:attempt.program,data:[licenseData.toString('base64'),'base64']};
    const clock=Buffer.from(value[2].data[0],'base64');clock.writeBigUInt64LE(BigInt(slot));value[2].data=[clock.toString('base64'),'base64'];
    return{context:{slot},value};
  };
  return{attempt,key,program,offer,license,baseline,snapshot};
}
function legacy(attempt:PendingAttempt){const{version:_,baseline:__,...record}=attempt;return record;}
async function storageTest(run:(storage:Map<string,string>,storageApi:Storage)=>Promise<void>|void){
  const previousStorage=Object.getOwnPropertyDescriptor(globalThis,'localStorage'),previousNavigator=Object.getOwnPropertyDescriptor(globalThis,'navigator');
  const storage=new Map<string,string>();
  const api={getItem:(key:string)=>storage.get(key)??null,setItem:(key:string,value:string)=>{storage.set(key,String(value));},removeItem:(key:string)=>{storage.delete(key);},clear:()=>storage.clear(),key:(index:number)=>[...storage.keys()][index]??null,get length(){return storage.size;}};
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:api});
  const held=new Set<string>();Object.defineProperty(globalThis,'navigator',{configurable:true,value:{locks:{request:async(name:string,_options:unknown,callback:(lock:unknown)=>Promise<unknown>)=>{if(held.has(name))return callback(null);held.add(name);try{return await callback({name});}finally{held.delete(name);}}}}});
  try{await run(storage,api);}finally{
    if(previousStorage)Object.defineProperty(globalThis,'localStorage',previousStorage);else Reflect.deleteProperty(globalThis,'localStorage');
    if(previousNavigator)Object.defineProperty(globalThis,'navigator',previousNavigator);else Reflect.deleteProperty(globalThis,'navigator');
  }
}

test('new purchase persists SDK-compatible primary and strict legacy mirror without metadata or wire',async()=>storageTest(storage=>{
  const f=fixture();storePendingAttempt(f.key,f.attempt);
  expect(JSON.parse(storage.get(checkoutStorageKey(f.key))!)).toEqual(f.attempt);
  expect(JSON.parse(storage.get(pendingStorageKey(f.key))!)).toEqual(legacy(f.attempt));
  expect(storage.get(pendingStorageKey(f.key))).not.toMatch(/baseline|version|terms|wireBytes|private|secret/);
  clearPendingAttempt(f.key,f.attempt);expect(storage.size).toBe(0);
}));

test('expired repurchase and missing-license baselines require finalized canonical context at the history watermark',async()=>{
  for(const missing of [false,true]){
    const f=fixture(missing),calls:{method:string;params?:unknown[]}[]=[];
    const source:RpcSource=async(method,params)=>{calls.push({method,params});return method==='getGenesisHash'?DEVNET_GENESIS:f.snapshot();};
    const read=await acquireSolanaSnapshot({program:f.program,offerAddress:f.attempt.offer,holder:f.attempt.buyer,session:0,clock:()=>10,source,commitment:'finalized',minContextSlot:100});
    expect(calls[1].params?.[1]).toMatchObject({commitment:'finalized',minContextSlot:100});
    expect(read.licenseBaseline).toEqual(f.baseline);expect(expiredAttemptMatchesSnapshot(f.attempt,read,100,10)).toBe(true);
    expect(expiredAttemptMatchesSnapshot(f.attempt,{...read,commitment:'confirmed'},100,10)).toBe(false);
    expect(expiredAttemptMatchesSnapshot(f.attempt,read,101,10)).toBe(false);
    expect(expiredAttemptMatchesSnapshot(f.attempt,read,100,8010)).toBe(false);
    expect(expiredAttemptMatchesSnapshot({...f.attempt,baseline:undefined,version:undefined},read,100,10)).toBe(false);
    expect(expiredAttemptMatchesSnapshot({...f.attempt,state:'confirmed'},read,100,10)).toBe(false);
    await expect(acquireSolanaSnapshot({program:f.program,offerAddress:f.attempt.offer,holder:f.attempt.buyer,session:0,clock:()=>10,source,commitment:'finalized',minContextSlot:101})).rejects.toThrow('below');
    expect(expiredAttemptMatchesSnapshot(f.attempt,{...read,licenseBaseline:{...read.licenseBaseline,expiry:'901'}},100,10)).toBe(false);
  }
});

test('only complete expiration evidence returns a nonregressing watermark',async()=>{
  const f=fixture();let time=0,reads=0;const methods:string[]=[];
  const result=await reconcileAttempt(f.attempt,async method=>{methods.push(method);if(method==='getSignatureStatuses')return{context:{slot:++reads===1?100:105},value:[null]};if(method==='getBlockHeight')return 101;return{value:false};},{clock:()=>time,sleep:async ms=>{time+=ms;},timeoutMs:1000});
  expect(result).toMatchObject({state:'expired',statusContextSlot:105});expect(methods).toEqual(['getSignatureStatuses','getBlockHeight','getSignatureStatuses','isBlockhashValid']);
});

test('mirror confirmation is sticky and cannot be cleared by expiry despite lower primary state',async()=>storageTest(storage=>{
  const f=fixture();storage.set(checkoutStorageKey(f.key),JSON.stringify(f.attempt));storage.set(pendingStorageKey(f.key),JSON.stringify({...legacy(f.attempt),state:'confirmed'}));
  expect(readPendingAttempt(f.key)?.state).toBe('confirmed');
  storePendingAttempt(f.key,f.attempt);expect(JSON.parse(storage.get(checkoutStorageKey(f.key))!).state).toBe('confirmed');
  expect(()=>clearPendingAttempt(f.key,f.attempt,{allowConfirmed:false})).toThrow('confirmed');
  clearPendingAttempt(f.key,{...f.attempt,state:'confirmed'});expect(storage.size).toBe(0);
}));

test('same-signature blockhash and lifetime conflicts never overwrite or clear either incarnation',async()=>storageTest(storage=>{
  for(const change of [{blockhash:buyer.toBase58()},{lastValidBlockHeight:101}]){
    const f=fixture();storePendingAttempt(f.key,f.attempt);const newer={...f.attempt,...change};
    storage.set(checkoutStorageKey(f.key),JSON.stringify(newer));storage.set(pendingStorageKey(f.key),JSON.stringify(legacy(newer)));
    expect(readPendingAttempt(f.key)?.blockhash).toBe(newer.blockhash);
    expect(()=>storePendingAttempt(f.key,f.attempt)).toThrow();expect(()=>clearPendingAttempt(f.key,f.attempt)).toThrow();
    expect(JSON.parse(storage.get(checkoutStorageKey(f.key))!)).toEqual(newer);clearPendingAttempt(f.key,newer);
  }
}));

test('conflicting or malformed durable pairs fail closed even with remembered transaction state',async()=>storageTest(storage=>{
  const f=fixture();storePendingAttempt(f.key,f.attempt);
  storage.set(pendingStorageKey(f.key),JSON.stringify({...legacy(f.attempt),lastValidBlockHeight:102}));
  expect(()=>readPendingAttempt(f.key)).toThrow('disagree');expect(()=>clearPendingAttempt(f.key,f.attempt)).toThrow();
  storage.set(pendingStorageKey(f.key),JSON.stringify(legacy(f.attempt)));storage.set(checkoutStorageKey(f.key),'{');
  expect(()=>readPendingAttempt(f.key)).toThrow();expect(()=>storePendingAttempt(f.key,f.attempt)).toThrow();
}));

test('partial primary write protects the signature and partial cleanup cannot clear a newer primary',async()=>storageTest((storage,api)=>{
  const f=fixture();const set=api.setItem;api.setItem=(key,value)=>{if(key===pendingStorageKey(f.key))throw Error('Synthetic mirror write failure');set(key,value);};
  expect(()=>storePendingAttempt(f.key,f.attempt)).toThrow('mirror write');expect(storage.has(checkoutStorageKey(f.key))).toBe(true);expect(readPendingAttempt(f.key)?.baseline).toEqual(f.baseline);
  api.setItem=set;const remove=api.removeItem;const newer={...f.attempt,lastValidBlockHeight:102};
  api.removeItem=key=>{remove(key);if(key===pendingStorageKey(f.key))storage.set(checkoutStorageKey(f.key),JSON.stringify(newer));};
  expect(()=>clearPendingAttempt(f.key,f.attempt)).toThrow();expect(JSON.parse(storage.get(checkoutStorageKey(f.key))!)).toEqual(newer);
}));

test('legacy-only purchase remains baseline-less but definitive finalization can clean its exact record',async()=>storageTest(storage=>{
  const f=fixture();const record=legacy(f.attempt);storage.set(pendingStorageKey(f.key),JSON.stringify(record));
  const old=readPendingAttempt(f.key)!;expect(old.baseline).toBeUndefined();expect(()=>storePendingAttempt(f.key,f.attempt)).toThrow('baseline');
  clearPendingAttempt(f.key,old);expect(storage.size).toBe(0);
}));

test('confirmation arriving during mirror removal preserves the primary and memory protection',async()=>storageTest((storage,api)=>{
  const f=fixture();storePendingAttempt(f.key,f.attempt);const remove=api.removeItem;
  api.removeItem=key=>{remove(key);if(key===pendingStorageKey(f.key))storage.set(checkoutStorageKey(f.key),JSON.stringify({...f.attempt,state:'confirmed'}));};
  expect(()=>clearPendingAttempt(f.key,f.attempt,{allowConfirmed:false})).toThrow('confirmed');
  expect(JSON.parse(storage.get(checkoutStorageKey(f.key))!).state).toBe('confirmed');expect(readPendingAttempt(f.key)?.state).toBe('confirmed');
  api.removeItem=remove;clearPendingAttempt(f.key,{...f.attempt,state:'confirmed'});
}));

test('confirmation arriving during primary removal remains protected in memory',async()=>storageTest((storage,api)=>{
  const f=fixture();storePendingAttempt(f.key,f.attempt);const remove=api.removeItem;
  api.removeItem=key=>{if(key===checkoutStorageKey(f.key))storePendingAttempt(f.key,{...f.attempt,state:'confirmed'});remove(key);};
  expect(()=>clearPendingAttempt(f.key,f.attempt,{allowConfirmed:false})).toThrow();
  expect(readPendingAttempt(f.key)?.state).toBe('confirmed');api.removeItem=remove;clearPendingAttempt(f.key,{...f.attempt,state:'confirmed'});
}));

test('store never downgrades confirmation observed after its initial journal read',async()=>storageTest((storage,api)=>{
  const f=fixture();storePendingAttempt(f.key,f.attempt);const get=api.getItem;let reads=0;
  api.getItem=key=>{if(key===checkoutStorageKey(f.key)&&++reads===2)storage.set(key,JSON.stringify({...f.attempt,state:'confirmed'}));return get(key);};
  expect(()=>storePendingAttempt(f.key,{...f.attempt,state:'rpc-accepted'})).toThrow('progress changed');
  expect(JSON.parse(storage.get(checkoutStorageKey(f.key))!).state).toBe('confirmed');expect(readPendingAttempt(f.key)?.state).toBe('confirmed');
  api.getItem=get;clearPendingAttempt(f.key,{...f.attempt,state:'confirmed'});
}));

test('oversized durable journals fail closed before parsing without losing the protected attempt',async()=>storageTest(storage=>{
  const f=fixture();storePendingAttempt(f.key,f.attempt);storage.set(checkoutStorageKey(f.key),' '.repeat(4097));
  expect(()=>readPendingAttempt(f.key)).toThrow('size limit');expect(()=>clearPendingAttempt(f.key,f.attempt)).toThrow('size limit');
  expect(storage.has(pendingStorageKey(f.key))).toBe(true);storage.set(checkoutStorageKey(f.key),JSON.stringify(f.attempt));clearPendingAttempt(f.key,f.attempt);
}));

test('SDK recovers a web-created expired repurchase using shared primary and mirror without signing',async()=>storageTest(async storage=>{
  const f=fixture(false,900n,new PublicKey(PACT_PROGRAM_ID));storePendingAttempt(f.key,f.attempt);let signs=0;const calls:any[]=[];
  const client=createCheckoutClient({programId:PACT_PROGRAM_ID,rpcUrl:'http://127.0.0.1:8899',walletAdapter:{connect:async()=>f.attempt.buyer,disconnect:async()=>{},getPublicKey:()=>f.attempt.buyer,signTransaction:async()=>{signs++;throw Error('Signing forbidden');},subscribe:()=>()=>{},destroy(){}},now:()=>0,fetch:async(_url,init)=>{
    const q=JSON.parse(String(init?.body));calls.push(q);let result:unknown;
    if(q.method==='getGenesisHash')result=DEVNET_GENESIS;else if(q.method==='getSignatureStatuses')result={context:{slot:100},value:[null]};else if(q.method==='getBlockHeight')result=101;else if(q.method==='isBlockhashValid')result={value:false};else if(q.method==='getMultipleAccounts')result=f.snapshot();else throw Error('Forbidden interop RPC '+q.method);
    return Response.json({jsonrpc:'2.0',id:q.id,result});
  }});
  try{await client.connect();expect(client.getPendingPurchase({offer:f.attempt.offer})?.signature).toBe(f.attempt.signature);expect((await client.recoverPurchase({offer:f.attempt.offer})).outcome).toBe('expired');expect(storage.size).toBe(0);expect(signs).toBe(0);expect(calls.find(q=>q.method==='getMultipleAccounts').params[1]).toMatchObject({commitment:'finalized',minContextSlot:100});}
  finally{client.destroy();expect(calls.map(q=>q.method).filter(method=>!['getGenesisHash','getSignatureStatuses','getBlockHeight','isBlockhashValid','getMultipleAccounts'].includes(method))).toEqual([]);clearPendingAttempt(f.key,f.attempt);}
}));

test('web recognizes an actual SDK-created baseline and safely clears its exact expired pair',async()=>storageTest(async storage=>{
  const f=fixture(false,900n,new PublicKey(PACT_PROGRAM_ID));let signs=0;const calls:any[]=[];
  const client=createCheckoutClient({programId:PACT_PROGRAM_ID,rpcUrl:'http://127.0.0.1:8899',walletAdapter:{connect:async()=>f.attempt.buyer,disconnect:async()=>{},getPublicKey:()=>f.attempt.buyer,signTransaction:async tx=>{signs++;const signed=VersionedTransaction.deserialize(tx.serialize());signed.signatures[0]=new Uint8Array(64).fill(1);return signed;},subscribe:()=>()=>{},destroy(){}},now:()=>0,fetch:async(_url,init)=>{
    const q=JSON.parse(String(init?.body));calls.push(q);let result:unknown;
    if(q.method==='getGenesisHash')result=DEVNET_GENESIS;else if(q.method==='getMultipleAccounts')result=f.snapshot();else if(q.method==='getLatestBlockhash')result={context:{slot:100},value:{blockhash:f.attempt.blockhash,lastValidBlockHeight:100}};else if(q.method==='simulateTransaction')result={context:{slot:100},value:{err:null,logs:[]}};else if(q.method==='getBlockHeight')result=101;else if(q.method==='isBlockhashValid')result={value:false};else throw Error('Forbidden interop RPC '+q.method);
    return Response.json({jsonrpc:'2.0',id:q.id,result});
  }});
  try{
    await client.connect();await expect(client.purchaseLicense({offer:f.attempt.offer,metadataJson:metadata,termsAccepted:true})).rejects.toThrow('expired');
    const record=readPendingAttempt(f.key)!;expect(record.baseline).toEqual(f.baseline);expect(record.version).toBe(1);expect(signs).toBe(1);
    const final=await acquireSolanaSnapshot({program:f.program,offerAddress:record.offer,holder:record.buyer,session:0,clock:()=>0,commitment:'finalized',minContextSlot:100,source:async method=>method==='getGenesisHash'?DEVNET_GENESIS:f.snapshot()});
    expect(expiredAttemptMatchesSnapshot(record,final,100,0)).toBe(true);clearPendingAttempt(f.key,record,{allowConfirmed:false});expect(storage.size).toBe(0);expect(calls.some(q=>q.method==='sendTransaction')).toBe(false);
  }finally{client.destroy();expect(calls.map(q=>q.method).filter(method=>!['getGenesisHash','getMultipleAccounts','getLatestBlockhash','simulateTransaction','getBlockHeight','isBlockhashValid'].includes(method))).toEqual([]);}
}));

