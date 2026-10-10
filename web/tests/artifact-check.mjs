// Independent read-only artifact reproduction. No wallet, RPC or deployment access.
import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {keccak256} from 'viem';

const path = relative => new URL(`../../contracts/${relative}`, import.meta.url);
const read = relative => JSON.parse(fs.readFileSync(path(relative), 'utf8'));
const artifact = read('out/PactLicensing.sol/PactLicensing.json');
const evidence = read('abi/PactLicensing.evidence.json');
assert.deepEqual(artifact.abi, read('abi/PactLicensing.json'), 'Exported ABI must match the build');
for(const [name,hex] of [['creationBytecode',artifact.bytecode.object],['runtimeBytecode',artifact.deployedBytecode.object]]){
  const bytes=Buffer.from(hex.replace(/^0x/,''),'hex');
  const actual={lengthBytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),keccak256:keccak256(hex)};
  assert.deepEqual(actual,evidence[name],`${name} evidence mismatch`);
  console.log(name,JSON.stringify(actual));
}
for(const [field,file] of [['sourceSha256','src/PactLicensing.sol'],['abiSha256','abi/PactLicensing.json']]){
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path(file))).digest('hex'),evidence[field]);
}
assert.equal(artifact.metadata.settings.evmVersion,'cancun');
assert.equal(artifact.metadata.compiler.version,evidence.compiler);
assert.deepEqual(artifact.metadata.settings,evidence.settings);
assert.equal(evidence.address,null);
assert.equal(evidence.deploymentTransaction,null);
console.log('PASS: independent ABI, source, bytecode hashes, compiler/settings and undeployed evidence checks.');
