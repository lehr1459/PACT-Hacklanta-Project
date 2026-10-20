import type {Reporter,TestCase,TestResult,FullResult} from '@playwright/test/reporter';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
// Do not serialize matcher errors, stacks, attachments, steps or test stdout:
// those can contain one-time responses before a failed assertion is redacted.
function safeTitle(value:string){return value.replace(/pact_sk_dev_key_[a-f0-9]{32}_[A-Za-z0-9_-]{43}|pact_(?:grant|code)_[A-Za-z0-9_-]{43}|pact-domain-verification=[A-Za-z0-9_-]{43}|Browser\/session binding: [a-f0-9]{64}|[A-Za-z0-9+/]{86}==|[A-Za-z0-9_-]{43,}/g,'[REDACTED]');}
export default class ConsoleReceipt implements Reporter{
 private results=new Map<string,{title:string;status:string;durationMs:number;file:string;line:number;project:string}>();
 private runnerErrors=0;private suppressedOutput=0;
 constructor(private options:{outputFile:string}){}
 onStdOut(){this.suppressedOutput++;}
 onStdErr(){this.suppressedOutput++;}
 onError(){this.runnerErrors++;process.stdout.write('Hosted browser runner error; raw diagnostics suppressed.\n');}
 onTestEnd(test:TestCase,result:TestResult){
  const item={title:safeTitle(test.title),status:result.status,durationMs:result.duration,
   file:path.basename(test.location.file),line:test.location.line,project:safeTitle(test.parent.project()?.name??'')};
  this.results.set(test.id,item);process.stdout.write(`${item.status}: ${item.project} / ${item.title}\n`);
 }
 async onEnd(result:FullResult){
  const tests=[...this.results.values()],passed=tests.filter(t=>t.status==='passed').length,skipped=tests.filter(t=>t.status==='skipped').length;
  const receipt={schemaVersion:1,kind:'hosted-browser-receipt',status:result.status,stats:{expected:passed,skipped,unexpected:tests.length-passed-skipped},
   runnerErrors:this.runnerErrors,suppressedOutput:this.suppressedOutput,rawDiagnosticsRecorded:false,tests};
  await mkdir(path.dirname(this.options.outputFile),{recursive:true});await writeFile(this.options.outputFile,JSON.stringify(receipt,null,2)+'\n');
  process.stdout.write(JSON.stringify({status:result.status,passed,skipped,failed:receipt.stats.unexpected,runnerErrors:this.runnerErrors})+'\n');
 }
}
