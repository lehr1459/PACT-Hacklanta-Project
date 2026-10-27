import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {assertBuildEnvironment, assertClean, inspectTool, compareRebuild, INPUTS, verifySourceRelationship} from './provenance.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
function temporary(t) {
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'pact-provenance-test-'));
  t.after(()=>{
    assert.ok(directory.startsWith(path.join(os.tmpdir(),'pact-provenance-test-')));
    fs.rmSync(directory,{recursive:true,force:true});
  });
  return directory;
}
function git(directory,args) {
  return execFileSync('git',args,{cwd:directory,encoding:'utf8',stdio:['ignore','pipe','pipe'],windowsHide:true});
}

test('clean provenance refuses tracked modifications and untracked source files',t=>{
  const directory=temporary(t);git(directory,['init','--quiet']);
  fs.writeFileSync(path.join(directory,'source.txt'),'committed\n');git(directory,['add','source.txt']);
  git(directory,['-c','user.name=Provenance Fixture','-c','user.email=fixture@example.invalid','commit','--quiet','-m','Synthetic source fixture']);
  assert.match(assertClean(directory),/^[0-9a-f]{40}$/);
  fs.writeFileSync(path.join(directory,'untracked.txt'),'new source');
  assert.throws(()=>assertClean(directory),/clean committed checkout/);
  fs.unlinkSync(path.join(directory,'untracked.txt'));
  fs.writeFileSync(path.join(directory,'source.txt'),'changed\n');
  assert.throws(()=>assertClean(directory),/clean committed checkout/);
});

test('ambient compiler overrides and applicable Cargo configuration fail without printing their values',t=>{
  const directory=temporary(t);fs.mkdirSync(path.join(directory,'solana'),{recursive:true});
  assert.doesNotThrow(()=>assertBuildEnvironment(directory,{}));
  for(const name of ['RUSTFLAGS','CARGO_HOME','RUSTC_WRAPPER','CARGO_TARGET_SBPF_SOLANA_SOLANA_LINKER','CARGO_PROFILE_RELEASE_LTO']) {
    assert.throws(()=>assertBuildEnvironment(directory,{[name]:'never-echo-this-value'}),error=>error.message.includes(name)&&!error.message.includes('never-echo-this-value'));
  }
  for(const relative of ['.cargo/config','solana/.cargo/config.toml','solana/.tools/cargo/config.toml']) {
    const filename=path.join(directory,relative);fs.mkdirSync(path.dirname(filename),{recursive:true});
    fs.writeFileSync(filename,'unsupported synthetic configuration');
    assert.throws(()=>assertBuildEnvironment(directory,{}),/Ambient Cargo configuration/);
    fs.unlinkSync(filename);
  }
});

test('pinned tool bytes are checked before execution and version output is bounded',t=>{
  const directory=temporary(t),filename=path.join(directory,'compiler');
  const bytes=Buffer.from('synthetic compiler fixture');fs.writeFileSync(filename,bytes);
  let probes=0;const version=()=>{probes++;return 'synthetic compiler version';};
  assert.deepEqual(inspectTool(filename,sha(bytes),version),{sha256:sha(bytes),version:'synthetic compiler version'});
  fs.appendFileSync(filename,'changed');
  assert.throws(()=>inspectTool(filename,sha(bytes),version),/checksum mismatch/);
  assert.equal(probes,1,'drifted executable must never be launched');
  fs.writeFileSync(filename,bytes);
  assert.throws(()=>inspectTool(filename,sha(bytes),()=>''),/version response/);
});

test('fresh rebuild must match complete approved bytes, including exact size',t=>{
  const directory=temporary(t),filename=path.join(directory,'candidate.so'),bytes=Buffer.from('independent ELF fixture');
  const artifact={sizeBytes:bytes.length,sha256:sha(bytes)};fs.writeFileSync(filename,bytes);
  assert.deepEqual(compareRebuild(filename,artifact),artifact);
  const changed=Buffer.from(bytes);changed[changed.length-1]^=1;fs.writeFileSync(filename,changed);
  assert.throws(()=>compareRebuild(filename,artifact),/artifact hash mismatch/);
  fs.writeFileSync(filename,bytes.subarray(1));assert.throws(()=>compareRebuild(filename,artifact),/artifact size mismatch/);
});

test('recorded source ancestry and all six actual Git blobs bind proof even if claimed hashes are rewritten',t=>{
  const directory=temporary(t);git(root,['clone','--quiet','--shared','--no-checkout',root,directory]);
  for(const file of INPUTS){fs.mkdirSync(path.dirname(path.join(directory,file)),{recursive:true});fs.copyFileSync(path.join(root,file),path.join(directory,file));}
  const proof=JSON.parse(fs.readFileSync(path.join(root,'solana/artifacts/reproducibility.json')));
  const artifact=JSON.parse(fs.readFileSync(path.join(root,'solana/artifacts/evidence.json')));
  const result=verifySourceRelationship(directory,proof,artifact);
  assert.equal(Object.keys(result.inputs).length,6);
  for(const value of Object.values(result.inputs))assert.equal(value.gitBlob,value.recordedSourceBlob);
  const filename=path.join(directory,INPUTS[0]);fs.appendFileSync(filename,'\n');proof.inputs[INPUTS[0]]=sha(fs.readFileSync(filename));
  assert.throws(()=>verifySourceRelationship(directory,proof,artifact),/source Git bytes mismatch/);
});
