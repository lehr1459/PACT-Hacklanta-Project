import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, copyFile, readFile, writeFile, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { root } from './common.mjs';

test('artifact gate rejects changed build inputs and invented deployment claims', async () => {
  const fixture = await mkdtemp(path.join(os.tmpdir(), 'pact-artifact-gate-'));
  try {
    const files = ['scripts/validation/common.mjs', 'scripts/validation/verify-artifacts.mjs',
      'scripts/solana/provenance.mjs',
      'solana/artifacts/pact_licensing.so', 'solana/artifacts/evidence.json', 'solana/artifacts/reproducibility.json',
      'solana/src/lib.rs', 'solana/Cargo.toml', 'solana/Cargo.lock', 'solana/wire-spec.json', 'solana/scripts/build.ps1', 'solana/toolchain.json',
      'contracts/src/PactLicensing.sol', 'contracts/abi/PactLicensing.json', 'contracts/abi/PactLicensing.evidence.json'];
    const cloned=spawnSync('git',['clone','--quiet','--shared','--no-checkout',root,fixture],{encoding:'utf8',windowsHide:true});
    assert.equal(cloned.status,0,cloned.stderr);
    for (const file of files) {
      await mkdir(path.dirname(path.join(fixture, file)), { recursive: true });
      await copyFile(path.join(root, file), path.join(fixture, file));
    }
    const run = () => spawnSync(process.execPath, ['scripts/validation/verify-artifacts.mjs'], { cwd: fixture, encoding: 'utf8', timeout: 10000, windowsHide: true });
    assert.equal(run().status, 0, 'Unmodified release inputs must pass');
    for (const file of ['solana/Cargo.toml', 'solana/scripts/build.ps1', 'solana/toolchain.json']) {
      const target = path.join(fixture, file), original = await readFile(target);
      await writeFile(target, Buffer.concat([original, Buffer.from('\n')]));
      const changed = run();
      assert.notEqual(changed.status, 0);
      assert.match(changed.stderr, /Reproducibility input mismatch/);
      await writeFile(target, original);
    }
    const proofPath = path.join(fixture, 'solana/artifacts/reproducibility.json');
    const originalProof = await readFile(proofPath, 'utf8');
    for(const mutate of [proof=>{proof.sourceCommit='0'.repeat(40);},proof=>{proof.sourceCommit='8e259de1bc046d460a62bf6cc8102c6e64552d02';},proof=>{proof.builds=[proof.builds[0],proof.builds[0]];}]){
      const changedProof=JSON.parse(originalProof);mutate(changedProof);await writeFile(proofPath,JSON.stringify(changedProof));
      const changed=run();assert.notEqual(changed.status,0,'Invented commit or duplicate build proof must fail');
      assert.match(changed.stderr,/source commit|Git blob mismatch|Duplicate checkout build record/);
      await writeFile(proofPath,originalProof);
    }
    const proof = JSON.parse(originalProof);
    proof.deploymentVerified = true;
    await writeFile(proofPath, JSON.stringify(proof));
    const fabricated = run();
    assert.notEqual(fabricated.status, 0);
    assert.match(fabricated.stderr, /must not invent deployment evidence/);
    await writeFile(proofPath, originalProof);
    const evidencePath = path.join(fixture, 'solana/artifacts/evidence.json');
    const originalEvidence = await readFile(evidencePath, 'utf8');
    for (const field of ['deploymentProgramId', 'deploymentSignature']) {
      const evidence = JSON.parse(originalEvidence);
      evidence[field] = 'invented-deployment';
      await writeFile(evidencePath, JSON.stringify(evidence));
      const invented = run();
      assert.notEqual(invented.status, 0);
      assert.match(invented.stderr, /Local Solana artifact evidence must not invent/);
      await writeFile(evidencePath, originalEvidence);
    }
  } finally {
    assert.ok(fixture.startsWith(path.join(os.tmpdir(), 'pact-artifact-gate-')));
    await rm(fixture, { recursive: true, force: true });
  }
});
