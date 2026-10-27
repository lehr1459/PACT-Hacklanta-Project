import {randomUUID} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {types as nodeTypes} from 'node:util';

const operations = ['unknown','preflight','health.live','health.ready','auth.challenge','auth.verify','auth.session','auth.logout',
  'offer.get','offer.metadata','offer.prepare','checkout.prepare','license.get','license.verify','transaction.get',
  'protected.get','resource.get','resource.post'] as const;
const failures = ['success','license-expired','license-invalid','auth','rpc-outage','chain-invalid','timeout','overload',
  'metadata','application','input','not-found','configuration'] as const;
export type ApiOperation = typeof operations[number];
export type ApiFailure = typeof failures[number];
export type ApiDiagnosticEvent = Readonly<{schemaVersion:1;requestId:string;operation:ApiOperation;
  method:'GET'|'POST'|'OPTIONS'|'OTHER';status:number;durationMs:number;failure:ApiFailure}>;
export type ApiDiagnosticsOptions = {onEvent:(event:ApiDiagnosticEvent)=>void|Promise<void>};
type PoolGauges = Readonly<{inflight:number;queued:number;quarantined:number}>;
type HttpGauges = Readonly<{active:number;inflight:number;quarantined:number;limit:number}>;
export type ApiOperationalGauges = Readonly<{
  http:Readonly<{public:HttpGauges;auth:HttpGauges;protected:HttpGauges}>;
  rpc:Readonly<{public:PoolGauges;protected:PoolGauges}>;
  auth:Readonly<{enabled:boolean;storedChallenges:number;storedSessions:number;capacity:number}>;
}>;
type RecordState = {requestId:string;method:ApiDiagnosticEvent['method'];operation:ApiOperation;failure:ApiFailure;start:number;finished:boolean};
const increment=(value:number)=>Math.min(Number.MAX_SAFE_INTEGER,value+1);
const counters=<T extends string>(keys:readonly T[])=>Object.fromEntries(keys.map(key=>[key,0])) as Record<T,number>;
const promiseThen=Promise.prototype.then;

/** Only constant route names enter metrics. Request URLs and caller IDs never do. */
export function apiOperation(path:string,method:string):ApiOperation {
  if(method==='OPTIONS')return 'preflight';
  const exact:Record<string,ApiOperation>={
    'GET /health/live':'health.live','GET /health/ready':'health.ready',
    'POST /auth/challenge':'auth.challenge','POST /auth/verify':'auth.verify','GET /auth/session':'auth.session','POST /auth/logout':'auth.logout',
    'POST /offers/prepare':'offer.prepare','POST /checkout/prepare':'checkout.prepare','POST /licenses/verify':'license.verify','GET /protected':'protected.get',
  };
  const known=exact[method+' '+path];if(known)return known;
  if(method==='GET'&&/^\/offers\/[^/]+\/metadata$/.test(path))return 'offer.metadata';
  if(method==='GET'&&/^\/offers\/[^/]+$/.test(path))return 'offer.get';
  if(method==='GET'&&/^\/licenses\/[^/]+\/[^/]+$/.test(path))return 'license.get';
  if(method==='GET'&&/^\/transactions\/[^/]+$/.test(path))return 'transaction.get';
  if(/^\/resources\/[A-Za-z0-9_-]{1,64}$/.test(path))return method==='GET'?'resource.get':method==='POST'?'resource.post':'unknown';
  return 'unknown';
}

export function apiFailure(code:string,previous:ApiFailure='success',status=0):ApiFailure {
  if(code==='LICENSE_REQUIRED')return previous==='success'?'license-invalid':previous;
  if(['AUTH_REQUIRED','AUTH_INVALID','AUTH_UNAVAILABLE','FORBIDDEN'].includes(code))return 'auth';
  if(['TIMEOUT','CANCELLED'].includes(code))return 'timeout';
  if(['RATE_LIMITED','BUSY'].includes(code))return 'overload';
  if(code==='METADATA_UNAVAILABLE')return 'metadata';
  if(code==='RPC_ERROR')return 'rpc-outage';
  if(['STALE','WRONG_NETWORK','INVALID_ACCOUNT'].includes(code))return 'chain-invalid';
  if(code==='NOT_CONFIGURED')return 'configuration';
  if(code==='NOT_FOUND')return 'not-found';
  if(code==='BODY_TOO_LARGE'&&status>=500)return 'application';
  if(['INVALID_INPUT','BODY_TOO_LARGE','OFFER_INACTIVE','ALREADY_LICENSED'].includes(code))return 'input';
  return 'application';
}

/** No event history, user labels, or awaited hooks. At most four unsettled hooks. */
export function createApiObservability(options:ApiDiagnosticsOptions|undefined) {
  let sink:ApiDiagnosticsOptions['onEvent']|undefined,observerFailures=0,pending=0,dropped=0,total=0;
  try{if(typeof options?.onEvent==='function')sink=options.onEvent;}catch{observerFailures=increment(observerFailures);}
  const byOperation=counters(operations),byFailure=counters(failures),byStatus=counters(['2xx','4xx','5xx','other'] as const);
  const latency=counters(['le5','le20','le100','le500','le1000','le5000','over5000'] as const);
  function emit(event:ApiDiagnosticEvent) {
    if(!sink)return;
    if(pending>=4){dropped=increment(dropped);return;}
    try{
      const result=sink(event);
      if(result!==undefined){
        if(!nodeTypes.isPromise(result)){observerFailures=increment(observerFailures);return;}
        pending++;
        // Native promise reactions bypass an overridden .then property. Invalid
        // arbitrary thenables are not executed or recursively assimilated.
        try{void promiseThen.call(result,()=>{pending--;},()=>{pending--;observerFailures=increment(observerFailures);});}
        catch{pending--;throw Error('Diagnostic hook failed.');}
      }
    }catch{observerFailures=increment(observerFailures);}
  }
  return {
    begin(method:string):RecordState {
      return {requestId:randomUUID(),method:method==='GET'||method==='POST'||method==='OPTIONS'?method:'OTHER',
        operation:'unknown',failure:'success',start:performance.now(),finished:false};
    },
    complete(record:RecordState,status:number) {
      if(record.finished)return;record.finished=true;
      const elapsed=performance.now()-record.start,durationMs=Number.isFinite(elapsed)?Math.round(Math.max(0,Math.min(86400000,elapsed))*1000)/1000:0;
      const event=Object.freeze({schemaVersion:1 as const,requestId:record.requestId,operation:record.operation,method:record.method,status,durationMs,failure:record.failure});
      total=increment(total);byOperation[event.operation]=increment(byOperation[event.operation]);byFailure[event.failure]=increment(byFailure[event.failure]);
      const statusClass=status>=200&&status<300?'2xx':status>=400&&status<500?'4xx':status>=500&&status<600?'5xx':'other';
      byStatus[statusClass]=increment(byStatus[statusClass]);
      const bucket=durationMs<=5?'le5':durationMs<=20?'le20':durationMs<=100?'le100':durationMs<=500?'le500':durationMs<=1000?'le1000':durationMs<=5000?'le5000':'over5000';
      latency[bucket]=increment(latency[bucket]);emit(event);
    },
    metrics(gauges:ApiOperationalGauges) {
      return Object.freeze({schemaVersion:1 as const,requests:total,byOperation:Object.freeze({...byOperation}),byFailure:Object.freeze({...byFailure}),
        byStatus:Object.freeze({...byStatus}),latencyMs:Object.freeze({...latency}),observer:Object.freeze({pending,dropped,failures:observerFailures}),
        gauges:Object.freeze({http:Object.freeze({public:Object.freeze({...gauges.http.public}),auth:Object.freeze({...gauges.http.auth}),protected:Object.freeze({...gauges.http.protected})}),
          rpc:Object.freeze({public:Object.freeze({...gauges.rpc.public}),protected:Object.freeze({...gauges.rpc.protected})}),auth:Object.freeze({...gauges.auth})})});
    },
  };
}
