import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {nextEnvironmentConfig} from './environment.mjs';

const environment={PACT_ENV_PROFILE:'local',PACT_NETWORK:'devnet',PACT_APP_ORIGIN:'http://localhost:3007',
 NEXT_PUBLIC_PACT_SOLANA_PROGRAM_ID:'EiiiWWsW2kkqP6nugHz6iBADvhnW5xnibAtZ82ZExVqy',NEXT_PUBLIC_SOLANA_RPC_URL:'https://api.devnet.solana.com',
 SOLANA_RPC_URL:'https://private-rpc.example.com/account?key=PRIVATE_RPC_CANARY',PACT_AUTH_MODE:'disabled',PACT_SERVER_POLICY:'disabled'};
async function temporary(t){const directory=await fs.mkdtemp(path.join(os.tmpdir(),'pact-next-binding-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));return directory;}
async function saved(directory,configuration){await fs.mkdir(path.join(directory,'.next'));await fs.writeFile(path.join(directory,'.next/required-server-files.json'),JSON.stringify({version:1,config:configuration}));}

test('Next binding records actual source provenance without embedding private RPC settings',async t=>{
 const directory=await temporary(t),config=await nextEnvironmentConfig({application:'marketplace',directory,phase:'phase-production-build',environment});
 assert.match(config.env.PACT_BUILD_SOURCE_REVISION,/^[0-9a-f]{40}$/);
 for(const name of ['PACT_BUILD_SOURCE_CLEAN','PACT_BUILD_ENV_FILES_ABSENT','PACT_BUILD_PUBLIC_ENV_SAFE'])assert.ok(['true','false'].includes(config.env[name]));
 assert.equal(config.env.PACT_BUILD_ENV_FILES_ABSENT,'true');assert.equal(config.env.PACT_BUILD_PUBLIC_ENV_SAFE,'true');
 assert.equal(JSON.stringify(config).includes('PRIVATE_RPC_CANARY'),false);assert.equal(JSON.stringify(config).includes('private-rpc.example.com'),false);
 await saved(directory,config);
 const rotated=await nextEnvironmentConfig({application:'marketplace',directory,phase:'phase-production-server',environment:{...environment,SOLANA_RPC_URL:'https://other-private.example.com/new?key=NEW_PRIVATE_CANARY'}});
 assert.deepEqual(rotated,config);
});
test('saved Next build rejects public settings drift and missing source provenance at startup',async t=>{
 const directory=await temporary(t),config=await nextEnvironmentConfig({application:'marketplace',directory,phase:'phase-production-build',environment});await saved(directory,config);
 await assert.rejects(nextEnvironmentConfig({application:'marketplace',directory,phase:'phase-production-server',environment:{...environment,NEXT_PUBLIC_SOLANA_RPC_URL:'https://different-public.example.com'}}),error=>error.code==='BUILD_ENVIRONMENT_MISMATCH');
 delete config.env.PACT_BUILD_SOURCE_REVISION;await fs.writeFile(path.join(directory,'.next/required-server-files.json'),JSON.stringify({version:1,config}));
 await assert.rejects(nextEnvironmentConfig({application:'marketplace',directory,phase:'phase-production-server',environment}),/Saved source revision/);
});
test('local ambient-file metadata and unknown public values cannot qualify as release evidence',async t=>{
 const directory=await temporary(t);await fs.writeFile(path.join(directory,'.env.local'),'SYNTHETIC_FILE_MUST_NOT_BE_READ=fixture\n');
 const config=await nextEnvironmentConfig({application:'marketplace',directory,phase:'phase-production-build',environment:{...environment,NEXT_PUBLIC_UNREVIEWED_SECRET:'PUBLIC_VALUE_CANARY'}});
 assert.equal(config.env.PACT_BUILD_ENV_FILES_ABSENT,'false');assert.equal(config.env.PACT_BUILD_PUBLIC_ENV_SAFE,'false');
 assert.equal(JSON.stringify(config).includes('PUBLIC_VALUE_CANARY'),false);
});

test('actual Next TypeScript config loader resolves the public SDK server without transformed file-URL requires',async t=>{
 const directory=await temporary(t),repository=fileURLToPath(new URL('../../',import.meta.url));
 const helper=fileURLToPath(new URL('./environment.mjs',import.meta.url)).replaceAll('\\','/');
 const next=path.join(repository,'web/node_modules/next/dist/server/config.js');
 const childEnvironment={};for(const name of ['PATH','SystemRoot','SYSTEMROOT','ComSpec','COMSPEC','TEMP','TMP','HOME','USERPROFILE','APPDATA','LOCALAPPDATA','PATHEXT'])if(process.env[name])childEnvironment[name]=process.env[name];
 Object.assign(childEnvironment,{PACT_ENV_PROFILE:'local',PACT_NETWORK:'devnet',PACT_APP_ORIGIN:'http://localhost:3007',PACT_AUTH_MODE:'disabled',PACT_SERVER_POLICY:'disabled',PACT_PROCESS_MODEL:'stateless',NEXT_PUBLIC_PACT_SOLANA_PROGRAM_ID:environment.NEXT_PUBLIC_PACT_SOLANA_PROGRAM_ID,NEXT_PUBLIC_SOLANA_RPC_URL:'https://api.devnet.solana.com',SOLANA_RPC_URL:'https://api.devnet.solana.com',NEXT_TELEMETRY_DISABLED:'1'});
 const run=target=>execFileSync(process.execPath,['--input-type=commonjs','-e',`const load=require(${JSON.stringify(next)}).default;load('phase-production-build',${JSON.stringify(target)},{silent:true}).then(config=>{const binding=JSON.parse(config.env.PACT_BUILD_BINDING_JSON);if(binding.profile!=='local'||binding.application!=='marketplace')throw Error('Invalid binding');console.log('NEXT_TYPESCRIPT_CONFIG_BINDING_PASS');}).catch(error=>{console.error('NEXT_TYPESCRIPT_CONFIG_BINDING_FAILED '+error.code+' '+String(error.message));process.exitCode=1;});`],{cwd:target,env:childEnvironment,windowsHide:true,timeout:30000,maxBuffer:100000,stdio:['ignore','pipe','pipe']});
 const positive=path.join(directory,'positive');await fs.mkdir(positive);
 await fs.writeFile(path.join(positive,'next.config.ts'),`import {nextEnvironmentConfig} from ${JSON.stringify(helper)};\nexport default async function config(phase:string){return nextEnvironmentConfig({application:'marketplace',directory:${JSON.stringify(positive)},phase});}\n`);
 assert.match(run(positive).toString(),/NEXT_TYPESCRIPT_CONFIG_BINDING_PASS/);
 // Reproduce the former helper shape through the same actual Next loader.
 const negative=path.join(directory,'negative');await fs.mkdir(negative);
 const sdkPackage=path.join(repository,'packages/pact-sdk/package.json');
 await fs.writeFile(path.join(negative,'old-helper.mjs'),`import {createRequire} from 'node:module';import {pathToFileURL} from 'node:url';export async function oldFunctions(){const require=createRequire(${JSON.stringify(sdkPackage)});return import(pathToFileURL(require.resolve('@pact/sdk/server')).href);}`);
 await fs.writeFile(path.join(negative,'next.config.ts'),`import {oldFunctions} from './old-helper.mjs';export default async function config(){const sdk=await oldFunctions();return {env:{PACT_BUILD_BINDING_JSON:JSON.stringify(sdk.publicEnvironmentBinding(sdk.resolvePactEnvironment({environment:process.env,application:'marketplace',phase:'build'})))}};}`);
 assert.throws(()=>run(negative),error=>error.status!==0&&error.stderr.toString().includes('NEXT_TYPESCRIPT_CONFIG_BINDING_FAILED')&&error.stderr.toString().includes('MODULE_NOT_FOUND')&&error.stderr.toString().includes('file:'));
});
