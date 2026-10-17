import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createWalletAuth } from '../dist/server.js';
import { signer, ORIGIN } from '../../../web/tests/platform/fixtures.mjs';

const server = new URL('../dist/server.js', import.meta.url).href;
const markers = ['VERCEL', 'AWS_LAMBDA_FUNCTION_NAME', 'AWS_EXECUTION_ENV', 'FUNCTIONS_WORKER_RUNTIME',
  'AZURE_FUNCTIONS_ENVIRONMENT', 'K_SERVICE', 'NETLIFY', 'NODE_UNIQUE_ID', 'WEB_CONCURRENCY'];
const authAttempt = `try { createWalletAuth({origin:${JSON.stringify(ORIGIN)},authMode:'single-process'}).challenge('11111111111111111111111111111111'); console.log(JSON.stringify({enabled:true})); }
catch(error) { console.log(JSON.stringify({enabled:false,code:error.code})); }`;
const script = `import {createWalletAuth} from ${JSON.stringify(server)};\n${authAttempt}`;
function child(source, extra = {}, filename) {
  const env = { ...process.env };
  for (const name of [...markers, 'NODE_OPTIONS', 'NODE_PATH', 'NODE_TEST_CONTEXT']) delete env[name];
  const result = spawnSync(process.execPath, filename ? [filename] : ['--input-type=module', '-e', source], {
    env: { ...env, ...extra }, encoding: 'utf8', timeout: 10000, windowsHide: true,
  });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout.trim());
}
function unavailable(result) { assert.deepEqual(result, { enabled: false, code: 'AUTH_UNAVAILABLE' }); }

test('authentication defaults disabled, including session and logout methods', () => {
  const auth = createWalletAuth({ origin: ORIGIN });
  for (const operation of [() => auth.challenge('11111111111111111111111111111111'),
    () => auth.session(), () => auth.logout()]) assert.throws(operation, error => error.code === 'AUTH_UNAVAILABLE');
});

test('explicit single-process mode works only with canonical one-process WEB_CONCURRENCY', async t => {
  assert.deepEqual(child(script), { enabled: true });
  assert.deepEqual(child(script, { WEB_CONCURRENCY: '1' }), { enabled: true });
  for (const value of ['', '0', '2', '-1', '1.0', '01', ' 1', 'NaN', 'unbounded'])
    await t.test(JSON.stringify(value), () => unavailable(child(script, { WEB_CONCURRENCY: value })));
});

test('known hosted/serverless environment markers fail closed before issuing a challenge', async t => {
  for (const marker of markers.filter(name => !['WEB_CONCURRENCY', 'NODE_UNIQUE_ID'].includes(name)))
    await t.test(marker, () => unavailable(child(script, { [marker]: 'independent-test-marker' })));
});

test('worker_threads cannot enable process-local authentication', () => {
  const workerSource = `const {parentPort}=require('node:worker_threads');
import(${JSON.stringify(server)}).then(({createWalletAuth})=>{
try{createWalletAuth({origin:${JSON.stringify(ORIGIN)},authMode:'single-process'}).challenge('11111111111111111111111111111111');parentPort.postMessage({enabled:true});}
catch(error){parentPort.postMessage({enabled:false,code:error.code});}});`;
  const source = `import {Worker} from 'node:worker_threads';
const worker=new Worker(${JSON.stringify(workerSource)},{eval:true,execArgv:[]});
worker.on('message',message=>console.log(JSON.stringify(message)));
worker.on('error',error=>{console.error(error);process.exitCode=1});`;
  unavailable(child(source));
});

test('a real cluster worker cannot enable process-local authentication', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'pact-auth-cluster-'));
  try {
    const filename = path.join(directory, 'cluster.mjs');
    await writeFile(filename, `import cluster from 'node:cluster';import {createWalletAuth} from ${JSON.stringify(server)};
if(cluster.isPrimary){cluster.setupPrimary({exec:${JSON.stringify(filename)}});const worker=cluster.fork();worker.on('exit',code=>{process.exitCode=code??1});}
else{${authAttempt};process.disconnect();}`);
    unavailable(child('', {}, filename));
  } finally {
    assert.ok(directory.startsWith(path.join(os.tmpdir(), 'pact-auth-cluster-')));
    await rm(directory, { recursive: true, force: true });
  }
});

test('restarted or independent process-local auth instance cannot accept prior challenge or session', () => {
  const identity = signer(), settings = { origin: ORIGIN, authMode: 'single-process', now: () => 1000 };
  const first = createWalletAuth(settings), restarted = createWalletAuth(settings);
  const challenge = first.challenge(identity.wallet);
  assert.throws(() => restarted.verify(challenge.challengeId, identity.signMessage(challenge.message), challenge.binding), error => error.code === 'AUTH_INVALID');
  const session = first.verify(challenge.challengeId, identity.signMessage(challenge.message), challenge.binding);
  assert.deepEqual(restarted.session(session.sessionId), { authenticated: false });
  assert.equal(first.session(session.sessionId).authenticated, true);
});

test('unsupported authentication topology is refused instead of silently enabling a different mode', () => {
  for (const authMode of ['distributed', 'serverless', 'single-process ', true])
    assert.throws(() => createWalletAuth({ origin: ORIGIN, authMode }), error => error.code === 'INVALID_INPUT');
});

test('challenge/session capacity preserves existing proof and rejects overflow without evicting authenticated session', () => {
  const identity = signer(), auth = createWalletAuth({ origin: ORIGIN, authMode: 'single-process', capacity: 1, now: () => 1000 });
  const outstanding = auth.challenge(identity.wallet);
  assert.throws(() => auth.challenge(identity.wallet), error => error.code === 'RATE_LIMITED');
  const session = auth.verify(outstanding.challengeId, identity.signMessage(outstanding.message), outstanding.binding);
  const another = auth.challenge(identity.wallet);
  assert.throws(() => auth.verify(another.challengeId, identity.signMessage(another.message), another.binding), error => error.code === 'RATE_LIMITED');
  assert.equal(auth.session(session.sessionId).authenticated, true);
  assert.throws(() => auth.verify(another.challengeId, identity.signMessage(another.message), another.binding), error => error.code === 'AUTH_INVALID');
});

test('concurrent replay authenticates exactly once and logout does not revive consumed proofs', async () => {
  const identity = signer(), auth = createWalletAuth({ origin: ORIGIN, authMode: 'single-process', now: () => 1000 });
  const challenge = auth.challenge(identity.wallet), signature = identity.signMessage(challenge.message);
  const results = await Promise.allSettled([0, 1].map(() => Promise.resolve().then(() => auth.verify(challenge.challengeId, signature, challenge.binding))));
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.filter(result => result.status === 'rejected').length, 1);
  const session = results.find(result => result.status === 'fulfilled').value;
  auth.logout(session.sessionId); assert.deepEqual(auth.session(session.sessionId), { authenticated: false });
  assert.throws(() => auth.verify(challenge.challengeId, signature, challenge.binding), error => error.code === 'AUTH_INVALID');
});
