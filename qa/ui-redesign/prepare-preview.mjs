// Isolated presentation preview. Never rebuilds the existing localhost demos.
import fs from 'node:fs/promises';
import path from 'node:path';
import {existsSync} from 'node:fs';

const root = path.resolve(import.meta.dirname, '../..');
const target = path.join(root, '.deployment-candidates/ui-redesign/preview');
await fs.mkdir(target, {recursive: true});
for (const directory of ['web/app', 'web/components', 'web/lib', 'packages/pact-sdk/src']) {
  await fs.cp(path.join(root, directory), path.join(target, directory), {recursive: true, force: true});
}
if (existsSync(path.join(root, 'web/public'))) {
  await fs.cp(path.join(root, 'web/public'), path.join(target, 'web/public'), {recursive: true, force: true});
}
for (const file of ['web/package.json', 'web/package-lock.json', 'web/tsconfig.json', 'web/next.config.ts', 'web/next-env.d.ts', 'contracts/abi/PactLicensing.json', 'solana/wire-spec.json', 'packages/pact-sdk/package.json', 'packages/pact-sdk/tsconfig.json']) {
  await fs.mkdir(path.dirname(path.join(target, file)), {recursive: true});
  await fs.copyFile(path.join(root, file), path.join(target, file));
}
await fs.cp(path.join(root, 'packages/pact-sdk/dist'), path.join(target, 'packages/pact-sdk/dist'), {recursive: true, force: true});
for (const directory of ['web/node_modules', 'packages/pact-sdk/node_modules']) {
  if (!existsSync(path.join(target, directory))) {
    await fs.cp(path.join(root, directory), path.join(target, directory), {recursive: true, dereference: true});
  }
}
await fs.cp(path.join(target, 'packages/pact-sdk/dist'), path.join(target, 'web/node_modules/@pact/sdk/dist'), {recursive: true, force: true});
console.log(JSON.stringify({preview: target,privateEnvironmentCopied: false,servingOutputsChanged: false}));
