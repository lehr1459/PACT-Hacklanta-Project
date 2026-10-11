// Existing SDK acceptance in a separate output directory; never rebuild assets
// currently served by the checkout example or a Next.js preview.
import {cp,mkdir,symlink,writeFile} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import path from 'node:path';
const root=path.resolve('.'),source=path.join(root,'packages/pact-sdk');
const target=path.join(root,'web/test-results/hacklanta-final/sdk-'+randomUUID());
if(!target.startsWith(path.join(root,'web/test-results/hacklanta-final')+path.sep))throw Error('Invalid isolated consumer target');
await mkdir(target,{recursive:true});
for(const entry of ['package.json','package-lock.json','tsconfig.json','build.mjs','src','tests','README.md'])await cp(path.join(source,entry),path.join(target,entry),{recursive:true});
await symlink(path.join(source,'node_modules'),path.join(target,'node_modules'),'junction');
await writeFile(path.join(root,'web/test-results/hacklanta-final/sdk-consumer-path.txt'),target);
async function run(args){const child=spawn(process.execPath,args,{cwd:target,stdio:'inherit'});await new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(Error(args.join(' ')+' exit '+code)));});}
const hash=async file=>createHash('sha256').update(await readFile(file)).digest('hex');
const before=await Promise.all(['dist/pact-checkout.mjs','dist/pact-checkout.js'].map(file=>hash(path.join(source,file))));
await run(['build.mjs']);await run(['node_modules/typescript/bin/tsc','-p','tsconfig.json','--noEmit']);
await run(['--test',...['checkout-focused.test.mjs','checkout-qa.test.mjs','sdk.test.mjs'].map(file=>'tests/'+file)]);
const after=await Promise.all(['dist/pact-checkout.mjs','dist/pact-checkout.js'].map(file=>hash(path.join(source,file))));
if(JSON.stringify(before)!==JSON.stringify(after))throw Error('Serving original SDK bundles changed');
console.log(JSON.stringify({isolatedConsumer:target,originalServingBundlesUnchanged:true,bundleHashes:after}));
