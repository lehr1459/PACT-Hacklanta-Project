import {pathToFileURL} from 'node:url';
import fs from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';
import {spawn} from 'node:child_process';
import os from 'node:os';
import {createRequire} from 'node:module';
import {npm,root as repository,validationEnv} from '../../../scripts/validation/common.mjs';

const web=path.join(repository,'web');
const root=await fs.mkdtemp(path.join(os.tmpdir(),'pact-generated-consumer-'));
const receipt=path.join(web,'test-results/integration-consumer');
await fs.mkdir(receipt,{recursive:true});
await fs.writeFile(path.join(receipt,'location.json'),JSON.stringify({consumer:root,source:'actual generated snippets with installed SDK archive'},null,2));
// Install the public archive without inheriting marketplace node_modules.
const archives=path.join(root,'archives');await fs.mkdir(archives);
await npm(['pack','--ignore-scripts','--pack-destination',archives],{cwd:path.join(repository,'packages/pact-sdk')});
const archive=(await fs.readdir(archives)).find(file=>file.endsWith('.tgz'));
if(!archive)throw Error('SDK pack produced no archive.');
await fs.writeFile(path.join(root,'package.json'),JSON.stringify({name:'pact-generated-qa-consumer',private:true,type:'module',dependencies:{next:'16.4.1',react:'19.3.0','react-dom':'19.3.0','@pact/sdk':'file:./archives/'+archive},devDependencies:{typescript:'5.9.3','@types/node':'24.10.0','@types/react':'19.3.0','@types/react-dom':'19.3.0','@solana/web3.js':'1.99.0'}}));
await npm(['install','--package-lock-only','--ignore-scripts','--no-audit','--no-fund'],{cwd:root});
await npm(['ci','--no-audit','--no-fund'],{cwd:root});
for(const name of ['template','generator']) {
  const source=await fs.readFile(path.join(web,`lib/integration/${name}.ts`),'utf8');
  const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText.replace("from './template'","from './template.mjs'");
  await fs.writeFile(path.join(root,`${name}.mjs`),code);
}
const {generateIntegration}=await import(pathToFileURL(path.join(root,'generator.mjs')).href);
const {offer}=await import('../../../packages/pact-sdk/tests/fixtures.mjs');
for(const framework of ['nextjs','react']) {
  const output=generateIntegration({appName:'Independent QA consumer',framework,offer:offer.toBase58()});
  const dir=path.join(root,'app',framework);await fs.mkdir(dir,{recursive:true});
  await fs.writeFile(path.join(dir,'PactLicenseGate.tsx'),output.snippet);
  await fs.writeFile(path.join(dir,'pact-config.ts'),output.configuration);
  await fs.writeFile(path.join(dir,'page.tsx'),`'use client';\nimport PactLicenseGate from './PactLicenseGate';\nexport default function Page(){return <PactLicenseGate><button data-testid="generated-premium">Independent premium control</button></PactLicenseGate>}`);
}
for(const framework of ['nextjs','react'])for(const variant of ['program','network']) {
  const output=generateIntegration({appName:'Invalid configuration QA',framework,offer:offer.toBase58()});
  const dir=path.join(root,'app',`${framework}-bad-${variant}`);await fs.mkdir(dir,{recursive:true});
  await fs.writeFile(path.join(dir,'PactLicenseGate.tsx'),output.snippet);
  const config=output.configuration.replace(' as const','').replace(variant==='program'?'EiiiWWsW2kkqP6nugHz6iBADvhnW5xnibAtZ82ZExVqy':'"devnet"',variant==='program'?'11111111111111111111111111111111':'"mainnet"');
  await fs.writeFile(path.join(dir,'pact-config.ts'),config);
  await fs.writeFile(path.join(dir,'page.tsx'),`'use client';\nimport Gate from './PactLicenseGate';export default function Page(){return <Gate><button data-testid="generated-premium">Premium</button></Gate>}`);
}
await fs.writeFile(path.join(root,'app/layout.tsx'),`import type {ReactNode} from 'react';export default function Layout({children}:{children:ReactNode}){return <html lang="en"><body style={{maxWidth:700,margin:'auto',padding:20,fontFamily:'sans-serif'}}>{children}</body></html>}`);
await fs.writeFile(path.join(root,'app/page.tsx'),`export default function Page(){return <p>Actual generated output independent QA consumer</p>}`);
await fs.writeFile(path.join(root,'tsconfig.json'),JSON.stringify({compilerOptions:{target:'ES2020',lib:['dom','esnext'],strict:true,noEmit:true,esModuleInterop:true,module:'esnext',moduleResolution:'bundler',jsx:'react-jsx',skipLibCheck:true,plugins:[{name:'next'}]},include:['**/*.ts','**/*.tsx','.next/types/**/*.ts'],exclude:['node_modules']}));
await fs.writeFile(path.join(root,'next.config.mjs'),`export default {turbopack:{root:${JSON.stringify(root)}},outputFileTracingRoot:${JSON.stringify(root)}};`);
const installed=path.join(root,'node_modules/@pact/sdk');
const location=await fs.realpath(installed);
if(path.relative(installed,location)!==''||!(await fs.stat(path.join(installed,'dist/index.js'))).isFile())throw Error('Generated consumer SDK must be an installed archive, not an external link.');
const require=createRequire(path.join(root,'package.json'));
for(const name of ['@pact/sdk','next','react','react-dom','typescript']) {
  const resolved=await fs.realpath(require.resolve(name));
  if(!resolved.startsWith(path.join(root,'node_modules')+path.sep))throw Error(`${name} resolved outside the generated consumer.`);
}
for(const file of ['package.json','package-lock.json'])await fs.copyFile(path.join(root,file),path.join(receipt,file));
const run=args=>spawn(process.execPath,[path.join(root,'node_modules/next/dist/bin/next'),...args],{cwd:root,stdio:'inherit',env:validationEnv()});
await new Promise((resolve,reject)=>{const child=run(['build']);child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(Error(`Generated consumer build exit ${code}`)));});
const server=run(['start','--hostname','127.0.0.1','--port','3007']);
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{server.kill();process.exit();});
server.once('error',error=>{console.error(error.message);process.exit(1);});
server.on('exit',code=>process.exit(code??0));
