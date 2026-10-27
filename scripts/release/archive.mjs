// Local, nondeployable release snapshots. No publish, deployment or blockchain transaction commands.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {crc32,deflateRawSync,inflateRawSync,gunzipSync} from 'node:zlib';
import {execFileSync,spawn} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {assertClean} from '../solana/provenance.mjs';
import {verifyConsumerReceipt,assertPackageContents,runPackageCommand} from './sdk.mjs';
import {npmCli,root} from '../validation/common.mjs';
import {loadRuntimePolicy} from '../validation/runtime.mjs';
import {environmentFunctions,readBuildBinding} from '../validation/environment.mjs';

const MAX_FILE=50_000_000,MAX_TOTAL=250_000_000,MAX_ENTRIES=4000;
export const REQUIRED_VALIDATION_COMMANDS=Object.freeze([
  'sdk-ci','sdk-build','web-ci','examples-pact-demo-app-ci','examples-pact-platform-app-ci',
  'sdk-typecheck','sdk-tests','platform-tests','dependency-policy-tests','artifact-policy-tests',
  'deployment-identity-tests','provenance-tests','sdk-release-policy-tests','runtime-review-tests',
  'environment-policy-tests','next-environment-tests','archive-policy-tests',
  'staging-source-policy-tests','staging-configuration-policy-tests',
  'web-route-types','web-typecheck','web-production-build','production-route-smoke',
  'examples-pact-demo-app-route-types','examples-pact-demo-app-typecheck','examples-pact-demo-app-production-build',
  'examples-pact-platform-app-route-types','examples-pact-platform-app-typecheck','examples-pact-platform-app-production-build',
  'solana-mock','solana-setup','base-mock','base-setup','wizard','generated','checkout','static-server-safety',
  'prism','platform-browser','packed-consumer','dependency-policy','committed-evidence',
]);
const sha=b=>createHash('sha256').update(b).digest('hex');
const json=b=>JSON.parse(b.toString('utf8'));
const encoded=value=>Buffer.from(JSON.stringify(value,null,2)+'\n');
const order=(a,b)=>Buffer.compare(Buffer.from(a),Buffer.from(b));
export function safeArchivePath(name){
  assert.ok(typeof name==='string'&&name.length>0&&Buffer.byteLength(name)<1024&&!/[\\:"*?<>|\x00-\x1f\x7f]/.test(name),'Unsafe archive path');
  assert.ok(!name.startsWith('/')&&!name.endsWith('/')&&name.split('/').every(part=>part&&part!=='.'&&part!=='..'&&!/[. ]$/.test(part)&&! /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part)),'Unsafe archive path');
  assert.equal(Buffer.from(name).toString('utf8'),name,'Invalid UTF8 archive path');
  return name;
}
/** Narrow deterministic ZIP: regular UTF8 files, raw DEFLATE, no comments/extras/ZIP64. */
export function encodeZip(entries){
  assert.ok(entries instanceof Map&&entries.size>0&&entries.size<=MAX_ENTRIES,'Invalid archive size');
  const locals=[],central=[];let offset=0,total=0;
  for(const name of [...entries.keys()].sort(order)){
    safeArchivePath(name);const data=entries.get(name);assert.ok(Buffer.isBuffer(data)&&data.length<=MAX_FILE,'Archive file exceeds bound');total+=data.length;assert.ok(total<=MAX_TOTAL,'Archive exceeds bound');
    const filename=Buffer.from(name),compressed=deflateRawSync(data,{level:9}),checksum=crc32(data);
    const h=Buffer.alloc(30);h.writeUInt32LE(0x04034b50);h.writeUInt16LE(20,4);h.writeUInt16LE(0x800,6);h.writeUInt16LE(8,8);h.writeUInt16LE(0,10);h.writeUInt16LE(33,12);h.writeUInt32LE(checksum,14);h.writeUInt32LE(compressed.length,18);h.writeUInt32LE(data.length,22);h.writeUInt16LE(filename.length,26);
    locals.push(h,filename,compressed);
    const c=Buffer.alloc(46);c.writeUInt32LE(0x02014b50);c.writeUInt16LE(0x314,4);c.writeUInt16LE(20,6);h.copy(c,8,6,28);c.writeUInt32LE(0x81a40000,38);c.writeUInt32LE(offset,42);
    central.push(c,filename);offset+=h.length+filename.length+compressed.length;
  }
  const directory=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(entries.size,8);end.writeUInt16LE(entries.size,10);end.writeUInt32LE(directory.length,12);end.writeUInt32LE(offset,16);
  return Buffer.concat([...locals,directory,end]);
}
export function decodeZip(bytes){
  assert.ok(Buffer.isBuffer(bytes)&&bytes.length>=22&&bytes.length<=MAX_TOTAL,'Invalid ZIP bound');
  const end=bytes.length-22;assert.equal(bytes.readUInt32LE(end),0x06054b50,'Missing canonical ZIP footer');
  assert.equal(bytes.readUInt32LE(end+4),0,'Multipart ZIP forbidden');assert.equal(bytes.readUInt16LE(end+20),0,'ZIP comments forbidden');
  const count=bytes.readUInt16LE(end+10),size=bytes.readUInt32LE(end+12),start=bytes.readUInt32LE(end+16);
  assert.ok(count>0&&count<=MAX_ENTRIES&&bytes.readUInt16LE(end+8)===count&&start+size===end,'Invalid ZIP directory');
  const entries=new Map(),folded=new Set();let cursor=start,local=0,total=0,last='';
  for(let i=0;i<count;i++){
    assert.ok(cursor+46<=end&&bytes.readUInt32LE(cursor)===0x02014b50,'Invalid ZIP entry');
    assert.equal(bytes.readUInt16LE(cursor+4),0x314,'Unsupported ZIP producer');assert.equal(bytes.readUInt16LE(cursor+6),20,'Unsupported ZIP version');
    assert.equal(bytes.readUInt16LE(cursor+8),0x800,'Unsupported ZIP flags');assert.equal(bytes.readUInt16LE(cursor+10),8,'Unsupported ZIP compression');
    assert.equal(bytes.readUInt16LE(cursor+12),0,'Noncanonical ZIP time');assert.equal(bytes.readUInt16LE(cursor+14),33,'Noncanonical ZIP date');
    const compressed=bytes.readUInt32LE(cursor+20),length=bytes.readUInt32LE(cursor+24),namesize=bytes.readUInt16LE(cursor+28);
    assert.equal(bytes.readUInt32LE(cursor+30),0,'ZIP extras/comments forbidden');assert.equal(bytes.readUInt16LE(cursor+34),0,'ZIP disk forbidden');assert.equal(bytes.readUInt16LE(cursor+36),0,'ZIP attributes forbidden');assert.equal(bytes.readUInt32LE(cursor+38),0x81a40000,'Only regular files allowed');
    assert.equal(bytes.readUInt32LE(cursor+42),local,'ZIP local offsets must be contiguous');
    assert.ok(namesize>0&&cursor+46+namesize<=end&&length<=MAX_FILE,'ZIP entry exceeds bound');
    const namebytes=bytes.subarray(cursor+46,cursor+46+namesize),name=safeArchivePath(namebytes.toString('utf8'));
    assert.ok(Buffer.from(name).equals(namebytes)&&!entries.has(name)&&!folded.has(name.toLowerCase())&&(!last||order(last,name)<0),'Duplicate, unsorted or invalid UTF8 path');folded.add(name.toLowerCase());
    assert.ok(local+30+namesize+compressed<=start&&bytes.readUInt32LE(local)===0x04034b50,'Invalid ZIP local header');
    assert.equal(bytes.readUInt16LE(local+4),20);assert.ok(bytes.subarray(local+6,local+28).equals(bytes.subarray(cursor+8,cursor+30)),'ZIP headers disagree');assert.equal(bytes.readUInt16LE(local+28),0,'ZIP local extras forbidden');assert.ok(bytes.subarray(local+30,local+30+namesize).equals(namebytes),'ZIP filename mismatch');
    const inflated=inflateRawSync(bytes.subarray(local+30+namesize,local+30+namesize+compressed),{maxOutputLength:Math.max(length,1),info:true}),data=inflated.buffer;assert.equal(inflated.engine.bytesWritten,compressed,'Trailing compressed bytes forbidden');
    assert.equal(data.length,length,'ZIP length mismatch');assert.equal(crc32(data),bytes.readUInt32LE(cursor+16),'ZIP CRC mismatch');
    total+=length;assert.ok(total<=MAX_TOTAL,'ZIP decompression bound');entries.set(name,data);last=name;
    local+=30+namesize+compressed;cursor+=46+namesize;
  }
  assert.equal(cursor,end,'ZIP trailing directory bytes');assert.equal(local,start,'ZIP extra local records');return entries;
}
function allowed(name){
  const filename=name.split('/').at(-1);
  const secret=/\.(?:pem|key|p12|pfx|keystore|jks|seed|mnemonic|kdbx)$/i.test(filename)||/^(?:id_(?:rsa|dsa|ecdsa|ed25519)|wallet\.json|(?:.*[-_.])?(?:private[-_]?key|secret[-_]?(?:key|seed)|keypair|signer)(?:\.(?:json|txt|env|yaml|yml))?)$/i.test(filename);
  return !secret&&/^(?:packages\/pact-sdk\/(?:package(?:-lock)?\.json|README\.md|CHANGELOG\.md|DISTRIBUTION\.md|dist\/(?:internal\/)?[\w-]+(?:\.d)?\.(?:js|mjs|ts))|web\/(?:package(?:-lock)?\.json|next\.config\.mjs|public\/.+|\.next\/(?:server\/.+|static\/.+|[\w.-]+\.(?:json|js)|BUILD_ID|turbopack))|evidence\/[\w.-]+\.json|release\/pact-sdk-[\d.]+\.tgz|solana\/artifacts\/(?:pact_licensing\.so|evidence\.json|reproducibility\.json)|operations\/[A-Z]+\.md)$/.test(name)&&!/(?:^|\/)(?:node_modules|\.env[^/]*|\.git|cache|dev)(?:\/|$)/i.test(name);
}
export function validateSnapshot(entries){
  assert.ok(entries.has('manifest.json'),'Snapshot manifest required');const manifest=json(entries.get('manifest.json'));
  assert.equal(manifest.schemaVersion,1);assert.equal(manifest.kind,'local-marketplace-release-snapshot');assert.equal(manifest.deployable,false);assert.equal(manifest.published,false);assert.deepEqual(manifest.migrations,[]);assert.match(manifest.sourceRevision,/^[a-f0-9]{40}$/);
  assert.ok(Array.isArray(manifest.files)&&manifest.files.length===entries.size-1,'Snapshot file count mismatch');
  const names=new Set();for(const item of manifest.files){safeArchivePath(item.path);assert.ok(allowed(item.path)&&!names.has(item.path),'Unapproved or duplicate snapshot file');names.add(item.path);const data=entries.get(item.path);assert.ok(data&&data.length===item.sizeBytes&&sha(data)===item.sha256,'Snapshot file hash mismatch');}
  for(const name of entries.keys())assert.ok(name==='manifest.json'||names.has(name),'Unlisted snapshot file');
  for(const required of ['web/package.json','web/package-lock.json','web/next.config.mjs','web/.next/BUILD_ID','web/.next/required-server-files.json','packages/pact-sdk/package.json','packages/pact-sdk/package-lock.json','evidence/sdk-release.json','evidence/consumer.json','evidence/solana-provenance.json','evidence/historical-deployment.json','evidence/runtime.json','evidence/validation.json','solana/artifacts/pact_licensing.so','solana/artifacts/evidence.json','solana/artifacts/reproducibility.json','operations/ENVIRONMENTS.md','operations/RELEASE.md','operations/RUNBOOKS.md','operations/ROLLOUT.md'])assert.ok(entries.has(required),'Required snapshot entry missing');
  validateValidation(json(entries.get('evidence/validation.json')),manifest.sourceRevision,'v'+manifest.runtime.node);
  const saved=json(entries.get('web/.next/required-server-files.json')),binding=JSON.parse(saved?.config?.env?.PACT_BUILD_BINDING_JSON??'null');
  assert.deepEqual(binding,manifest.build.binding,'Saved Next binding mismatch');assert.equal(saved.config.env.PACT_BUILD_SOURCE_REVISION,manifest.sourceRevision,'Saved Next source revision mismatch');assert.equal(entries.get('web/.next/BUILD_ID').toString().trim(),manifest.build.id,'Build ID mismatch');
  for(const key of ['PACT_BUILD_SOURCE_CLEAN','PACT_BUILD_ENV_FILES_ABSENT','PACT_BUILD_PUBLIC_ENV_SAFE'])assert.equal(saved.config.env[key],'true','Saved Next build must have clean, explicit public configuration');
  assert.deepEqual(Object.keys(saved.config.env).sort(),['PACT_BUILD_BINDING_JSON','PACT_BUILD_SOURCE_REVISION','PACT_BUILD_SOURCE_CLEAN','PACT_BUILD_ENV_FILES_ABSENT','PACT_BUILD_PUBLIC_ENV_SAFE'].sort(),'Unexpected saved Next env field');
  assertLocalBinding(binding);
  const release=json(entries.get('evidence/sdk-release.json')),consumer=json(entries.get('evidence/consumer.json'));
  assert.equal(release.kind,'local-reproducible-sdk-candidate');assert.equal(release.independentBuilds,2);assert.equal(release.published,false);assert.equal(release.distributionApproved,false);
  assert.deepEqual(manifest.sdk,{sha256:release.package.sha256,version:release.package.version,independentBuilds:2},'SDK manifest summary mismatch');
  assert.equal(release.revision,manifest.sourceRevision,'SDK revision mismatch');verifyConsumerReceipt(consumer,release);assert.equal(release.consumerValidation?.passed,true);assert.equal(sha(entries.get('evidence/consumer.json')),release.consumerValidation.reportSha256,'Consumer evidence hash mismatch');
  const tar=entries.get('release/'+release.package.filename);assert.ok(tar&&sha(tar)===release.package.sha256&&tar.length===release.package.sizeBytes,'SDK archive hash mismatch');assert.equal('sha512-'+createHash('sha512').update(tar).digest('base64'),release.package.integrity,'SDK integrity mismatch');
  const sdkFiles=readSdkTar(tar);assert.deepEqual([...sdkFiles.keys()].sort(),release.package.files,'SDK archive file list mismatch');
  const sdkManifest=json(sdkFiles.get('package.json'));assert.equal(sdkManifest.private,true);assert.equal(sdkManifest.version,release.package.version);assertPackageContents({name:sdkManifest.name,version:sdkManifest.version,integrity:release.package.integrity,files:release.package.files.map(name=>({path:name}))},sdkManifest);
  for(const [name,bytes]of sdkFiles)assert.ok(entries.get('packages/pact-sdk/'+name)?.equals(bytes),'Installed SDK differs from approved archive');
  const provenance=json(entries.get('evidence/solana-provenance.json')),historical=json(entries.get('evidence/historical-deployment.json'));
  assert.equal(provenance.status,'passed');assert.equal(provenance.rebuild?.observed,true,'Observed SBF rebuild evidence required');assert.equal(sha(entries.get('solana/artifacts/pact_licensing.so')),provenance.artifact?.sha256,'SBF identity mismatch');
  assert.deepEqual(manifest.solana,{sha256:provenance.artifact.sha256,deployedCurrent:false},'SBF manifest summary mismatch');
  const sbfEvidence=json(entries.get('solana/artifacts/evidence.json')),proof=json(entries.get('solana/artifacts/reproducibility.json'));assert.equal(sbfEvidence.sha256,provenance.artifact.sha256);assert.equal(sbfEvidence.sizeBytes,entries.get('solana/artifacts/pact_licensing.so').length);assert.ok(proof.builds?.length>=2&&proof.builds.every(build=>build.sha256===sbfEvidence.sha256));
  for(const [name,value]of Object.entries(proof.inputs))assert.equal(provenance.relationship?.inputs?.[name]?.sha256,value,'SBF proof input mismatch');
  assert.equal(historical.expectedArtifact,'historical');assert.equal(historical.artifactMatches?.current,false);assert.equal(historical.artifactMatches?.historical,true);assert.equal(historical.networkTransactions,0);assert.notEqual(historical.artifactSha256,provenance.artifact.sha256,'Historical/current artifacts must remain distinct');
  assert.equal(historical.kind,'read-only-devnet-deployment-identity');assert.equal(historical.network,'solana-devnet');assert.equal(historical.commitment,'finalized');assert.equal(historical.program,binding.public.programId);assert.equal(historical.genesis,'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG');assert.equal(historical.artifactSha256,proof.historical?.sha256);assert.equal(historical.artifactBytes,proof.historical?.sizeBytes);
  return manifest;
}
export function assertLocalBinding(binding){
  assert.equal(binding?.schemaVersion,1);assert.equal(binding.application,'marketplace');assert.equal(binding.profile,'local');
  assert.equal(binding.public?.network,'devnet');assert.equal(binding.public.programId,'EiiiWWsW2kkqP6nugHz6iBADvhnW5xnibAtZ82ZExVqy');assert.equal(binding.public.rpcUrl,'https://api.devnet.solana.com');
  for(const field of ['offer','marketplaceUrl','metadataSha256'])assert.equal(binding.public[field],null,'Local snapshot cannot contain demo configuration');
  assert.equal(binding.public.base?.chainId,84532);assert.equal(binding.public.base.contractAddress,null);assert.equal(binding.public.base.rpcUrl,'https://sepolia.base.org');
  assert.equal(binding.server?.authMode,'disabled');assert.equal(binding.server.policy,'disabled');assert.equal(binding.server.protectedOffer,null);assert.equal(binding.server.processModel,'stateless');
  const origin=new URL(binding.server.origin);assert.ok(origin.origin===binding.server.origin&&origin.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(origin.hostname)&&origin.port,'Snapshot requires an explicit loopback origin/port');
  assert.ok(!('rpcUrl'in binding.server)&&!('rpcUrls'in binding.server),'Private RPC must never be saved');
}
function readSdkTar(tar){
  const bytes=gunzipSync(tar,{maxOutputLength:MAX_FILE}),entries=new Map();let p=0;
  while(p+512<=bytes.length&&bytes[p]){
    const header=bytes.subarray(p,p+512),type=header[156];assert.ok(type===0||type===48,'Only SDK regular tar files accepted');
    let checksum=0;for(let i=0;i<512;i++)checksum+=i>=148&&i<156?32:header[i];assert.equal(checksum,parseInt(header.subarray(148,156).toString().replace(/\0.*$/s,'').trim(),8),'SDK tar checksum mismatch');
    const raw=header.subarray(0,100).toString().replace(/\0.*$/s,''),prefix=header.subarray(345,500).toString().replace(/\0.*$/s,'');assert.equal(prefix,'','SDK tar prefix unsupported');assert.ok(raw.startsWith('package/'));const name=safeArchivePath(raw.slice(8));
    const length=parseInt(header.subarray(124,136).toString().replace(/\0.*$/s,'').trim(),8);assert.ok(Number.isSafeInteger(length)&&length>=0&&length<=MAX_FILE&&p+512+length<=bytes.length&&!entries.has(name),'Invalid SDK tar entry');
    entries.set(name,Buffer.from(bytes.subarray(p+512,p+512+length)));p+=512+Math.ceil(length/512)*512;assert.ok(entries.size<200,'SDK tar entry bound');
  }
  assert.ok(p+1024<=bytes.length&&bytes.subarray(p).every(byte=>byte===0),'SDK tar terminator required');return entries;
}
async function readBounded(filename){const stat=await fs.lstat(filename);assert.ok(stat.isFile()&&!stat.isSymbolicLink()&&stat.size<=MAX_FILE,'Expected bounded regular input');return fs.readFile(filename);}
async function noLinks(filename,boundary){for(let cursor=filename;;cursor=path.dirname(cursor)){try{assert.equal((await fs.lstat(cursor)).isSymbolicLink(),false,'Symlink input/output forbidden');}catch(error){if(error.code!=='ENOENT')throw error;}if(cursor===boundary)break;assert.notEqual(path.dirname(cursor),cursor,'Path escapes boundary');}}
async function ownedOutput(requested){
  const output=path.resolve(requested),parent=path.join(root,'web/test-results');
  assert.ok(output.startsWith(parent+path.sep),'Output must be under ignored web/test-results');await noLinks(output,root);await fs.mkdir(output,{recursive:true});
  const relative=path.relative(root,output).replaceAll('\\','/');execFileSync('git',['check-ignore','--quiet',relative+'/probe.json'],{cwd:root,windowsHide:true});assert.equal((await fs.readdir(output)).length,0,'Use a new empty output directory; prior evidence is preserved');return output;
}
async function collect(entries,directory,destination){
  try{await fs.access(directory);}catch(error){if(error.code==='ENOENT')return;throw error;}
  await noLinks(directory,root);
  for(const item of (await fs.readdir(directory,{withFileTypes:true})).sort((a,b)=>order(a.name,b.name))){
    const filename=path.join(directory,item.name),name=destination+'/'+item.name;assert.ok(!item.isSymbolicLink(),'Snapshot symlinks forbidden');
    if(item.isDirectory())await collect(entries,filename,name);else{assert.ok(item.isFile()&&allowed(name),'Unapproved snapshot path');entries.set(name,await readBounded(filename));}
  }
}
const minimalConfig=`import fs from 'node:fs';\nimport {resolvePactEnvironment,publicEnvironmentBinding} from '@pact/sdk/server';\nexport default function config(phase){\n if(phase!=='phase-production-server')throw Error('Saved release snapshot supports next start only');\n const saved=JSON.parse(fs.readFileSync(new URL('./.next/required-server-files.json',import.meta.url),'utf8'));\n const expected=JSON.parse(saved.config.env.PACT_BUILD_BINDING_JSON);\n const resolved=resolvePactEnvironment({environment:process.env,application:'marketplace',phase:'start',expectedBinding:expected});\n return {env:{PACT_BUILD_BINDING_JSON:JSON.stringify(publicEnvironmentBinding(resolved)),PACT_BUILD_SOURCE_REVISION:saved.config.env.PACT_BUILD_SOURCE_REVISION}};\n}\n`;
function summarizeValidation(receipt,name){
  assert.ok(receipt.status==='passed'||receipt.status==='pass','Validation receipt did not pass');
  assert.match(name,/^[a-z][a-z0-9-]{0,40}$/);assert.ok(Array.isArray(receipt.results)&&receipt.results.length>0,'Validation command results required');
  assert.ok(receipt.results.every(item=>['passed','skipped'].includes(item.status)),'Validation command incomplete');
  return {name,revision:receipt.revision,status:receipt.status,node:receipt.node,cleanEnvironmentRequired:receipt.cleanEnvironmentRequired,results:receipt.results.map(item=>({name:item.name,status:item.status,...(item.code===undefined?{}:{code:item.code})}))};
}
export function validateValidation(receipts,revision,node){
  assert.ok(Array.isArray(receipts)&&receipts.length>0&&receipts.length<=32,'Validation receipt bound');
  const names=new Set(),coverage=new Set();let saturday=false;
  for(const receipt of receipts){
    assert.deepEqual(Object.keys(receipt).sort(),['name','revision','status','node','cleanEnvironmentRequired','results'].sort(),'Unexpected validation receipt field');
    assert.match(receipt.name,/^[a-z][a-z0-9-]{0,40}$/);assert.ok(!names.has(receipt.name),'Duplicate validation receipt');names.add(receipt.name);
    assert.equal(receipt.revision,revision);assert.equal(receipt.node,node);assert.equal(receipt.cleanEnvironmentRequired,true);assert.ok(['pass','passed'].includes(receipt.status));
    assert.ok(Array.isArray(receipt.results)&&receipt.results.length>0&&receipt.results.length<=100,'Validation result bound');const commands=new Set();
    for(const item of receipt.results){
      assert.match(item.name,/^[a-z][a-z0-9-]{0,100}$/);assert.ok(!commands.has(item.name),'Duplicate validation command');commands.add(item.name);assert.ok(['passed','skipped'].includes(item.status));
      assert.ok(Object.keys(item).every(key=>['name','status','code'].includes(key)),'Unexpected validation command field');
      if(item.status==='passed'){
        if(!['environment','clean-environment','external-saturday'].includes(item.name)||item.code!==undefined)assert.equal(item.code,0,'Passed command must have exit code zero');
        if(item.code===0)coverage.add(item.name);
      }else{assert.equal(item.name,'external-saturday','Required validation cannot be skipped');assert.ok(item.code===undefined||item.code===0,'Skipped command cannot conceal failure');}
      if(item.name==='external-saturday')saturday=true;
    }
  }
  for(const required of REQUIRED_VALIDATION_COMMANDS)assert.ok(coverage.has(required),'Required validation coverage missing: '+required);
  assert.ok(saturday,'Optional external checkout decision must be recorded explicitly');
}
export async function createSnapshot({inputs,output}){
  const revision=assertClean(root),runtime=await loadRuntimePolicy();assert.equal(process.version,'v'+runtime.node);assert.equal(execFileSync(process.execPath,[npmCli(),'--version'],{encoding:'utf8',windowsHide:true}).trim(),runtime.npm);
  execFileSync(process.execPath,[path.join(root,'scripts/validation/verify-artifacts.mjs')],{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe']});
  const index=json(await readBounded(path.resolve(inputs)));assert.equal(index.schemaVersion,1);assert.ok(Array.isArray(index.validation)&&index.validation.length>0&&index.validation.length<=32);assert.equal(new Set(index.validation.map(item=>item.name)).size,index.validation.length);
  const entries=new Map(),evidenceInputs=[];
  async function evidence(key,destination){assert.equal(typeof index[key],'string');const filename=path.resolve(root,index[key]);await noLinks(filename,path.parse(filename).root);const bytes=await readBounded(filename);entries.set(destination,bytes);evidenceInputs.push({kind:key,sha256:sha(bytes)});return json(bytes);}
  const release=await evidence('sdkRelease','evidence/sdk-release.json'),consumer=await evidence('consumerReport','evidence/consumer.json');assert.equal(release.revision,revision);verifyConsumerReceipt(consumer,release);
  const tar=await readBounded(path.join(path.dirname(path.resolve(root,index.sdkRelease)),release.package.filename));assert.equal(sha(tar),release.package.sha256);entries.set('release/'+release.package.filename,tar);for(const [name,bytes]of readSdkTar(tar))entries.set('packages/pact-sdk/'+name,bytes);
  entries.set('packages/pact-sdk/package-lock.json',execFileSync('git',['show',revision+':packages/pact-sdk/package-lock.json'],{cwd:root,windowsHide:true,maxBuffer:MAX_FILE}));
  const provenance=await evidence('solanaProvenance','evidence/solana-provenance.json');await evidence('historicalDeployment','evidence/historical-deployment.json');
  assert.equal(execFileSync('git',['merge-base','--is-ancestor',provenance.commit,revision],{cwd:root,windowsHide:true}).length,0);
  for(const [name,value]of Object.entries(provenance.relationship.inputs)){const actual=execFileSync('git',['show',revision+':'+name],{cwd:root,windowsHide:true,maxBuffer:MAX_FILE});assert.equal(sha(actual),value.sha256,'SBF inputs changed since provenance');}
  for(const filename of ['pact_licensing.so','evidence.json','reproducibility.json'])entries.set('solana/artifacts/'+filename,await readBounded(path.join(root,'solana/artifacts',filename)));
  entries.set('evidence/runtime.json',encoded(runtime));
  for(const filename of ['ENVIRONMENTS.md','RELEASE.md','RUNBOOKS.md','ROLLOUT.md'])entries.set('operations/'+filename,execFileSync('git',['show',revision+':docs/operations/'+filename],{cwd:root,windowsHide:true,maxBuffer:MAX_FILE}));
  const validation=[];for(const item of index.validation){const bytes=await readBounded(path.resolve(root,item.path)),receipt=json(bytes);assert.equal(receipt.revision,revision,'Validation revision mismatch');assert.equal(receipt.cleanEnvironmentRequired,true,'Release evidence requires clean environment checks');validation.push(summarizeValidation(receipt,item.name));evidenceInputs.push({kind:'validation:'+item.name,sha256:sha(bytes)});}
  validateValidation(validation,revision,'v'+runtime.node);
  entries.set('evidence/validation.json',encoded(validation));
  const web=path.join(root,'web'),binding=await readBuildBinding(web);assertLocalBinding(binding);
  const sdk=await environmentFunctions();sdk.resolvePactEnvironment({environment:localEnvironment(binding),application:'marketplace',phase:'start',expectedBinding:binding});
  for(const filename of ['package.json','package-lock.json'])entries.set('web/'+filename,execFileSync('git',['show',revision+':web/'+filename],{cwd:root,windowsHide:true,maxBuffer:MAX_FILE}));
  entries.set('web/next.config.mjs',Buffer.from(minimalConfig));
  for(const item of await fs.readdir(path.join(web,'.next'),{withFileTypes:true}))if(item.isFile()&&(/^[\w.-]+\.(?:json|js)$/.test(item.name)||['BUILD_ID','turbopack'].includes(item.name)))entries.set('web/.next/'+item.name,await readBounded(path.join(web,'.next',item.name)));
  await collect(entries,path.join(web,'.next/server'),'web/.next/server');await collect(entries,path.join(web,'.next/static'),'web/.next/static');await collect(entries,path.join(web,'public'),'web/public');
  const manifest={schemaVersion:1,kind:'local-marketplace-release-snapshot',sourceRevision:revision,deployable:false,published:false,migrations:[],runtime:{node:runtime.node,npm:runtime.npm,securityReviewDue:runtime.securityReviewDue},build:{id:entries.get('web/.next/BUILD_ID').toString().trim(),binding,reproducibility:'Saved Next snapshot; no cross-build reproducibility claim'},sdk:{sha256:release.package.sha256,version:release.package.version,independentBuilds:release.independentBuilds},solana:{sha256:provenance.artifact.sha256,deployedCurrent:false},evidenceInputs,files:[...entries].sort(([a],[b])=>order(a,b)).map(([name,data])=>({path:name,sizeBytes:data.length,sha256:sha(data)}))};
  entries.set('manifest.json',encoded(manifest));validateSnapshot(entries);
  const first=encodeZip(entries),second=encodeZip(entries);assert.ok(first.length<=MAX_FILE,'Compressed release archive exceeds 50MB CLI bound');assert.ok(first.equals(second),'Repeated snapshot packaging differs');validateSnapshot(decodeZip(first));assert.equal(assertClean(root),revision,'Source changed during snapshot creation');
  const directory=await ownedOutput(output),filename=path.join(directory,'pact-local-'+revision.slice(0,12)+'.zip');await fs.writeFile(filename,first,{flag:'wx'});
  const receipt={schemaVersion:1,kind:'local-release-archive',sourceRevision:revision,sha256:sha(first),sizeBytes:first.length,entries:entries.size,deterministicPacks:2,deployable:false,published:false,relocationObserved:false};await fs.writeFile(path.join(directory,'archive.json'),encoded(receipt),{flag:'wx'});return {filename,receipt};
}
function localEnvironment(binding){return {PACT_ENV_PROFILE:'local',PACT_NETWORK:'devnet',NEXT_PUBLIC_PACT_SOLANA_PROGRAM_ID:binding.public.programId,NEXT_PUBLIC_SOLANA_RPC_URL:binding.public.rpcUrl,NEXT_PUBLIC_PACT_OFFER:'',NEXT_PUBLIC_PACT_METADATA:'',NEXT_PUBLIC_PACT_MARKETPLACE_URL:'',NEXT_PUBLIC_PACT_CONTRACT_ADDRESS:'',NEXT_PUBLIC_RPC_URL:binding.public.base.rpcUrl,PACT_APP_ORIGIN:binding.server.origin,PACT_AUTH_MODE:'disabled',PACT_PROCESS_MODEL:'stateless',PACT_SERVER_POLICY:'disabled',PACT_PROTECTED_OFFER:'',SOLANA_RPC_URL:binding.public.rpcUrl};}
function isolatedEnvironment(temporary){const result={};for(const name of ['PATH','SystemRoot','SYSTEMROOT','ComSpec','COMSPEC','TEMP','TMP','HOME','USERPROFILE','APPDATA','LOCALAPPDATA','PATHEXT'])if(process.env[name])result[name]=process.env[name];return {...result,PATH:path.dirname(process.execPath)+path.delimiter+(result.PATH??''),NEXT_TELEMETRY_DISABLED:'1',npm_config_userconfig:path.join(temporary,'npm-user.ini'),npm_config_globalconfig:path.join(temporary,'npm-global.ini'),npm_config_cache:path.join(temporary,'npm-cache'),npm_config_registry:'https://registry.npmjs.org/',npm_config_audit:'false',npm_config_fund:'false'};}
async function extract(entries,directory){for(const[name,data]of entries){safeArchivePath(name);const filename=path.join(directory,...name.split('/'));assert.ok(filename.startsWith(directory+path.sep));await fs.mkdir(path.dirname(filename),{recursive:true});await fs.writeFile(filename,data,{flag:'wx'});}}
export async function smokeSnapshot({archive,output}){
  const runtime=await loadRuntimePolicy();assert.equal(process.version,'v'+runtime.node);assert.equal(execFileSync(process.execPath,[npmCli(),'--version'],{encoding:'utf8',windowsHide:true}).trim(),runtime.npm);const archiveBytes=await readBounded(path.resolve(archive)),entries=decodeZip(archiveBytes),manifest=validateSnapshot(entries);assert.equal(manifest.runtime.node,runtime.node);assert.equal(manifest.runtime.npm,runtime.npm);
  const directory=await ownedOutput(output),temporary=await fs.mkdtemp(path.join(os.tmpdir(),'pact-local-archive-')),environment=isolatedEnvironment(temporary);await extract(entries,temporary);
  await fs.writeFile(environment.npm_config_userconfig,'');await fs.writeFile(environment.npm_config_globalconfig,'');
  const report={schemaVersion:1,kind:'relocated-local-archive-smoke',sourceRevision:manifest.sourceRevision,archiveSha256:sha(archiveBytes),deployable:false,networkTransactions:0,relocationObserved:false,status:'running',checks:[]};
  try{
    for(const [label,relative]of [['sdk','packages/pact-sdk'],['web','web']]){await runPackageCommand(['ci','--omit=dev','--ignore-scripts','--no-audit','--no-fund'],path.join(temporary,relative),environment,path.join(directory,label+'-install.log'));report.checks.push(label+' locked runtime install');}
    const origin=new URL(manifest.build.binding.server.origin),web=path.join(temporary,'web');
    const child=spawn(process.execPath,[path.join(web,'node_modules/next/dist/bin/next'),'start','--hostname',origin.hostname.replace(/^\[|\]$/g,''),'--port',origin.port],{cwd:web,env:{...environment,...localEnvironment(manifest.build.binding)},windowsHide:true,detached:process.platform!=='win32',stdio:['ignore','pipe','pipe']});
    let exited=false,startup='',size=0;const closed=new Promise(resolve=>child.once('close',()=>{exited=true;resolve();}));child.once('exit',()=>{exited=true;});child.once('error',()=>{exited=true;});
    for(const stream of [child.stdout,child.stderr])stream.on('data',chunk=>{size+=chunk.length;if(size<65536)startup+=chunk.toString();});
    try{
      // Readiness is tied to this child; an occupied port must fail, never reuse another server.
      const deadline=Date.now()+30000;let ready=false;
      while(Date.now()<deadline&&!exited){if(startup.includes('Ready in')){ready=true;break;}await new Promise(resolve=>setTimeout(resolve,100));}
      assert.ok(ready&&!exited,'Relocated Next startup failed');
      for(const [route,allowedStatus]of [['/',[200]],['/api/v1/health/live',[200]],['/api/v1/health/ready',[200]],['/api/v1/protected',[401,403,503]]]){
        const response=await fetch(new URL(route,origin),{redirect:'error',signal:AbortSignal.timeout(5000)});assert.ok(allowedStatus.includes(response.status),'Relocated route smoke failed');const reader=response.body.getReader(),chunks=[];let length=0;try{while(true){const part=await reader.read();if(part.done)break;length+=part.value.length;assert.ok(length<2_000_000,'Route response bound');chunks.push(part.value);}}finally{await reader.cancel().catch(()=>{});}const text=Buffer.concat(chunks).toString('utf8');if(route.endsWith('/protected'))assert.ok(!text.includes('"authorized":true'),'Protected content must remain closed');if(route.endsWith('/health/live'))assert.equal(JSON.parse(text).live,true);if(route.endsWith('/health/ready')){const ready=JSON.parse(text);assert.equal(ready.ready,true);assert.equal(ready.programId,manifest.build.binding.public.programId);assert.equal(ready.network,'devnet');}report.checks.push(route);
      }
      report.status='passed';report.relocationObserved=true;
    }finally{
      if(!exited&&child.pid){if(process.platform==='win32'){await Promise.race([new Promise(resolve=>{const killer=spawn('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});killer.once('error',resolve);killer.once('close',resolve);killer.unref();}),new Promise(resolve=>setTimeout(resolve,3000))]);}else{try{process.kill(-child.pid,'SIGKILL');}catch{child.kill();}}}
      await Promise.race([closed,new Promise(resolve=>setTimeout(resolve,3000))]);child.stdout.destroy();child.stderr.destroy();child.unref();
      await fs.writeFile(path.join(directory,'startup.log'),startup.replace(/https?:\/\/[^\s"'<>]+/g,'[redacted URL]'));
    }
  }catch{report.status='failed';throw Error('Relocated local archive smoke failed; inspect bounded sanitized receipts');}
  finally{await fs.writeFile(path.join(directory,'smoke.json'),encoded(report));}
  return report;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  const [command,...args]=process.argv.slice(2),values={};let valid=args.length%2===0;for(let i=0;i<args.length;i+=2){if(!['--inputs','--output','--archive'].includes(args[i])||Object.hasOwn(values,args[i].slice(2)))valid=false;values[args[i].slice(2)]=args[i+1];}
  const task=async()=>{assert.ok(valid,'Invalid archive arguments');if(command==='create'&&values.inputs&&values.output&&Object.keys(values).length===2)return createSnapshot(values);if(command==='verify'&&values.archive&&Object.keys(values).length===1){const bytes=await readBounded(path.resolve(values.archive)),manifest=validateSnapshot(decodeZip(bytes));return {status:'passed',sha256:sha(bytes),sourceRevision:manifest.sourceRevision,deployable:false};}if(command==='smoke'&&values.archive&&values.output&&Object.keys(values).length===2)return smokeSnapshot(values);throw Error('Invalid archive command');};
  task().then(result=>console.log(JSON.stringify(result,null,2))).catch(()=>{console.error('Local archive validation failed. Use create --inputs <index.json> --output <ignored-dir>, verify --archive <zip>, or smoke --archive <zip> --output <ignored-dir>. No deployment performed.');process.exitCode=1;});
}
