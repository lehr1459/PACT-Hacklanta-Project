import {pathToFileURL} from 'node:url';
import fs from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';
import {spawn} from 'node:child_process';
const root=path.resolve('test-results/integration-consumer');await fs.mkdir(root,{recursive:true});await fs.symlink(path.resolve('node_modules'),path.join(root,'node_modules'),'junction').catch(error=>{if(error.code!=='EEXIST')throw error;});
for(const name of ['template','generator']){const source=await fs.readFile(`lib/integration/${name}.ts`,'utf8');const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText.replace("from './template'","from './template.mjs'");await fs.writeFile(path.join(root,`${name}.mjs`),code);}
const {generateIntegration}=await import(pathToFileURL(path.join(root,'generator.mjs')).href);
const {offer}=await import('../../../packages/pact-sdk/tests/fixtures.mjs');
for(const framework of ['nextjs','react']){const output=generateIntegration({appName:'Independent QA consumer',framework,offer:offer.toBase58()});const dir=path.join(root,'app',framework);await fs.mkdir(dir,{recursive:true});await fs.writeFile(path.join(dir,'PactLicenseGate.tsx'),output.snippet);await fs.writeFile(path.join(dir,'pact-config.ts'),output.configuration);await fs.writeFile(path.join(dir,'page.tsx'),`'use client';\nimport PactLicenseGate from './PactLicenseGate';\nexport default function Page(){return <PactLicenseGate><button data-testid="generated-premium">Independent premium control</button></PactLicenseGate>}`);}
for(const framework of ['nextjs','react'])for(const variant of ['program','network']){const output=generateIntegration({appName:'Invalid configuration QA',framework,offer:offer.toBase58()});const dir=path.join(root,'app',`${framework}-bad-${variant}`);await fs.mkdir(dir,{recursive:true});await fs.writeFile(path.join(dir,'PactLicenseGate.tsx'),output.snippet);const config=output.configuration.replace(' as const','').replace(variant==='program'?'EiiiWWsW2kkqP6nugHz6iBADvhnW5xnibAtZ82ZExVqy':'"devnet"',variant==='program'?'11111111111111111111111111111111':'"mainnet"');await fs.writeFile(path.join(dir,'pact-config.ts'),config);await fs.writeFile(path.join(dir,'page.tsx'),`'use client';\nimport Gate from './PactLicenseGate';export default function Page(){return <Gate><button data-testid="generated-premium">Premium</button></Gate>}`);}
await fs.writeFile(path.join(root,'app','layout.tsx'),`import type {ReactNode} from 'react';export default function Layout({children}:{children:ReactNode}){return <html lang="en"><body style={{maxWidth:700,margin:'auto',padding:20,fontFamily:'sans-serif'}}>{children}</body></html>}`);
await fs.writeFile(path.join(root,'app','page.tsx'),`export default function Page(){return <p>Actual generated output independent QA consumer</p>}`);
await fs.writeFile(path.join(root,'package.json'),JSON.stringify({name:'pact-generated-qa-consumer',private:true,dependencies:{next:'16.4.0',react:'19.3.0','react-dom':'19.3.0','@pact/sdk':'file:../../../../packages/pact-sdk'}}));
await fs.writeFile(path.join(root,'tsconfig.json'),JSON.stringify({compilerOptions:{target:'ES2020',lib:['dom','esnext'],strict:true,noEmit:true,esModuleInterop:true,module:'esnext',moduleResolution:'bundler',jsx:'react-jsx',skipLibCheck:true,plugins:[{name:'next'}]},include:['**/*.ts','**/*.tsx','.next/types/**/*.ts'],exclude:['node_modules']}));
await fs.writeFile(path.join(root,'next.config.mjs'),`export default {turbopack:{root:${JSON.stringify(path.resolve('..'))}}};`);
const run=args=>spawn(process.execPath,[path.resolve('node_modules/next/dist/bin/next'),...args],{cwd:root,stdio:'inherit',env:{...process.env,NEXT_TELEMETRY_DISABLED:'1'}});
await new Promise((resolve,reject)=>run(['build']).on('exit',code=>code===0?resolve():reject(Error(`Generated consumer build exit${code}`))));
const server=run(['start','--hostname','127.0.0.1','--port','3007']);for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{server.kill();process.exit();});server.on('exit',code=>process.exit(code??0));




