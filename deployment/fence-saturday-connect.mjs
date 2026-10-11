import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

// Release-copy hardening only. Never alter the operator's original Saturday app.
const repo = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const staging = path.join(repo, '.deployment-candidates');
const target = path.resolve(process.argv[2] ?? '');
const relative = path.relative(staging, target);
if (!relative || relative.startsWith('..') || path.isAbsolute(relative) || path.basename(target) !== 'saturday-lights') {
  throw Error('Only an isolated Saturday deployment candidate can be patched.');
}
const file = path.join(target, 'worker/pact-license.js');
const original = fs.readFileSync(file, 'utf8');
let source = original;
const patches = [
  ['generation = 0, connected = false;', 'generation = 0, connected = false, connectionEpoch = 0;'],
  ['const changed = key => {', 'const changed = (key, cancelPending = true) => {\n    if (cancelPending) connectionEpoch++;'],
  ['const disconnected = () => { connected = false; reset(); };', 'const connectedEvent = () => { status = null; onChange(); };\n  const disconnected = () => { connectionEpoch++; connected = false; reset(); };'],
  ['function attach(next) {', 'function attach(next) {\n    connectionEpoch++;'],
  ["[['connect', changed], ['accountChanged', changed], ['disconnect', disconnected]]", "[['connect', connectedEvent], ['accountChanged', changed], ['disconnect', disconnected]]"],
  ['const result = await provider.connect();', "const selectedProvider = provider, epoch = ++connectionEpoch;\n    const result = await selectedProvider.connect();\n    if (provider !== selectedProvider || connectionEpoch !== epoch) throw new Error('Wallet connection changed while connecting. Connect again deliberately.');"],
];
for (const [before, after] of patches) {
  const occurrences = source.split(before).length - 1;
  const expected = before.startsWith("[['connect'") ? 2 : 1;
  if (occurrences !== expected) throw Error(`Saturday source changed; expected ${expected} patch locations, got ${occurrences}.`);
  source = source.replaceAll(before, after);
}
fs.writeFileSync(file, source);
const hash = value => createHash('sha256').update(value).digest('hex');
console.log(JSON.stringify({file, originalSha256: hash(original), stagedSha256: hash(source), originalSourceModified: false}));
