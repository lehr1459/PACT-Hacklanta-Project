import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import {execFile,execFileSync} from 'node:child_process';
import {promisify} from 'node:util';
import {createServer} from 'node:http';
import {PROGRAM,PROGRAM_DATA,LOADER,GENESIS,inspectSnapshot,verifyDeployment} from './deployment-identity.mjs';
const {PublicKey}=createRequire(new URL('../../packages/pact-sdk/package.json',import.meta.url))('@solana/web3.js');
const authority=new PublicKey(new Uint8Array(32).fill(19)).toBase58();
const artifact=Buffer.from('7f454c4601020304','hex');
function fixture({padding=0,immutable=false}={}){
  const program=Buffer.alloc(36);program.writeUInt32LE(2);new PublicKey(PROGRAM_DATA).toBuffer().copy(program,4);
  const data=Buffer.alloc(45+artifact.length+padding);data.writeUInt32LE(3);data.writeBigUInt64LE(90n,4);data[12]=immutable?0:1;new PublicKey(authority).toBuffer().copy(data,13);artifact.copy(data,45);
  const account=(bytes,executable)=>({owner:LOADER,lamports:1000000,executable,data:[bytes.toString('base64'),'base64']});
  return {context:{slot:100},value:[account(program,true),account(data,false)]};
}
const inspect=(snapshot,options={})=>inspectSnapshot(snapshot,{expectedAuthority:authority,artifact,...options});
function mutateBytes(snapshot,index,change){const bytes=Buffer.from(snapshot.value[index].data[0],'base64');change(bytes);snapshot.value[index].data[0]=bytes.toString('base64');}
test('loader-v3 canonical PDA, complete artifact and explicitly zero reserved padding',()=>{
  assert.equal(PROGRAM_DATA,'4oeQ43DP6oUXparT8cYT3niBgdJCaFitj61mVXQfy9cX');
  const result=inspect(fixture({padding:12}),{comparisons:{current:artifact,historical:Buffer.concat([artifact,Buffer.from([7])])}});
  assert.equal(result.program,PROGRAM);assert.equal(result.lastModifiedSlot,'90');assert.equal(result.zeroPaddingBytes,12);assert.deepEqual(result.artifactMatches,{current:true,historical:false});
});
for(const [name,change] of Object.entries({
  missing:s=>{s.value[1]=null;},owner:s=>{s.value[0].owner=PROGRAM;},executable:s=>{s.value[1].executable=true;},
  context:s=>{s.context.slot=-1;},unsafeContext:s=>{s.context.slot=Number.MAX_SAFE_INTEGER+1;},negativeLamports:s=>{s.value[0].lamports=-1;},
  pointer:s=>mutateBytes(s,0,b=>{b[4]^=1;}),programTag:s=>mutateBytes(s,0,b=>{b[0]=1;}),dataTag:s=>mutateBytes(s,1,b=>{b[0]=2;}),
  option:s=>mutateBytes(s,1,b=>{b[12]=2;}),authority:s=>mutateBytes(s,1,b=>{b[13]^=1;}),
  futureSlot:s=>mutateBytes(s,1,b=>b.writeBigUInt64LE(101n,4)),artifact:s=>mutateBytes(s,1,b=>{b[46]^=1;}),
  trailingData:s=>{const b=Buffer.from(s.value[1].data[0],'base64');s.value[1].data[0]=Buffer.concat([b,Buffer.from([1])]).toString('base64');},
  truncated:s=>{s.value[1].data[0]=Buffer.from(s.value[1].data[0],'base64').subarray(0,-1).toString('base64');},
  noncanonicalEncoding:s=>{s.value[1].data[0]+='\n';},encoding:s=>{s.value[1].data[1]='base58';},
  shortProgram:s=>{s.value[0].data[0]=Buffer.alloc(4).toString('base64');},extraAccount:s=>{s.value.push(s.value[0]);}
}))test(`deployment mutation fails closed: ${name}`,()=>{const snapshot=fixture();change(snapshot);assert.throws(()=>inspect(snapshot));});
test('immutable authority is never inferred or silently accepted',()=>{
  assert.throws(()=>inspect(fixture({immutable:true})),/AUTHORITY_MISMATCH/);
  assert.equal(inspect(fixture({immutable:true}),{expectedAuthority:'none'}).upgradeAuthority,'none');
  assert.throws(()=>inspect(fixture(),{expectedAuthority:undefined}),/INVALID_PUBLIC_IDENTITY/);
});
function transport(transform=()=>{}){
  const calls=[];
  const fetch=async(_url,request)=>{
    const input=JSON.parse(request.body);calls.push(input);
    assert.equal(request.redirect,'error');assert.equal(request.method,'POST');
    let result=input.method==='getGenesisHash'?GENESIS:fixture();
    const envelope={jsonrpc:'2.0',id:input.id,result};transform(envelope,input,calls.length);
    return Response.json(envelope);
  };
  return {fetch,calls};
}
test('read-only verifier pins genesis twice and one finalized canonical account snapshot',async()=>{
  const mock=transport();const result=await verifyDeployment({expectedAuthority:authority,artifact,fetch:mock.fetch,now:()=>0});
  assert.equal(result.networkTransactions,0);assert.equal(result.sampledAt,'1970-01-01T00:00:00.000Z');
  assert.deepEqual(mock.calls.map(c=>c.method),['getGenesisHash','getMultipleAccounts','getGenesisHash']);
  assert.deepEqual(mock.calls[1].params,[[PROGRAM,PROGRAM_DATA],{encoding:'base64',commitment:'finalized'}]);
});
for(const [name,transform] of Object.entries({
  wrongGenesis:(e,_i,n)=>{if(n===1)e.result=PROGRAM;},changedGenesis:(e,_i,n)=>{if(n===3)e.result=PROGRAM;},
  wrongId:e=>{e.id=99;},errorWithResult:e=>{e.error={message:'PRIVATE_RPC_MARKER'};},noResult:e=>{delete e.result;},wrongVersion:e=>{e.jsonrpc='1.0';}
}))test(`RPC envelope mutation: ${name}`,async()=>{const mock=transport(transform);await assert.rejects(verifyDeployment({expectedAuthority:authority,artifact,fetch:mock.fetch}),error=>!error.message.includes('PRIVATE_RPC_MARKER'));assert.ok(mock.calls.length<=3);});
test('private endpoint/transport errors never appear in diagnostic categories',async()=>{
  await assert.rejects(verifyDeployment({endpoint:'https://rpc.example/?secret=PRIVATE_RPC_MARKER',expectedAuthority:authority,artifact,fetch:async()=>{throw Error('PRIVATE_RPC_MARKER');}}),{message:'RPC_UNAVAILABLE'});
  for(const endpoint of ['http://rpc.example','https://user:password@rpc.example','file:///tmp/key','https://rpc.example/#secret'])await assert.rejects(verifyDeployment({endpoint,expectedAuthority:authority,artifact}),{message:'INVALID_ENDPOINT'});
});
test('oversized and invalid UTF8 bodies fail without exposing raw input',async()=>{
  for(const [bytes,category] of [[new Uint8Array(2_000_001),'RPC_RESPONSE_TOO_LARGE'],[new Uint8Array([255]),'INVALID_RPC_RESPONSE']])await assert.rejects(verifyDeployment({expectedAuthority:authority,artifact,fetch:async()=>new Response(bytes)}),{message:category});
});
test('deadline rejects ignored abort without a replacement RPC',async()=>{
  let calls=0,release;const waiting=new Promise(resolve=>{release=resolve;});
  await assert.rejects(verifyDeployment({expectedAuthority:authority,artifact,timeoutMs:10,fetch:async()=>{calls++;await waiting;return Response.json({jsonrpc:'2.0',id:1,result:GENESIS});}}),{message:'RPC_TIMEOUT'});
  release();await new Promise(resolve=>setTimeout(resolve,10));assert.equal(calls,1);
});
test('actual CLI distinguishes default current from explicit historical deployment',async()=>{
  const current=await readFile(new URL('../../solana/artifacts/pact_licensing.so',import.meta.url));
  const historical=execFileSync('git',['show','8e259de:solana/artifacts/pact_licensing.so'],{maxBuffer:1000000});
  let payload=current;const calls=[];
  const server=createServer(async(request,response)=>{
    let input='';for await(const chunk of request)input+=chunk;
    const rpc=JSON.parse(input);calls.push(rpc.method);
    const snapshot=fixture();
    const metadata=Buffer.from(snapshot.value[1].data[0],'base64').subarray(0,45);
    snapshot.value[1].data[0]=Buffer.concat([metadata,payload]).toString('base64');
    response.setHeader('content-type','application/json');response.end(JSON.stringify({jsonrpc:'2.0',id:rpc.id,result:rpc.method==='getGenesisHash'?GENESIS:snapshot}));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const run=extra=>promisify(execFile)(process.execPath,['scripts/solana/deployment-identity.mjs','--authority',authority,...extra],{env:{...process.env,PACT_DEPLOYMENT_RPC_URL:`http://127.0.0.1:${server.address().port}/?private=DO_NOT_PRINT`},timeout:15000,windowsHide:true});
  try{
    const first=JSON.parse((await run([])).stdout);assert.equal(first.expectedArtifact,'current');assert.deepEqual(first.artifactMatches,{current:true,historical:false});assert.equal(typeof first.trackedWorkingTreeClean,'boolean');assert.match(first.inspectionToolRevision,/^[0-9a-f]{40}$/);
    payload=historical;
    await assert.rejects(run([]),error=>error.code===1&&error.stderr.trim()==='DEPLOYED_ARTIFACT_MISMATCH'&&error.stdout===''&&!error.stderr.includes('DO_NOT_PRINT'));
    const last=JSON.parse((await run(['--artifact','historical'])).stdout);assert.equal(last.expectedArtifact,'historical');assert.deepEqual(last.artifactMatches,{current:false,historical:true});
    assert.deepEqual(calls,['getGenesisHash','getMultipleAccounts','getGenesisHash','getGenesisHash','getMultipleAccounts','getGenesisHash','getMultipleAccounts','getGenesisHash']);
  }finally{await new Promise(resolve=>server.close(resolve));}
});
