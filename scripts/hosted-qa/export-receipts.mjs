// Upload only reconstructed numeric/status summaries. Raw logs, images, private
// clocks, SQL snapshots and test error bodies are deliberately ineligible.
import {readFile,mkdir,writeFile,lstat,realpath} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {root} from '../validation/common.mjs';
import {matrixReceipt} from './acceptance.mjs';
const base=path.join(root,'web/test-results');
const output=path.join(base,'hosted-export');
await mkdir(output,{recursive:true});
if((await lstat(base)).isSymbolicLink()||!(await realpath(base)).startsWith((await realpath(root))+path.sep)
 ||(await lstat(output)).isSymbolicLink()||!(await realpath(output)).startsWith((await realpath(base))+path.sep))throw Error('Unsafe evidence destination');
const revision=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
if(!/^[a-f0-9]{40}$/.test(revision))throw Error('Invalid revision');
const integer=value=>Number.isSafeInteger(value)&&value>=0&&value<=10000000;
async function input(relative){
 const file=path.join(base,relative),parent=path.dirname(file);
 if((await lstat(parent)).isSymbolicLink()||(await lstat(file)).isSymbolicLink()||!(await realpath(file)).startsWith((await realpath(base))+path.sep))throw Error('Linked evidence is ineligible');
 const bytes=await readFile(file);if(bytes.length>65536)throw Error('Oversized receipt');return JSON.parse(bytes);
}
const r=await input('hosted-ci/results.json');
if(r.schemaVersion!==1||r.kind!=='hosted-local-matrix'||r.revision!==revision||!['passed','failed','running'].includes(r.status)
 ||!/^[a-f0-9-]{36}$/.test(r.runId??'')||!Array.isArray(r.results)||r.results.length>40||r.results.some(x=>!/^[a-z][a-z0-9-]{0,63}$/.test(x.name)||!['passed','failed','running'].includes(x.status)||!integer(x.durationMs)))throw Error('Unsupported matrix receipt');
const runId=r.runId,exports=[];
matrixReceipt(r);
for(const lane of ['console','connect']){
 const b=await input('hosted-'+lane+'/results.json');
 if(b.kind!=='hosted-browser-receipt'||b.schemaVersion!==1||b.rawDiagnosticsRecorded!==false||!['passed','failed','timedout','interrupted'].includes(b.status)
  ||!['expected','skipped','unexpected'].every(k=>integer(b.stats?.[k]))||!integer(b.runnerErrors)
  ||b.revision!==revision||b.runId!==runId||b.buildRevision!==revision||b.buildRunId!==runId)throw Error('Unsupported or stale browser receipt');
 if(b.status==='passed'&&(b.stats.expected!==(lane==='console'?16:12)||b.stats.skipped!==0||b.stats.unexpected!==0||b.runnerErrors!==0))throw Error('Contradictory passed receipt');
 exports.push([lane, {schemaVersion:1,revision,runId,lane,status:b.status,stats:{expected:b.stats.expected,skipped:b.stats.skipped,unexpected:b.stats.unexpected},runnerErrors:b.runnerErrors,rawDiagnosticsRecorded:false}]);
}
exports.push(['matrix',{schemaVersion:1,revision,runId,kind:r.kind,status:r.status,results:r.results.map(x=>({name:x.name,status:x.status,durationMs:x.durationMs})),rawDiagnosticsRecorded:false}]);
for(const[name,value]of exports)await writeFile(path.join(output,name+'.json'),JSON.stringify(value)+'\n',{flag:'wx'});
process.stdout.write('Hosted evidence export: fixed numeric/status summaries only.\n');
