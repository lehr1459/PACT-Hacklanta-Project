import {mkdir,writeFile,open,readdir,access} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {writeSync} from 'node:fs';
import path from 'node:path';
import {root,npmCli,execute} from './common.mjs';
import {loadRuntimePolicy} from './runtime.mjs';

const requested=process.argv[2]??'help';
const requireClean=process.argv.includes('--clean')||['true','1'].includes(process.env.CI);
const groups={
  'all-node':['environment','install','node','build','browser-solana','browser-base','browser-integration','browser-checkout','browser-examples','packed','dependencies','artifacts','external-saturday'],
  'all-chain':['environment','windows-setup','chain','artifacts'],
};
const names=['environment','install','node','build','browser-solana','browser-base','browser-integration','browser-checkout','browser-examples','packed','dependencies','windows-setup','chain','artifacts','external-saturday','live-read'];
if(requested==='help') {console.log(`Usage: node scripts/validation/run.mjs <${[...Object.keys(groups),...names].join('|')}> [--clean]\nRun release validation in a fresh committed checkout. --clean (automatic in CI) refuses ambient .env files by existence only. Targeted local runs preserve local files and are not clean-release evidence. Required lanes use local synthetic fixtures only. external-saturday requires an explicit PACT_EXTERNAL_SATURDAY path; live-read is opt-in.`);process.exit(0);}
if(!names.includes(requested)&&!groups[requested])throw Error('Unknown validation lane: '+requested);
const directory=path.join(root,'web/test-results/validation',requested);
await mkdir(directory,{recursive:true});
const results=[];
const summary={lane:requested,cleanEnvironmentRequired:requireClean,startedAt:new Date().toISOString(),node:process.version,platform:process.platform,revision:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),results};
async function record(){await writeFile(path.join(directory,'results.json'),JSON.stringify(summary,null,2)+'\n');}
async function command(name,args,{cwd=root,env={},binary=process.execPath,probeOnly=false,capture=false}={}) {
  const logfile=path.join(directory,`${results.length+1}-${name}.log`),handle=await open(logfile,'w');
  const item={name,binary,args,cwd,environment:env,log:logfile,startedAt:new Date().toISOString(),status:'running'};
  results.push(item);await record();const started=Date.now();let captured='';
  try {
    const result=await execute(binary,args,{cwd,env,onOutput:(chunk,channel)=>{writeSync(handle.fd,chunk);if(capture&&channel==='stdout')captured+=chunk.toString('utf8');}});
    Object.assign(item,result,{status:result.code===0?'passed':probeOnly?'unavailable':'failed'});
    if(result.code!==0&&!probeOnly)throw Error(`${name} exited ${result.code}`);
    return {...result,...(capture?{output:captured}:{})};
  }
  catch(error){item.status=probeOnly?'unavailable':'failed';item.error=error.message;if(probeOnly)return{code:1,signal:null,output:captured};throw error;}
  finally{item.durationMs=Date.now()-started;await handle.close();await record();}
}
const npm=(name,args,cwd=root)=>command(name,[npmCli(),...args],{cwd});
const web=path.join(root,'web'),sdk=path.join(root,'packages/pact-sdk');
const playwright=(name,config,cwd=web,env={})=>command(name,[path.join(web,'node_modules/@playwright/test/cli.js'),'test','--config',config],{cwd,env});
const prism=(name,env={})=>command(name,[path.join(root,'examples/pact-demo-app/node_modules/@playwright/test/cli.js'),'test','--config','examples/pact-checkout-vanilla/tests/prism.config.ts'],{env});
async function lane(name) {
  console.log(`\nValidation lane: ${name}`);
  if(name==='environment') {
    const runtime=await loadRuntimePolicy();
    if(process.version!=='v'+runtime.node)throw Error('Required Node v'+runtime.node+'; found '+process.version);
    const version=execFileSync(process.execPath,[npmCli(),'--version'],{encoding:'utf8'}).trim();
    if(version!==runtime.npm)throw Error('Required npm '+runtime.npm+'; found '+version);
    results.push({name:'environment',status:'passed',node:process.version,npm:version,platform:process.platform});await record();
  } else if(name==='install') {
    await npm('sdk-ci',['ci'],sdk);await npm('sdk-build',['run','build'],sdk);
    for(const project of ['web','examples/pact-demo-app','examples/pact-platform-app'])await npm(project.replaceAll('/','-')+'-ci',['ci'],path.join(root,project));
  } else if(name==='node') {
    await npm('sdk-typecheck',['run','typecheck'],sdk);
    const tests=(await readdir(path.join(sdk,'tests'))).filter(file=>file.endsWith('.test.mjs')).map(file=>'tests/'+file);
    await command('sdk-tests',['--test',...tests],{cwd:sdk});
    await command('platform-tests',['--test','web/tests/platform/auth.test.mjs','web/tests/platform/api.test.mjs']);
    await command('dependency-policy-tests',['--test','scripts/validation/dependencies.test.mjs']);
    await command('artifact-policy-tests',['--test','scripts/validation/artifacts.test.mjs']);
    await command('deployment-identity-tests',['--test','scripts/solana/deployment-identity.test.mjs']);
    await command('provenance-tests',['--test','scripts/solana/provenance.test.mjs']);
    await command('sdk-release-policy-tests',['--test','scripts/release/sdk.test.mjs']);
    await command('runtime-review-tests',['--test','scripts/validation/runtime.test.mjs']);
  } else if(name==='build') {
    for(const project of ['web','examples/pact-demo-app','examples/pact-platform-app']) {
      const cwd=path.join(root,project),id=project.replaceAll('/','-');
      await command(id+'-route-types',[path.join(cwd,'node_modules/next/dist/bin/next'),'typegen'],{cwd});
      await npm(id+'-typecheck',['run','typecheck'],cwd);
      await command(id+'-production-build',[path.join(cwd,'node_modules/next/dist/bin/next'),'build'],{cwd,env:{NEXT_PUBLIC_PACT_SOLANA_PROGRAM_ID:'EiiiWWsW2kkqP6nugHz6iBADvhnW5xnibAtZ82ZExVqy',NEXT_PUBLIC_SOLANA_RPC_URL:'https://api.devnet.solana.com',NEXT_PUBLIC_PACT_CONTRACT_ADDRESS:'',PACT_AUTH_MODE:'disabled'}});
      if(project==='web')await command('production-route-smoke',['examples/pact-checkout-vanilla/tests/web-production-smoke.mjs']);
    }
  } else if(name==='browser-solana') {
    for(const mode of ['mock','setup'])await playwright('solana-'+mode,'tests/solana/playwright.config.ts',web,{PACT_SOLANA_QA_MODE:mode});
  } else if(name==='browser-base') {
    for(const mode of ['mock','setup'])await playwright('base-'+mode,'playwright.config.ts',web,{PACT_QA_MODE:mode});
  } else if(name==='browser-integration') {
    await playwright('wizard','tests/integration/playwright.config.ts');
    await playwright('generated','tests/integration/generated.config.ts');
  } else if(name==='browser-checkout') {
    await playwright('checkout','examples/pact-checkout-vanilla/tests/playwright.config.ts',root);
    await command('static-server-safety',['examples/pact-checkout-vanilla/tests/server-qa.mjs']);
  } else if(name==='browser-examples') {
    await prism('prism');
    const app=path.join(root,'examples/pact-platform-app');
    await command('platform-browser',[path.join(app,'node_modules/@playwright/test/cli.js'),'test','--config','tests/playwright.config.ts'],{cwd:app});
  } else if(name==='packed')await command('packed-consumer',['scripts/validation/packed-consumer.mjs','--output',path.join(directory,'packed-consumer')]);
  else if(name==='dependencies')await command('dependency-policy',['scripts/validation/dependencies.mjs']);
  else if(name==='windows-setup') {
    if(process.platform!=='win32')throw Error('Pinned chain toolchain requires Windows; use the Windows CI job.');
    const virtualPython=path.join(root,'solana/.tools/venv/Scripts/python.exe');
    let hasVirtualPython=true;try{await access(virtualPython);}catch{hasVirtualPython=false;}
    let python=virtualPython;
    const probe='import json,sys; assert sys.version_info[:3] == (3,13,5), sys.version; print(json.dumps({"executable":sys.executable,"version":sys.version}))';
    if(!hasVirtualPython) {
      python=undefined;
      for(const candidate of [{binary:'py',prefix:['-3.13']},{binary:'python',prefix:[]}]) {
        const result=await command('python-probe-'+candidate.binary,[...candidate.prefix,'-c',probe],{binary:candidate.binary,probeOnly:true,capture:true});
        if(result.code===0) {const selected=JSON.parse(result.output);await access(selected.executable);python=selected.executable;break;}
      }
      if(!python)throw Error('Python 3.13.5 is required; neither the py -3.13 launcher nor python selected that exact interpreter. See probe receipts.');
    }
    await command('pinned-python',['-c',probe],{binary:python});
    if(!hasVirtualPython)await command('solana-python-venv',['-m','venv',path.join(root,'solana/.tools/venv')],{binary:python});
    await command('solana-setup',['-NoProfile','-ExecutionPolicy','Bypass','-File','solana/scripts/setup.ps1'],{binary:'powershell.exe'});
    // Nested dependency repositories have no Solidity EOL attributes. Reproduce
    // the reviewed CRLF dependency sources without changing global Git config.
    await command('foundry-setup',['-NoProfile','-ExecutionPolicy','Bypass','-File','contracts/scripts/setup.ps1'],{binary:'powershell.exe',env:{GIT_CONFIG_COUNT:'1',GIT_CONFIG_KEY_0:'core.autocrlf',GIT_CONFIG_VALUE_0:'true'}});
  } else if(name==='chain') {
    if(process.platform!=='win32')throw Error('Pinned chain toolchain requires Windows; use the Windows CI job.');
    await command('solana-build',['-NoProfile','-ExecutionPolicy','Bypass','-File','solana/scripts/build.ps1'],{binary:'powershell.exe'});
    await command('solana-svm',['-m','unittest','discover','-s','tests','-p','test_*.py','-v'],{cwd:path.join(root,'solana'),binary:path.join(root,'solana/.tools/venv/Scripts/python.exe')});
    await command('foundry-tests',['test','-vv'],{cwd:path.join(root,'contracts'),binary:path.join(root,'contracts/.tools/foundry-v1.8.5/forge.exe')});
    await command('compiled-evidence',['scripts/validation/verify-artifacts.mjs','--compiled-base']);
    await command('approved-artifacts-unchanged',['diff','--exit-code','--','solana/artifacts','contracts/abi'],{binary:'git'});
  } else if(name==='artifacts')await command('committed-evidence',['scripts/validation/verify-artifacts.mjs']);
  else if(name==='live-read') {
    await command('public-checkout-quote',['tests/checkout-qa-live.mjs'],{cwd:sdk});
    await playwright('solana-public-read','tests/solana/playwright.config.ts',web,{PACT_SOLANA_QA_MODE:'live'});
    await playwright('wizard-public-read','tests/integration/playwright.config.ts',web,{PACT_INTEGRATION_QA_MODE:'live'});
    await playwright('checkout-public-read','examples/pact-checkout-vanilla/tests/playwright.config.ts',root,{PACT_CHECKOUT_QA_MODE:'live'});
    await prism('prism-public-read',{PACT_SDK_QA_MODE:'live'});
  }
  else if(name==='external-saturday') {
    if(!process.env.PACT_EXTERNAL_SATURDAY){results.push({name,status:'skipped',reason:'Optional external repository not configured; set PACT_EXTERNAL_SATURDAY explicitly.'});await record();return;}
    await command('external-saturday-bundle',['examples/pact-checkout-vanilla/tests/build-saturday-consumer.mjs']);
    await playwright('external-saturday','examples/pact-checkout-vanilla/tests/saturday.config.ts',root);
  }
}
try{
  if(requireClean) {
    const unexpected=[];
    for(const project of ['','web','packages/pact-sdk','examples/pact-demo-app','examples/pact-platform-app'])for(const file of ['.env','.env.local','.env.production','.env.production.local','.env.development','.env.development.local','.env.test','.env.test.local']) {
      const target=path.join(root,project,file);try{await access(target);unexpected.push(path.relative(root,target));}catch(error){if(error.code!=='ENOENT')throw error;}
    }
    if(unexpected.length)throw Error('Clean validation refuses local environment files (contents were not read): '+unexpected.join(', ')+'. Use a fresh committed checkout.');
    results.push({name:'clean-environment',status:'passed',method:'existence-only checks; no local environment files'});
  }
  for(const name of groups[requested]??[requested])await lane(name);summary.status='passed';
}
catch(error){summary.status='failed';summary.error=error.message;process.exitCode=1;console.error(error.message);}
finally{summary.finishedAt=new Date().toISOString();await record();console.log(`Validation ${summary.status}: ${path.relative(root,path.join(directory,'results.json'))}`);}
