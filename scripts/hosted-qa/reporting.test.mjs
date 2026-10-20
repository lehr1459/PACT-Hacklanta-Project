import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {randomBytes} from 'node:crypto';
import {mkdir,mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {root} from '../validation/common.mjs';
test('hosted reporter omits raw matcher errors, output, proof material and attachments even on failure',async()=>{
 const require=createRequire(new URL('../../web/package.json',import.meta.url)),ts=require('typescript');
 const source=await readFile(path.join(root,'web/tests/hosted/console-reporter.ts'),'utf8');
 const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
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
   {status:'failed',duration:1,errors:[{message:sensitive.join('\n'),stack:sensitive.join('\n')}],attachments:[{body:Buffer.from(key)}]});
  await reporter.onEnd({status:'failed'});
 }finally{process.stdout.write=write;if(binding!==undefined)process.env.PACT_HOSTED_QA_RUN_ID=binding;}
 const file=await readFile(path.join(directory,'results.json'),'utf8');for(const secret of sensitive)assert.ok(!output.includes(secret)&&!file.includes(secret),'sensitive test values must not be recorded');
 const receipt=JSON.parse(file);assert.equal(receipt.status,'failed');assert.equal(receipt.stats.unexpected,1);assert.equal(receipt.runnerErrors,1);assert.equal(receipt.rawDiagnosticsRecorded,false);
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
 const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
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
