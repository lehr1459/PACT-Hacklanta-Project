// Owner-run private build only. No Docker start/build, network deployment or publication.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {npmCli, validationEnv} from '../../../scripts/validation/common.mjs';
import {createKit, realDirectory} from '../../../scripts/release/staging-source.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const [file, expectedRevision] = process.argv.slice(2);
const rehearsal = file === '--rehearsal';
try {
  assert.match(expectedRevision ?? '', /^[a-f0-9]{40}$/);
  assert.ok(rehearsal || (file && path.isAbsolute(file)), 'Use an external nonsecret configuration path');
  let config;
  if (rehearsal) config = {PACT_APP_ORIGIN: 'http://127.0.0.1:3000', NEXT_PUBLIC_SOLANA_RPC_URL: 'https://api.devnet.solana.com'};
  else {
  const relative = path.relative(root, path.resolve(file));
  assert.ok(relative.startsWith('..' + path.sep) || path.isAbsolute(relative), 'Build configuration must be outside checkout');
  const stat = await fs.lstat(file); assert.ok(stat.isFile() && !stat.isSymbolicLink() && stat.size <= 8192);
  config = JSON.parse(await fs.readFile(file, 'utf8'));
  assert.deepEqual(Object.keys(config).sort(), ['NEXT_PUBLIC_SOLANA_RPC_URL', 'PACT_APP_ORIGIN']);
  for (const value of Object.values(config)) {
    assert.equal(typeof value, 'string');
    const url = new URL(value); assert.equal(url.protocol, 'https:');
    assert.equal(url.origin, value); assert.ok(!url.username && !url.password && !url.port);
    assert.ok(!/OWNER_|\.invalid$|localhost|127\.0\.0\.1/.test(value));
  }
  }
  const before = await createKit(root); assert.equal(before.manifest.sourceRevision, expectedRevision);
  const runtime = before.manifest.runtime; assert.equal(process.version, 'v' + runtime.node);
  assert.equal(execFileSync(process.execPath, [npmCli(), '--version'], {encoding: 'utf8', windowsHide: true}).trim(), runtime.npm);
  const output = path.join(root, '.deployment-candidates/staging', expectedRevision, rehearsal ? 'web-rehearsal-context' : 'web-context');
  await realDirectory(output, {newFinal: true});
  const emptyUser = path.join(output, '.empty-user.npmrc'), emptyGlobal = path.join(output, '.empty-global.npmrc');
  await fs.writeFile(emptyUser, '', {mode: 0o600}); await fs.writeFile(emptyGlobal, '', {mode: 0o600});
  const supplied = validationEnv({...config, PACT_ENV_PROFILE: rehearsal ? 'test' : 'hosted', PACT_NETWORK: 'devnet',
    PACT_AUTH_MODE: 'disabled', PACT_PROCESS_MODEL: 'stateless', PACT_SERVER_POLICY: 'disabled',
    NEXT_PUBLIC_PACT_SOLANA_PROGRAM_ID: 'EiiiWWsW2kkqP6nugHz6iBADvhnW5xnibAtZ82ZExVqy',
    NEXT_PUBLIC_RPC_URL: 'https://sepolia.base.org', SOLANA_RPC_URL: config.NEXT_PUBLIC_SOLANA_RPC_URL,
    npm_config_userconfig: emptyUser, npm_config_globalconfig: emptyGlobal, npm_config_registry: 'https://registry.npmjs.org/'});
  const operating = new Set(['PATH','PATHEXT','SystemRoot','SYSTEMROOT','WINDIR','ComSpec','COMSPEC','TEMP','TMP','HOME','USERPROFILE','LOCALAPPDATA','APPDATA','LANG','LC_ALL']);
  const npmKeys = new Set(['npm_config_userconfig', 'npm_config_globalconfig', 'npm_config_registry']);
  const env = Object.fromEntries(Object.entries(supplied).filter(([key]) => operating.has(key) || npmKeys.has(key) || /^(?:PACT_|NEXT_PUBLIC_|SOLANA_|NEXT_TELEMETRY_DISABLED$)/.test(key)));
  env.PATH = path.dirname(process.execPath) + path.delimiter + (process.env.PATH ?? '');
  const run = (cwd, args) => execFileSync(process.execPath, args, {cwd: path.join(root, cwd), env, windowsHide: true, stdio: 'inherit'});
  run('packages/pact-sdk', [npmCli(), 'ci', '--no-audit', '--fund=false']);
  run('packages/pact-sdk', [npmCli(), 'run', 'build']);
  run('web', [npmCli(), 'ci', '--no-audit', '--fund=false']);
  run('web', ['node_modules/next/dist/bin/next', 'build']);
  const after = await createKit(root); assert.equal(after.sha256, before.sha256, 'Source changed during production build');
  const saved = JSON.parse(await fs.readFile(path.join(root, 'web/.next/required-server-files.json')));
  assert.equal(saved.config.env.PACT_BUILD_SOURCE_REVISION, expectedRevision);
  for (const name of ['PACT_BUILD_SOURCE_CLEAN', 'PACT_BUILD_ENV_FILES_ABSENT', 'PACT_BUILD_PUBLIC_ENV_SAFE']) assert.equal(saved.config.env[name], 'true');
  const binding = JSON.parse(saved.config.env.PACT_BUILD_BINDING_JSON);
  assert.equal(binding.profile, rehearsal ? 'test' : 'hosted');
  const files = [];
  async function copy(from, to) {
    const item = await fs.lstat(from); assert.ok(!item.isSymbolicLink(), 'Linked build context entry forbidden');
    if (item.isDirectory()) {
      for (const entry of await fs.readdir(from)) {
        if (from === path.join(root, 'web/.next') && ['cache', 'dev'].includes(entry)) continue;
        await copy(path.join(from, entry), path.posix.join(to, entry));
      }
    } else {
      assert.ok(item.isFile() && item.size <= 50_000_000 && !/(?:^|\/)(?:\.env[^/]*|node_modules|\.git)(?:\/|$)/.test(to));
      const bytes = await fs.readFile(from), target = path.join(output, to);
      await fs.mkdir(path.dirname(target), {recursive: true, mode: 0o700});
      await fs.writeFile(target, bytes, {flag: 'wx', mode: 0o600});
      files.push({path: to, sizeBytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex')});
    }
  }
  for (const name of ['packages/pact-sdk/package.json', 'packages/pact-sdk/package-lock.json', 'packages/pact-sdk/dist',
    'web/package.json', 'web/package-lock.json', 'web/.next', 'web/public', 'scripts/validation/environment.mjs']) await copy(path.join(root, name), name);
  await copy(path.join(root, 'deployment/staging/Web.Dockerfile'), 'Dockerfile');
  // This start-only loader is relocated into web/, so its helper is one level up.
  const loader = (await fs.readFile(path.join(root, 'deployment/staging/next.runtime.mjs'), 'utf8')).replace("'./scripts/", "'../scripts/");
  await fs.writeFile(path.join(output, 'web/next.config.mjs'), loader, {flag: 'wx', mode: 0o600});
  files.push({path: 'web/next.config.mjs', sizeBytes: Buffer.byteLength(loader), sha256: createHash('sha256').update(loader).digest('hex')});
  await fs.unlink(emptyUser); await fs.unlink(emptyGlobal);
  const manifest = {schemaVersion: 1, kind: rehearsal ? 'private-test-web-context' : 'private-domain-bound-web-context', sourceRevision: expectedRevision,
    sourceArchiveSha256: before.sha256, runtime, binding, buildId: (await fs.readFile(path.join(root, 'web/.next/BUILD_ID'), 'utf8')).trim(),
    cleanBefore: true, cleanAfter: true, testOnly: rehearsal, dockerExecuted: false, hostedApproved: false, files: files.sort((a, b) => a.path.localeCompare(b.path))};
  await fs.writeFile(path.join(output, 'web-runtime-manifest.json'), JSON.stringify(manifest, null, 2) + '\n', {flag: 'wx', mode: 0o600});
  console.log(JSON.stringify({built: true, sourceRevision: expectedRevision, context: output, hostedApproved: false}));
} catch {
  console.error('Private staging web build failed. Verify approved origin, clean exact source, pinned runtime and private local build logs.');
  process.exitCode = 1;
}
