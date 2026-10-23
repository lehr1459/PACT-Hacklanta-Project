// Read-only preparation/host checks. Never starts, pulls, builds or changes services.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {createKit} from '../../../scripts/release/staging-source.mjs';
const kit = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = path.resolve(kit, '../..');
const fields = ['PACT_STAGING_DOMAIN','PACT_PUBLIC_RPC_ORIGIN','PACT_API_IMAGE','PACT_WEB_IMAGE','PACT_CONFIG_DIRECTORY','PACT_PRIVATE_DIRECTORY','PACT_PG_DATA','PACT_CLOCK_DIRECTORY','PACT_SOURCE_REVISION'];
export function dockerEnvironment(values, ambient=process.env) {
  const operating=new Set(['PATH','HOME','USER','LOGNAME','LANG','LC_ALL','TMPDIR']);
  return {...Object.fromEntries(Object.entries(ambient).filter(([key])=>operating.has(key))), ...values};
}
export function parseConfiguration(text) {
  const values = {};
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    const match = /^([A-Z][A-Z0-9_]*)=([^\s"'`$\\]*)$/.exec(line);
    assert.ok(match && fields.includes(match[1]) && !Object.hasOwn(values, match[1]) && match[2] && !/OWNER_|REPLACE|EXAMPLE/.test(match[2]), 'Unconfigured/unsafe Compose input');
    values[match[1]] = match[2];
  }
  assert.deepEqual(Object.keys(values).sort(), [...fields].sort(), 'Exact configuration fields required');
  assert.ok(/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/.test(values.PACT_STAGING_DOMAIN));
  assert.ok(!/\.(?:invalid|test|example|localhost)$/.test(values.PACT_STAGING_DOMAIN));
  const rpc = new URL(values.PACT_PUBLIC_RPC_ORIGIN);
  assert.equal(rpc.protocol, 'https:'); assert.equal(rpc.origin, values.PACT_PUBLIC_RPC_ORIGIN); assert.ok(!rpc.username && !rpc.password);
  for (const key of ['PACT_API_IMAGE','PACT_WEB_IMAGE']) assert.match(values[key], /^(?:sha256:[a-f0-9]{64}|[a-z0-9./:_-]+@sha256:[a-f0-9]{64})$/, 'Immutable image identity required');
  assert.match(values.PACT_SOURCE_REVISION, /^[a-f0-9]{40}$/);
  for (const key of ['PACT_CONFIG_DIRECTORY','PACT_PRIVATE_DIRECTORY','PACT_PG_DATA','PACT_CLOCK_DIRECTORY']) assert.ok(values[key].startsWith('/') && !values[key].includes(',') && path.posix.normalize(values[key]) === values[key] && values[key] !== '/');
  const privatePaths = ['PACT_PRIVATE_DIRECTORY','PACT_PG_DATA','PACT_CLOCK_DIRECTORY'].map(key => values[key]);
  for (let i=0;i<privatePaths.length;i++) for(let j=0;j<privatePaths.length;j++) if(i!==j) assert.ok(!privatePaths[i].startsWith(privatePaths[j]+'/') && privatePaths[i]!==privatePaths[j], 'Private mounts must be separate');
  return values;
}
export function validateCompose(compose) {
  assert.equal(compose.name, 'pact-staging');
  assert.deepEqual(Object.keys(compose.services).sort(), ['api','gateway','migrate','postgres','web']);
  for (const [name, service] of Object.entries(compose.services)) {
    assert.equal(service.network_mode, 'host'); assert.equal(service.pull_policy, 'never');
    assert.equal(service.restart, 'no'); assert.equal(service.read_only, true);
    assert.deepEqual(service.cap_drop, ['ALL']); assert.deepEqual(service.security_opt, ['no-new-privileges:true']);
    assert.ok(service.profiles.length === 1 && !service.ports && !service.build && !service.privileged && !service.deploy && !service.env_file);
    assert.ok(service.mem_limit && service.pids_limit && service.cpus && service.user !== '0:0');
    assert.equal(service.logging.driver, 'none');
    assert.ok(!service.cap_add || (name === 'gateway' && JSON.stringify(service.cap_add) === '["NET_BIND_SERVICE"]'));
    assert.ok(service.volumes.every(volume => volume.type === 'bind' && volume.bind.create_host_path === false));
  }
  assert.equal(compose.services.api.environment.PACT_HOSTED_HOST, '127.0.0.1');
  assert.equal(compose.services.api.environment.PACT_HOSTED_PROCESS_MODEL, 'single-persistent-process');
  assert.deepEqual(compose.services.migrate.entrypoint, ['node','/pact-staging/inject-runtime.mjs','migrate']);
  assert.equal(compose.services.migrate.profiles[0], 'operations');
  assert.ok(compose.services.migrate.volumes.some(v => v.source.endsWith('/api-migrate.json') && v.target === '/run/secrets/api-runtime.json'));
  assert.equal(compose.services.migrate.volumes.find(v=>v.target==='/pact-clock').read_only, true);
  assert.equal(compose.services.gateway.profiles[0], 'ingress');
  assert.match(compose.services.gateway.image, /^caddy:2\.11\.7@sha256:[a-f0-9]{64}$/);
  assert.match(compose.services.postgres.image, /^postgres:18\.4-bookworm@sha256:[a-f0-9]{64}$/);
  assert.equal(compose.services.web.environment.PACT_NETWORK, 'devnet');
  assert.equal(compose.services.web.environment.PACT_HOSTED_API_INTERNAL_URL, 'http://127.0.0.1:4100');
  return true;
}
async function existingPath(value, {directory=false, uid, privateMode=false}={}) {
  let cursor = '/';
  for (const part of value.split('/').filter(Boolean)) {
    cursor = path.join(cursor, part); const stat = await fs.lstat(cursor);
    assert.ok(!stat.isSymbolicLink(), 'Linked configuration path forbidden');
  }
  const stat = await fs.lstat(value);
  assert.ok(directory ? stat.isDirectory() : stat.isFile());
  if (uid !== undefined) assert.equal(stat.uid, uid);
  if (privateMode) assert.equal(stat.mode & 0o077, 0);
}
async function main() {
  const compose = JSON.parse(await fs.readFile(path.join(kit, 'compose.json'))); validateCompose(compose);
  if (process.argv[2] === '--static' && process.argv.length === 3) {
    console.log(JSON.stringify({staticConfigurationVerified:true, dockerExecuted:false, configured:false, hostedApproved:false})); return;
  }
  assert.equal(process.argv.length, 4, 'Use preflight.mjs NONSECRET_COMPOSE_ENV EXACT_SOURCE_SHA');
  assert.equal(process.platform, 'linux'); assert.equal(process.arch, 'x64');
  const filename = path.resolve(process.argv[2]); await existingPath(filename);
  assert.ok(!filename.startsWith(root+'/'), 'Operator configuration must be outside checkout');
  const values = parseConfiguration(await fs.readFile(filename, 'utf8'));
  assert.equal(values.PACT_SOURCE_REVISION, process.argv[3]);
  const source = await createKit(root); assert.equal(source.manifest.sourceRevision, process.argv[3]);
  assert.equal(process.version, 'v'+source.manifest.runtime.node);
  assert.equal(values.PACT_CONFIG_DIRECTORY, kit);
  for (const [key,uid] of [['PACT_PRIVATE_DIRECTORY',1000],['PACT_PG_DATA',999],['PACT_CLOCK_DIRECTORY',1000]]) await existingPath(values[key], {directory:true, uid, privateMode:true});
  for (const name of ['api-runtime.json','api-migrate.json','web-runtime.json']) await existingPath(values.PACT_PRIVATE_DIRECTORY+'/'+name, {uid:1000,privateMode:true});
  for (const name of ['postgres-password','postgres-tls/server.key']) await existingPath(values.PACT_PRIVATE_DIRECTORY+'/'+name, {uid:999,privateMode:true});
  await existingPath(values.PACT_PRIVATE_DIRECTORY+'/gateway-tls/privkey.pem',{uid:1000,privateMode:true});
  for(const name of ['postgres-tls/ca.crt','postgres-tls/server.crt','gateway-tls/fullchain.pem']) await existingPath(values.PACT_PRIVATE_DIRECTORY+'/'+name);
  await assert.rejects(fs.lstat(values.PACT_CLOCK_DIRECTORY+'/owner.lock'), {code:'ENOENT'});
  // Force the local Linux daemon; remote contexts cannot validate local mounts.
  // Explicit parsed interpolation values beat ambient Compose/PACT overrides.
  const run = args => execFileSync('docker', ['--host=unix:///var/run/docker.sock',...args], {cwd:root, env:dockerEnvironment(values), windowsHide:true, stdio:['ignore','pipe','pipe']});
  run(['compose','version']); run(['info','--format','{{.OSType}}']).toString().trim()==='linux'||assert.fail('Linux Docker engine required');
  const resolved=JSON.parse(run(['compose','--env-file',filename,'-f',path.join(kit,'compose.json'),'config','--format','json']));
  assert.equal(resolved.services.api.image,values.PACT_API_IMAGE); assert.equal(resolved.services.web.image,values.PACT_WEB_IMAGE);
  assert.equal(resolved.services.api.environment.PACT_HOSTED_ORIGIN,'https://'+values.PACT_STAGING_DOMAIN);
  assert.equal(resolved.services.web.environment.PACT_APP_ORIGIN,'https://'+values.PACT_STAGING_DOMAIN);
  for(const name of ['api','migrate']) {
    assert.equal(resolved.services[name].volumes.find(v=>v.target==='/pact-clock').source,values.PACT_CLOCK_DIRECTORY);
    assert.equal(resolved.services[name].volumes.find(v=>v.target==='/run/secrets/api-runtime.json').source,values.PACT_PRIVATE_DIRECTORY+(name==='migrate'?'/api-migrate.json':'/api-runtime.json'));
  }
  assert.equal(resolved.services.postgres.volumes.find(v=>v.target==='/var/lib/postgresql').source,values.PACT_PG_DATA);
  for(const image of [values.PACT_API_IMAGE,values.PACT_WEB_IMAGE,compose.services.postgres.image,compose.services.gateway.image]) {
    const inspected=JSON.parse(run(['image','inspect',image]))[0]; assert.equal(inspected.Os,'linux'); assert.equal(inspected.Architecture,'amd64');
    if([values.PACT_API_IMAGE,values.PACT_WEB_IMAGE].includes(image)) assert.equal(inspected.Config.Labels?.['org.opencontainers.image.revision'],values.PACT_SOURCE_REVISION);
    if(image===values.PACT_WEB_IMAGE) assert.equal(inspected.Config.Labels?.['org.pact.staging.origin'],'https://'+values.PACT_STAGING_DOMAIN);
  }
  console.log(JSON.stringify({hostConfigurationPreflightVerified:true, sourceRevision:process.argv[3], imageContentAcceptanceRequired:true, servicesStarted:false, hostedApproved:false}));
}
if(process.argv[1] && import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href) main().catch(()=>{console.error('PACT staging preflight failed; check exact source, configuration, private paths, stopped clock owner and preloaded Linux images.');process.exitCode=1;});
