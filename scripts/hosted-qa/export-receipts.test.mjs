import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,copyFile,link} from 'node:fs/promises';
import {spawnSync,execFileSync} from 'node:child_process';
import path from 'node:path';
import {root} from '../validation/common.mjs';
import {matrixNames} from './acceptance.mjs';
async function fixture(){
 const base=path.join(root,'web/test-results/hosted-export-policy');await mkdir(base,{recursive:true});const directory=await mkdtemp(path.join(base,'run-'));
 for(const name of['scripts/hosted-qa','scripts/validation','web/test-results/hosted-console','web/test-results/hosted-connect','web/test-results/hosted-ci','web/test-results/hosted-export'])await mkdir(path.join(directory,name),{recursive:true});
 for(const name of['scripts/hosted-qa/export-receipts.mjs','scripts/hosted-qa/acceptance.mjs','scripts/validation/common.mjs'])await copyFile(path.join(root,name),path.join(directory,name));
 execFileSync('git',['init','--quiet'],{cwd:directory});execFileSync('git',['-c','user.name=PACT disposable fixture','-c','user.email=pact-fixture@invalid.local','commit','--quiet','--allow-empty','-m','fixture'],{cwd:directory});
 const revision=execFileSync('git',['rev-parse','HEAD'],{cwd:directory,encoding:'utf8'}).trim(),runId='12345678-1234-1234-1234-123456789abc';
 const receipts={};for(const lane of['console','connect'])receipts[lane]={schemaVersion:1,kind:'hosted-browser-receipt',revision,runId,buildRevision:revision,buildRunId:runId,status:'passed',stats:{expected:lane==='console'?16:12,unexpected:0,skipped:0},runnerErrors:0,rawDiagnosticsRecorded:false,extra:'pact_grant_'+'a'.repeat(43)};
 receipts.matrix={schemaVersion:1,kind:'hosted-local-matrix',mode:'all',revision,runId,status:'passed',results:matrixNames.map(name=>({name,status:'passed',durationMs:1}))};
 const save=async()=>{for(const lane of['console','connect','matrix'])await writeFile(path.join(directory,'web/test-results/'+(lane==='matrix'?'hosted-ci':'hosted-'+lane)+'/results.json'),JSON.stringify(receipts[lane]));};await save();
 return{directory,receipts,save,run:()=>spawnSync(process.execPath,['scripts/hosted-qa/export-receipts.mjs'],{cwd:directory,windowsHide:true,encoding:'utf8'})};
}
test('export reconstructs fixed summaries and excludes raw extra fields',async()=>{
 const f=await fixture();assert.equal(f.run().status,0);
 const value=await readFile(path.join(f.directory,'web/test-results/hosted-export/console.json'),'utf8');assert.ok(!value.includes('pact_grant_')&&!value.includes('extra'));assert.equal(JSON.parse(value).stats.expected,16);
});
test('export refuses stale and contradictory passed receipts',async()=>{
 const f=await fixture();f.receipts.console.runId='old-run';await f.save();assert.notEqual(f.run().status,0);
 f.receipts.console.runId=f.receipts.matrix.runId;f.receipts.matrix.results=[];await f.save();assert.notEqual(f.run().status,0);
});
test('exclusive output creation cannot overwrite an existing linked destination',async()=>{
 const f=await fixture(),target=path.join(f.directory,'private-sentinel.txt');await writeFile(target,'preserve this unrelated file');await link(target,path.join(f.directory,'web/test-results/hosted-export/console.json'));
 assert.notEqual(f.run().status,0);assert.equal(await readFile(target,'utf8'),'preserve this unrelated file');
});
