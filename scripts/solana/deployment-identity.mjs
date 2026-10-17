// Read-only loader-v3 inspection. Never loads keys or constructs transactions.
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {fileURLToPath, pathToFileURL} from 'node:url';
import path from 'node:path';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const require=createRequire(path.join(root,'packages/pact-sdk/package.json'));
const {PublicKey}=require('@solana/web3.js');
export const PROGRAM='EiiiWWsW2kkqP6nugHz6iBADvhnW5xnibAtZ82ZExVqy';
export const GENESIS='EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG';
export const LOADER='BPFLoaderUpgradeab1e11111111111111111111111';
export const PROGRAM_DATA=PublicKey.findProgramAddressSync([new PublicKey(PROGRAM).toBytes()],new PublicKey(LOADER))[0].toBase58();
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const fail=category=>{throw new Error(category);};
const integer=value=>Number.isSafeInteger(value)&&value>=0;
function address(value){
  if(typeof value!=='string'||value.length<32||value.length>44)fail('INVALID_PUBLIC_IDENTITY');
  try{if(new PublicKey(value).toBase58()!==value)fail('INVALID_PUBLIC_IDENTITY');}catch{fail('INVALID_PUBLIC_IDENTITY');}
  return value;
}
function account(value,executable){
  if(!value||value.owner!==LOADER||value.executable!==executable||!integer(value.lamports)||!Array.isArray(value.data)||value.data.length!==2||value.data[1]!=='base64')fail('INVALID_LOADER_ACCOUNT');
  const encoded=value.data[0];
  if(typeof encoded!=='string'||encoded.length>1_400_000||encoded.length%4||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded))fail('INVALID_ACCOUNT_ENCODING');
  const bytes=Buffer.from(encoded,'base64');
  if(bytes.toString('base64')!==encoded)fail('INVALID_ACCOUNT_ENCODING');
  return bytes;
}
function matches(payload,artifact){
  return payload.length>=artifact.length&&payload.subarray(0,artifact.length).equals(artifact)&&payload.subarray(artifact.length).every(byte=>byte===0);
}
export function inspectSnapshot(snapshot,{expectedAuthority,artifact,comparisons={}}){
  if(expectedAuthority!=='none')address(expectedAuthority);
  if(!Buffer.isBuffer(artifact)||artifact.length<4||artifact.length>1_000_000||artifact.subarray(0,4).toString('hex')!=='7f454c46')fail('INVALID_EXPECTED_ARTIFACT');
  if(!snapshot||!integer(snapshot.context?.slot)||!Array.isArray(snapshot.value)||snapshot.value.length!==2)fail('INVALID_ACCOUNT_SNAPSHOT');
  const program=account(snapshot.value[0],true),data=account(snapshot.value[1],false);
  if(program.length!==36||program.readUInt32LE(0)!==2||!program.subarray(4).equals(new PublicKey(PROGRAM_DATA).toBuffer()))fail('PROGRAM_DATA_POINTER_MISMATCH');
  if(data.length<49||data.readUInt32LE(0)!==3||data[12]>1)fail('INVALID_PROGRAM_DATA_LAYOUT');
  const modified=data.readBigUInt64LE(4);
  if(modified>BigInt(snapshot.context.slot))fail('INVALID_DEPLOYMENT_SLOT');
  const authority=data[12]===1?new PublicKey(data.subarray(13,45)).toBase58():'none';
  if(authority!==expectedAuthority)fail('UPGRADE_AUTHORITY_MISMATCH');
  // Loader-v3 reserves its maximum metadata size even with no authority.
  const payload=data.subarray(45);
  if(!matches(payload,artifact))fail('DEPLOYED_ARTIFACT_MISMATCH');
  const artifactMatches={};
  for(const [name,bytes] of Object.entries(comparisons))artifactMatches[name]=matches(payload,bytes);
  return {program:PROGRAM,programData:PROGRAM_DATA,contextSlot:snapshot.context.slot,lastModifiedSlot:modified.toString(),upgradeAuthority:authority,artifactSha256:sha(artifact),artifactBytes:artifact.length,programDataPayloadBytes:payload.length,zeroPaddingBytes:payload.length-artifact.length,payloadSha256:sha(payload),artifactMatches};
}
export async function verifyDeployment({endpoint='https://api.devnet.solana.com',expectedAuthority,artifact,comparisons={},fetch:transport=globalThis.fetch,timeoutMs=10000,now=Date.now}={}){
  if(!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>30000)fail('INVALID_TIMEOUT');
  let url;try{url=new URL(endpoint);}catch{fail('INVALID_ENDPOINT');}
  if(url.username||url.password||url.hash||!(url.protocol==='https:'||(url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname))))fail('INVALID_ENDPOINT');
  if(expectedAuthority!=='none')address(expectedAuthority);
  const controller=new AbortController();
  let timer,id=0;
  const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new Error('RPC_TIMEOUT'));},timeoutMs);});
  async function rpc(method,params){
    if(controller.signal.aborted)fail('RPC_TIMEOUT');
    const requestId=++id;
    let response;try{response=await transport(url.href,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:requestId,method,params}),signal:controller.signal,redirect:'error'});}catch{fail('RPC_UNAVAILABLE');}
    if(controller.signal.aborted)fail('RPC_TIMEOUT');
    if(!response?.ok||!response.body)fail('RPC_UNAVAILABLE');
    const reader=response.body.getReader(),chunks=[];let size=0;
    try{while(true){const {done,value}=await reader.read();if(controller.signal.aborted)fail('RPC_TIMEOUT');if(done)break;size+=value.byteLength;if(size>2_000_000)fail('RPC_RESPONSE_TOO_LARGE');chunks.push(value);}}
    catch(error){void reader.cancel().catch(()=>{});if(error?.message==='RPC_RESPONSE_TOO_LARGE')throw error;fail('RPC_UNAVAILABLE');}
    let result;try{result=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));}catch{fail('INVALID_RPC_RESPONSE');}
    if(!result||result.jsonrpc!=='2.0'||result.id!==requestId||Object.hasOwn(result,'error')||!Object.hasOwn(result,'result'))fail('INVALID_RPC_RESPONSE');
    return result.result;
  }
  try{return await Promise.race([deadline,(async()=>{
    if(await rpc('getGenesisHash',[])!==GENESIS)fail('NETWORK_GENESIS_MISMATCH');
    if(controller.signal.aborted)fail('RPC_TIMEOUT');
    const snapshot=await rpc('getMultipleAccounts',[[PROGRAM,PROGRAM_DATA],{encoding:'base64',commitment:'finalized'}]);
    const result=inspectSnapshot(snapshot,{expectedAuthority,artifact,comparisons});
    if(await rpc('getGenesisHash',[])!==GENESIS)fail('NETWORK_GENESIS_MISMATCH');
    return {schemaVersion:1,kind:'read-only-devnet-deployment-identity',sampledAt:new Date(now()).toISOString(),network:'solana-devnet',genesis:GENESIS,commitment:'finalized',...result,networkTransactions:0};
  })()]);}finally{clearTimeout(timer);controller.abort();}
}

async function main(){
  const args=process.argv.slice(2),allowed=new Set(['--authority','--artifact','--output']);
  const values={};
  for(let i=0;i<args.length;i+=2){if(!allowed.has(args[i])||!args[i+1]||values[args[i]])fail('INVALID_ARGUMENTS');values[args[i]]=args[i+1];}
  if(!values['--authority']||!['current','historical'].includes(values['--artifact']??'current'))fail('EXPLICIT_AUTHORITY_AND_ARTIFACT_REQUIRED');
  const current=await readFile(path.join(root,'solana/artifacts/pact_licensing.so'));
  const evidence=JSON.parse(await readFile(path.join(root,'solana/artifacts/reproducibility.json'),'utf8'));
  const historical=execFileSync('git',['show',`${evidence.historical.commit}:solana/artifacts/pact_licensing.so`],{cwd:root,maxBuffer:2_000_000,windowsHide:true,stdio:['ignore','pipe','ignore']});
  if(sha(current)!==evidence.builds[0].sha256||sha(historical)!==evidence.historical.sha256)fail('LOCAL_ARTIFACT_EVIDENCE_MISMATCH');
  const selected=values['--artifact']??'current';
  const receipt=await verifyDeployment({endpoint:process.env.PACT_DEPLOYMENT_RPC_URL,expectedAuthority:values['--authority'],artifact:selected==='current'?current:historical,comparisons:{current,historical}});
  receipt.expectedArtifact=selected;
  receipt.inspectionToolRevision=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8',windowsHide:true}).trim();
  receipt.trackedWorkingTreeClean=execFileSync('git',['status','--porcelain','--untracked-files=normal'],{cwd:root,encoding:'utf8',windowsHide:true}).trim()==='';
  const serialized=JSON.stringify(receipt,null,2)+'\n';
  if(values['--output']){
    const output=path.resolve(root,values['--output']),allowedRoot=path.join(root,'web/test-results');
    if(!output.startsWith(allowedRoot+path.sep)||!output.endsWith('.json'))fail('OUTPUT_MUST_BE_IGNORED_TEST_RECEIPT');
    // Refuse any existing child junction/symlink before creating directories.
    const {lstat}=await import('node:fs/promises');
    for(let cursor=output;cursor!==root;cursor=path.dirname(cursor)){
      try{if((await lstat(cursor)).isSymbolicLink())fail('OUTPUT_REPARSE_POINT');}catch(error){if(error.code!=='ENOENT')throw error;}
    }
    await mkdir(path.dirname(output),{recursive:true});await writeFile(output,serialized,{flag:'wx'});
  }
  console.log(serialized);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)main().catch(error=>{const safe=/^[A-Z_]+$/.test(error?.message??'')?error.message:'DEPLOYMENT_INSPECTION_FAILED';console.error(safe);process.exitCode=1;});
