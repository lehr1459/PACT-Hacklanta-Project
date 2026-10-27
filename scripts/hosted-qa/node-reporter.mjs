// Diagnostic companion to TAP, never an acceptance or exit-code replacement.
// Export only fixed source names, bounded coordinates/counts and fixed enums.
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../../',import.meta.url));
export const nativeMinimumTests=89;
export const nativeFiles=Object.freeze(['gateway','gateway-integration','phase1','phase2','phase3','phase4','phase6-client','phase6-contract','phase6-consumer','phase7-clock','phase7-deadline-usage','phase7-maintenance','phase7-restore','load'].map(name=>`scripts/hosted-qa/${name}.test.mjs`));
const sourceFiles=Object.freeze([...nativeFiles,
  ...['helpers','browser','access-fixture','phase7-clock-fixture','rpc-fixture'].map(name=>`scripts/hosted-qa/${name}.mjs`),
  ...['access','clock','config','connect','contract','database','maintenance','resources','security','service','startup','telemetry','usage'].map(name=>`services/pact-api/src/${name}.mjs`)]);
const sources=new Map(sourceFiles.map(file=>{
  const bytes=readFileSync(path.join(root,file));
  return[file,{lines:bytes.toString('utf8').split(/\r?\n/),hash:createHash('sha256').update(bytes).digest('hex')}];
}));
export const sourceFingerprint=createHash('sha256').update(JSON.stringify([...sources].map(([file,s])=>[file,s.hash]))).digest('hex');
const codes=Object.freeze(['ERR_ASSERTION','ERR_TEST_FAILURE',
  'CLOCK_UNAVAILABLE','CLOCK_RESTART_QUARANTINED','CLOCK_OWNER_LOCKED','CLOCK_STORAGE_OVERRUN','CLOCK_STORAGE_UNAVAILABLE',
  'CLOCK_RECORD_INVALID','CLOCK_BINDING_MISMATCH','CLOCK_CONTEXT_MISMATCH','CLOCK_DATABASE_DURABILITY_REQUIRED','CLOCK_DIRECTORY_REQUIRED','CLOCK_CONFIGURATION_REQUIRED',
  'REQUEST_DEADLINE','DATABASE_UNAVAILABLE','OVERLOADED','RATE_LIMITED','CHAIN_UNAVAILABLE','STALE_CHAIN','SERVICE_UNAVAILABLE',
  'AUTH_INVALID','API_KEY_INVALID','API_KEY_SCOPE_DENIED','GRANT_INVALID','APP_DISABLED','POLICY_CHANGED','INVALID_INPUT','RESOURCE_NOT_FOUND',
  'RESOURCE_DISABLED','LICENSE_REQUIRED','EXPIRED','BODY_TOO_LARGE']);
const integer=(value,max=100000)=>Number.isSafeInteger(value)&&value>=0&&value<=max;
const httpStatus=value=>Number.isSafeInteger(value)&&value>=100&&value<=599;
function binding({revision,runId}={}){
  if(!/^[a-f0-9]{40}$/.test(revision??'')||!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(runId??''))throw Error('NODE_FAILURE_BINDING_REQUIRED');
  return{revision,runId};
}
function fixedFile(input){
  if(typeof input!=='string'||input.length>8192||/[\x00-\x1f\x7f]/.test(input))return null;
  try{
    let candidate=input;
    if(input.startsWith('file:')){const url=new URL(input);if(url.search||url.hash||url.hostname) return null;candidate=fileURLToPath(url);}
    if(candidate.split(/[\\/]/).includes('..'))return null;
    const absolute=path.resolve(candidate),same=(a,b)=>process.platform==='win32'?a.toLowerCase()===b.toLowerCase():a===b;
    return sourceFiles.find(file=>same(absolute,path.resolve(root,file)))??null;
  }catch{return null;}
}
function coordinate(file,line,column){
  const source=sources.get(file);
  if(!source||!integer(line,source.lines.length)||line<1||!integer(column,10000)||column<1||column>source.lines[line-1].length+1)return null;
  return{file,line,column};
}
function failure(data){
  const file=fixedFile(data?.file),declaration=nativeFiles.includes(file)?coordinate(file,data.line,data.column):null;
  const locations=[],seen=new Set(),errors=new Set();let error=data?.details?.error,code=null,status=null;
  for(let depth=0;depth<4&&error&&typeof error==='object'&&!errors.has(error);depth++,error=error.cause){
    errors.add(error);
    if(codes.includes(error.code)&&(code===null||error.code!=='ERR_TEST_FAILURE'))code=error.code;
    if(httpStatus(error.httpStatus))status=error.httpStatus;
    if(typeof error.stack!=='string'||error.stack.length>32768)continue;
    // Ignore the message/first line and all non-frame diagnostics. Never emit
    // the frame text, function name, assertion operands or arbitrary file path.
    for(const frame of error.stack.split(/\r?\n/).slice(1,33)){
      const match=/^\s+at (?:[^\r\n()]{0,256} \()?([^\r\n()]{1,8192}):([1-9]\d{0,5}):([1-9]\d{0,4})\)?$/.exec(frame);
      if(!match)continue;
      const name=fixedFile(match[1]),location=coordinate(name,Number(match[2]),Number(match[3]));
      if(!location)continue;
      const key=JSON.stringify(location);if(!seen.has(key)&&locations.length<8){seen.add(key);locations.push(location);}
    }
  }
  return{declaration,code,...(status!==null?{httpStatus:status}:{}),locations};
}
function counts(data){
  const labels=['tests','passed','failed','cancelled','skipped','todo'],result={};
  for(const key of labels){if(!integer(data?.[key]))return null;result[key]=data[key];}
  if(result.passed+result.failed+result.cancelled+result.skipped+result.todo>result.tests)return null;
  return result;
}
export async function collectNodeFailures(events,identity){
  const id=binding(identity),failures=[];let failureEvents=0,finale=null,finales=0;
  for await(const event of events){
    if(event?.type==='test:fail'){
      failureEvents=Math.min(100000,failureEvents+1);
      if(failures.length<32)failures.push(failure(event.data));
    }else if(event?.type==='test:summary'&&event.data?.file===undefined){
      finales++;finale={counts:counts(event.data.counts),success:event.data.success};
    }
  }
  const complete=finales===1&&finale?.counts!==null&&typeof finale?.success==='boolean';
  return{schemaVersion:1,kind:'hosted-node-failure-summary',...id,sourceFingerprint,
    status:!complete?'incomplete':finale.success&&failureEvents===0?'passed':'failed',
    counts:complete?finale.counts:null,minimumTests:nativeMinimumTests,minimumMet:complete&&finale.counts.tests>=nativeMinimumTests,
    failureEvents,omittedFailures:failureEvents-failures.length,failures,rawDiagnosticsRecorded:false};
}
// Reconstruct on the parent side before printing: reject stale identity/source
// and invalid coordinates rather than trusting arbitrary JSON from a child.
export function nodeFailureReceipt(receipt,identity){
  const id=binding(identity);
  if(receipt?.schemaVersion!==1||receipt.kind!=='hosted-node-failure-summary'||receipt.revision!==id.revision||receipt.runId!==id.runId
    ||receipt.sourceFingerprint!==sourceFingerprint||receipt.rawDiagnosticsRecorded!==false
    ||!['passed','failed','incomplete'].includes(receipt.status)||receipt.minimumTests!==nativeMinimumTests
    ||!integer(receipt.failureEvents)||!Array.isArray(receipt.failures)||receipt.failures.length>32
    ||receipt.omittedFailures!==receipt.failureEvents-receipt.failures.length||receipt.omittedFailures<0)throw Error('INELIGIBLE_NODE_FAILURE_SUMMARY');
  const safeCounts=receipt.counts===null?null:counts(receipt.counts);
  if(receipt.counts!==null&&safeCounts===null||receipt.status!=='incomplete'&&safeCounts===null
    ||receipt.minimumMet!==(safeCounts!==null&&safeCounts.tests>=nativeMinimumTests))throw Error('INELIGIBLE_NODE_FAILURE_SUMMARY');
  const safeFailures=receipt.failures.map(item=>{
    const check=(location,nativeOnly=false)=>{
      if(!location||nativeOnly&&!nativeFiles.includes(location.file))throw Error('INELIGIBLE_NODE_FAILURE_LOCATION');
      const result=coordinate(location.file,location.line,location.column);if(!result)throw Error('INELIGIBLE_NODE_FAILURE_LOCATION');return result;
    };
    if(!item||item.code!==null&&!codes.includes(item.code)||!Array.isArray(item.locations)||item.locations.length>8
      ||Object.hasOwn(item,'httpStatus')&&!httpStatus(item.httpStatus))throw Error('INELIGIBLE_NODE_FAILURE_LOCATION');
    return{declaration:item.declaration===null?null:check(item.declaration,true),code:item.code,
      ...(Object.hasOwn(item,'httpStatus')?{httpStatus:item.httpStatus}:{}),locations:item.locations.map(location=>check(location))};
  });
  return{schemaVersion:1,kind:'hosted-node-failure-summary',...id,sourceFingerprint,status:receipt.status,
    counts:safeCounts,minimumTests:nativeMinimumTests,minimumMet:receipt.minimumMet,failureEvents:receipt.failureEvents,
    omittedFailures:receipt.omittedFailures,failures:safeFailures,rawDiagnosticsRecorded:false};
}
export default async function* reporter(events){
  const receipt=await collectNodeFailures(events,{revision:process.env.PACT_HOSTED_QA_REVISION,runId:process.env.PACT_HOSTED_QA_RUN_ID});
  yield JSON.stringify(nodeFailureReceipt(receipt,receipt))+'\n';
}
