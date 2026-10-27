import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {randomBytes} from 'node:crypto';
import {mkdir,mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {EventEmitter} from 'node:events';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import {root} from '../validation/common.mjs';
async function consoleObserver(){
 const require=createRequire(new URL('../../web/package.json',import.meta.url)),ts=require('typescript');
 const source=await readFile(path.join(root,'web/tests/hosted/console-fixtures.ts'),'utf8');
 const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText
  .replaceAll('../../../scripts/hosted-qa/acceptance.mjs',new URL('./acceptance.mjs',import.meta.url).href)
  .replaceAll("'@playwright/test'",JSON.stringify(pathToFileURL(path.join(path.dirname(require.resolve('@playwright/test')),'index.mjs')).href));
 return import('data:text/javascript;base64,'+Buffer.from(compiled).toString('base64'));
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const observedResponse=(status=503,url='http://127.0.0.1:3112/v1/access/check',json=async()=>({error:{code:'DATABASE_UNAVAILABLE'}}),contentType='application/json')=>({status:()=>status,url:()=>url,headers:()=>({'content-type':contentType}),json});
test('failure observer never reads successful or unrelated response bodies and preserves response order',async()=>{
 const {observeApiFailures,finishApiFailures}=await consoleObserver(),page=new EventEmitter();let excludedReads=0,resolveFirst;
 const excluded=async()=>{excludedReads++;return{secret:'must-never-read'};};observeApiFailures(page);
 for(const [status,url]of[[200,'http://127.0.0.1:3112/v1/access/check'],[503,'https://foreign.invalid/v1/access/check'],[503,'http://127.0.0.1:3112/not-v1'],[NaN,'http://127.0.0.1:3112/v1/access/check'],[503.5,'http://127.0.0.1:3112/v1/access/check']])page.emit('response',observedResponse(status,url,excluded));
 page.emit('response',observedResponse(503,undefined,()=>new Promise(resolve=>{resolveFirst=resolve;})));
 page.emit('response',observedResponse(401,undefined,async()=>({error:{code:'AUTH_REQUIRED'},secret:'not-exported'})));
 await tick();resolveFirst({error:{code:'DATABASE_UNAVAILABLE',secret:'not-exported'}});
 assert.deepEqual(await finishApiFailures(page),{entries:[{code:'DATABASE_UNAVAILABLE',status:503,count:1},{code:'AUTH_REQUIRED',status:401,count:1}],dropped:0});
 assert.equal(excludedReads,0);assert.equal(page.listenerCount('response'),0);
});
test('failure observer enforces fixed values and separate pending, event and group caps',async()=>{
 const {observeApiFailures,finishApiFailures}=await consoleObserver();
 const pendingPage=new EventEmitter();observeApiFailures(pendingPage);
 for(let i=0;i<17;i++)pendingPage.emit('response',observedResponse(503,undefined,()=>new Promise(()=>{})));
 const start=performance.now();assert.deepEqual(await finishApiFailures(pendingPage),{entries:[{code:'UNCLASSIFIED',status:503,count:16}],dropped:1});assert.ok(performance.now()-start>=450,'bounded drain waits for pending bodies');
 const eventsPage=new EventEmitter();observeApiFailures(eventsPage);
 for(let i=0;i<65;i++){eventsPage.emit('response',observedResponse(503,undefined,async()=>({error:{code:'private-unapproved-code'},secret:'must-not-export'})));await tick();}
 assert.deepEqual(await finishApiFailures(eventsPage),{entries:[{code:'UNCLASSIFIED',status:503,count:64}],dropped:1});
 const groupsPage=new EventEmitter();observeApiFailures(groupsPage);
 for(let i=0;i<17;i++){groupsPage.emit('response',observedResponse(400+i));await tick();}
 const groups=await finishApiFailures(groupsPage);assert.equal(groups.entries.length,16);assert.equal(groups.dropped,1);assert.equal(groups.entries[0].status,400);assert.equal(groups.entries.at(-1).status,415);
 const malformedPage=new EventEmitter();observeApiFailures(malformedPage);
 malformedPage.emit('response',observedResponse(500,undefined,async()=>{throw Error('private-json-error');}));
 malformedPage.emit('response',observedResponse(501,undefined,async()=>{throw Error('body must not be read');},'text/plain'));
 assert.deepEqual(await finishApiFailures(malformedPage),{entries:[{code:'UNCLASSIFIED',status:500,count:1},{code:'UNCLASSIFIED',status:501,count:1}],dropped:0});
});
test('failure snapshot strips service secrets and handles unavailable or malformed observations safely',async()=>{
 const {failureDiagnosticSnapshot}=await consoleObserver();
 for(const response of[{status:()=>200,json:async()=>({available:false,secret:'private-service-data'})},{status:()=>200,json:async()=>({available:true,clock:{secret:'private-service-data'}})},{status:()=>503,json:async()=>{throw Error('do not read');}},null]){
  const page=new EventEmitter();page.request={get:async(url,options)=>{assert.equal(url,'http://127.0.0.1:3113/qa/diagnostics');assert.deepEqual(options,{timeout:1000});if(!response)throw Error('private-request-error');return response;}};
  assert.deepEqual(await failureDiagnosticSnapshot(page),{schemaVersion:1,apiFailures:{entries:[],dropped:0},service:{available:false}});
 }
});
test('browser failure annotations reject arbitrary strings and duplicates and reconstruct only safe observations',async()=>{
 const require=createRequire(new URL('../../web/package.json',import.meta.url)),ts=require('typescript');
 const source=await readFile(path.join(root,'web/tests/hosted/console-reporter.ts'),'utf8');
 const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText.replaceAll('../../../scripts/hosted-qa/acceptance.mjs',new URL('./acceptance.mjs',import.meta.url).href);
 const {annotationDiagnostics,default:Reporter}=await import('data:text/javascript;base64,'+Buffer.from(compiled).toString('base64'));
 const secret='private-matcher-material',value={schemaVersion:1,apiFailures:{entries:[{code:'CLOCK_UNAVAILABLE',status:503,count:1,secret}],dropped:0,secret},service:{available:false,secret},secret};
 const annotation={type:'pact-safe-failure-v1',description:JSON.stringify(value)};
 const expected={schemaVersion:1,apiFailures:{entries:[{code:'CLOCK_UNAVAILABLE',status:503,count:1}],dropped:0},service:{available:false}};
 assert.deepEqual(annotationDiagnostics([annotation]),expected);
 for(const annotations of[[],[annotation,annotation],Array.from({length:65},()=>annotation),[{...annotation,type:'other'}],[{...annotation,description:'invalid '+secret}],[{...annotation,description:'x'.repeat(8193)}],[{...annotation,description:JSON.stringify({...value,schemaVersion:2})}]])assert.equal(annotationDiagnostics(annotations),undefined);
 const reporter=new Reporter({outputFile:'unused'}),write=process.stdout.write;let output='';
 try{
  process.stdout.write=function(chunk){output+=String(chunk);return true;};
  for(const status of['passed','failed'])reporter.onTestEnd({id:status,title:'safe fixture',location:{file:'console.spec.ts',line:1},parent:{project:()=>({name:'desktop-console'})}},
   {status,duration:1,errors:[],annotations:[annotation]});
 }finally{process.stdout.write=write;}
 assert.equal(Object.hasOwn(reporter.results.get('passed'),'failureDiagnostics'),false);
 assert.deepEqual(reporter.results.get('failed').failureDiagnostics,expected);
 assert.equal(JSON.stringify([...reporter.results.values()]).includes(secret)||output.includes(secret),false);
});
test('hosted reporter omits raw matcher errors, output, proof material and attachments even on failure',async()=>{
 const require=createRequire(new URL('../../web/package.json',import.meta.url)),ts=require('typescript');
 const source=await readFile(path.join(root,'web/tests/hosted/console-reporter.ts'),'utf8');
 const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText.replaceAll('../../../scripts/hosted-qa/acceptance.mjs',new URL('./acceptance.mjs',import.meta.url).href);
 const {default:Reporter}=await import('data:text/javascript;base64,'+Buffer.from(compiled).toString('base64'));
 const base=path.join(root,'web/test-results/hosted-reporter-fixtures');await mkdir(base,{recursive:true});const directory=await mkdtemp(path.join(base,'run-'));
 const key='pact_sk_dev_key_'+'a'.repeat(32)+'_'+randomBytes(32).toString('base64url'),grant='pact_grant_'+randomBytes(32).toString('base64url'),code='pact_code_'+randomBytes(32).toString('base64url');
 const sensitive=[key,grant,code,'pact-domain-verification='+randomBytes(32).toString('base64url'),'Browser/session binding: '+'b'.repeat(64),randomBytes(64).toString('base64')];
 const reporter=new Reporter({outputFile:path.join(directory,'results.json')}),write=process.stdout.write;let output='';
 const binding=process.env.PACT_HOSTED_QA_RUN_ID;delete process.env.PACT_HOSTED_QA_RUN_ID;
 try{
  process.stdout.write=function(chunk){output+=String(chunk);return true;};
  reporter.onStdOut(Buffer.from(sensitive.join('\n')));reporter.onStdErr(Buffer.from(sensitive.join('\n')));reporter.onError(new Error(sensitive.join('\n')));
  reporter.onTestEnd({id:'safe-id',title:'diagnostic '+key,location:{file:'public.spec.ts',line:1},parent:{project:()=>({name:'project '+grant})}},
   {status:'failed',duration:1,errors:[{message:sensitive.join('\n'),stack:sensitive.join('\n'),location:{file:'/private/'+grant+'/console.spec.ts',line:42,column:9}}],attachments:[{body:Buffer.from(key)}]});
  await reporter.onEnd({status:'failed'});
 }finally{process.stdout.write=write;if(binding!==undefined)process.env.PACT_HOSTED_QA_RUN_ID=binding;}
 const file=await readFile(path.join(directory,'results.json'),'utf8');for(const secret of sensitive)assert.ok(!output.includes(secret)&&!file.includes(secret),'sensitive test values must not be recorded');
 const receipt=JSON.parse(file);assert.equal(receipt.status,'failed');assert.equal(receipt.stats.unexpected,1);assert.equal(receipt.runnerErrors,1);assert.equal(receipt.rawDiagnosticsRecorded,false);
 assert.deepEqual(receipt.tests[0].failureLocations,[{file:'console.spec.ts',line:42,column:9}]);
});

test('hosted failure coordinates allow only bounded known source locations and omit raw stack text',async()=>{
 const require=createRequire(new URL('../../web/package.json',import.meta.url)),ts=require('typescript');
 const source=await readFile(path.join(root,'web/tests/hosted/console-reporter.ts'),'utf8');
 const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText.replaceAll('../../../scripts/hosted-qa/acceptance.mjs',new URL('./acceptance.mjs',import.meta.url).href);
 const {failureLocations}=await import('data:text/javascript;base64,'+Buffer.from(compiled).toString('base64'));
 const secret='pact_grant_'+randomBytes(32).toString('base64url');
 const structured={location:{file:'C:\\private\\'+secret+'\\console.spec.ts',line:42,column:9},
  message:secret,stack:`Error: ${secret}\n    at helper (/private/connect.spec.ts:99:3)`};
 assert.deepEqual(failureLocations([structured]),[{file:'console.spec.ts',line:42,column:9}],'structured location takes precedence over a stack');
 const errors=[structured,structured,{message:secret,stack:`Error: ${secret}\nconsole.spec.ts:1:1\n at caller (/private/${secret}/console-fixtures.ts:17:5)\n at /private/connect.spec.ts:33:7\n at /private/secret.ts:1:1\n at /private/console.spec.ts:0:1\n at /private/console.spec.ts:100001:1\n at /private/console.spec.ts:1:10001\n at /private/console.spec.ts:4:5 ${secret}`}];
 const result=failureLocations(errors);
 assert.deepEqual(result,[{file:'console.spec.ts',line:42,column:9},{file:'console-fixtures.ts',line:17,column:5},{file:'connect.spec.ts',line:33,column:7}]);
 assert.ok(!JSON.stringify(result).includes(secret));
 for(const [line,column]of [[NaN,1],[Infinity,1],[1.5,1],['2',1],[1,-1],[1,0],[1,'2']])
  assert.deepEqual(failureLocations([{location:{file:'console.spec.ts',line,column}}]),[]);
 assert.deepEqual(failureLocations([{location:{file:'console.spec.ts?private='+secret,line:1,column:1}}]),[]);
 const many=Array.from({length:30},(_,i)=>({stack:` at /private/console.spec.ts:${i+1}:1`}));
 assert.equal(failureLocations(many).length,8,'bounded output');
 assert.deepEqual(failureLocations([{stack:'x'.repeat(65536)+'\n at /private/console.spec.ts:1:1'}]),[],'bounded stack input');
});
test('hosted browser configurations forbid recording and failure page snapshots',async()=>{
 for(const file of['console.config.ts','playwright.config.ts']){
  const source=await readFile(path.join(root,'web/tests/hosted',file),'utf8');
  assert.match(source,/PLAYWRIGHT_NO_COPY_PROMPT.*1/);assert.match(source,/trace:'off'/);assert.match(source,/video:'off'/);assert.match(source,/screenshot:'off'/);
  assert.ok(!source.includes("['list']")&&!source.includes("['json'"),'raw Playwright error reporters must not be enabled');
 }
});

test('artifact audit rejects recordings, unapproved rasters, proof cookies and raw page snapshots',async()=>{
 const base=path.join(root,'web/test-results/hosted-artifact-policy');await mkdir(base,{recursive:true});
 const directory=await mkdtemp(path.join(base,'run-')),file=path.join(directory,'candidate.txt');
 const audit=()=>spawnSync(process.execPath,[path.join(root,'scripts/hosted-qa/audit-console-artifacts.mjs'),directory],{cwd:root,encoding:'utf8',windowsHide:true});
 for(const value of['pact_hosted_session='+'a'.repeat(43),JSON.stringify({name:'pact_connect_binding',value:'a'.repeat(43)}),'# Page snapshot\nraw challenge']){
  await writeFile(file,value);assert.notEqual(audit().status,0,'unsafe artifact must fail closed');
 }
 await writeFile(file,'{"status":"passed","rawDiagnosticsRecorded":false}');assert.equal(audit().status,0);
 for(const name of['proof.png','trace.zip','network.har','video.webm']){
  const candidate=path.join(directory,name);await writeFile(candidate,'fixture');assert.notEqual(audit().status,0);await rm(candidate);
 }
});

test('actual browser reporter binds current run to its production build marker',async()=>{
 const require=createRequire(new URL('../../web/package.json',import.meta.url)),ts=require('typescript');
 const source=await readFile(path.join(root,'web/tests/hosted/console-reporter.ts'),'utf8');
 const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText.replaceAll('../../../scripts/hosted-qa/acceptance.mjs',new URL('./acceptance.mjs',import.meta.url).href);
 const {default:Reporter}=await import('data:text/javascript;base64,'+Buffer.from(compiled).toString('base64'));
 const base=path.join(root,'web/test-results/hosted-reporter-fixtures');await mkdir(base,{recursive:true});const directory=await mkdtemp(path.join(base,'binding-'));
 const output=path.join(directory,'web/test-results/hosted-console/results.json'),marker=path.join(directory,'web/.next/hosted-build.json');await mkdir(path.dirname(marker),{recursive:true});
 const oldRun=process.env.PACT_HOSTED_QA_RUN_ID,oldRevision=process.env.PACT_HOSTED_QA_REVISION,runId='12345678-1234-1234-1234-123456789abc',revision='a'.repeat(40);
 process.env.PACT_HOSTED_QA_RUN_ID=runId;process.env.PACT_HOSTED_QA_REVISION=revision;
 try{
  await writeFile(marker,JSON.stringify({runId:'old-run',revision}));await assert.rejects(new Reporter({outputFile:output}).onEnd({status:'passed'}),/binding mismatch/);
  await writeFile(marker,JSON.stringify({runId,revision}));await new Reporter({outputFile:output}).onEnd({status:'passed'});
  const receipt=JSON.parse(await readFile(output,'utf8'));assert.equal(receipt.runId,runId);assert.equal(receipt.buildRunId,runId);assert.equal(receipt.revision,revision);assert.equal(receipt.buildRevision,revision);
 }finally{for(const[key,value]of Object.entries({PACT_HOSTED_QA_RUN_ID:oldRun,PACT_HOSTED_QA_REVISION:oldRevision})){if(value===undefined)delete process.env[key];else process.env[key]=value;}}
});

test('legacy Base discovery preserves its cases and cannot collect sensitive hosted suites',()=>{
 const result=spawnSync(process.execPath,[path.join(root,'web/node_modules/@playwright/test/cli.js'),'test','--list','--reporter=json','--config',path.join(root,'web/playwright.config.ts')],{cwd:root,encoding:'utf8',windowsHide:true});
 assert.equal(result.status,0,'legacy discovery must complete without starting fixtures');
 let report;try{report=JSON.parse(result.stdout);}catch{throw Error('Unsupported discovery receipt');}
 const files=new Set();let cases=0;
 function visit(suite){if(suite.file)files.add(suite.file.replaceAll('\\','/'));cases+=(suite.specs??[]).reduce((total,spec)=>total+(spec.tests?.length??0),0);for(const child of suite.suites??[])visit(child);}
 for(const suite of report.suites??[])visit(suite);
 assert.ok(cases>0&&files.has('browser.spec.ts'),'existing Base cases remain collected');
 assert.equal([...files].some(file=>/(?:^|\/)hosted\//.test(file)),false,'hosted proofs must never enter legacy trace/reporting configuration');
});
