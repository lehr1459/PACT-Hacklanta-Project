import {id} from './security.mjs';
const SAFE_REASONS=new Set(['ACTIVE_LICENSE','LICENSE_REQUIRED','EXPIRED','RESOURCE_DISABLED','RESOURCE_NOT_FOUND',
  'CHAIN_UNAVAILABLE','STALE_CHAIN','AUTH_INVALID','APP_DISABLED','POLICY_CHANGED','RATE_LIMITED','OVERLOADED','INVALID_INPUT','DATABASE_UNAVAILABLE']);
export function createAccessTelemetry(database,now){
  const pending=new Set();let dropped=0,failures=0;
  const increment=value=>Math.min(value+1,Number.MAX_SAFE_INTEGER);
  function record({appId,ownerId,requestId,reason,decision,status,latencyMs,observedAt}){
    if(!SAFE_REASONS.has(reason)||pending.size>=8){dropped=increment(dropped);return;}
    let timestamp;try{timestamp=observedAt??now();if(!Number.isSafeInteger(timestamp)||timestamp<0)throw Error();}catch{failures=increment(failures);return;}
    const bucket=Math.floor(timestamp/3600000)*3600000;
    const task=Promise.resolve().then(()=>database.transaction(async tx=>{
      const allowed=decision==='ALLOW'?1:0,error=status>=500?1:0,denied=allowed||error?0:1;
      await tx.query(`INSERT INTO usage_aggregates(app_id,bucket,requests,allowed,denied,errors,latency_total_ms,latency_max_ms)
        VALUES($1,$2,1,$3,$4,$5,$6,$6) ON CONFLICT(app_id,bucket) DO UPDATE SET
        requests=LEAST(usage_aggregates.requests+1,9007199254740991),allowed=LEAST(usage_aggregates.allowed+$3,9007199254740991),
        denied=LEAST(usage_aggregates.denied+$4,9007199254740991),errors=LEAST(usage_aggregates.errors+$5,9007199254740991),
        latency_total_ms=LEAST(usage_aggregates.latency_total_ms+$6,9007199254740991),latency_max_ms=GREATEST(usage_aggregates.latency_max_ms,$6)`,
        [appId,bucket,allowed,denied,error,latencyMs]);
      await tx.query(`INSERT INTO usage_reasons(app_id,bucket,reason,requests) VALUES($1,$2,$3,1)
        ON CONFLICT(app_id,bucket,reason) DO UPDATE SET requests=LEAST(usage_reasons.requests+1,9007199254740991)`,[appId,bucket,reason]);
      await tx.query(`INSERT INTO security_audit_events(id,owner_id,app_id,type,request_id,outcome,created_at)
        VALUES($1,$2,$3,$4,$5,$6,$7)`,[id('evt'),ownerId,appId,decision==='ALLOW'?'access.allow':error?'access.error':'access.deny',requestId,reason,timestamp]);
    }));
    pending.add(task);
    void task.then(()=>pending.delete(task),()=>{pending.delete(task);failures=increment(failures);});
  }
  return{record,flush:()=>Promise.allSettled([...pending]),diagnostics:()=>({pending:pending.size,dropped,failures})};
}
