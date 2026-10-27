import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createKit, verifyKit, materializeKit, sha256, allowedSource, sourceTree, realDirectory} from './staging-source.mjs';
import {encodeZip, decodeZip} from './archive.mjs';

const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'pact-staging-source-'));
const source = path.join(directory, 'source'); await fs.mkdir(source);
const git = args => execFileSync('git', args, {cwd: source, encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe']}).trim();
git(['init', '--template=', '--initial-branch=test']);
git(['config', 'user.name', 'PACT local fixture']); git(['config', 'user.email', 'fixture@example.invalid']); git(['config', 'core.autocrlf', 'false']);
await fs.mkdir(path.join(source, 'scripts/validation'), {recursive: true});
await fs.writeFile(path.join(source, 'scripts/validation/runtime.json'), JSON.stringify({node: '24.22.1', npm: '11.19.1'}));
await fs.writeFile(path.join(source, 'safe.txt'), 'committed source\n');
await fs.writeFile(path.join(source, '.gitignore'), '.env*\n');
git(['add', '.']); git(['commit', '-m', 'Local immutable source fixture']);
const revision = git(['rev-parse', 'HEAD']);
const kit = await createKit(source);

test('deterministic complete committed source and independent revision/digest verification', async () => {
  const second = await createKit(source);
  assert.deepEqual(second.bytes, kit.bytes);
  assert.equal(verifyKit(kit.bytes, revision, kit.sha256).manifest.sourceRevision, revision);
  assert.equal(kit.manifest.files.length, 3);
  assert.equal(kit.manifest.deployable, false); assert.equal(kit.manifest.ciValidated, false);
  assert.throws(() => verifyKit(kit.bytes, 'a'.repeat(40), kit.sha256));
  assert.throws(() => verifyKit(kit.bytes, revision, 'a'.repeat(64)));
});
test('complete original commit materializes offline with no remotes/history and a clean index', async () => {
  const target = path.join(directory, 'restored');
  await materializeKit(kit.bytes, revision, kit.sha256, target);
  const run = args => execFileSync('git', args, {cwd: target, encoding: 'utf8', windowsHide: true}).trim();
  assert.equal(run(['rev-parse', 'HEAD']), revision);
  assert.equal(run(['status', '--porcelain', '--untracked-files=all']), '');
  assert.equal(run(['remote']), ''); assert.equal(run(['rev-list', '--count', 'HEAD']), '1');
  assert.equal(await fs.readFile(path.join(target, 'safe.txt'), 'utf8'), 'committed source\n');
  await assert.rejects(materializeKit(kit.bytes, revision, kit.sha256, target), {code: 'EEXIST'});
});
test('dirty source is rejected and ignored private environment bytes never enter the kit', async () => {
  await fs.writeFile(path.join(source, '.env.local'), 'PRIVATE_FIXTURE_MARKER_DO_NOT_EXPORT');
  assert.deepEqual((await createKit(source)).bytes, kit.bytes);
  assert.equal([...decodeZip(kit.bytes).values()].some(data => data.includes('PRIVATE_FIXTURE_MARKER_DO_NOT_EXPORT')), false);
  await fs.writeFile(path.join(source, 'safe.txt'), 'changed');
  await assert.rejects(createKit(source), /clean committed/);
  await fs.writeFile(path.join(source, 'safe.txt'), 'committed source\n');
});
test('file tampering is rejected even when ZIP CRC and outer digest are recomputed', () => {
  const entries = decodeZip(kit.bytes); entries.set('source/safe.txt', Buffer.from('tampered source\n'));
  const bytes = encodeZip(entries);
  assert.throws(() => verifyKit(bytes, revision, sha256(bytes)));
});
test('manifest/blob tampering cannot evade the original Git tree commitment', () => {
  const entries = decodeZip(kit.bytes), manifest = JSON.parse(entries.get('staging-source.json'));
  manifest.files.find(item => item.path === 'safe.txt').mode = '100755';
  entries.set('staging-source.json', Buffer.from(JSON.stringify(manifest)));
  const bytes = encodeZip(entries);
  assert.throws(() => verifyKit(bytes, revision, sha256(bytes)), /tree mismatch/);
});
test('extra members, active environments, wallet files and path escapes are rejected', () => {
  const entries = decodeZip(kit.bytes); entries.set('source/unlisted.txt', Buffer.from('extra'));
  assert.throws(() => verifyKit(encodeZip(entries), revision));
  for (const name of ['.env.local', 'web/.env.production', '.git/config', 'a/../b', 'a\\b', 'wallet.json', 'my-keypair.json', 'clock/private.key', 'db.dump', 'node_modules/a.js']) assert.throws(() => allowedSource(name));
  assert.equal(allowedSource('services/pact-api/.env.example'), 'services/pact-api/.env.example');
});
test('tree reconstruction rejects duplicate and file/directory collisions', () => {
  const file = {path: 'a', mode: '100644', gitBlob: 'a'.repeat(40)};
  assert.throws(() => sourceTree([file, file]));
  assert.throws(() => sourceTree([file, {...file, path: 'a/b'}]));
  assert.throws(() => sourceTree([{...file, mode: '120000'}]));
});
test('inherited Git pointer and configuration injection cannot redirect offline materialization', async () => {
  const original = {...process.env};
  const keys = {GIT_DIR: path.join(directory, 'DO_NOT_CREATE'), GIT_WORK_TREE: source,
    GIT_INDEX_FILE: path.join(directory, 'DO_NOT_WRITE'), GIT_OBJECT_DIRECTORY: path.join(directory, 'DO_NOT_WRITE_OBJECTS'),
    GIT_COMMON_DIR: path.join(directory, 'DO_NOT_WRITE_COMMON'), GIT_CONFIG_COUNT: '1',
    GIT_CONFIG_KEY_0: 'core.hooksPath', GIT_CONFIG_VALUE_0: path.join(directory, 'DO_NOT_EXECUTE'),
    GIT_CONFIG_PARAMETERS: "'core.bare=true'"};
  try {
    Object.assign(process.env, keys);
    const target = path.join(directory, 'git-environment-isolated');
    await materializeKit(kit.bytes, revision, kit.sha256, target);
    assert.equal((await createKit(source)).sha256, kit.sha256);
    for (const name of ['DO_NOT_CREATE', 'DO_NOT_WRITE', 'DO_NOT_WRITE_OBJECTS', 'DO_NOT_WRITE_COMMON'])
      await assert.rejects(fs.stat(path.join(directory, name)), {code: 'ENOENT'});
  } finally {
    for (const key of Object.keys(keys)) {if (original[key] === undefined) delete process.env[key]; else process.env[key] = original[key];}
  }
});
test('linked destination/output ancestors are rejected without writing through them', async () => {
  const actual = path.join(directory, 'actual-directory'), link = path.join(directory, 'linked-directory');
  await fs.mkdir(actual); await fs.symlink(actual, link, process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(realDirectory(path.join(link, 'output')), /Linked directory/);
  await assert.rejects(materializeKit(kit.bytes, revision, kit.sha256, path.join(link, 'checkout')), /Linked directory/);
  assert.deepEqual(await fs.readdir(actual), []);
  await assert.rejects(materializeKit(kit.bytes, revision, kit.sha256, path.parse(directory).root), {code: 'EEXIST'});
});
test.after(async () => {
  // All paths derive from the single mkdtemp allocation, never caller input.
  assert.equal(path.dirname(directory), os.tmpdir());
  await fs.rm(directory, {recursive: true, force: true});
});
