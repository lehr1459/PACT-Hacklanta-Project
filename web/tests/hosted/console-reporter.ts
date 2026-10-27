import type {Reporter,TestCase,TestResult,FullResult,TestError} from '@playwright/test/reporter';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import path from 'node:path';
// Do not serialize matcher errors, stacks, attachments, steps or test stdout:
// those can contain one-time responses before a failed assertion is redacted.
function safeTitle(value:string){return value.replace(/pact_sk_dev_key_[a-f0-9]{32}_[A-Za-z0-9_-]{43}|pact_(?:grant|code)_[A-Za-z0-9_-]{43}|pact-domain-verification=[A-Za-z0-9_-]{43}|Browser\/session binding: [a-f0-9]{64}|[A-Za-z0-9+/]{86}==|[A-Za-z0-9_-]{43,}/g,'[REDACTED]');}
type FailureLocation={file:string;line:number;column:number};
const failureFiles=new Set(['console.spec.ts','console-fixtures.ts','connect.spec.ts']);
// Export only source coordinates, never an error message, path prefix or stack.
export function failureLocations(errors:readonly TestError[]=[]):FailureLocation[]{
 const locations:FailureLocation[]=[],seen=new Set<string>();
 const add=(file:unknown,line:unknown,column:unknown)=>{
  if(typeof file!=='string'||file.length>4096)return false;
  const basename=file.replaceAll('\\','/').split('/').at(-1)!;
  if(!failureFiles.has(basename)||!Number.isSafeInteger(line)||!Number.isSafeInteger(column)
   ||(line as number)<1||(line as number)>100000||(column as number)<1||(column as number)>10000)return false;
  const key=`${basename}:${line}:${column}`;if(seen.has(key)||locations.length>=8)return true;
  seen.add(key);locations.push({file:basename,line:line as number,column:column as number});return true;
 };
 for(const error of errors.slice(0,16)){
  if(error.location&&add(error.location.file,error.location.line,error.location.column))continue;
  if(typeof error.stack!=='string')continue;
  for(const frame of error.stack.slice(0,65536).split('\n').slice(0,128)){
   if(!/^\s*at\s/.test(frame))continue;
   const match=/(?:^|[\\/])(console\.spec\.ts|console-fixtures\.ts|connect\.spec\.ts):(\d{1,6}):(\d{1,5})\)?\s*$/.exec(frame);
   if(match)add(match[1],Number(match[2]),Number(match[3]));
  }
 }
 return locations;
}
export default class ConsoleReceipt implements Reporter{
 private results=new Map<string,{title:string;status:string;durationMs:number;file:string;line:number;project:string;failureLocations?:FailureLocation[]}>();
 private runnerErrors=0;private suppressedOutput=0;
 constructor(private options:{outputFile:string}){}
 onStdOut(){this.suppressedOutput++;}
 onStdErr(){this.suppressedOutput++;}
 onError(){this.runnerErrors++;process.stdout.write('Hosted browser runner error; raw diagnostics suppressed.\n');}
 onTestEnd(test:TestCase,result:TestResult){
  const item={title:safeTitle(test.title),status:result.status,durationMs:result.duration,
   file:path.basename(test.location.file),line:test.location.line,project:safeTitle(test.parent.project()?.name??''),
   ...(['failed','timedOut','interrupted'].includes(result.status)?{failureLocations:failureLocations(result.errors)}:{})};
  this.results.set(test.id,item);process.stdout.write(`${item.status}: ${item.project} / ${item.title}\n`);
 }
 async onEnd(result:FullResult){
  const tests=[...this.results.values()],passed=tests.filter(t=>t.status==='passed').length,skipped=tests.filter(t=>t.status==='skipped').length;
  let binding:{}|{revision:string;runId:string;buildRevision:string;buildRunId:string}={};
  if(process.env.PACT_HOSTED_QA_RUN_ID){
   if(!/^[a-f0-9-]{36}$/.test(process.env.PACT_HOSTED_QA_RUN_ID)||!process.env.PACT_HOSTED_QA_REVISION?.match(/^[a-f0-9]{40}$/))throw Error('Invalid hosted receipt binding');
   const build=JSON.parse(await readFile(path.resolve(path.dirname(this.options.outputFile),'../../.next/hosted-build.json'),'utf8'));
   if(build.revision!==process.env.PACT_HOSTED_QA_REVISION||build.runId!==process.env.PACT_HOSTED_QA_RUN_ID)throw Error('Hosted browser build binding mismatch');
   binding={revision:build.revision,runId:build.runId,buildRevision:build.revision,buildRunId:build.runId};
  }
  const receipt={schemaVersion:1,kind:'hosted-browser-receipt',status:result.status,stats:{expected:passed,skipped,unexpected:tests.length-passed-skipped},
   runnerErrors:this.runnerErrors,suppressedOutput:this.suppressedOutput,rawDiagnosticsRecorded:false,...binding,tests};
  await mkdir(path.dirname(this.options.outputFile),{recursive:true});await writeFile(this.options.outputFile,JSON.stringify(receipt,null,2)+'\n');
  process.stdout.write(JSON.stringify({status:result.status,passed,skipped,failed:receipt.stats.unexpected,runnerErrors:this.runnerErrors})+'\n');
 }
}
