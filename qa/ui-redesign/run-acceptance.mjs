import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
const repo=process.cwd(),target=path.resolve(process.argv[2]??'.deployment-candidates/ui-redesign/baseline'),group=process.argv[3]??'web';
if(!target.startsWith(path.join(repo,'.deployment-candidates/ui-redesign')+path.sep))throw Error('Isolated UI candidate required');
const stage=path.basename(target),logs=path.join(repo,'web/test-results/ui-redesign',stage,'commands');await fs.mkdir(logs,{recursive:true});
const results=[];
async function run(name,args,cwd=target,extra={},binary=process.execPath){const started=Date.now();const file=path.join(logs,name+'.log');const handle=await fs.open(file,'w');const env={...process.env,...extra};for(const key of ['PACT_QA_MODE','PACT_SOLANA_QA_MODE','PACT_INTEGRATION_QA_MODE','PACT_SDK_QA_MODE','PACT_CHECKOUT_QA_MODE','NODE_TEST_CONTEXT'])if(!(key in extra))delete env[key];const child=spawn(binary,args,{cwd,env,stdio:['ignore',handle.fd,handle.fd]});const code=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',resolve);});await handle.close();results.push({name,args,cwd,extra,code,durationMs:Date.now()-started,log:file});await fs.writeFile(path.join(logs,'results-'+group+'.json'),JSON.stringify(results,null,2));console.log(`${stage} ${name} exit${code}, ${Date.now()-started}ms`);if(code!==0)throw Error(name+' failed; see '+file);}
const web=path.join(target,'web'),cli=['node_modules/@playwright/test/cli.js','test'];
if(group==='web'){
 for(const mode of ['mock','setup','live'])await run('solana-'+mode,[...cli,'--config','tests/solana/playwright.config.ts'],web,mode==='mock'?{}:{PACT_SOLANA_QA_MODE:mode});
 for(const mode of ['mock','setup'])await run('base-'+mode,[...cli,'--config','playwright.config.ts'],web,mode==='mock'?{}:{PACT_QA_MODE:mode});
 for(const mode of ['mock','live'])await run('wizard-'+mode,['web/node_modules/@playwright/test/cli.js','test','--config','qa/hacklanta-final/wizard.config.ts'],target,mode==='mock'?{}:{PACT_INTEGRATION_QA_MODE:mode});
 await run('actual-production-build',['node_modules/next/dist/bin/next','build'],web,{NEXT_PUBLIC_PACT_SOLANA_PROGRAM_ID:'EiiiWWsW2kkqP6nugHz6iBADvhnW5xnibAtZ82ZExVqy',NEXT_PUBLIC_SOLANA_RPC_URL:'https://api.devnet.solana.com',NEXT_TELEMETRY_DISABLED:'1'});
 await run('web-typecheck',['node_modules/typescript/bin/tsc','--noEmit'],web);
}else if(group==='sdk'){
 const sdk=path.join(target,'packages/pact-sdk');await run('sdk-build',['build.mjs'],sdk);await run('sdk-typecheck',['node_modules/typescript/bin/tsc','-p','tsconfig.json','--noEmit'],sdk);
 await run('sdk-57',['--test','tests/checkout-focused.test.mjs','tests/checkout-qa.test.mjs','tests/sdk.test.mjs'],sdk);
}else if(group==='other'){
 await run('saturday-readonly-consumer',['examples/pact-checkout-vanilla/tests/build-saturday-consumer.mjs']);
 for(const mode of ['mock','live'])await run('checkout-'+mode,['web/node_modules/@playwright/test/cli.js','test','--config','examples/pact-checkout-vanilla/tests/playwright.config.ts'],target,mode==='mock'?{}:{PACT_CHECKOUT_QA_MODE:mode});
 for(const mode of ['mock','live'])await run('prism-'+mode,['examples/pact-demo-app/node_modules/@playwright/test/cli.js','test','--config','examples/pact-checkout-vanilla/tests/prism.config.ts'],target,mode==='mock'?{}:{PACT_SDK_QA_MODE:mode});
 await run('generated-44',[...cli,'--config','tests/integration/generated.config.ts'],web);
 await run('saturday-candidate-12',['web/node_modules/@playwright/test/cli.js','test','--config','qa/hacklanta-final/saturday-candidate.config.ts']);
}else if(group==='chain'){
 await run('solana-svm-23',['-m','unittest','discover','-s','tests','-p','test_*.py','-v'],path.join(target,'solana'),{},path.join(repo,'solana/.tools/venv/Scripts/python.exe'));
 await run('foundry-23',['test'],path.join(target,'contracts'),{},path.join(repo,'contracts/.tools/foundry-v1.8.5/forge.exe'));
}else throw Error('Unknown group');
