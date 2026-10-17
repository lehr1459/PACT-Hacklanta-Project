import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {Worker} from 'node:worker_threads';
import {environmentFunctions,validateEnvironment} from './environment.mjs';

const sdk=await environmentFunctions();
const program='EiiiWWsW2kkqP6nugHz6iBADvhnW5xnibAtZ82ZExVqy';
const offer='11111111111111111111111111111111';
const base={PACT_ENV_PROFILE:'hosted',PACT_NETWORK:'devnet',NEXT_PUBLIC_PACT_SOLANA_PROGRAM_ID:program,NEXT_PUBLIC_SOLANA_RPC_URL:'https://api.devnet.solana.com',PACT_APP_ORIGIN:'https://customer.example.org',SOLANA_RPC_URL:'https://provider.example.org/private-path?key=PRIVATE_CANARY',PACT_AUTH_MODE:'disabled',PACT_PROCESS_MODEL:'stateless',PACT_SERVER_POLICY:'disabled'};
const resolve=(environment=base,application='marketplace',extra={})=>sdk.resolvePactEnvironment({environment,application,phase:'build',...extra});
const invalid=fn=>assert.throws(fn,error=>error.code==='ENVIRONMENT_INVALID'&&!error.message.includes('PRIVATE_CANARY'));

test('profiles are explicit for build/start; only unhosted development defaults local',()=>{
  for(const phase of ['build','start'])invalid(()=>resolve({},'marketplace',{phase}));
  assert.equal(resolve({},'marketplace',{phase:'development'}).profile,'local');
  invalid(()=>resolve({VERCEL:'1'},'marketplace',{phase:'development'}));
  for(const profile of ['local','test','ci','preview','hosted'])assert.equal(resolve({...base,PACT_ENV_PROFILE:profile}).profile,profile);
  invalid(()=>resolve({...base,PACT_ENV_PROFILE:'production'}));
});
test('strict profiles require every critical setting without inference',()=>{
  for(const profile of ['preview','hosted'])for(const key of Object.keys(base).filter(key=>key!=='PACT_ENV_PROFILE')){
    const value={...base,PACT_ENV_PROFILE:profile};delete value[key];invalid(()=>resolve(value));
  }
});
test('hosted browser URLs cannot contain private paths, credentials, query, fragments or local defaults',()=>{
  for(const value of ['https://provider.example.org/key','https://provider.example.org/?key=PRIVATE_CANARY','https://user:PRIVATE_CANARY@provider.example.org','https://provider.example.org/#PRIVATE_CANARY','http://api.devnet.solana.com','https://127.0.0.1','https://localhost','https://192.168.1.2'])invalid(()=>resolve({...base,NEXT_PUBLIC_SOLANA_RPC_URL:value}));
  invalid(()=>resolve({...base,NEXT_PUBLIC_PRIVATE_RPC:'PRIVATE_CANARY'}));
  for(const name of ['PACT_SOLANA_QA_MODE','PACT_QA_MODE','PACT_FIXTURE_MODE','PACT_MOCK_MODE'])invalid(()=>resolve({...base,[name]:'mock'}));
  for(const value of [' https://api.devnet.solana.com','https://api.devnet.solana.com\n','https://api.devnet.solana.com/\t'])invalid(()=>resolve({...base,NEXT_PUBLIC_SOLANA_RPC_URL:value}));
  invalid(()=>resolve({PACT_ENV_PROFILE:'local',SOLANA_RPC_URL:'http://remote.example.org'}));
});
test('private primary/fallback can rotate without changing build binding or exposing either URL',()=>{
  const first=resolve({...base,SOLANA_RPC_FALLBACK_URL:'https://backup.example.org/?secret=SECOND_PRIVATE_CANARY'}),binding=sdk.publicEnvironmentBinding(first);
  assert.equal(first.server.rpcUrls.length,2);
  assert.ok(!JSON.stringify(binding).includes('CANARY'));
  assert.ok(!JSON.stringify(binding).includes('provider.example.org'));
  assert.equal(resolve({...base,SOLANA_RPC_URL:'https://rotated.example.org/?token=NEW_PRIVATE_CANARY'},'marketplace',{phase:'start',expectedBinding:binding}).server.rpcUrls.length,1);
  assert.equal(resolve({...base,SOLANA_RPC_URL:'https://192.168.1.2/internal?key=PRIVATE_CANARY'}).server.rpcUrls.length,1);
  invalid(()=>resolve({...base,SOLANA_RPC_FALLBACK_URL:base.SOLANA_RPC_URL}));
});
test('public and server policy build settings are immutable across startup, including field presence',()=>{
  const binding=sdk.publicEnvironmentBinding(resolve());
  for(const update of [{NEXT_PUBLIC_SOLANA_RPC_URL:'https://other.example.org'},{PACT_APP_ORIGIN:'https://other.example.org'},{NEXT_PUBLIC_PACT_OFFER:offer},{NEXT_PUBLIC_PACT_METADATA:'exact text'},{PACT_ENV_PROFILE:'preview'},{NEXT_PUBLIC_PACT_CONTRACT_ADDRESS:'0x1111111111111111111111111111111111111111'}])assert.throws(()=>resolve({...base,...update},'marketplace',{phase:'start',expectedBinding:binding}),e=>e.code==='BUILD_ENVIRONMENT_MISMATCH');
  assert.throws(()=>resolve(base,'marketplace',{expectedBinding:{...binding,unrecognized:true}}),e=>e.code==='BUILD_ENVIRONMENT_MISMATCH');
  assert.ok(Object.isFrozen(binding)&&Object.isFrozen(binding.public.base));
});
test('metadata commitments bind exact UTF8 bytes without returning agreement text',()=>{
  const value='{"terms":"Exact agreement €"}\n',resolved=resolve({...base,NEXT_PUBLIC_PACT_METADATA:value});
  assert.equal(resolved.public.metadataSha256,createHash('sha256').update(value).digest('hex'));
  assert.ok(!JSON.stringify(resolved).includes('Exact agreement'));
  assert.notEqual(resolve({...base,NEXT_PUBLIC_PACT_METADATA:value.trim()}).public.metadataSha256,resolved.public.metadataSha256);
  for(const value of ['a'.repeat(65537),'€'.repeat(21846),'\ud800'])invalid(()=>resolve({...base,NEXT_PUBLIC_PACT_METADATA:value}));
  assert.ok(resolve({...base,NEXT_PUBLIC_PACT_METADATA:'a'.repeat(65536)}));
});
test('identity proof alone is supported without claiming a resource policy or authorization',()=>{
  const value={...base,PACT_AUTH_MODE:'single-process',PACT_PROCESS_MODEL:'single-persistent-process'};
  assert.equal(resolve(value).server.policy,'disabled');
  assert.equal(resolve(value).server.protectedOffer,null);
  for(const update of [{PACT_PROCESS_MODEL:'stateless'},{VERCEL:'1'},{WEB_CONCURRENCY:'2'},{NODE_UNIQUE_ID:'worker'}])invalid(()=>resolve({...value,...update}));
});
test('actual worker thread cannot start single-process authentication',async()=>{
  const environment={...base,PACT_AUTH_MODE:'single-process',PACT_PROCESS_MODEL:'single-persistent-process'};
  const script=`const {parentPort}=require('node:worker_threads');import(${JSON.stringify(new URL('./environment.mjs',import.meta.url).href)}).then(async m=>{const sdk=await m.environmentFunctions();try{sdk.resolvePactEnvironment({environment:${JSON.stringify(environment)},application:'marketplace',phase:'start'});parentPort.postMessage('unexpected-success');}catch(e){parentPort.postMessage(e.code);}}).catch(()=>parentPort.postMessage('unexpected-error'));`;
  const worker=new Worker(script,{eval:true});let timer;try{const code=await new Promise((resolve,reject)=>{timer=setTimeout(()=>reject(Error('Worker validation deadline')),5000);worker.once('message',resolve);worker.once('error',reject);worker.once('exit',()=>reject(Error('Worker exited before result')));});assert.equal(code,'ENVIRONMENT_INVALID');}finally{clearTimeout(timer);await worker.terminate();}
});
test('resource policy requires single-process auth and the same platform purchase offer',()=>{
  const value={...base,PACT_AUTH_MODE:'single-process',PACT_PROCESS_MODEL:'single-persistent-process',PACT_SERVER_POLICY:'licensed-demo-v1',PACT_PROTECTED_OFFER:offer,NEXT_PUBLIC_PACT_OFFER:offer};
  assert.equal(resolve(value,'platform').server.protectedOffer,offer);
  for(const update of [{PACT_AUTH_MODE:'disabled'},{PACT_PROTECTED_OFFER:''},{NEXT_PUBLIC_PACT_OFFER:program},{PACT_SERVER_POLICY:'disabled'}])invalid(()=>resolve({...value,...update},'platform'));
});
test('local platform compatibility and isolated fixture profiles remain explicit',()=>{
  const local=resolve({PACT_ENV_PROFILE:'local'},'platform');assert.equal(local.server.authMode,'single-process');assert.equal(local.server.policy,'licensed-demo-v1');
  for(const profile of ['test','ci'])assert.equal(resolve({PACT_ENV_PROFILE:profile},'platform').server.authMode,'disabled');
  assert.equal(resolve({PACT_ENV_PROFILE:'local',PACT_AUTH_MODE:'single-process'}).server.protectedOffer,null);
  for(const profile of ['hosted','preview'])invalid(()=>resolve({...base,PACT_ENV_PROFILE:profile,NEXT_PUBLIC_PACT_OFFER:local.public.offer}));
});
test('Base fallback remains fixed to Sepolia and canonical optional contract address',()=>{
  assert.equal(resolve().public.base.chainId,84532);
  for(const update of [{NEXT_PUBLIC_CHAIN_ID:'1'},{NEXT_PUBLIC_PACT_CONTRACT_ADDRESS:'0x'+'0'.repeat(40)},{NEXT_PUBLIC_RPC_URL:'https://provider.example.org/?secret=PRIVATE_CANARY'}])invalid(()=>resolve({...base,...update}));
  for(const profile of ['preview','hosted'])invalid(()=>resolve({...base,PACT_ENV_PROFILE:profile,NEXT_PUBLIC_PACT_CONTRACT_ADDRESS:'0x4444444444444444444444444444444444444444'}));
  assert.equal(resolve({PACT_ENV_PROFILE:'local',NEXT_PUBLIC_PACT_CONTRACT_ADDRESS:'0x4444444444444444444444444444444444444444'}).public.base.contractAddress,'0x4444444444444444444444444444444444444444');
});
test('wrapper validates public configuration without opening environment files',async()=>{
  const binding=await validateEnvironment({application:'marketplace',phase:'build',environment:{PACT_ENV_PROFILE:'local'}});
  assert.equal(binding.profile,'local');assert.ok(!('rpcUrls'in binding.server));
});
