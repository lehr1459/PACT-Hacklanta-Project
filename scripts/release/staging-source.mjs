// Private, source-only staging build kit. No deployment, fetching, signing or publication.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {encodeZip, decodeZip, safeArchivePath} from './archive.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const requiredChecks = Object.freeze(['node-and-browser', 'pinned-chain', 'hosted-api-and-browser', 'hosted-portable-windows']);
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export const gitHash = (kind, bytes) => createHash('sha1').update(`${kind} ${bytes.length}\0`).update(bytes).digest('hex');
const json = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');
const order = (a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b));
function git(directory, args, input) {
  // Inherited Git pointer/config variables must never redirect writes away from
  // the newly allocated materialization or inject hooks, filters or templates.
  const environment = Object.fromEntries(Object.entries(process.env).filter(([name]) => !/^GIT_/i.test(name)));
  return execFileSync('git', ['--no-replace-objects', ...args], {
    cwd: directory, input, maxBuffer: 60_000_000, windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: {...environment, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: process.platform === 'win32' ? 'NUL' : '/dev/null'},
  });
}
function assertClean(directory) {
  assert.equal(git(directory, ['status', '--porcelain=v1', '--untracked-files=all']).length, 0,
    'Release provenance requires a clean committed checkout, including untracked source files.');
}
export async function realDirectory(directory, {newFinal = false} = {}) {
  const absolute = path.resolve(directory), parsed = path.parse(absolute);
  let current = parsed.root;
  const parts = absolute.slice(parsed.root.length).split(path.sep).filter(Boolean);
  if (newFinal && parts.length === 0) throw Object.assign(Error('Destination exists'), {code: 'EEXIST'});
  for (let index = 0; index < parts.length; index++) {
    current = path.join(current, parts[index]);
    let stat;
    try {stat = await fs.lstat(current);} catch (error) {
      if (error.code !== 'ENOENT') throw error;
      await fs.mkdir(current, {mode: 0o700}); stat = await fs.lstat(current);
      assert.ok(stat.isDirectory() && !stat.isSymbolicLink(), 'Linked directory forbidden'); continue;
    }
    assert.ok(stat.isDirectory() && !stat.isSymbolicLink(), 'Linked directory forbidden');
    if (newFinal && index === parts.length - 1) throw Object.assign(Error('Destination exists'), {code: 'EEXIST'});
  }
  return absolute;
}
export function allowedSource(name) {
  safeArchivePath(name);
  assert.ok(!/(?:^|\/)(?:\.git|node_modules|\.next|test-results|\.private-evidence)(?:\/|$)/i.test(name), 'Private/generated source path forbidden');
  const base = name.split('/').at(-1);
  assert.ok(!/^\.env(?:\.|$)/i.test(base) || base === '.env.example', 'Active environment file forbidden');
  assert.ok(!/\.(?:pem|key|p12|pfx|keystore|jks|dump|backup|kdbx)$/i.test(base), 'Secret/backup file forbidden');
  assert.ok(!/^(?:id_(?:rsa|dsa|ecdsa|ed25519)|wallet\.json|.*(?:keypair|private[-_]key|mnemonic|seed[-_]phrase)\.(?:json|txt))$/i.test(base), 'Wallet/secret file forbidden');
  return name;
}
// Recompute the complete Git tree independently, including executable modes.
export function sourceTree(files) {
  const tree = new Map();
  for (const file of files) {
    const parts = allowedSource(file.path).split('/');
    let cursor = tree;
    for (const part of parts.slice(0, -1)) {
      if (!cursor.has(part)) cursor.set(part, new Map());
      assert.ok(cursor.get(part) instanceof Map, 'File/directory collision');
      cursor = cursor.get(part);
    }
    const name = parts.at(-1);
    assert.ok(!cursor.has(name), 'Duplicate source path');
    assert.ok(['100644', '100755'].includes(file.mode), 'Only regular source files allowed');
    assert.match(file.gitBlob, /^[a-f0-9]{40}$/);
    cursor.set(name, file);
  }
  const objects = [];
  function visit(entries) {
    const names = [...entries.keys()].sort((a, b) => order(a + (entries.get(a) instanceof Map ? '/' : ''), b + (entries.get(b) instanceof Map ? '/' : '')));
    const bytes = Buffer.concat(names.map(name => {
      const entry = entries.get(name), directory = entry instanceof Map;
      const hash = directory ? visit(entry) : entry.gitBlob;
      return Buffer.concat([Buffer.from(`${directory ? '40000' : entry.mode} ${name}\0`), Buffer.from(hash, 'hex')]);
    }));
    const hash = gitHash('tree', bytes); objects.push({hash, bytes}); return hash;
  }
  return {hash: visit(tree), objects};
}
export function verifyKit(bytes, expectedRevision, expectedDigest) {
  assert.match(expectedRevision ?? '', /^[a-f0-9]{40}$/, 'An independently retained source revision is required');
  if (expectedDigest !== undefined) {
    assert.match(expectedDigest, /^[a-f0-9]{64}$/, 'An independently retained archive SHA256 is required');
    assert.equal(sha256(bytes), expectedDigest, 'Archive SHA256 mismatch');
  }
  const entries = decodeZip(bytes);
  const manifest = JSON.parse(entries.get('staging-source.json')?.toString() ?? 'null');
  assert.equal(manifest?.schemaVersion, 1);
  assert.equal(manifest.kind, 'pact-private-staging-source-kit');
  assert.equal(manifest.sourceRevision, expectedRevision, 'Source revision mismatch');
  for (const key of ['deployable', 'published', 'originBound', 'ciValidated']) assert.equal(manifest[key], false, 'Source kit is not a hosted release approval');
  assert.equal(manifest.network, 'devnet');
  assert.equal(manifest.cleanBefore, true); assert.equal(manifest.cleanAfter, true);
  assert.deepEqual(manifest.requiredChecks, requiredChecks);
  assert.ok(Array.isArray(manifest.files) && manifest.files.length > 0 && manifest.files.length === entries.size - 2, 'Manifest coverage mismatch');
  const names = new Set();
  for (const item of manifest.files) {
    allowedSource(item.path);
    assert.ok(!names.has(item.path), 'Duplicate manifest entry'); names.add(item.path);
    const data = entries.get(`source/${item.path}`);
    assert.ok(data && data.length === item.sizeBytes, 'Source length mismatch');
    assert.equal(sha256(data), item.sha256, 'Source SHA256 mismatch');
    assert.equal(gitHash('blob', data), item.gitBlob, 'Committed source blob mismatch');
  }
  for (const name of entries.keys()) assert.ok(['staging-source.json', 'source-commit.txt'].includes(name) || (name.startsWith('source/') && names.has(name.slice(7))), 'Unlisted archive member');
  const commit = entries.get('source-commit.txt'); assert.ok(commit && commit.length < 100_000, 'Source commit missing');
  assert.equal(gitHash('commit', commit), expectedRevision, 'Original Git commit mismatch');
  const tree = sourceTree(manifest.files);
  assert.equal(commit.toString().split('\n')[0], `tree ${tree.hash}`, 'Complete source tree mismatch');
  assert.equal(manifest.sourceTree, tree.hash);
  const runtime = JSON.parse(entries.get('source/scripts/validation/runtime.json')?.toString() ?? 'null');
  assert.deepEqual(manifest.runtime, {node: runtime.node, npm: runtime.npm});
  return {manifest, entries, commit, tree};
}
export async function createKit(directory = root) {
  await assertClean(directory);
  assert.equal(git(directory, ['rev-parse', '--show-object-format']).toString().trim(), 'sha1');
  const revision = git(directory, ['rev-parse', 'HEAD']).toString().trim();
  const commit = git(directory, ['cat-file', 'commit', revision]);
  const records = git(directory, ['ls-tree', '-r', '-z', revision]).toString().split('\0').filter(Boolean);
  const entries = new Map(), files = [];
  for (const record of records) {
    const match = /^(100644|100755) blob ([a-f0-9]{40})\t(.+)$/s.exec(record);
    assert.ok(match, 'Symlinks, submodules and non-regular sources are forbidden');
    const [, mode, blob, name] = match; allowedSource(name);
    const data = git(directory, ['cat-file', 'blob', blob]);
    entries.set(`source/${name}`, data);
    files.push({path: name, mode, gitBlob: blob, sizeBytes: data.length, sha256: sha256(data)});
  }
  files.sort((a, b) => order(a.path, b.path));
  const runtime = JSON.parse(entries.get('source/scripts/validation/runtime.json').toString());
  const manifest = {schemaVersion: 1, kind: 'pact-private-staging-source-kit', sourceRevision: revision,
    sourceTree: sourceTree(files).hash, cleanBefore: true, cleanAfter: true,
    network: 'devnet', deployable: false, published: false, originBound: false, ciValidated: false,
    runtime: {node: runtime.node, npm: runtime.npm}, requiredChecks, files};
  entries.set('source-commit.txt', commit); entries.set('staging-source.json', json(manifest));
  const bytes = encodeZip(entries);
  await assertClean(directory);
  assert.equal(git(directory, ['rev-parse', 'HEAD']).toString().trim(), revision, 'Source changed while packaging');
  verifyKit(bytes, revision);
  return {bytes, manifest, sha256: sha256(bytes)};
}
// Restore ONLY the original commit and its complete tree. No history, remotes,
// hooks, user configuration or credentials are imported. No fetch is performed.
export async function materializeKit(bytes, revision, digest, destination) {
  const verified = verifyKit(bytes, revision, digest);
  const target = path.resolve(destination);
  // mkdir without recursive/existing-directory reuse prevents overwriting work.
  await realDirectory(target, {newFinal: true});
  git(target, ['init', '--template=', '--object-format=sha1', '--initial-branch=staging-candidate']);
  git(target, ['config', 'core.autocrlf', 'false']);
  for (const item of verified.manifest.files) {
    const id = git(target, ['hash-object', '-w', '--stdin'], verified.entries.get(`source/${item.path}`)).toString().trim();
    assert.equal(id, item.gitBlob);
  }
  for (const item of verified.tree.objects) assert.equal(git(target, ['hash-object', '-t', 'tree', '-w', '--stdin'], item.bytes).toString().trim(), item.hash);
  assert.equal(git(target, ['hash-object', '-t', 'commit', '-w', '--stdin'], verified.commit).toString().trim(), revision);
  await fs.writeFile(path.join(target, '.git/shallow'), revision + '\n', {flag: 'wx', mode: 0o600});
  git(target, ['update-ref', 'refs/heads/staging-candidate', revision]);
  git(target, ['read-tree', 'HEAD']); git(target, ['checkout-index', '--all']);
  git(target, ['fsck', '--connectivity-only', '--no-reflogs']);
  await assertClean(target);
  return verified.manifest;
}
async function cli() {
  const [action, archive, revision, digest, destination, ...extra] = process.argv.slice(2);
  assert.equal(extra.length, 0, 'Unexpected arguments');
  if (action === 'create' && !archive) {
    const kit = await createKit();
    const directory = path.join(root, '.deployment-candidates/staging', kit.manifest.sourceRevision);
    await realDirectory(directory);
    const filename = path.join(directory, 'pact-staging-source.zip');
    await fs.writeFile(filename, kit.bytes, {flag: 'wx', mode: 0o600});
    await fs.writeFile(filename + '.sha256', `${kit.sha256}  pact-staging-source.zip\n`, {flag: 'wx', mode: 0o600});
    console.log(JSON.stringify({kind: kit.manifest.kind, sourceRevision: kit.manifest.sourceRevision, files: kit.manifest.files.length, sha256: kit.sha256, archive: filename, deployable: false, ciValidated: false}));
  } else if (['verify', 'materialize'].includes(action) && archive && revision && digest && (action === 'materialize' ? destination : !destination)) {
    const bytes = await fs.readFile(archive);
    const manifest = action === 'materialize'
      ? await materializeKit(bytes, revision, digest, destination)
      : verifyKit(bytes, revision, digest).manifest;
    console.log(JSON.stringify({verified: true, sourceRevision: manifest.sourceRevision, files: manifest.files.length, deployable: false, ciValidated: false}));
  } else throw Error('Usage: staging-source.mjs create | verify ZIP SOURCE_SHA ZIP_SHA256 | materialize ZIP SOURCE_SHA ZIP_SHA256 NEW_DIRECTORY');
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  cli().catch(() => {console.error('Staging source operation failed. Check clean source, retained revision/digest, archive integrity and a new destination.'); process.exitCode = 1;});
}
