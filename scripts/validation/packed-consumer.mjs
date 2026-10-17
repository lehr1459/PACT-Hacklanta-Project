// Install and exercise the actual SDK tarball outside this repository.
// No symlinked dependencies, registry publication, wallet or network transaction.
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {runDocumentationExamples} from './documentation.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sdk = path.join(repo, 'packages/pact-sdk');
const args = process.argv.slice(2);
assert.ok(args.length === 0 || args.length === 2 && args[0] === '--output', 'Usage: packed-consumer.mjs [--output directory]');
const output = path.resolve(args[1] ?? path.join(repo, 'web/test-results/packed-consumer'));
await fs.mkdir(output, {recursive: true});
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'pact-packed-consumer-'));
const checks = [];
const gitStamp=()=>({revision:execFileSync('git',['rev-parse','HEAD'],{cwd:repo,encoding:'utf8',windowsHide:true}).trim(),workingTreeClean:execFileSync('git',['status','--porcelain','--untracked-files=all'],{cwd:repo,encoding:'utf8',windowsHide:true}).trim()===''});
const report = {status: 'running', temporary, node: process.version, ...gitStamp(), checks};
const manifest = JSON.parse(await fs.readFile(path.join(sdk, 'package.json'), 'utf8'));
const web = JSON.parse(await fs.readFile(path.join(repo, 'web/package.json'), 'utf8'));
const pins = {...web.dependencies, ...web.devDependencies};
function pin(name) {
  assert.match(pins[name] ?? '', /^\d+\.\d+\.\d+(?:-[\w.-]+)?$/, `${name} must have an exact consumer version`);
  return pins[name];
}
const environment = {...process.env, NEXT_TELEMETRY_DISABLED: '1', CI: '1'};
// Do not let inherited fixture modes, module search paths or auth runtime flags
// affect the independently installed package or the persistent Node test server.
for (const key of Object.keys(environment)) {
  if (/^(?:NODE_PATH|NODE_OPTIONS|NEXT_PUBLIC_|PACT_|SOLANA_|VERCEL(?:_|$)|AWS_LAMBDA_)/.test(key)) delete environment[key];
}
function passed(name, details = {}) {
  checks.push({name, status: 'pass', ...details});
  console.log(`[packed-consumer] PASS ${name}`);
}
async function write(root, file, contents) {
  const target = path.join(root, file);
  await fs.mkdir(path.dirname(target), {recursive: true});
  await fs.writeFile(target, contents);
}
async function executable(file) {
  try { await fs.access(file); return file; } catch { return undefined; }
}
async function npmCli() {
  const possibilities = [
    path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js'),
    path.resolve(path.dirname(process.execPath), '../lib/node_modules/npm/bin/npm-cli.js'),
    process.env.npm_execpath,
  ];
  for (const directory of (process.env.PATH ?? '').split(path.delimiter)) possibilities.push(path.join(directory, 'node_modules/npm/bin/npm-cli.js'));
  for (const candidate of possibilities) if (candidate && /npm-cli\.js$/.test(candidate) && await executable(candidate)) return candidate;
  throw Error('Cannot locate npm-cli.js; run with a supported Node/npm installation.');
}
const npm = await npmCli();
let sequence = 0;
async function run(label, commandArgs, cwd, {allowFailure = false, env = {}, timeout = 300000} = {}) {
  const logfile = path.join(output, `${String(++sequence).padStart(2, '0')}-${label}.log`);
  const chunks = [];
  const child = spawn(process.execPath, commandArgs, {cwd, env: {...environment, ...env}, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true});
  const collect = data => chunks.push(data);
  child.stdout.on('data', collect); child.stderr.on('data', collect);
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; child.kill(); }, timeout);
  let code;
  try {
    code = await new Promise((resolve, reject) => {child.once('error', reject); child.once('close', resolve);});
  } finally { clearTimeout(timer); }
  const text = Buffer.concat(chunks).toString('utf8');
  await fs.writeFile(logfile, text);
  if (timedOut || code !== 0 && !allowFailure) throw Error(`${label} ${timedOut ? 'timed out' : `exited ${code}`}; see ${logfile}\n${text.slice(-1800)}`);
  return {code, text, logfile};
}
const install = (root, label) => run(label, [npm, 'install', '--ignore-scripts', '--no-audit', '--no-fund', '--prefer-offline'], root);
const node = (root, file, label) => run(label, [file], root);
async function assertLocalDependency(root, name) {
  const require = createRequire(path.join(root, 'package.json'));
  const resolved = await fs.realpath(require.resolve(name));
  const modules = path.join(await fs.realpath(root), 'node_modules') + path.sep;
  assert.ok(resolved.startsWith(modules), `${name} resolved outside consumer: ${resolved}`);
  assert.ok(!resolved.startsWith(repo + path.sep), `${name} leaked from the repository`);
  assert.equal((await fs.lstat(path.join(root, 'node_modules/@pact/sdk'))).isSymbolicLink(), false, 'SDK must be extracted from the tarball');
  return resolved;
}
async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {server.once('error', reject); server.listen(0, '127.0.0.1', resolve);});
  const port = server.address().port;
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  return port;
}
async function startNext(root) {
  // Next's local Request URL uses localhost; configure that exact origin rather
  // than relaxing the SDK's same-origin check (the listener stays loopback).
  const port = await freePort(), origin = `http://localhost:${port}`;
  const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', String(port)], {
    cwd: root, env: {...environment, PACT_CONSUMER_ORIGIN: origin}, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
  });
  const chunks = []; let exited = false;
  child.stdout.on('data', data => chunks.push(data)); child.stderr.on('data', data => chunks.push(data));
  child.once('exit', () => {exited = true;});
  const stop = async () => {
    if (!exited) {
      const closed = new Promise(resolve => child.once('close', resolve));
      child.kill(); await closed;
    }
    await fs.writeFile(path.join(output, 'next-start.log'), Buffer.concat(chunks));
  };
  try {
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline && !exited) {
      try { const response = await fetch(origin, {signal: AbortSignal.timeout(1000)}); if (response.ok) return {origin, stop}; } catch {}
      await new Promise(resolve => setTimeout(resolve, 150));
    }
    throw Error(`Isolated Next server did not become ready: ${Buffer.concat(chunks).toString('utf8')}`);
  } catch (error) { await stop(); throw error; }
}

try {
  await run('sdk-build', [npm, 'run', 'build'], sdk);
  const packed = await run('npm-pack', [npm, 'pack', '--ignore-scripts', '--json', '--pack-destination', temporary], sdk);
  const [pack] = JSON.parse(packed.text);
  const archive = path.join(temporary, pack.filename);
  await fs.copyFile(archive, path.join(output, pack.filename));
  assert.equal(pack.name, '@pact/sdk'); assert.equal(pack.version, manifest.version);
  const entries = new Set(pack.files.map(file => file.path));
  for (const name of ['.', './checkout', './widget', './v1', './server', './react', './pact-checkout.mjs', './pact-checkout.js']) assert.ok(Object.hasOwn(manifest.exports, name), `Missing compatible export ${name}`);
  for (const target of Object.values(manifest.exports)) for (const file of typeof target === 'string' ? [target] : Object.values(target)) assert.ok(entries.has(file.replace(/^\.\//, '')), `Missing packaged export ${file}`);
  for (const entry of entries) assert.ok(['package.json','README.md','CHANGELOG.md','DISTRIBUTION.md'].includes(entry) || entry.startsWith('dist/'), `Unexpected package content ${entry}`);
  report.package = {version: manifest.version, filename: pack.filename, integrity: pack.integrity, sha256: createHash('sha256').update(await fs.readFile(archive)).digest('hex'), files: [...entries]};
  passed('tarball contents and all compatible exports', {files: entries.size});

  const plain = path.join(temporary, 'plain');
  await fs.mkdir(plain);
  await write(plain, 'package.json', JSON.stringify({name: 'pact-isolated-plain', private: true, type: 'module', dependencies: {'@pact/sdk': `file:${archive}`}, devDependencies: {typescript: pin('typescript'), '@types/node': pin('@types/node')}}, null, 2));
  await install(plain, 'plain-install');
  for (const file of ['package.json', 'package-lock.json']) await fs.copyFile(path.join(plain, file), path.join(output, `plain-${file}`));
  await assertLocalDependency(plain, '@pact/sdk'); await assertLocalDependency(plain, 'typescript');
  const plainRequire = createRequire(path.join(plain, 'package.json'));
  assert.throws(() => plainRequire.resolve('react'), /Cannot find module/, 'Optional React must not be silently installed');
  await write(plain, 'plain.mjs', `import assert from 'node:assert/strict';
import {generateKeyPairSync, sign} from 'node:crypto';
import {createPactClient, PACT_PROGRAM_ID, isLicenseStatusFresh} from '@pact/sdk';
import {createCheckoutClient} from '@pact/sdk/checkout';
import {mountCheckout} from '@pact/sdk/widget';
import {PactClient} from '@pact/sdk/v1';
import {createWalletAuth, createPactApiHandler} from '@pact/sdk/server';
assert.equal(typeof window,'undefined'); assert.equal(typeof document,'undefined');
assert.equal(PACT_PROGRAM_ID,'EiiiWWsW2kkqP6nugHz6iBADvhnW5xnibAtZ82ZExVqy');
assert.equal(typeof createCheckoutClient,'function'); assert.equal(typeof PactClient,'function');
assert.throws(()=>mountCheckout({element:'#absent'}),/browser document/);
let calls=0;const client=createPactClient({fetch:async()=>{calls++;throw Error('No external RPC allowed');}});
assert.equal(await client.verifyLicense({offer:'invalid',wallet:'invalid'}),false);assert.equal(calls,0);
assert.equal(isLicenseStatusFresh({program:PACT_PROGRAM_ID,offer:'x',wallet:'y',licensePda:'z',state:'active',active:true,contextSlot:1,chainTimestamp:'1000',expiry:'1001',startedAtMs:0,receivedAtMs:0,lastProgressAtMs:0},0),true);
assert.equal(isLicenseStatusFresh({state:'active',active:true,chainTimestamp:'1000',expiry:'1001',startedAtMs:0,receivedAtMs:0,lastProgressAtMs:0},1000),false);
const keys=generateKeyPairSync('ed25519'),bytes=keys.publicKey.export({format:'der',type:'spki'}).subarray(-32);
let value=BigInt('0x'+bytes.toString('hex')),wallet='';const alphabet='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
while(value){wallet=alphabet[Number(value%58n)]+wallet;value/=58n;}for(const byte of bytes){if(byte!==0)break;wallet='1'+wallet;}
const auth=createWalletAuth({origin:'http://localhost:4021',authMode:'single-process'}),challenge=auth.challenge(wallet);
const result=auth.verify(challenge.challengeId,sign(null,Buffer.from(challenge.message),keys.privateKey).toString('base64'),challenge.binding);
assert.equal(result.walletAddress,wallet);auth.logout(result.sessionId);assert.equal(auth.session(result.sessionId).authenticated,false);
const api=createPactApiHandler({origin:'http://localhost:4021',authMode:'single-process'});
const response=await api(new Request('http://localhost:4021/api/v1/auth/session'));assert.equal(response.status,200);assert.equal((await response.json()).authenticated,false);
await assert.rejects(import('@pact/sdk/react'),/Cannot find package 'react'/);
console.log('PASS Node, plain JS, server-only behavior, optional React absence and SSR-safe imports');
`);
  await node(plain, 'plain.mjs', 'plain-behavior');
  passed('Node/vanilla JS/server behavior without React or DOM');
  await write(plain, 'consumer.ts', `import {createPactClient, type LicenseStatus} from '@pact/sdk';
import {createCheckoutClient, type WalletAdapter} from '@pact/sdk/checkout';
import {mountCheckout, type CheckoutController} from '@pact/sdk/widget';
import {PactClient} from '@pact/sdk/v1';
import {createPactApiHandler, type PactApiOptions} from '@pact/sdk/server';
const options:PactApiOptions={origin:'http://localhost:4021',authMode:'single-process'};
const api=createPactApiHandler(options);const client=createPactClient();
const status:Promise<LicenseStatus>=client.getLicenseStatus({offer:'not-executed',wallet:'not-executed'});
void [api,status,createCheckoutClient,mountCheckout,PactClient];
export type ConsumerTypes={adapter:WalletAdapter;controller:CheckoutController};
`);
  const typeOptions = {target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext', strict: true, noEmit: true, skipLibCheck: false, lib: ['ES2022', 'DOM'], types: ['node']};
  await write(plain, 'tsconfig.json', JSON.stringify({compilerOptions: typeOptions, include: ['consumer.ts']}));
  await run('plain-types', ['node_modules/typescript/bin/tsc', '--noEmit'], plain);
  passed('vanilla TypeScript public declarations with React absent');
  await runDocumentationExamples({consumerDirectory:plain,outputDirectory:path.join(output,'documentation')});
  passed('portable documentation examples against the installed SDK tarball');

  const app = path.join(temporary, 'next');
  await fs.mkdir(app);
  const dependencies = {'@pact/sdk': `file:${archive}`, next: pin('next'), react: pin('react'), 'react-dom': pin('react-dom')};
  const devDependencies = Object.fromEntries(['typescript', '@types/node', '@types/react', '@types/react-dom', '@playwright/test'].map(name => [name, pin(name)]));
  report.consumerVersions = {...dependencies, ...devDependencies};
  await write(app, 'package.json', JSON.stringify({name: 'pact-isolated-next', private: true, type: 'module', dependencies, devDependencies}, null, 2));
  await install(app, 'next-install');
  for (const file of ['package.json', 'package-lock.json']) await fs.copyFile(path.join(app, file), path.join(output, `next-${file}`));
  for (const name of ['@pact/sdk', 'react', 'next', '@playwright/test', 'typescript']) await assertLocalDependency(app, name);
  passed('clean tarball installations without sibling dependency leakage');
  await write(app, 'ssr.mjs', `import assert from 'node:assert/strict';
import {createElement} from 'react';import {renderToString} from 'react-dom/server';
import {PactCheckout} from '@pact/sdk/react';
assert.equal(typeof window,'undefined');assert.equal(typeof document,'undefined');
const html=renderToString(createElement(PactCheckout,{offer:'11111111111111111111111111111111',programId:'EiiiWWsW2kkqP6nugHz6iBADvhnW5xnibAtZ82ZExVqy',rpcUrl:'http://127.0.0.1:4022'}));
assert.match(html,/<div/);console.log('PASS React server render without DOM or wallet');
`);
  await node(app, 'ssr.mjs', 'react-ssr');
  passed('React optional entrypoint and real server rendering');

  // Test data only: copied JSON is not an import path into the source checkout.
  const fixtures = await import(pathToFileURL(path.join(sdk, 'tests/fixtures.mjs')).href);
  const fixture = {offer: fixtures.offer.toBase58(), wallet: fixtures.wallet.toBase58(), license: fixtures.license.toBase58(), snapshot: fixtures.fixture(), genesis: fixtures.GENESIS, program: fixtures.PROGRAM};
  await write(app, 'fixture.json', JSON.stringify(fixture));
  const options = JSON.stringify({offer: fixture.offer, programId: fixture.program, rpcUrl: 'http://127.0.0.1:4022'});
  const react18=path.join(temporary,'react18');await fs.mkdir(react18);
  await write(react18,'package.json',JSON.stringify({name:'pact-isolated-react18',private:true,type:'module',dependencies:{'@pact/sdk':`file:${archive}`,react:'18.3.1','react-dom':'18.3.1'},devDependencies:{esbuild:manifest.devDependencies.esbuild}},null,2));
  await install(react18,'react18-install');
  for(const name of ['@pact/sdk','react','react-dom','esbuild'])await assertLocalDependency(react18,name);
  await write(react18,'ssr.mjs',`import assert from 'node:assert/strict';import React,{createElement} from 'react';import {renderToString} from 'react-dom/server';import {PactCheckout} from '@pact/sdk/react';assert.equal(React.version,'18.3.1');assert.match(renderToString(createElement(PactCheckout,${options})),/PACT embedded checkout/);`);
  await node(react18,'ssr.mjs','react18-ssr');
  await write(react18,'consumer.mjs',`import React,{createElement} from 'react';import {createRoot} from 'react-dom/client';import {PactCheckout} from '@pact/sdk/react';createRoot(document.getElementById('root')).render(createElement(React.StrictMode,null,createElement('output',{id:'react-version'},React.version),createElement(PactCheckout,${options})));`);
  await write(react18,'bundle.mjs',`import {build} from 'esbuild';await build({entryPoints:['consumer.mjs'],bundle:true,platform:'browser',format:'esm',target:'es2022',outfile:'consumer.js'});`);
  await node(react18,'bundle.mjs','react18-browser-bundle');
  await write(app,'public/react18.js',await fs.readFile(path.join(react18,'consumer.js')));
  await write(app,'public/react18.html','<!doctype html><html lang="en"><head><title>React18 packed SDK</title></head><body><div id="root"></div><script type="module" src="/react18.js"></script></body></html>');
  await fs.copyFile(path.join(react18,'package-lock.json'),path.join(output,'react18-package-lock.json'));
  await write(app, 'app/layout.tsx', `import type {ReactNode} from 'react';export default function Layout({children}:{children:ReactNode}){return <html lang="en"><body>{children}</body></html>;}`);
  await write(app, 'app/page.tsx', `import Consumer from './consumer';export default function Page(){return <main><h1>Packed SDK consumer</h1><Consumer /></main>;}`);
  await write(app, 'app/consumer.tsx', `'use client';
import {useEffect,useState} from 'react';
import {createPactClient} from '@pact/sdk';
import {PactCheckout} from '@pact/sdk/react';
export default function Consumer(){const [state,setState]=useState('ssr');
useEffect(()=>{let mounted=true;const client=createPactClient({rpcUrl:'http://127.0.0.1:4022'});void client.getLicenseStatus({offer:${JSON.stringify(fixture.offer)},wallet:${JSON.stringify(fixture.wallet)}}).then(status=>{if(mounted)setState(status.state);},()=>{if(mounted)setState('error');});return()=>{mounted=false;};},[]);
return <><output id="verification">{state}</output><div id="react-checkout"><PactCheckout {...${options}} /></div></>;}
`);
  await write(app, 'app/api/pact/[...path]/route.ts', `import {createPactApiHandler} from '@pact/sdk/server';
export const runtime='nodejs';
const handler=createPactApiHandler({origin:process.env.PACT_CONSUMER_ORIGIN??'http://localhost:4021',prefix:'/api/pact',authMode:'single-process'});
export const GET=handler;export const POST=handler;export const OPTIONS=handler;
`);
  await write(app, 'tsconfig.json', JSON.stringify({compilerOptions: {target: 'ES2022', lib: ['DOM', 'DOM.Iterable', 'ES2022'], strict: true, noEmit: true, esModuleInterop: true, module: 'ESNext', moduleResolution: 'bundler', jsx: 'react-jsx', skipLibCheck: true, plugins: [{name: 'next'}]}, include: ['**/*.ts', '**/*.tsx', '.next/types/**/*.ts'], exclude: ['node_modules']}));
  await write(app, 'next.config.mjs', `export default {turbopack:{root:${JSON.stringify(app)}}};`);
  const extracted = path.join(app, 'node_modules/@pact/sdk');
  for (const name of ['pact-checkout.mjs', 'pact-checkout.js']) {
    const bytes = await fs.readFile(path.join(extracted, 'dist', name));
    assert.doesNotMatch(bytes.toString('utf8'), /node:(?:crypto|async_hooks|cluster|worker_threads)|function createWalletAuth/, 'Browser asset contains server-only implementation');
    await write(app, `public/${name}`, bytes);
  }
  await write(app, 'public/vanilla.html', '<!doctype html><html lang="en"><head><title>Packed vanilla consumer</title></head><body><div id="esm"></div><div id="iife"></div><script src="/pact-checkout.js"></script></body></html>');
  await run('next-production-build', ['node_modules/next/dist/bin/next', 'build'], app);
  await run('next-types', ['node_modules/typescript/bin/tsc', '--noEmit'], app);
  passed('Next production build, public types and Node server entrypoint');
  const server = await startNext(app);
  try {
    const ssr = await fetch(server.origin).then(response => response.text());
    assert.match(ssr, /Packed SDK consumer/); assert.match(ssr, /id="verification">ssr/);
    const session = await fetch(`${server.origin}/api/pact/auth/session`), sessionBody = await session.json();
    assert.equal(session.status, 200, JSON.stringify(sessionBody)); assert.equal(sessionBody.authenticated, false);
    const challenge = await fetch(`${server.origin}/api/pact/auth/challenge`, {method: 'POST', headers: {'content-type': 'application/json', origin: server.origin}, body: JSON.stringify({walletAddress: fixture.wallet})});
    assert.equal(challenge.status, 200); assert.match(challenge.headers.get('set-cookie') ?? '', /HttpOnly/);
    const proof = await challenge.json(); assert.match(proof.message, /Purpose: prove wallet control; no transaction or license purchase/);
    passed('real Next SSR and same-origin server-only route');

    const {chromium} = await import(pathToFileURL(path.join(app, 'node_modules/@playwright/test/index.mjs')).href);
    const browser = await chromium.launch({headless: true});
    try {
      const context = await browser.newContext();
      const page = await context.newPage(), errors = [], methods = [], forbidden = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.route('**/*', async route => {
        const request = route.request(), url = new URL(request.url());
        if (url.origin === server.origin) return route.continue();
        if (url.origin !== 'http://127.0.0.1:4022' || request.method() !== 'POST') {
          forbidden.push('Unexpected external browser resource'); await route.abort(); return;
        }
        const body = request.postDataJSON();
        methods.push(body.method);
        if (!['getGenesisHash', 'getMultipleAccounts'].includes(body.method)) {
          forbidden.push('Forbidden RPC method'); await route.abort(); return;
        }
        const snapshot = structuredClone(fixture.snapshot);
        if (body.method === 'getMultipleAccounts' && body.params[0][1] !== fixture.license) snapshot.value[1] = null;
        await route.fulfill({json: {jsonrpc: '2.0', id: body.id, result: body.method === 'getGenesisHash' ? fixture.genesis : snapshot}, headers: {'access-control-allow-origin': '*'}});
      });
      await page.goto(server.origin);
      await page.locator('#verification').filter({hasText: /^active$/}).waitFor();
      await page.locator('#react-checkout').getByRole('button', {name: 'Connect Phantom', exact: true}).waitFor();
      assert.equal(await page.locator('#react-checkout').getByRole('button', {name: 'Purchase license', exact: true}).isDisabled(), true);
      assert.deepEqual(errors, []); assert.deepEqual(forbidden, []); assert.ok(methods.includes('getMultipleAccounts'));
      passed('Next browser hydration, real SDK verification and React checkout');
      await page.goto(`${server.origin}/react18.html`);
      await page.locator('#react-version').filter({hasText:/^18\.3\.1$/}).waitFor();
      await page.getByRole('button',{name:'Connect Phantom',exact:true}).waitFor();
      assert.equal(await page.getByRole('button',{name:'Purchase license',exact:true}).isDisabled(),true);
      assert.deepEqual(errors,[]);assert.deepEqual(forbidden,[]);
      report.react18Version='18.3.1';
      passed('React18 independent install, server render and browser StrictMode mount');
      await page.goto(`${server.origin}/vanilla.html`);
      await page.evaluate(async options => {
        const module = await import('/pact-checkout.mjs');
        window.esmController = module.mountCheckout({element: '#esm', ...options});
        window.iifeController = window.PACT.mountCheckout({element: '#iife', ...options});
      }, JSON.parse(options));
      for (const selector of ['#esm', '#iife']) {
        await page.locator(selector).locator('#price').filter({hasText: /0\.001/}).waitFor();
        assert.equal(await page.locator(selector).getByRole('button', {name: 'Purchase license', exact: true}).isDisabled(), true);
      }
      assert.deepEqual(errors, []); assert.deepEqual(forbidden, []);
      report.browserRpcMethods = [...new Set(methods)];
      passed('vanilla browser ESM and IIFE assets from the installed package');
      await context.close();
    } finally { await browser.close(); }
  } finally { await server.stop(); }

  // This is an expected compile failure. Require a Node-only import diagnostic,
  // not merely any nonzero exit, so unrelated broken builds cannot satisfy it.
  await write(app, 'app/consumer.tsx', `'use client';import {createWalletAuth} from '@pact/sdk/server';export default function Consumer(){return <p>{String(typeof createWalletAuth)}</p>;}`);
  const rejected = await run('server-in-client-rejected', ['node_modules/next/dist/bin/next', 'build'], app, {allowFailure: true});
  assert.notEqual(rejected.code, 0, 'Client import of server-only entrypoint unexpectedly bundled');
  assert.match(rejected.text, /node:(?:crypto|async_hooks|cluster|worker_threads)|(?:Module not found|Can't resolve)[^\n]*(?:crypto|async_hooks|cluster|worker_threads)|server-only/i, 'Expected Node-only boundary diagnostic');
  passed('server entrypoint rejected by a real Next client build');
  const after=gitStamp();assert.equal(after.revision,report.revision,'Source revision changed during consumer validation');
  if(report.workingTreeClean)assert.equal(after.workingTreeClean,true,'Source changed during clean consumer validation');
  report.status = 'pass';
} catch (error) {
  report.status = 'fail'; report.error = error instanceof Error ? error.stack : String(error);
  process.exitCode = 1;
  console.error(report.error);
} finally {
  await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(`[packed-consumer] ${report.status.toUpperCase()}: ${checks.length} passed checks; report ${path.join(output, 'report.json')}`);
}
