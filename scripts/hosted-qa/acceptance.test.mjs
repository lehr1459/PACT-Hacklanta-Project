import test from 'node:test';
import assert from 'node:assert/strict';
import {nodeReceipt,browserReceipt,matrixReceipt,matrixNames,generatedReferences} from './acceptance.mjs';
import {readFile} from 'node:fs/promises';
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
