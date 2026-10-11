import {createRequire} from 'node:module';
import {mkdir} from 'node:fs/promises';
import path from 'node:path';
const require=createRequire(path.resolve('packages/pact-sdk/package.json'));
const {build}=require('esbuild');
const output=path.resolve('web/test-results/checkout-saturday-consumer');await mkdir(output,{recursive:true});
await build({entryPoints:['C:/Hackathon/saturday-lights/worker/pact-license.js'],bundle:true,format:'esm',platform:'browser',target:'es2022',outfile:path.join(output,'saturday.mjs'),alias:{'@pact/sdk':path.resolve('packages/pact-sdk/dist/index.js')}});
console.log('Original Saturday worker bundled read-only against compiled @pact/sdk root export into PACT ignored consumer.');
