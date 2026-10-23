import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {createKit} from '../../../scripts/release/staging-source.mjs';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
export async function verifyContext(directory,revision,{allowRehearsal=false}={}) {
  assert.match(revision,/^[a-f0-9]{40}$/); directory=path.resolve(directory);
  // Check every existing ancestor, not just the final context directory.
  let current=path.parse(directory).root;
  for(const part of directory.slice(current.length).split(path.sep).filter(Boolean)) {current=path.join(current,part);const stat=await fs.lstat(current);assert.ok(stat.isDirectory()&&!stat.isSymbolicLink());}
  const data=new Map();let total=0;
  async function walk(from,prefix='') {
    for(const name of await fs.readdir(from)) {
      assert.ok(!/[\\\x00-\x1f]/.test(name));const relative=prefix+name,item=await fs.lstat(path.join(from,name));
      assert.ok(!item.isSymbolicLink()&&!/(?:^|\/)(?:\.env[^/]*|node_modules|\.git|cache|dev)(?:\/|$)/i.test(relative));
      if(item.isDirectory())await walk(path.join(from,name),relative+'/');
      else {assert.ok(item.isFile()&&item.size<=50_000_000&&data.size<10000);total+=item.size;assert.ok(total<=500_000_000);data.set(relative,await fs.readFile(path.join(from,name)));}
    }
  }
  await walk(directory);
  const manifest=JSON.parse(data.get('web-runtime-manifest.json')?.toString()??'null');
  assert.equal(manifest?.schemaVersion,1);assert.equal(manifest.sourceRevision,revision);
  assert.equal(manifest.cleanBefore,true);assert.equal(manifest.cleanAfter,true);assert.equal(manifest.hostedApproved,false);
  assert.match(manifest.sourceArchiveSha256,/^[a-f0-9]{64}$/);
  assert.equal(manifest.testOnly,manifest.kind==='private-test-web-context');
  if(manifest.testOnly)assert.equal(allowRehearsal,true,'Rehearsal context cannot be used for hosted staging');
  else assert.equal(manifest.kind,'private-domain-bound-web-context');
  assert.equal(manifest.binding.profile,manifest.testOnly?'test':'hosted');
  assert.equal(manifest.files.length,data.size-1);
  const listed=new Set();
  for(const file of manifest.files) {
    assert.ok(typeof file.path==='string'&&!listed.has(file.path)&&file.path!=='web-runtime-manifest.json');listed.add(file.path);
    const bytes=data.get(file.path);assert.ok(bytes&&bytes.length===file.sizeBytes);assert.equal(sha(bytes),file.sha256,'Context hash mismatch');
  }
  const required=['Dockerfile','web/next.config.mjs','web/package.json','web/package-lock.json','web/.next/BUILD_ID','web/.next/required-server-files.json','packages/pact-sdk/package.json','packages/pact-sdk/package-lock.json','scripts/validation/environment.mjs'];
  for(const file of required)assert.ok(listed.has(file),'Incomplete private web runtime context');
  const saved=JSON.parse(data.get('web/.next/required-server-files.json'));
  assert.deepEqual(JSON.parse(saved.config.env.PACT_BUILD_BINDING_JSON),manifest.binding);
  assert.equal(saved.config.env.PACT_BUILD_SOURCE_REVISION,revision);
  for(const name of ['PACT_BUILD_SOURCE_CLEAN','PACT_BUILD_ENV_FILES_ABSENT','PACT_BUILD_PUBLIC_ENV_SAFE'])assert.equal(saved.config.env[name],'true');
  assert.equal(data.get('web/.next/BUILD_ID').toString().trim(),manifest.buildId);
  return manifest;
}
async function cli() {
  const [directory,revision,flag,...extra]=process.argv.slice(2);assert.equal(extra.length,0);assert.ok(!flag||flag==='--allow-rehearsal');
  const manifest=await verifyContext(directory,revision,{allowRehearsal:flag==='--allow-rehearsal'});
  const source=await createKit();assert.equal(source.manifest.sourceRevision,revision);assert.equal(source.sha256,manifest.sourceArchiveSha256);
  assert.deepEqual(manifest.runtime,source.manifest.runtime);
  console.log(JSON.stringify({contextVerified:true,sourceRevision:revision,files:manifest.files.length,testOnly:manifest.testOnly,hostedApproved:false}));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)cli().catch(()=>{console.error('Private web context verification failed; inspect source, complete inventory, binding and retained hashes.');process.exitCode=1;});
