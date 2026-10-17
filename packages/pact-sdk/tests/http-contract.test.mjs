import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
import {build} from 'esbuild';
import {PactClient,PactApiError} from '../dist/v1.js';
import {preparedCheckout,preparedOffer} from '../dist/internal/api-contract.js';
import {isTransactionError} from '../dist/internal/transaction-error.js';

const golden=JSON.parse(fs.readFileSync(new URL('./golden/protocol-v1.json',import.meta.url)));
const vector=golden.vectors[0],origin='http://localhost:4567/api/v1';
const client=(fetch,timeoutMs=1000)=>new PactClient({network:'devnet',apiUrl:origin,fetch,timeoutMs});
function quote(now=Date.now()) {
  return {program:golden.program,offer:vector.offer,seller:golden.seller,nonce:vector.nonce,
    priceLamports:vector.priceLamports,durationSeconds:vector.durationSeconds,termsHash:vector.metadataKeccak256,active:true,
    contextSlot:100,chainTimestamp:String(Math.floor(now/1000)),startedAtMs:now,receivedAtMs:now};
}
const rejected=code=>error=>error instanceof PactApiError&&error.code===code;

test('browser-resolved HTTP client accepts canonical wallet challenges with the published Buffer polyfill',async()=>{
  const result=await build({entryPoints:[fileURLToPath(new URL('../dist/v1.js',import.meta.url))],bundle:true,platform:'browser',format:'iife',globalName:'PactBrowser',write:false});
  const sandbox={URL,TextEncoder,TextDecoder,Uint8Array,ArrayBuffer,Response,AbortController,setTimeout,clearTimeout,performance,console};
  vm.runInNewContext(result.outputFiles[0].text,sandbox);
  const now=Date.now(),id=Buffer.alloc(32,255).toString('base64url'),binding=Buffer.alloc(32,254).toString('base64url');
  const challenge={challengeId:id,expiresAt:now+120000,message:[
    'PACT wallet authentication v1','Origin: http://localhost:4567','Network: solana-devnet',
    'Genesis: EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG',`Program: ${golden.program}`,`Wallet: ${golden.buyer}`,
    `Challenge: ${id}`,`Session binding: ${binding}`,`Issued at: ${now}`,`Expires at: ${now+120000}`,
    'Purpose: prove wallet control; no transaction or license purchase.',
  ].join('\n')};
  let calls=0;
  const c=new sandbox.PactBrowser.PactClient({network:'devnet',apiUrl:origin,fetch:async()=>{calls++;return Response.json(challenge);}});
  assert.equal((await c.auth.challenge(golden.buyer)).challengeId,id);
  // These variants decode to the same 32 bytes but have nonzero unused bits.
  for(const key of ['challengeId','binding']) {
    const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    const changed={...challenge},value=key==='binding'?binding:id,noncanonical=value.slice(0,-1)+alphabet[alphabet.indexOf(value.at(-1))+1];
    changed.message=challenge.message.replace(value,noncanonical);
    if(key==='challengeId')changed.challengeId=noncanonical;
    const invalid=new sandbox.PactBrowser.PactClient({network:'devnet',apiUrl:origin,fetch:async()=>Response.json(changed)});
    await assert.rejects(invalid.auth.challenge(golden.buyer),error=>error.code==='AUTH_INVALID');
  }
  const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  for(let index=0;index<alphabet.length;index++) {
    const value='A'.repeat(42)+alphabet[index],changed={...challenge,challengeId:value,message:challenge.message.replace(id,value)};
    const candidate=new sandbox.PactBrowser.PactClient({network:'devnet',apiUrl:origin,fetch:async()=>Response.json(changed)});
    if(index%4===0)assert.equal((await candidate.auth.challenge(golden.buyer)).challengeId,value);
    else await assert.rejects(candidate.auth.challenge(golden.buyer),error=>error.code==='AUTH_INVALID');
  }
  for(const value of ['A'.repeat(42),'A'.repeat(44),'A'.repeat(42)+'=','+'.repeat(43),'/'.repeat(43)]) {
    const changed={...challenge,challengeId:value,message:challenge.message.replace(id,value)};
    const candidate=new sandbox.PactBrowser.PactClient({network:'devnet',apiUrl:origin,fetch:async()=>Response.json(changed)});
    await assert.rejects(candidate.auth.challenge(golden.buyer),error=>error.code==='AUTH_INVALID');
  }
  assert.equal(calls,1);
});

test('HTTP semantic validation accepts independently compiled Rust messages despite different static key ordering',()=>{
  const now=1000000,q={...quote(now),chainTimestamp:'1000'};
  const checkout={network:'devnet',programId:golden.program,quote:q,buyer:golden.buyer,licensePda:vector.license,
    transactionBase64:vector.unsignedBuyBase64,blockhash:golden.blockhash,lastValidBlockHeight:golden.lastValidBlockHeight};
  assert.equal(preparedCheckout(checkout,{offerAddress:vector.offer,walletAddress:golden.buyer,metadataJson:vector.metadataJson},now).licensePda,vector.license);
  const creation={network:'devnet',programId:golden.program,seller:golden.seller,nonce:vector.nonce,offer:vector.offer,
    termsHash:vector.metadataKeccak256,priceLamports:vector.priceLamports,durationSeconds:vector.durationSeconds,
    transactionBase64:vector.unsignedCreateBase64,blockhash:golden.blockhash,lastValidBlockHeight:golden.lastValidBlockHeight,
    contextSlot:100,chainTimestamp:'1000',startedAtMs:now,receivedAtMs:now};
  assert.equal(preparedOffer(creation,{sellerWallet:golden.seller,nonce:vector.nonce,metadataJson:vector.metadataJson},now).offer,vector.offer);
});

test('HTTP byte limits accept exactly one MiB but reject one additional byte and invalid UTF8',async()=>{
  const text=JSON.stringify(quote()),headers={'content-type':'application/json'};
  const exact=text+' '.repeat(1048576-Buffer.byteLength(text));
  assert.equal((await client(async()=>new Response(exact,{headers})).offers.get(vector.offer)).offer,vector.offer);
  await assert.rejects(client(async()=>new Response(exact+' ',{headers})).offers.get(vector.offer),rejected('BODY_TOO_LARGE'));
  const malformed=Buffer.concat([Buffer.from('{"x":"'),Buffer.from([0xff]),Buffer.from('"}')]);
  await assert.rejects(client(async()=>new Response(malformed,{headers})).offers.get(vector.offer),rejected('RPC_ERROR'));
});

test('HTTP errors and custom transport/body exceptions are typed and redact untrusted text',async()=>{
  const privateText='PRIVATE_PROVIDER_TOKEN_DO_NOT_REFLECT';
  for(const fetch of [
    async()=>Response.json({error:{code:'RPC_ERROR',message:privateText}},{status:503}),
    async()=>{throw new PactApiError('AUTH_INVALID',privateText);},
    async()=>new Response(new ReadableStream({start(controller){controller.error(new PactApiError('AUTH_INVALID',privateText));}}),{headers:{'content-type':'application/json'}}),
  ]) {
    await assert.rejects(client(fetch).offers.get(vector.offer),error=>error instanceof PactApiError&&error.code==='RPC_ERROR'&&!error.message.includes(privateText));
  }
  await assert.rejects(client(async()=>Response.json({error:{code:'RPC_ERROR',message:'x'.repeat(17000)}},{status:503})).offers.get(vector.offer),rejected('BODY_TOO_LARGE'));
});

test('only a bounded typed404 metadata-unavailable response becomes the explicit unavailable result',async()=>{
  const body={error:{code:'METADATA_UNAVAILABLE',message:'No registry'}};
  assert.deepEqual(await client(async()=>Response.json(body,{status:404})).offers.metadata(vector.offer),{available:false,offerAddress:vector.offer,reason:'METADATA_UNAVAILABLE'});
  for(const status of [400,500,503])await assert.rejects(client(async()=>Response.json(body,{status})).offers.metadata(vector.offer),error=>error instanceof PactApiError&&error.status===status);
  await assert.rejects(client(async()=>Response.json({error:{code:'METADATA_UNAVAILABLE',message:'x'.repeat(1025)}},{status:404})).offers.metadata(vector.offer),rejected('RPC_ERROR'));
});

test('metadata validation shares one HTTP deadline across metadata and independent quote reads',async()=>{
  let calls=0;
  const fetch=async(url)=>{
    calls++;
    if(String(url).endsWith('/metadata')) {
      await new Promise(resolve=>setTimeout(resolve,20));
      const m=JSON.parse(vector.metadataJson);
      return Response.json({available:true,offerAddress:vector.offer,metadataJson:vector.metadataJson,title:m.title,terms:m.terms,verifiedAt:new Date().toISOString()});
    }
    return new Promise(()=>{});
  };
  const started=performance.now();
  await assert.rejects(client(fetch,60).offers.metadata(vector.offer),rejected('TIMEOUT'));
  assert.equal(calls,2);assert.ok(performance.now()-started<300);
});

test('canonical64byte signature lookup preserves zero syntactic lookup and rejects short decoded strings before HTTP',async()=>{
  let calls=0;const fetch=async()=>{calls++;return Response.json({network:'devnet',signature:'1'.repeat(64),state:'not-found',slot:null,error:null,contextSlot:0});};
  const c=client(fetch);assert.equal((await c.transactions.get('1'.repeat(64))).state,'not-found');
  for(const signature of ['1'.repeat(63),'1'.repeat(65),'2'.repeat(64)])await assert.rejects(c.transactions.get(signature),rejected('INVALID_INPUT'));
  assert.equal(calls,1);
});

test('non-exhaustive TransactionError supports bounded unitvariants and validates known u8/u32 payloads',()=>{
  for(const value of ['BlockhashNotFound','FutureVariantName',{InstructionError:[255,{Custom:4294967295}]},{InstructionError:[0,'InvalidArgument']},
    {DuplicateInstruction:255},{InsufficientFundsForRent:{account_index:0}},{ProgramExecutionTemporarilyRestricted:{account_index:255}}])assert.equal(isTransactionError(value),true,JSON.stringify(value));
  for(const value of [[],{},'InstructionError',{InstructionError:[256,'InvalidArgument']},{InstructionError:[0,{Custom:4294967296}]},
    {InstructionError:[0,{Custom:-1}]},{DuplicateInstruction:-1},{InsufficientFundsForRent:{account_index:256}},{InstructionError:{message:'freeform'}},
    JSON.parse('{"FutureVariant":{"__proto__":{}}}')])assert.equal(isTransactionError(value),false,JSON.stringify(value));
});

test('OpenAPI output stays generated, carries additive fields and exactly bounds integer strings',t=>{
  const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'pact-openapi-contract-'));
  t.after(()=>{assert.ok(directory.startsWith(path.join(os.tmpdir(),'pact-openapi-contract-')));fs.rmSync(directory,{recursive:true,force:true});});
  fs.copyFileSync(path.join(root,'docs/platform/generate-openapi.mjs'),path.join(directory,'generate-openapi.mjs'));
  execFileSync(process.execPath,['generate-openapi.mjs'],{cwd:directory,stdio:'pipe',windowsHide:true});
  const expected=fs.readFileSync(path.join(root,'docs/platform/openapi.json'),'utf8').replaceAll('\r\n','\n');
  const actual=fs.readFileSync(path.join(directory,'openapi.json'),'utf8');assert.equal(actual,expected);
  const spec=JSON.parse(actual),schemas=spec.components.schemas;
  assert.ok(spec.paths['/resources/{id}'].post);assert.ok(schemas.Offer.required.includes('nonce'));
  for(const name of ['contextSlot','chainTimestamp','startedAtMs','receivedAtMs'])assert.ok(schemas.PreparedOffer.required.includes(name));
  assert.ok(schemas.Transaction.required.includes('contextSlot'));
  for(const [schema,maximum,zero] of [[schemas.Offer.properties.nonce,18446744073709551615n,true],
    [schemas.Offer.properties.priceLamports,18446744073709551615n,false],[schemas.Offer.properties.durationSeconds,31536000n,false],
    [schemas.LicenseStatus.properties.expiry,9223372036854775807n,true]]) {
    const pattern=new RegExp(schema.pattern);assert.equal(pattern.test('0'),zero);assert.equal(pattern.test('1'),true);
    assert.equal(pattern.test(String(maximum)),true);assert.equal(pattern.test(String(maximum+1n)),false);
    for(const bad of ['-1','01','1.5','9'.repeat(100)])assert.equal(pattern.test(bad),false);
  }
});
