import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {validationEnv} from '../validation/common.mjs';
import reporter,{collectNodeFailures,nodeFailureReceipt,nativeFiles,sourceFingerprint} from './node-reporter.mjs';

const root=fileURLToPath(new URL('../../',import.meta.url));
const identity={revision:'a'.repeat(40),runId:'12345678-1234-4123-8123-123456789abc'};
const sentinel='pact_sk_dev_PRIVATE_assertion_cookie_grant_rpc';
const testFile=nativeFiles[5],absolute=path.join(root,testFile);
const source=(await readFile(absolute,'utf8')).split(/\r?\n/);
const line=source.findIndex(value=>value.includes('assert.'))+1;
assert.ok(line>0);
const summary=(overrides={})=>({type:'test:summary',data:{success:false,counts:{tests:85,passed:84,failed:1,cancelled:0,skipped:0,todo:0},...overrides}});
const failed=(overrides={})=>({type:'test:fail',data:{name:sentinel,file:absolute,line,column:1,details:{error:{code:'ERR_TEST_FAILURE',message:sentinel,
  stack:`Error: ${sentinel}\n    at PRIVATE_FN (${pathToFileURL(absolute).href}:${line}:2)`,
  cause:{code:'ERR_ASSERTION',actual:sentinel,expected:sentinel,message:sentinel,stack:`AssertionError: ${sentinel}\n    at PRIVATE_FN (${pathToFileURL(absolute).href}:${line}:3)`}}},...overrides}});
async function collect(events){return collectNodeFailures(events,identity);}

test('Node failure receipt preserves exact allowlisted declaration/assertion coordinates without raw diagnostics',async()=>{
  const result=await collect([failed(),summary()]);
  assert.equal(result.status,'failed');assert.equal(result.minimumMet,true);assert.equal(result.counts.tests,85);
  assert.equal(result.sourceFingerprint,sourceFingerprint);
  assert.deepEqual(result.failures[0].declaration,{file:testFile,line,column:1});
  assert.equal(result.failures[0].code,'ERR_ASSERTION');
  assert.deepEqual(result.failures[0].locations,[{file:testFile,line,column:2},{file:testFile,line,column:3}]);
  assert.equal(JSON.stringify(result).includes(sentinel),false);assert.equal(JSON.stringify(result).includes(root),false);
  assert.deepEqual(nodeFailureReceipt(result,identity),result);
});

test('Node reporter ignores messages, stdout, stderr, diagnostics and per-file summaries',async()=>{
  const malicious=['test:stdout','test:stderr','test:diagnostic','test:log'].map(type=>({type,data:{message:sentinel,tests:99999}}));
  const result=await collect([...malicious,summary({file:absolute,counts:{tests:99999}}),failed(),summary()]);
  assert.equal(result.counts.tests,85);assert.equal(JSON.stringify(result).includes(sentinel),false);
  assert.equal((await collect([failed(),summary({file:absolute})])).status,'incomplete');
  assert.equal((await collect([failed(),summary(),summary()])).status,'incomplete');
});

test('unrecognized names, paths, traversal, source bounds and control characters never enter output',async()=>{
  const badPaths=['/private/customer/phase4.test.mjs',sentinel,absolute+'\n'+sentinel,path.join(root,'unknown.test.mjs'),
    path.join(root,'scripts','hosted-qa')+'/../hosted-qa/phase4.test.mjs',pathToFileURL(absolute).href+'?secret='+sentinel];
  for(const file of badPaths){
    const result=await collect([failed({file,details:{error:{code:sentinel,stack:`Error: ${sentinel}\n    at PRIVATE (${file}:${line}:1)`}}}),summary()]);
    assert.deepEqual(result.failures,[{declaration:null,code:null,locations:[]}]);assert.equal(JSON.stringify(result).includes(sentinel),false);
  }
  for(const coordinates of[{line:0,column:1},{line:source.length+1,column:1},{line,column:source[line-1].length+2},{line,column:Infinity},{line:1.5,column:1}]){
    const result=await collect([failed({...coordinates,details:{error:{stack:`Error\n    at PRIVATE (${pathToFileURL(absolute).href}:${coordinates.line}:${coordinates.column})`}}}),summary()]);
    assert.deepEqual(result.failures[0],{declaration:null,code:null,locations:[]});
  }
});

test('only fixed enum error codes and bounded cause/stack locations are retained',async()=>{
  const service=path.join(root,'services/pact-api/src/clock.mjs');
  const error={code:'CLOCK_OWNER_LOCKED',message:sentinel,stack:`Error: ${sentinel}\n    at ${pathToFileURL(service).href}:1:1`};error.cause=error;
  const result=await collect([failed({details:{error}}),summary()]);
  assert.equal(result.failures[0].code,'CLOCK_OWNER_LOCKED');
  assert.deepEqual(result.failures[0].locations,[{file:'services/pact-api/src/clock.mjs',line:1,column:1}]);
  const large=await collect([failed({details:{error:{code:sentinel,stack:'x'.repeat(32769)}}}),summary()]);
  assert.deepEqual(large.failures[0].locations,[]);assert.equal(large.failures[0].code,null);
});

test('malformed or incomplete counts cannot make diagnostic output an accepted complete run',async()=>{
  for(const counts of[{tests:85},{tests:NaN,passed:0,failed:0,cancelled:0,skipped:0,todo:0},
    {tests:1,passed:2,failed:0,cancelled:0,skipped:0,todo:0}]){
    const result=await collect([failed(),summary({counts})]);assert.equal(result.status,'incomplete');assert.equal(result.counts,null);assert.equal(result.minimumMet,false);
  }
  const early=await collect([failed(),summary({counts:{tests:1,passed:0,failed:1,cancelled:0,skipped:0,todo:0}})]);
  assert.equal(early.status,'failed');assert.equal(early.minimumMet,false);assert.equal(early.minimumTests,85);
  const passed=await collect([summary({success:true,counts:{tests:85,passed:85,failed:0,cancelled:0,skipped:0,todo:0}})]);
  assert.equal(passed.status,'passed');assert.equal(passed.failures.length,0);
});

test('failure storage and exported bytes stay bounded under repeated hostile events',async()=>{
  const result=await collect([...Array.from({length:1000},()=>failed()),summary()]);
  assert.equal(result.failures.length,32);assert.equal(result.failureEvents,1000);assert.equal(result.omittedFailures,968);
  assert.ok(Buffer.byteLength(JSON.stringify(result))<65536);
  assert.equal(JSON.stringify(result).includes(sentinel),false);
});

test('parent reconstruction rejects stale commit, run, source fingerprint and out-of-source coordinates',async()=>{
  const result=await collect([failed(),summary()]);
  for(const invalid of[{...result,revision:'b'.repeat(40)},{...result,runId:'22345678-1234-4123-8123-123456789abc'},
    {...result,sourceFingerprint:'0'.repeat(64)},{...result,minimumTests:1},{...result,minimumMet:false},
    {...result,failures:[{...result.failures[0],declaration:{file:testFile,line:100000,column:1}}]},
    {...result,failures:[{...result.failures[0],locations:[{file:sentinel,line:1,column:1}]}]}]){
    assert.throws(()=>nodeFailureReceipt(invalid,identity),/^Error: INELIGIBLE_NODE_FAILURE_/);
  }
  const enriched={...result,secret:sentinel,failures:[{...result.failures[0],message:sentinel}]};
  assert.equal(JSON.stringify(nodeFailureReceipt(enriched,identity)).includes(sentinel),false);
  await assert.rejects(()=>collectNodeFailures([],{}),/NODE_FAILURE_BINDING_REQUIRED/);
});

test('actual pinned Node reporter keeps failing child exit, final counts and codes while filtering child diagnostics',async t=>{
  const directory=await mkdtemp(path.join(tmpdir(),'pact-node-reporter-test-'));
  t.after(async()=>{assert.ok(directory.startsWith(path.join(tmpdir(),'pact-node-reporter-test-')));await rm(directory,{recursive:true,force:true});});
  const fixture=path.join(directory,'failure.test.mjs');
  await writeFile(fixture,`import test from 'node:test';import {fail} from ${JSON.stringify(pathToFileURL(path.join(root,'services/pact-api/src/security.mjs')).href)};import {Browser} from ${JSON.stringify(pathToFileURL(path.join(root,'scripts/hosted-qa/browser.mjs')).href)};test(${JSON.stringify(sentinel)},()=>{console.log(${JSON.stringify(sentinel)});console.error(${JSON.stringify(sentinel)});fail('CLOCK_UNAVAILABLE');});test('synthetic helper assertion',async()=>Browser.prototype.login.call({request:async()=>({status:418})}));`);
  const result=await new Promise((resolve,reject)=>{
    const env=validationEnv({PACT_HOSTED_QA_REVISION:identity.revision,PACT_HOSTED_QA_RUN_ID:identity.runId});
    const child=spawn(process.execPath,['--test','--test-reporter='+new URL('./node-reporter.mjs',import.meta.url).href,fixture],{
      env,windowsHide:true,stdio:['ignore','pipe','pipe']});
    let stdout='',stderr='';child.stdout.on('data',chunk=>stdout+=chunk);child.stderr.on('data',chunk=>stderr+=chunk);child.once('error',reject);child.once('close',code=>resolve({code,stdout,stderr}));
  });
  assert.equal(result.code,1);assert.equal(result.stdout.includes(sentinel),false);assert.equal(result.stderr.includes(sentinel),false);
  const receipt=nodeFailureReceipt(JSON.parse(result.stdout),identity);
  assert.equal(receipt.status,'failed');assert.equal(receipt.counts.tests,2);assert.equal(receipt.counts.failed,2);
  assert.equal(receipt.minimumMet,false);assert.equal(receipt.failures[0].code,'CLOCK_UNAVAILABLE');
  assert.equal(receipt.failures[0].declaration,null);assert.ok(receipt.failures[0].locations.some(location=>location.file==='services/pact-api/src/security.mjs'&&location.line===9));
  assert.equal(receipt.failures[1].code,'ERR_ASSERTION');
  const helperLines=(await readFile(path.join(root,'scripts/hosted-qa/browser.mjs'),'utf8')).split(/\r?\n/);
  const assertionLine=helperLines.findIndex(value=>value.includes("this.request('GET','/v1/developer/auth/session');assert.equal"))+1;
  assert.ok(assertionLine>0);assert.ok(receipt.failures[1].locations.some(location=>location.file==='scripts/hosted-qa/browser.mjs'&&location.line===assertionLine));
});

test('async generator emits one reconstructed JSON record and no raw event text',async()=>{
  const oldRevision=process.env.PACT_HOSTED_QA_REVISION,oldRunId=process.env.PACT_HOSTED_QA_RUN_ID;
  try{
    process.env.PACT_HOSTED_QA_REVISION=identity.revision;process.env.PACT_HOSTED_QA_RUN_ID=identity.runId;
    const output=[];for await(const chunk of reporter([failed(),summary()]))output.push(chunk);
    assert.equal(output.length,1);assert.equal(output[0].includes(sentinel),false);assert.equal(JSON.parse(output[0]).status,'failed');
  }finally{
    if(oldRevision===undefined)delete process.env.PACT_HOSTED_QA_REVISION;else process.env.PACT_HOSTED_QA_REVISION=oldRevision;
    if(oldRunId===undefined)delete process.env.PACT_HOSTED_QA_RUN_ID;else process.env.PACT_HOSTED_QA_RUN_ID=oldRunId;
  }
});
