import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {root} from './common.mjs';
import {verifySourceRelationship} from '../solana/provenance.mjs';

const read=relative=>readFile(path.join(root,relative));
const json=async relative=>JSON.parse(await read(relative));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const solana=await json('solana/artifacts/evidence.json');
assert.equal(solana.deploymentProgramId,null,'Local Solana artifact evidence must not invent a deployed program');
assert.equal(solana.deploymentSignature,null,'Local Solana artifact evidence must not invent a deployment signature');
assert.equal((await read('solana/artifacts/pact_licensing.so')).length,solana.sizeBytes,'Solana artifact size metadata');
for(const [file,expected] of [['artifacts/pact_licensing.so',solana.sha256],['src/lib.rs',solana.sourceSha256],['Cargo.lock',solana.cargoLockSha256],['wire-spec.json',solana.wireSpecSha256]])assert.equal(sha(await read('solana/'+file)),expected,`Solana evidence mismatch: ${file}`);
const reproducibility=await json('solana/artifacts/reproducibility.json');
assert.equal(reproducibility.schemaVersion,1);
assert.equal(reproducibility.kind,'local-build-path-reproducibility');
assert.match(reproducibility.sourceCommit,/^[0-9a-f]{40}$/);
assert.equal(reproducibility.deploymentVerified,false,'Build reproducibility must not invent deployment evidence');
assert.equal(reproducibility.chainTransactionsBroadcast,false,'Local build proof must not claim chain transactions');
const inputFiles=['solana/src/lib.rs','solana/Cargo.toml','solana/Cargo.lock','solana/wire-spec.json','solana/scripts/build.ps1','solana/toolchain.json'];
assert.deepEqual(Object.keys(reproducibility.inputs).sort(),inputFiles.sort(),'Reproducibility input coverage changed');
for(const file of inputFiles)assert.equal(sha(await read(file)),reproducibility.inputs[file],`Reproducibility input mismatch: ${file}`);
assert.ok(reproducibility.builds.length>=2,'Independent checkout build records required');
for(const build of reproducibility.builds){assert.equal(build.sha256,solana.sha256);assert.equal(build.sizeBytes,solana.sizeBytes);}
verifySourceRelationship(root,reproducibility,solana);
assert.deepEqual(solana.pathRemapping,{workspace:'/pact/solana',cargoHome:'/pact/cargo',encoding:'CARGO_ENCODED_RUSTFLAGS (ASCII 31)'});
const evidence=await json('contracts/abi/PactLicensing.evidence.json');
assert.equal(sha(await read('contracts/src/PactLicensing.sol')),evidence.sourceSha256,'Base source evidence mismatch');
assert.equal(sha(await read('contracts/abi/PactLicensing.json')),evidence.abiSha256,'Base ABI evidence mismatch; checkout must honor .gitattributes');
if(process.argv.includes('--compiled-base')) {
  const artifact=await json('contracts/out/PactLicensing.sol/PactLicensing.json');
  assert.equal(artifact.metadata.compiler.version,evidence.compiler,'Compiler evidence mismatch');
  assert.deepEqual(artifact.metadata.settings,evidence.settings,'Compiler settings evidence mismatch');
  assert.equal(artifact.metadata.settings.evmVersion,'cancun','Expected reviewed Cancun target');
  assert.deepEqual(artifact.abi,await json('contracts/abi/PactLicensing.json'),'Compiled ABI differs');
  for(const [name,hex] of [['creationBytecode',artifact.bytecode.object],['runtimeBytecode',artifact.deployedBytecode.object]]) {
    const bytes=Buffer.from(hex.replace(/^0x/,''),'hex');
    assert.equal(bytes.length,evidence[name].lengthBytes,`${name} length`);
    assert.equal(sha(bytes),evidence[name].sha256,`${name} SHA256`);
    const cast=path.join(root,'contracts/.tools/foundry-v1.8.5/cast.exe');
    assert.equal(execFileSync(cast,['keccak','0x'+bytes.toString('hex')],{encoding:'utf8'}).trim(),evidence[name].keccak256,`${name} Keccak256 evidence`);
  }
}
assert.equal(evidence.address,null,'Local artifact evidence must not invent a deployment address');
assert.equal(evidence.deploymentTransaction,null,'Local artifact evidence must not invent a deployment transaction');
console.log(JSON.stringify({status:'passed',checks:['Solana artifact/source/lock/wire hashes','Six reproducible build input hashes, historical/current Git blobs and distinct build records','Base source and exact ABI hashes',...(process.argv.includes('--compiled-base')?['Base compiled ABI and creation/runtime bytecode']:[])],deploymentChecked:false}));
