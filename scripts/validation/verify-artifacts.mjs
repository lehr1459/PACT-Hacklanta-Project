import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {root} from './common.mjs';

const read=relative=>readFile(path.join(root,relative));
const json=async relative=>JSON.parse(await read(relative));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const solana=await json('solana/artifacts/evidence.json');
assert.equal((await read('solana/artifacts/pact_licensing.so')).length,solana.sizeBytes,'Solana artifact size metadata');
for(const [file,expected] of [['artifacts/pact_licensing.so',solana.sha256],['src/lib.rs',solana.sourceSha256],['Cargo.lock',solana.cargoLockSha256],['wire-spec.json',solana.wireSpecSha256]])assert.equal(sha(await read('solana/'+file)),expected,`Solana evidence mismatch: ${file}`);
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
console.log(JSON.stringify({status:'passed',checks:['Solana artifact/source/lock/wire hashes','Base source and exact ABI hashes',...(process.argv.includes('--compiled-base')?['Base compiled ABI and creation/runtime bytecode']:[])],deploymentChecked:false}));
