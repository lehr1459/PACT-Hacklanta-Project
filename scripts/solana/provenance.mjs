// Local source/tool/build evidence only. No wallet, deployment or chain requests.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath, pathToFileURL} from 'node:url';

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const INPUTS = Object.freeze([
  'solana/src/lib.rs', 'solana/Cargo.toml', 'solana/Cargo.lock',
  'solana/wire-spec.json', 'solana/scripts/build.ps1', 'solana/toolchain.json',
]);
const SUPPORT = [
  'solana/scripts/setup.ps1', 'solana/requirements-lock.txt',
  'scripts/solana/provenance.mjs', 'scripts/validation/verify-artifacts.mjs', '.gitattributes',
];
const EXECUTABLES = ['rust/bin/cargo.exe', 'rust/bin/rustc.exe', 'llvm/bin/ld.lld.exe', 'llvm/bin/llvm-readelf.exe'];
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const json = filename => JSON.parse(fs.readFileSync(filename, 'utf8'));
function git(root, args) {
  return execFileSync('git', ['--no-replace-objects', ...args], {
    cwd: root, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true, timeout: 10000,
  });
}
const gitText = (root, args) => git(root, args).toString('utf8').trim();

/** Reuse the existing committed proof; bind its recorded build commit to real blobs. */
export function verifySourceRelationship(root, proof, artifact) {
  assert.match(proof.sourceCommit, /^[0-9a-f]{40}$/, 'Invalid recorded source commit');
  let commit;
  try {
    commit = gitText(root, ['rev-parse', '--verify', `${proof.sourceCommit}^{commit}`]);
    git(root, ['merge-base', '--is-ancestor', commit, 'HEAD']);
  } catch { throw Error('Recorded source commit must exist in the current Git ancestry; fetch full history.'); }
  assert.equal(commit, proof.sourceCommit, 'Recorded source commit must be exact');
  assert.deepEqual(Object.keys(proof.inputs).sort(), [...INPUTS].sort(), 'Reproducibility input coverage changed');
  const inputs = {};
  for (const file of INPUTS) {
    const physical = sha(fs.readFileSync(path.join(root, file)));
    assert.equal(physical, proof.inputs[file], `Reproducibility input mismatch: ${file}`);
    const sourceBlob = gitText(root, ['rev-parse', `${commit}:${file}`]);
    const currentBlob = gitText(root, ['rev-parse', `HEAD:${file}`]);
    assert.equal(currentBlob, sourceBlob, `Recorded/current source Git blob mismatch: ${file}`);
    const gitSha256 = sha(git(root, ['cat-file', 'blob', sourceBlob]));
    assert.equal(gitSha256, proof.inputs[file], `Recorded source Git bytes mismatch: ${file}`);
    inputs[file] = {sha256: physical, gitBlob: currentBlob, recordedSourceBlob: sourceBlob};
  }
  assert.ok(Array.isArray(proof.builds) && proof.builds.length >= 2, 'Distinct checkout build records required');
  const locations = new Set(), outputs = new Set();
  for (const build of proof.builds) {
    assert.ok(typeof build.location === 'string' && build.location.trim(), 'Build location is required');
    assert.ok(typeof build.artifact === 'string' && /^solana\/(?:target|artifacts)\/[A-Za-z0-9_./-]+\.so$/.test(build.artifact)
      && !build.artifact.split('/').includes('..'), 'Invalid recorded build output');
    assert.ok(!locations.has(build.location) && !outputs.has(build.artifact), 'Duplicate checkout build record');
    locations.add(build.location); outputs.add(build.artifact);
    assert.equal(build.sha256, artifact.sha256, 'Recorded build artifact hash mismatch');
    assert.equal(build.sizeBytes, artifact.sizeBytes, 'Recorded build artifact size mismatch');
  }
  return {recordedSourceCommit: commit, inputs, recordedBuilds: proof.builds};
}

export function assertClean(root) {
  assert.equal(git(root, ['status', '--porcelain=v1', '--untracked-files=all']).length, 0,
    'Release provenance requires a clean committed checkout, including untracked source files.');
  return gitText(root, ['rev-parse', 'HEAD']);
}

/** Existence-only checks: never read or print ambient configuration contents. */
export function assertBuildEnvironment(root, environment = process.env) {
  const unsupported = Object.keys(environment).filter(name =>
    /^(?:CARGO_|RUSTC(?:_|$)|RUSTFLAGS$|RUSTDOC(?:_|FLAGS$|$)|RUSTUP_TOOLCHAIN$)/.test(name)
    && environment[name] !== undefined && environment[name] !== '');
  assert.equal(unsupported.length, 0, `Unsupported inherited compiler configuration names: ${unsupported.sort().join(', ')}`);
  const candidates = new Set();
  for (let directory = path.join(root, 'solana'); ; directory = path.dirname(directory)) {
    candidates.add(path.join(directory, '.cargo', 'config'));
    candidates.add(path.join(directory, '.cargo', 'config.toml'));
    if (path.dirname(directory) === directory) break;
  }
  for (const name of ['config', 'config.toml']) candidates.add(path.join(root, 'solana/.tools/cargo', name));
  for (const filename of candidates) assert.equal(fs.existsSync(filename), false, 'Ambient Cargo configuration is unsupported (existence check only).');
}

export function inspectTool(filename, expected, version = executable => execFileSync(executable, ['--version'], {
  encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, timeout: 5000, maxBuffer: 16384,
}).trim()) {
  assert.match(expected, /^[0-9a-f]{64}$/, 'Invalid tool checksum pin');
  assert.equal(sha(fs.readFileSync(filename)), expected, 'Pinned tool executable checksum mismatch');
  const actualVersion = version(filename);
  assert.ok(typeof actualVersion === 'string' && actualVersion.length > 0 && actualVersion.length <= 4096, 'Invalid compiler tool version response');
  return {sha256: expected, version: actualVersion};
}

export function buildFlags(root) {
  // Use the same PowerShell path operations as the reviewed script, including
  // mixed-separator Join-Path results. This is planned argv, not a past build claim.
  const script = String.raw`
[Console]::OutputEncoding = New-Object Text.UTF8Encoding($false)
$root = $env:PACT_PROVENANCE_WORKSPACE
$literalCargo = Join-Path $root '.tools/cargo'
$cargo = [IO.Path]::GetFullPath($literalCargo)
$flags = @()
foreach ($prefix in (@($root, $root.Replace('\', '/')) | Select-Object -Unique)) { $flags += "--remap-path-prefix=$prefix=/pact/solana" }
foreach ($prefix in (@($literalCargo, $literalCargo.Replace('/', '\'), $literalCargo.Replace('\', '/'), $cargo, $cargo.Replace('\', '/')) | Select-Object -Unique)) { $flags += "--remap-path-prefix=$prefix=/pact/cargo" }
ConvertTo-Json -Compress -InputObject @($flags)
`;
  const result = JSON.parse(execFileSync('powershell.exe', ['-NoProfile','-NonInteractive','-Command',script], {
    encoding: 'utf8', env: {...process.env, PACT_PROVENANCE_WORKSPACE: path.join(root,'solana')},
    stdio: ['ignore','pipe','pipe'], windowsHide: true, timeout: 10000, maxBuffer: 16384,
  }));
  assert.ok(Array.isArray(result) && result.length >= 2 && result.every(flag => typeof flag === 'string' && flag.startsWith('--remap-path-prefix=')), 'Invalid remapping argument vector');
  return result;
}

export function compareRebuild(filename, artifact) {
  const bytes = fs.readFileSync(filename);
  assert.equal(bytes.length, artifact.sizeBytes, 'Fresh rebuild artifact size mismatch');
  assert.equal(sha(bytes), artifact.sha256, 'Fresh rebuild artifact hash mismatch');
  return {sha256: sha(bytes), sizeBytes: bytes.length};
}

function supportingInputs(root) {
  return Object.fromEntries(SUPPORT.map(file => {
    const blob = gitText(root, ['rev-parse', `HEAD:${file}`]);
    const checkoutBlob = gitText(root, ['hash-object', `--path=${file}`, file]);
    assert.equal(checkoutBlob, blob, `Supporting input differs from its committed Git blob: ${file}`);
    return [file, {sha256: sha(fs.readFileSync(path.join(root,file))), gitBlob: blob}];
  }));
}
function inspection(root) {
  assertBuildEnvironment(root);
  const commit = assertClean(root);
  const artifact = json(path.join(root, 'solana/artifacts/evidence.json'));
  const proof = json(path.join(root, 'solana/artifacts/reproducibility.json'));
  const relationship = verifySourceRelationship(root, proof, artifact);
  const pins = json(path.join(root, 'solana/toolchain.json'));
  assert.deepEqual(Object.keys(pins.executables).sort(), [...EXECUTABLES].sort(), 'Reviewed executable coverage changed');
  assert.equal(pins.target, 'sbpf-solana-solana', 'Unexpected compilation target');
  assert.deepEqual(pins.pathRemapping, {workspace:'/pact/solana',cargoHome:'/pact/cargo',encoding:'CARGO_ENCODED_RUSTFLAGS (ASCII 31)'}, 'Unexpected source path policy');
  const tools = Object.fromEntries(EXECUTABLES.map(file => [file, inspectTool(path.join(root, 'solana/.tools', file), pins.executables[file])]));
  assert.equal(tools['rust/bin/rustc.exe'].version, `rustc ${pins.rustc}`, 'Installed compiler version mismatch');
  const approved = compareRebuild(path.join(root, 'solana/artifacts/pact_licensing.so'), artifact);
  assert.equal(artifact.deploymentProgramId, null); assert.equal(artifact.deploymentSignature, null);
  assert.equal(proof.deploymentVerified, false); assert.equal(proof.chainTransactionsBroadcast, false);
  return {
    commit, relationship, supportingInputs: supportingInputs(root), tools,
    compilerArchivePin: pins.platformTools, artifact: approved,
    policy: {
      target: pins.target, cargoArguments: ['build','--release','--locked','--target',pins.target,'--target-dir','<fresh-ignored-target>'],
      flagEncoding: pins.pathRemapping.encoding,
      normalizedFlags: ['--remap-path-prefix=<workspace>=/pact/solana','--remap-path-prefix=<cargo-home>=/pact/cargo'],
      plannedArgumentVector: buildFlags(root),
    },
  };
}

export function releaseCheck(root, {rebuild = false} = {}) {
  assert.equal(process.platform, 'win32', 'The pinned compiler provenance check requires Windows.');
  const before = inspection(root);
  // Reuse all existing artifact/Base schema and hash checks, rather than invent
  // another approved-artifact format in this local receipt.
  execFileSync(process.execPath, [path.join(root, 'scripts/validation/verify-artifacts.mjs')], {
    cwd: root, stdio: ['ignore','pipe','pipe'], windowsHide: true, timeout: 30000,
  });
  const parent = path.join(root, 'solana/target');
  for (const directory of [path.join(root,'solana'),parent]) {
    if (fs.existsSync(directory)) assert.equal(fs.lstatSync(directory).isSymbolicLink(),false,'Ignored output must not traverse a workspace junction.');
  }
  fs.mkdirSync(parent, {recursive: true});
  const directory = fs.mkdtempSync(path.join(parent, 'provenance-'));
  const relativeDirectory = path.relative(root,directory).replaceAll('\\','/');
  assert.equal(gitText(root, ['check-ignore', '--', relativeDirectory]), relativeDirectory, 'Provenance output must be ignored');
  const receipt = {
    schemaVersion: 1, kind: 'local-provenance-inspection', status: 'running',
    startedAt: new Date().toISOString(), ...before,
    rebuild: {requested: rebuild, observed: false}, deploymentVerified: false, chainTransactionsBroadcast: false,
  };
  try {
    if (rebuild) {
      const target = path.join(directory, 'target'), evidence = path.join(directory, 'evidence');
      const logfile = path.join(directory, 'build.log'), fd = fs.openSync(logfile, 'w');
      try {
        execFileSync('powershell.exe', ['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(root,'solana/scripts/build.ps1'),'-TargetDirectory',target,'-ArtifactDirectory',evidence], {
          cwd: root, stdio: ['ignore',fd,fd], windowsHide: true, timeout: 300000,
        });
      } finally { fs.closeSync(fd); }
      const result = compareRebuild(path.join(evidence, 'pact_licensing.so'), before.artifact);
      const fingerprints = path.join(target, before.policy.target, 'release/.fingerprint');
      const candidates = fs.readdirSync(fingerprints).filter(name => name.startsWith('pact_licensing-'))
        .map(name => path.join(fingerprints, name, 'lib-pact_licensing.json')).filter(name => fs.existsSync(name));
      assert.equal(candidates.length, 1, 'Expected one fresh program compiler fingerprint');
      const fingerprint = fs.readFileSync(candidates[0]);
      const observedFlags = JSON.parse(fingerprint).rustflags;
      assert.deepEqual(observedFlags, before.policy.plannedArgumentVector, 'Observed compiler flags differ from reviewed remapping');
      receipt.rebuild = {requested: true, observed: true, ...result, observedFlags, fingerprintSha256: sha(fingerprint), log: path.relative(root,logfile).replaceAll('\\','/')};
    }
    // Catch source/config/tool/HEAD changes during inspection or compilation.
    const after = inspection(root);
    assert.deepEqual(after, before, 'Provenance inputs changed during inspection/build');
    receipt.status = 'passed';
  } catch (error) {
    receipt.status = 'failed';
    throw error;
  } finally {
    receipt.finishedAt = new Date().toISOString();
    fs.writeFileSync(path.join(directory,'provenance.json'),JSON.stringify(receipt,null,2)+'\n');
  }
  return {receipt: path.join(directory,'provenance.json'), ...receipt};
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2);
    assert.ok(args.length === 0 || args.length === 1 && args[0] === '--rebuild', 'Usage: node scripts/solana/provenance.mjs [--rebuild]');
    console.log(JSON.stringify(releaseCheck(repository, {rebuild: args[0] === '--rebuild'}), null, 2));
  } catch (error) {
    console.error('Local provenance failed: '+error.message);
    process.exitCode = 1;
  }
}
