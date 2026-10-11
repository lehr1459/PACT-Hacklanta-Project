import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
const root=process.cwd(),target=path.join(root,'.deployment-candidates/one-link/final'),logs=path.join(root,'web/test-results/one-link/final-build');
await fs.mkdir(logs,{recursive:true});const results=[];
async function run(name,args,relative){const file=path.join(logs,name+'.log'),handle=await fs.open(file,'w'),started=Date.now();const env={...process.env,NEXT_PUBLIC_PACT_SOLANA_PROGRAM_ID:'EiiiWWsW2kkqP6nugHz6iBADvhnW5xnibAtZ82ZExVqy',NEXT_PUBLIC_SOLANA_RPC_URL:'https://api.devnet.solana.com',NEXT_TELEMETRY_DISABLED:'1'};for(const key of ['PACT_QA_MODE','PACT_SOLANA_QA_MODE','PACT_INTEGRATION_QA_MODE','PACT_SDK_QA_MODE','PACT_CHECKOUT_QA_MODE','NODE_TEST_CONTEXT'])delete env[key];const child=spawn(process.execPath,args,{cwd:path.join(target,relative),env,stdio:['ignore',handle.fd,handle.fd]});const code=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',resolve);});await handle.close();results.push({name,code,durationMs:Date.now()-started,file});await fs.writeFile(path.join(logs,'results.json'),JSON.stringify(results,null,2));console.log(`${name}: exit ${code}`);if(code!==0)throw Error(name+' failed; retained log '+file);}
await run('sdk-build',['build.mjs'],'packages/pact-sdk');
await run('sdk-typecheck',['node_modules/typescript/bin/tsc','-p','tsconfig.json','--noEmit'],'packages/pact-sdk');
await run('web-typecheck',['node_modules/typescript/bin/tsc','--noEmit'],'web');
await run('production-build',['node_modules/next/dist/bin/next','build'],'web');
