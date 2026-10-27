import test from 'node:test';
import assert from 'node:assert/strict';
import {nodeReceipt,browserReceipt,browserFailureReceipt,browserFailureDiagnostics,developerDemoNames,developerDemoReceipt,matrixReceipt,matrixNames,generatedReferences} from './acceptance.mjs';
import {readFile} from 'node:fs/promises';
const safeDiagnosis=()=>({schemaVersion:1,apiFailures:{entries:[{code:'DATABASE_UNAVAILABLE',status:503,count:2}],dropped:0},service:{available:true,
 clock:{available:false,windowMs:100,writes:12,totalWriteMs:2.5,maxWriteMs:0.5},http:{active:1,access:0,auth:1,control:0},
 database:{pending:1,protectedPending:0,maxPending:8,perLaneLimit:4,closed:false}}});
test('browser failure diagnosis reconstructs only fixed codes and bounded observational metrics',()=>{
 const value=safeDiagnosis(),secret='private-diagnostic-material';
 for(const object of[value,value.apiFailures,value.apiFailures.entries[0],value.service,value.service.clock,value.service.http,value.service.database])object.extra=secret;
 assert.deepEqual(browserFailureDiagnostics(value),safeDiagnosis());assert.equal(JSON.stringify(browserFailureDiagnostics(value)).includes(secret),false);
 assert.deepEqual(browserFailureDiagnostics({...value,service:{available:false,clock:secret,extra:secret}}),{schemaVersion:1,apiFailures:{entries:[{code:'DATABASE_UNAVAILABLE',status:503,count:2}],dropped:0},service:{available:false}});
 const invalid=[null,[],{...value,schemaVersion:2},{...value,service:{available:'true'}}];
 for(const [key,bad]of[['status',399],['status',600],['status','503'],['count',0],['count',10000],['count',NaN],['code',secret]]){
  const next=safeDiagnosis();next.apiFailures.entries[0][key]=bad;invalid.push(next);
 }
 for(const bad of[-1,10000,Infinity,'0']){const next=safeDiagnosis();next.apiFailures.dropped=bad;invalid.push(next);}
 const duplicate=safeDiagnosis();duplicate.apiFailures.entries.push({...duplicate.apiFailures.entries[0]});invalid.push(duplicate);
 const tooMany=safeDiagnosis();tooMany.apiFailures.entries=Array.from({length:17},(_,i)=>({code:'UNCLASSIFIED',status:400+i,count:1}));invalid.push(tooMany);
 for(const [section,key,bad]of[['clock','windowMs',101],['clock','available',1],['clock','writes',1.5],['clock','writes',1e9+1],['clock','totalWriteMs',NaN],['clock','maxWriteMs',Infinity],['http','active',129],['http','auth',-1],['database','pending',65],['database','maxPending',1],['database','perLaneLimit',33],['database','closed',0]]){
  const next=safeDiagnosis();next.service[section][key]=bad;invalid.push(next);
 }
 for(const next of invalid)assert.throws(()=>browserFailureDiagnostics(next),/Ineligible bounded browser diagnosis/);
});
test('parent browser failure receipt independently revalidates diagnostics and omits passing case diagnostics',()=>{
 const binding={revision:'a'.repeat(40),runId:'fixture-run',lane:'console'},secret='sensitive-matcher-value';
 const receipt={schemaVersion:1,kind:'hosted-browser-receipt',rawDiagnosticsRecorded:false,...binding,buildRevision:binding.revision,buildRunId:binding.runId,status:'failed',stats:{expected:1,unexpected:1,skipped:0},runnerErrors:0,
 tests:[{file:'console.spec.ts',line:84,project:'desktop-console',status:'failed',durationMs:42,failureDiagnostics:{...safeDiagnosis(),extra:secret}},
  {file:'console.spec.ts',line:85,project:'desktop-console',status:'passed',durationMs:1,failureDiagnostics:{secret}}]};
 const result=browserFailureReceipt(receipt,binding);assert.equal(result.cases.length,1);assert.deepEqual(result.cases[0].diagnostics,safeDiagnosis());assert.equal(JSON.stringify(result).includes(secret),false);
 receipt.tests[0].failureDiagnostics.apiFailures.entries[0].code=secret;assert.throws(()=>browserFailureReceipt(receipt,binding));
});
test('browser failure summaries export only bound status and numeric source locations',()=>{
 const binding={revision:'a'.repeat(40),runId:'fixture-run',lane:'console'},secret='sensitive-matcher-value';
 const receipt={schemaVersion:1,kind:'hosted-browser-receipt',rawDiagnosticsRecorded:false,...binding,buildRevision:binding.revision,buildRunId:binding.runId,status:'failed',stats:{expected:0,unexpected:1,skipped:0},runnerErrors:0,tests:[{file:'console.spec.ts',line:84,project:'desktop-console',status:'failed',durationMs:42,title:secret,error:secret,stdout:secret,failureLocations:[{file:'console-fixtures.ts',line:73,column:4,secret}]}]};
 const result=browserFailureReceipt(receipt,binding);assert.equal(result.cases.length,1);assert.equal(JSON.stringify(result).includes(secret),false);assert.deepEqual(result.cases[0].locations,[{file:1,line:73,column:4}]);
 for(const patch of[{revision:'b'.repeat(40)},{rawDiagnosticsRecorded:true},{status:'passed'},{runnerErrors:-1},{tests:[{...receipt.tests[0],failureLocations:[{file:secret,line:73,column:4}]}]},{tests:[{...receipt.tests[0],line:100001}]}])assert.throws(()=>browserFailureReceipt({...receipt,...patch},binding));
});
test('independent demonstration requires complete clean-source packed-consumer evidence',()=>{
 const revision='a'.repeat(40),valid={schemaVersion:1,kind:'independent-packed-developer-demo',sourceRevision:revision,trackedWorkingTreeClean:true,status:'PASS',synthetic:true,blockchainPurchases:0,networkTransactions:0,externalPublication:false,checkCount:17,checks:Object.fromEntries(developerDemoNames.map(name=>[name,'PASS'])),archives:Object.fromEntries(['client','engine','express'].map(name=>[name,{sha256:'b'.repeat(64)}]))};
 valid.sourceArchiveSha256='d'.repeat(64);
 assert.equal(developerDemoReceipt(valid,revision),true);
 for(const patch of [{sourceRevision:'c'.repeat(40)},{sourceArchiveSha256:''},{trackedWorkingTreeClean:false},{checks:{}},{checkCount:16},{synthetic:false},{networkTransactions:1},{archives:{}},{status:'FAIL'}])assert.throws(()=>developerDemoReceipt({...valid,...patch},revision));
 const substituted=structuredClone(valid);delete substituted.checks[developerDemoNames[0]];substituted.checks.unrelatedCheck='PASS';assert.throws(()=>developerDemoReceipt(substituted,revision));
});
test('zero exit cannot substitute for complete mandatory Node cases',()=>{
 const output='# tests 3\n# pass 3\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n';
 assert.deepEqual(nodeReceipt(output,3),{tests:3,passed:3});assert.deepEqual(nodeReceipt(output.replaceAll('#','ℹ'),3),{tests:3,passed:3});
 for(const bad of['',output+output,output.replace('skipped 0','skipped 1'),output.replace('cancelled 0','cancelled 1'),output.replace('todo 0','todo 1'),output.replace('tests 3','tests 0'),output.replace('pass 3','pass 2')])assert.throws(()=>nodeReceipt(bad,3));
 assert.throws(()=>nodeReceipt(output,4));
});
test('generated Next reference allowance rejects additional source code or changed imports',async()=>{
 const source=await readFile(new URL('../../web/next-env.d.ts',import.meta.url),'utf8');assert.equal(generatedReferences(source),true);
 assert.throws(()=>generatedReferences(source+'export const injected = true;\n'));assert.throws(()=>generatedReferences(source.replace('next/image-types/global','external-code')));
});
test('passed matrix requires every expected child once and no failed or running command',()=>{
 const valid={mode:'all',status:'passed',results:matrixNames.map(name=>({name,status:'passed'}))};assert.equal(matrixReceipt(valid),true);
 for(const results of[[],valid.results.slice(1),[...valid.results,valid.results[0]],valid.results.map((x,i)=>i===0?{...x,status:'failed'}:x),valid.results.map((x,i)=>i===0?{...x,status:'running'}:x)])assert.throws(()=>matrixReceipt({...valid,results}));
 assert.throws(()=>matrixReceipt({...valid,mode:'install'}));
});
test('browser receipts require this exact build/run/revision and full counts',()=>{
 const binding={revision:'a'.repeat(40),runId:'fixture-run',lane:'console'},valid={schemaVersion:1,kind:'hosted-browser-receipt',rawDiagnosticsRecorded:false,revision:binding.revision,runId:binding.runId,buildRevision:binding.revision,buildRunId:binding.runId,status:'passed',stats:{expected:16,unexpected:0,skipped:0},runnerErrors:0};
 assert.equal(browserReceipt(valid,binding),true);
 for(const key of['revision','runId','buildRevision','buildRunId'])assert.throws(()=>browserReceipt({...valid,[key]:'old'},binding));
 for(const stats of[{expected:0,unexpected:0,skipped:0},{expected:16,unexpected:0,skipped:1},{expected:16,unexpected:1,skipped:0}])assert.throws(()=>browserReceipt({...valid,stats},binding));
 assert.throws(()=>browserReceipt({...valid,runnerErrors:1},binding));assert.throws(()=>browserReceipt({...valid,status:'failed'},binding));
});
