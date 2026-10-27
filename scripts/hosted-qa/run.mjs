// Mandatory hosted matrix; no external deployment, transactions or publication.
// Detailed child output stays private/ignored. CI exports reconstructed summaries.
import {spawn,execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {mkdir,writeFile,open,access,readdir,readFile} from 'node:fs/promises';
import path from 'node:path';
import {root,npmCli,validationEnv} from '../validation/common.mjs';
import {loadRuntimePolicy} from '../validation/runtime.mjs';
import {nodeReceipt,browserReceipt,browserFailureReceipt,developerDemoReceipt,matrixReceipt,generatedReferences} from './acceptance.mjs';
const mode=process.argv[2]??'all';
if(!['install','all','portable'].includes(mode))throw Error('Use hosted run.mjs install|all|portable');
const directory=path.join(root,'web/test-results/hosted-ci');await mkdir(directory,{recursive:true});
const revision=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
const runId=randomUUID();
const summary={schemaVersion:1,kind:'hosted-local-matrix',revision,runId,mode,status:'running',results:[]};
const record=()=>writeFile(path.join(directory,'results.json'),JSON.stringify(summary,null,2)+'\n');
const qa=process.env.PACT_QA_DATABASE_URL;
if(qa){const u=new URL(qa);if(u.hostname!=='127.0.0.1'||u.pathname!=='/pact_hosted_qa')throw Error('Dedicated loopback QA database required');}
async function command(name,args,{cwd=root,env={},testReceipt=false,minimumTests=1,demoReceipt=false}={}){
 const item={name,status:'running',durationMs:0};summary.results.push(item);await record();const started=performance.now();
 const log=await open(path.join(directory,name+'.log'),'w');
 try{
  const code=await new Promise((resolve,reject)=>{
   const child=spawn(process.execPath,args,{cwd,env:validationEnv({PACT_HOSTED_QA_CLEAN:'1',PACT_HOSTED_QA_RUN_ID:runId,PACT_HOSTED_QA_REVISION:revision,...(qa?{PACT_QA_DATABASE_URL:qa}:{}),...env}),windowsHide:true,stdio:['ignore',log.fd,log.fd]});
   child.once('error',reject);child.once('close',code=>resolve(code??1));
  });
  if(code!==0){
   if(['browser-console','browser-connect'].includes(name)){
    try{
     const lane=name.slice('browser-'.length),bytes=await readFile(path.join(root,'web/test-results/hosted-'+lane+'/results.json'));
     if(bytes.length>65536)throw Error();
     const safe=browserFailureReceipt(JSON.parse(bytes.toString('utf8')),{revision,runId,lane});
     await writeFile(path.join(directory,name+'-failure.json'),JSON.stringify(safe)+'\n');
     process.stdout.write(JSON.stringify(safe)+'\n');
    }catch{process.stdout.write('Bounded browser failure summary unavailable; raw diagnostics remain private.\n');}
   }
   throw Error('Hosted check failed: '+name);
  }
  if(testReceipt){
   const output=await readFile(path.join(directory,name+'.log'),'utf8');
   nodeReceipt(output,minimumTests);
  }
  if(demoReceipt)developerDemoReceipt(JSON.parse(await readFile(path.join(directory,name+'.log'),'utf8')),revision);
  item.status='passed';
 }catch(error){item.status='failed';throw error;}
 finally{item.durationMs=Math.round(performance.now()-started);await log.close();await record();process.stdout.write(name+': '+item.status+'\n');}
}
const npm=(name,project,args)=>command(name,[npmCli(),...args],{cwd:path.join(root,project),testReceipt:args[0]==='test'});
const tests=(name,files,options={})=>command(name,['--test','--test-concurrency=1',...files],{...options,testReceipt:true});
const projects=['packages/pact-hosted-client','examples/pact-hosted-common','examples/pact-hosted-express','examples/pact-hosted-next','examples/pact-hosted-rest'];
try{
 const runtime=await loadRuntimePolicy();if(process.version!=='v'+runtime.node||execFileSync(process.execPath,[npmCli(),'--version'],{encoding:'utf8'}).trim()!==runtime.npm)throw Error('Pinned runtime required');
 {
  if(execFileSync('git',['status','--porcelain','--untracked-files=normal'],{cwd:root,encoding:'utf8'}).trim())throw Error('Clean committed source required');
  if(process.env.PACT_HOSTED_QA_CLEAN!=='1')throw Error('Isolated checkout acknowledgement required');
  for(const project of['','web','services/pact-api','packages/pact-sdk',...projects])for(const name of['.env','.env.local','.env.production','.env.production.local','.env.development','.env.development.local','.env.test','.env.test.local']){
   try{await access(path.join(root,project,name));throw Error('Active environment file exists; contents not read');}catch(error){if(error.code!=='ENOENT')throw error;}
  }
 }
 if(mode==='install'){
  await npm('sdk-install','packages/pact-sdk',['ci']);await npm('sdk-build','packages/pact-sdk',['run','build']);
  for(const project of['services/pact-api','web',...projects])await npm(project.replaceAll('/','-')+'-install',project,['ci']);
 }else{
  await npm('contract-drift','services/pact-api',['run','openapi:check']);
  await tests('reporting-policy',['scripts/hosted-qa/reporting.test.mjs','scripts/hosted-qa/acceptance.test.mjs','scripts/hosted-qa/export-receipts.test.mjs','scripts/hosted-qa/artifact-policy.test.mjs']);
  for(const project of projects)await npm(project.replaceAll('/','-')+'-tests',project,['test']);
  if(mode==='all'){
   await npm('api-unit','services/pact-api',['test']);
   await command('hosted-dependency-policy',['scripts/hosted-qa/dependencies.mjs']);
   await tests('dependency-policy-tests',['scripts/hosted-qa/dependencies.test.mjs']);
   await command('packed-client',['scripts/hosted-qa/packed-client.mjs']);
   await command('next-route-types',['node_modules/next/dist/bin/next','typegen'],{cwd:path.join(root,'examples/pact-hosted-next')});
   await npm('next-typecheck','examples/pact-hosted-next',['run','typecheck']);
   await npm('next-production-build','examples/pact-hosted-next',['run','build']);
   await command('console-production-build',['scripts/hosted-qa/build-web.mjs']);
   const files=['gateway','gateway-integration','phase1','phase2','phase3','phase4','phase6-client','phase6-contract','phase6-consumer','phase7-clock','phase7-deadline-usage','phase7-maintenance','phase7-restore','load'].map(f=>'scripts/hosted-qa/'+f+'.test.mjs');
   await tests('native-postgres-http',files,{minimumTests:85,env:{PACT_QA_NEXT_EXAMPLE_BUILD:path.join(root,'examples/pact-hosted-next')}});
   await command('independent-developer-demo',['scripts/hosted-qa/developer-demo.mjs'],{demoReceipt:true});
   for(const lane of['console','connect']){
    await command('browser-'+lane,['web/node_modules/@playwright/test/cli.js','test','--config','web/tests/hosted/'+(lane==='console'?'console.config.ts':'playwright.config.ts')]);
    const r=JSON.parse(await readFile(path.join(root,'web/test-results/hosted-'+lane+'/results.json'),'utf8'));
    browserReceipt(r,{revision,runId,lane});
    await command('audit-'+lane,['scripts/hosted-qa/audit-console-artifacts.mjs','web/test-results/hosted-'+lane]);
   }
  }
 }
 const changes=execFileSync('git',['status','--porcelain','--untracked-files=normal'],{cwd:root,encoding:'utf8'}).trimEnd().split(/\r?\n/).filter(Boolean);
 if(execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim()!==revision||changes.some(line=>!['web/next-env.d.ts','examples/pact-hosted-next/next-env.d.ts'].includes(line.slice(3))))throw Error('Source changed during acceptance');
 for(const file of['web/next-env.d.ts','examples/pact-hosted-next/next-env.d.ts'])generatedReferences(await readFile(path.join(root,file),'utf8'));
 summary.status='passed';if(mode==='all')matrixReceipt(summary);
}catch{summary.status='failed';process.exitCode=1;process.stderr.write('Hosted matrix failed; inspect private local logs before any export.\n');}
finally{await record();process.stdout.write('Hosted matrix '+summary.status+' at '+revision+'\n');}
