import type {Reporter,TestCase,TestResult} from '@playwright/test/reporter';
function redacted(value:string){
 return value.replace(/pact_sk_dev_key_[a-f0-9]{32}_[A-Za-z0-9_-]{43}/g,'[REDACTED_KEY]')
  .replace(/Browser\/session binding: [a-f0-9]{64}/g,'[REDACTED_BINDING]')
  .replace(/[A-Za-z0-9+/]{86}==/g,'[REDACTED_SIGNATURE]');
}
export default class ConsoleReceipt implements Reporter{
 onTestEnd(test:TestCase,result:TestResult){
  if(result.status==='passed')return;
  process.stdout.write('\nIndependent redacted console failure: '+test.title+'\n');
  for(const error of result.errors)process.stdout.write(redacted(error.message??'No runner error message')+'\n');
 }
}
