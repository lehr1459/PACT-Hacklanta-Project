import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {encodeZip,decodeZip,safeArchivePath,assertLocalBinding,validateSnapshot,validateValidation,REQUIRED_VALIDATION_COMMANDS} from './archive.mjs';
import {REQUIRED_CONSUMER_CHECKS} from './sdk.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex'),encode=o=>Buffer.from(JSON.stringify(o,null,2)+'\n');
const revision='1'.repeat(40);
function validation(){return [{name:'all-node',revision,node:process.version,cleanEnvironmentRequired:true,status:'passed',results:[...REQUIRED_VALIDATION_COMMANDS.map(name=>({name,status:'passed',code:0})),{name:'external-saturday',status:'skipped'}]}];}
const binding={schemaVersion:1,application:'marketplace',profile:'local',public:{network:'devnet',programId:'EiiiWWsW2kkqP6nugHz6iBADvhnW5xnibAtZ82ZExVqy',rpcUrl:'https://api.devnet.solana.com',offer:null,marketplaceUrl:null,metadataSha256:null,base:{chainId:84532,contractAddress:null,rpcUrl:'https://sepolia.base.org'}},server:{origin:'http://localhost:3007',authMode:'disabled',processModel:'stateless',policy:'disabled',protectedOffer:null}};
function tar(files){const chunks=[];for(const[name,data]of files){const h=Buffer.alloc(512),raw='package/'+name;h.write(raw);h.write('0000644\0',100);h.write('0000000\0',108);h.write('0000000\0',116);h.write(data.length.toString(8).padStart(11,'0')+'\0',124);h.write('00000000000\0',136);h.fill(32,148,156);h[156]=48;h.write('ustar\0',257);let sum=0;for(const value of h)sum+=value;h.write(sum.toString(8).padStart(6,'0')+'\0 ',148);chunks.push(h,data,Buffer.alloc((512-data.length%512)%512));}return gzipSync(Buffer.concat([...chunks,Buffer.alloc(1024)]));}
function fixture(){
  const exports={};for(const name of ['.','./checkout','./widget','./v1','./server','./react','./pact-checkout.mjs','./pact-checkout.js'])exports[name]='./dist/'+(name==='.'?'index.js':name.slice(2)+(name.endsWith('.js')||name.endsWith('.mjs')?'':'.js'));
  const pkg={name:'@pact/sdk',version:'0.2.0',private:true,exports},sdk=new Map([['package.json',encode(pkg)],['README.md',Buffer.from('Fixture')],['CHANGELOG.md',Buffer.from('Fixture')],['DISTRIBUTION.md',Buffer.from('Fixture')]]);
  for(const name of Object.values(exports))sdk.set(name.slice(2),Buffer.from('export {};\n'));
  const archive=tar(sdk),packageInfo={version:'0.2.0',filename:'pact-sdk-0.2.0.tgz',sha256:sha(archive),integrity:'sha512-'+createHash('sha512').update(archive).digest('base64'),files:[...sdk.keys()].sort(),sizeBytes:archive.length};
  const consumer={status:'pass',revision,workingTreeClean:true,node:process.version,package:packageInfo,checks:REQUIRED_CONSUMER_CHECKS.map(name=>({name,status:'pass'}))},consumerBytes=encode(consumer);
  const release={kind:'local-reproducible-sdk-candidate',revision,runtime:{node:process.version},independentBuilds:2,published:false,distributionApproved:false,package:packageInfo,consumerValidation:{passed:true,reportSha256:sha(consumerBytes)}};
  const elf=Buffer.from('Synthetic ELF identity fixture, never executable'),artifact={sha256:sha(elf),sizeBytes:elf.length},inputs={'solana/src/lib.rs':'a'.repeat(64)};
  const entries=new Map([...sdk].map(([name,bytes])=>['packages/pact-sdk/'+name,bytes]));
  for(const[name,bytes]of Object.entries({
    'packages/pact-sdk/package-lock.json':encode({lockfileVersion:3}),
    'web/package.json':encode({name:'pact-web'}),'web/package-lock.json':encode({lockfileVersion:3}),'web/next.config.mjs':Buffer.from('// synthetic config fixture'),
    'web/.next/BUILD_ID':Buffer.from('fixture-build'),'web/.next/required-server-files.json':encode({version:1,config:{env:{PACT_BUILD_BINDING_JSON:JSON.stringify(binding),PACT_BUILD_SOURCE_REVISION:revision,PACT_BUILD_SOURCE_CLEAN:'true',PACT_BUILD_ENV_FILES_ABSENT:'true',PACT_BUILD_PUBLIC_ENV_SAFE:'true'}}}),
    'evidence/sdk-release.json':encode(release),'evidence/consumer.json':consumerBytes,
    'evidence/solana-provenance.json':encode({status:'passed',artifact,rebuild:{observed:true},relationship:{inputs:Object.fromEntries(Object.entries(inputs).map(([name,sha256])=>[name,{sha256}]))}}),
    'evidence/historical-deployment.json':encode({kind:'read-only-devnet-deployment-identity',network:'solana-devnet',commitment:'finalized',program:binding.public.programId,genesis:'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG',expectedArtifact:'historical',artifactMatches:{current:false,historical:true},networkTransactions:0,artifactSha256:'b'.repeat(64),artifactBytes:48}),
    'evidence/runtime.json':encode({node:process.version.slice(1)}),
    'evidence/validation.json':encode(validation()),
    'solana/artifacts/pact_licensing.so':elf,'solana/artifacts/evidence.json':encode(artifact),'solana/artifacts/reproducibility.json':encode({inputs,builds:[artifact,artifact],historical:{sha256:'b'.repeat(64),sizeBytes:48}}),
    'release/pact-sdk-0.2.0.tgz':archive,
    ...Object.fromEntries(['ENVIRONMENTS','RELEASE','RUNBOOKS','ROLLOUT'].map(name=>['operations/'+name+'.md',Buffer.from('Synthetic documentation fixture')]))
  }))entries.set(name,bytes);
  const manifest={schemaVersion:1,kind:'local-marketplace-release-snapshot',sourceRevision:revision,deployable:false,published:false,migrations:[],runtime:{node:process.version.slice(1)},build:{binding,id:'fixture-build'},sdk:{sha256:packageInfo.sha256,version:'0.2.0',independentBuilds:2},solana:{sha256:artifact.sha256,deployedCurrent:false},files:[]};
  function seal(){manifest.files=[...entries].filter(([name])=>name!=='manifest.json').map(([path,data])=>({path,sizeBytes:data.length,sha256:sha(data)}));entries.set('manifest.json',encode(manifest));return entries;}
  return {entries,manifest,seal};
}
test('ZIP packaging is byte deterministic, sorted and preserves binary/UTF8 content',()=>{
  const entries=new Map([['z/last.bin',Buffer.from(Array.from({length:256},(_,i)=>i))],['a/€-first.txt',Buffer.from('Exact UTF8 €\r\n')],['empty',Buffer.alloc(0)]]),first=encodeZip(entries);
  assert.ok(first.equals(encodeZip(new Map([...entries].reverse()))));
  const decoded=decodeZip(first);assert.deepEqual([...decoded.keys()],['a/€-first.txt','empty','z/last.bin']);for(const[name,data]of entries)assert.ok(decoded.get(name).equals(data));
});
test('archive paths reject traversal, Windows aliases, alternate streams and invalid encodings',()=>{
  for(const name of ['../escape','/absolute','a/../escape','a//b','a\\b','C:/escape','a:stream','a?query','a*glob','a|pipe','a/.','a/b.','a/b ','CON','a/NUL.txt','a/COM1','a/\0bad','\ud800'])assert.throws(()=>safeArchivePath(name),undefined,name);
});
test('strict ZIP reader rejects malformed headers, symlinks, multipart, checksum corruption and appended bytes',()=>{
  const original=encodeZip(new Map([['a.txt',Buffer.from('Hello')]])),central=original.readUInt32LE(original.length-6);
  const mutations=[b=>b.writeUInt32LE(0,0),b=>b.writeUInt16LE(0,6),b=>b.writeUInt32LE(1,14),b=>b.writeUInt32LE(0xffffffff,22),b=>b.writeUInt32LE(0xa1ff0000,central+38),b=>b.writeUInt32LE(1,central+42),b=>b.writeUInt16LE(1,central+30),b=>b.writeUInt16LE(1,b.length-18),b=>b.writeUInt16LE(2,b.length-12),b=>b.writeUInt32LE(0xffffffff,central+24)];
  for(const mutate of mutations){const changed=Buffer.from(original);mutate(changed);assert.throws(()=>decodeZip(changed));}
  assert.throws(()=>decodeZip(Buffer.concat([original,Buffer.from('appended')])));
  assert.throws(()=>decodeZip(original.subarray(0,-1)));
  const a=encodeZip(new Map([['a.txt',Buffer.from('Hello')]])),start=a.readUInt32LE(a.length-6),junk=Buffer.concat([a.subarray(0,start),Buffer.from('hidden'),a.subarray(start)]),newStart=start+6,footer=junk.length-22;
  junk.writeUInt32LE(a.readUInt32LE(18)+6,18);junk.writeUInt32LE(a.readUInt32LE(start+20)+6,newStart+20);junk.writeUInt32LE(newStart,footer+16);assert.throws(()=>decodeZip(junk),/Trailing compressed bytes/);
});
test('ZIP reader catches duplicate names, path traversal and decompression-bound lies',()=>{
  const original=encodeZip(new Map([['a.txt',Buffer.from('A')],['b.txt',Buffer.from('B')]])),start=original.readUInt32LE(original.length-6),second=start+51,local=original.readUInt32LE(second+42);
  for(const name of ['a.txt','../xx']){const changed=Buffer.from(original);changed.write(name,second+46);changed.write(name,local+30);assert.throws(()=>decodeZip(changed));}
  const bomb=encodeZip(new Map([['a',Buffer.alloc(10000)]])),central=bomb.readUInt32LE(bomb.length-6);bomb.writeUInt32LE(1,22);bomb.writeUInt32LE(1,central+24);assert.throws(()=>decodeZip(bomb));
});
test('local snapshot binding refuses fixtures, rights, private endpoints, hosted promotion and wrong origin',()=>{
  assert.doesNotThrow(()=>assertLocalBinding(binding));
  const mutations=[v=>v.profile='hosted',v=>v.public.offer='11111111111111111111111111111111',v=>v.public.metadataSha256='a'.repeat(64),v=>v.public.base.contractAddress='0x'+'1'.repeat(40),v=>v.server.authMode='single-process',v=>v.server.rpcUrls=['https://private.example.org/key'],v=>v.server.origin='https://production.example.org',v=>v.public.programId='11111111111111111111111111111111'];
  for(const mutate of mutations){const changed=structuredClone(binding);mutate(changed);assert.throws(()=>assertLocalBinding(changed));}
});
test('snapshot verification binds exact SDK bytes, consumer evidence, SBF identity and actual saved Next revision',()=>{
  const f=fixture();assert.equal(validateSnapshot(f.seal()).sourceRevision,revision);
  assert.equal(validateSnapshot(decodeZip(encodeZip(f.entries))).build.id,'fixture-build');
  const changed=Buffer.from(f.entries.get('packages/pact-sdk/dist/index.js'));changed[0]^=1;f.entries.set('packages/pact-sdk/dist/index.js',changed);assert.throws(()=>validateSnapshot(f.seal()),/SDK differs/);
});
test('snapshot manifest cannot hide unlisted/env/node_modules files or mismatched deployment claims',()=>{
  for(const name of ['web/.env.local','web/node_modules/secret','web/public/.env.private','web/public/.ENV.local','web/public/.GIT/config','web/public/NODE_MODULES/secret','web/public/id_ed25519','web/public/customer-keypair.json','web/public/signer.json','web/public/private-key.txt','web/public/token.key','web/public/secrets.PEM','unapproved.txt']){const f=fixture();f.entries.set(name,Buffer.from('PRIVATE_CANARY'));assert.throws(()=>validateSnapshot(f.seal()));}
  for(const mutate of [f=>f.manifest.deployable=true,f=>f.manifest.migrations=['invented'],f=>f.manifest.sourceRevision='2'.repeat(40),f=>f.entries.set('evidence/consumer.json',encode({...JSON.parse(f.entries.get('evidence/consumer.json')),workingTreeClean:false})),f=>f.entries.set('evidence/historical-deployment.json',encode({artifactMatches:{current:true,historical:true},expectedArtifact:'historical',networkTransactions:0}))]){const f=fixture();mutate(f);assert.throws(()=>validateSnapshot(f.seal()));}
  const f=fixture();f.seal();f.entries.set('web/public/unlisted',Buffer.from('unlisted'));assert.throws(()=>validateSnapshot(f.entries));
  for(const key of ['PACT_BUILD_SOURCE_CLEAN','PACT_BUILD_ENV_FILES_ABSENT','PACT_BUILD_PUBLIC_ENV_SAFE']){const f=fixture(),saved=JSON.parse(f.entries.get('web/.next/required-server-files.json'));saved.config.env[key]='false';f.entries.set('web/.next/required-server-files.json',encode(saved));assert.throws(()=>validateSnapshot(f.seal()));}
  const missing=fixture();missing.entries.delete('evidence/validation.json');assert.throws(()=>validateSnapshot(missing.seal()),/Required snapshot entry missing/);
});
test('validation receipts require full coverage and cannot hide failed, skipped or omitted release gates',()=>{
  assert.doesNotThrow(()=>validateValidation(validation(),revision,process.version));
  for(const required of REQUIRED_VALIDATION_COMMANDS){const receipts=validation();receipts[0].results=receipts[0].results.filter(item=>item.name!==required);assert.throws(()=>validateValidation(receipts,revision,process.version),/coverage/);}
  for(const mutate of [v=>v[0].revision='2'.repeat(40),v=>v[0].node='v24.11.1',v=>v[0].cleanEnvironmentRequired=false,v=>v.push(structuredClone(v[0])),v=>v[0].results[0].code=1,v=>delete v[0].results[0].code,v=>v[0].results[0].status='skipped',v=>v[0].results[0].status='failed',v=>v[0].results.pop(),v=>v[0].results.push({...v[0].results[0]}),v=>v[0].environment={PRIVATE_RPC:'PRIVATE_CANARY'}]){const receipts=validation();mutate(receipts);assert.throws(()=>validateValidation(receipts,revision,process.version));}
  const f=fixture();f.entries.set('evidence/validation.json',encode([{...validation()[0],results:[]}])) ;assert.throws(()=>validateSnapshot(f.seal()),/result bound/);
});
