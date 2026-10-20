import {FRESHNESS_MS,SLOT_PROGRESS_MS,isLicenseStatusFresh} from '@pact/sdk';
import {ApiError,PROGRAM,fail,strict,token,equal} from './security.mjs';

const POLICY_KEY=/^[a-z][a-z0-9-]{0,63}$/;
function decimal(value){return typeof value==='string'&&/^(?:0|[1-9]\d{0,19})$/.test(value);}
export function registerAccess(service){
  const {database,reader,now,hash,authenticateKey,authenticateGrant,telemetry,options:{origin}}=service;
  const db=database.protected??database,{route,validateBody}=service.internals;
  const appActive=new Map(),keyActive=new Map();
  function admit(key){
    if((appActive.get(key.app_id)??0)>=4||(keyActive.get(key.id)??0)>=4)fail('OVERLOADED',503);
    appActive.set(key.app_id,(appActive.get(key.app_id)??0)+1);keyActive.set(key.id,(keyActive.get(key.id)??0)+1);
    return()=>{for(const[map,id]of[[appActive,key.app_id],[keyActive,key.id]]){const count=map.get(id)-1;if(count)map.set(id,count);else map.delete(id);}};
  }
  async function quotas(key){
    const minute=Math.floor(now()/60000);
    for(const[kind,value,limit]of[['app',key.app_id,120],['key',key.id,60]]){
      const budgetKey=hash('access-budget',`${kind}\0${value}\0${minute}`);
      const row=(await db.query(`INSERT INTO request_budgets(budget_key,window_start,hits) VALUES($1,$2,1)
        ON CONFLICT(budget_key) DO UPDATE SET hits=LEAST(request_budgets.hits+1,10001) RETURNING hits`,[budgetKey,minute])).rows[0];
      if(row.hits>limit)fail('RATE_LIMITED',429);
    }
  }
  function fresh(status,resource,grant){
    const time=now();
    if(!status||status.program!==PROGRAM||status.offer!==resource.offer_address||status.wallet!==grant.wallet
      ||!['active','expired','missing'].includes(status.state)||status.active!==(status.state==='active')
      ||!Number.isSafeInteger(status.contextSlot)||status.contextSlot<0||!decimal(status.chainTimestamp)||!decimal(status.expiry)
      ||![status.startedAtMs,status.receivedAtMs,status.lastProgressAtMs].every(Number.isSafeInteger)
      ||status.startedAtMs>status.receivedAtMs||status.receivedAtMs>time||time<status.startedAtMs||time<status.lastProgressAtMs
      ||time-status.startedAtMs>=FRESHNESS_MS||time-status.lastProgressAtMs>=SLOT_PROGRESS_MS)fail('STALE_CHAIN',503);
    if(status.state==='active'&&(!isLicenseStatusFresh(status,time)||BigInt(status.expiry)<=BigInt(Math.floor(time/1000))))fail('STALE_CHAIN',503);
    return time;
  }
  function freshness(status,time,principalDeadline=Infinity){
    let deadline=BigInt(Math.min(status.startedAtMs+FRESHNESS_MS,status.lastProgressAtMs+SLOT_PROGRESS_MS));
    if(Number.isSafeInteger(principalDeadline)&&BigInt(principalDeadline)<deadline)deadline=BigInt(principalDeadline);
    if(status.state==='active'){
      const wall=BigInt(status.expiry)*1000n,chain=BigInt(status.startedAtMs)+(BigInt(status.expiry)-BigInt(status.chainTimestamp))*1000n;
      if(wall<deadline)deadline=wall;if(chain<deadline)deadline=chain;
    }
    return{readStartedAtMs:status.startedAtMs,receivedAtMs:status.receivedAtMs,lastProgressAtMs:status.lastProgressAtMs,
      verifiedAtMs:time,maxAgeMs:FRESHNESS_MS,maxProgressAgeMs:SLOT_PROGRESS_MS,validUntilMs:Number(deadline)};
  }
  async function finalContext(key,grant,resource,walletGrant){
    return db.transaction(async tx=>{
      const owner=(await tx.query('SELECT id,status FROM developer_accounts WHERE id=$1 FOR UPDATE',[key.owner_id])).rows[0];
      if(!owner||owner.status!=='active')fail('AUTH_INVALID',401);
      const app=(await tx.query('SELECT * FROM developer_applications WHERE id=$1 AND owner_id=$2 FOR UPDATE',[key.app_id,owner.id])).rows[0];
      if(!app||app.status!=='active'||app.environment!=='devnet')fail('APP_DISABLED',403);
      const credential=(await tx.query('SELECT * FROM api_credentials WHERE id=$1 AND app_id=$2 FOR UPDATE',[key.id,app.id])).rows[0];
      if(!credential||credential.revoked_at!==null||Number(credential.expires_at)<=now()||!equal(credential.token_hash,key.token_hash)
        ||!JSON.parse(credential.scopes).includes('access:check'))fail('API_KEY_INVALID',401);
      const currentGrant=(await tx.query('SELECT * FROM wallet_grants WHERE token_hash=$1 AND app_id=$2 FOR UPDATE',[hash('wallet-grant',walletGrant),app.id])).rows[0];
      if(!currentGrant||currentGrant.revoked_at!==null||Number(currentGrant.expires_at)<=now()||currentGrant.environment!=='devnet'
        ||currentGrant.wallet!==grant.wallet||String(currentGrant.policy_epoch)!==String(app.policy_epoch))fail('GRANT_INVALID',401);
      const currentResource=(await tx.query('SELECT * FROM app_resources WHERE app_id=$1 AND resource_key=$2 FOR UPDATE',[app.id,resource.resource_key])).rows[0];
      if(!currentResource||currentResource.version!==resource.version||currentResource.offer_address!==resource.offer_address
        ||currentResource.enabled!==resource.enabled||String(app.policy_epoch)!==String(grant.policy_epoch))fail('POLICY_CHANGED',403);
      const validUntil=Math.min(Number(credential.expires_at),Number(currentGrant.expires_at));
      if(now()>=validUntil)fail('AUTH_INVALID',401);
      return{validUntil,epoch:String(app.policy_epoch)};
    });
  }
  function binding(key,grant,resource,epoch){
    return{appId:key.app_id,resourceKey:resource.resource_key,resourceVersion:Number(resource.version),policyEpoch:epoch,
      offerAddress:resource.offer_address,walletAddress:grant.wallet,network:'solana-devnet',programId:PROGRAM};
  }
  function safeReason(error){
    if(error?.code==='API_KEY_INVALID'||error?.code==='API_KEY_SCOPE_DENIED'||error?.code==='GRANT_INVALID'||error?.code==='AUTH_INVALID')return'AUTH_INVALID';
    return ['APP_DISABLED','POLICY_CHANGED','RATE_LIMITED','OVERLOADED','INVALID_INPUT','DATABASE_UNAVAILABLE','RESOURCE_NOT_FOUND','STALE_CHAIN'].includes(error?.code)?error.code:'CHAIN_UNAVAILABLE';
  }
  route('POST','/v1/access/check',async(req,reply)=>{
    const started=performance.now();let key,release,recorded=false;
    function record(reason,status,decision='DENY'){
      if(!key||recorded)return;recorded=true;
      telemetry.record({appId:key.app_id,ownerId:key.owner_id,requestId:req.id,reason,decision,status,
        latencyMs:Math.min(60000,Math.max(0,Math.ceil(performance.now()-started)))});
    }
    try{
      key=await authenticateKey(req,'access:check',db);release=admit(key);
      strict(req.body,['walletGrant','resourceKey']);
      if(typeof req.body.resourceKey!=='string'||!POLICY_KEY.test(req.body.resourceKey))fail('INVALID_INPUT');
      if(typeof req.body.walletGrant!=='string'||!req.body.walletGrant.startsWith('pact_grant_')||!token(req.body.walletGrant.slice(11)))fail('GRANT_INVALID',401);
      validateBody(req);
      await quotas(key);
      const grant=await authenticateGrant(req.body.walletGrant,key,db);
      const resource=(await db.query('SELECT * FROM app_resources WHERE app_id=$1 AND resource_key=$2',[key.app_id,req.body.resourceKey])).rows[0];
      if(!resource)fail('RESOURCE_NOT_FOUND',404);
      let status,chainError;
      if(resource.enabled){
        try{status=await service.chainRead('access',key.app_id,()=>reader.getLicenseStatus({offer:resource.offer_address,wallet:grant.wallet},
          {signal:req.pactAbortController?.signal}));fresh(status,resource,grant);}
        catch(error){chainError=error?.code==='OVERLOADED'?'OVERLOADED':error?.code==='STALE_CHAIN'||error?.code==='STALE'?'STALE_CHAIN':'CHAIN_UNAVAILABLE';}
      }
      const ctx=await finalContext(key,grant,resource,req.body.walletGrant);
      if(now()>=ctx.validUntil)fail('AUTH_INVALID',401);
      const bound=binding(key,grant,resource,ctx.epoch);
      function denied(reason,httpStatus,knownStatus=null){
        const time=now();record(reason,httpStatus);reply.code(httpStatus);
        const body={decision:'DENY',reason,...bound,expiresAt:knownStatus&&knownStatus.state!=='missing'?knownStatus.expiry:null,
          verifiedAt:new Date(time).toISOString(),contextSlot:knownStatus?.contextSlot??null,chainTimestamp:knownStatus?.chainTimestamp??null,
          freshness:knownStatus?freshness(knownStatus,time,ctx.validUntil):null};
        if(reason==='LICENSE_REQUIRED'||reason==='EXPIRED'){
          const buyer=new URL('/',origin);buyer.searchParams.set('offer',resource.offer_address);
          body.purchase={url:buyer.href,metadata:'SELLER_EXACT_BYTES_REQUIRED'};
        }
        return body;
      }
      if(!resource.enabled)return denied('RESOURCE_DISABLED',403);
      if(chainError)return denied(chainError,503);
      let time;try{time=fresh(status,resource,grant);}catch{return denied('STALE_CHAIN',503);}
      if(status.state==='missing')return denied('LICENSE_REQUIRED',403,status);
      if(status.state==='expired')return denied('EXPIRED',403,status);
      // No awaited operation follows this original-snapshot and lease check.
      if(now()>=ctx.validUntil)fail('AUTH_INVALID',401);
      time=fresh(status,resource,grant);
      if(time>=ctx.validUntil)fail('AUTH_INVALID',401);
      const result={decision:'ALLOW',reason:'ACTIVE_LICENSE',...bound,expiresAt:status.expiry,verifiedAt:new Date(time).toISOString(),
        contextSlot:status.contextSlot,chainTimestamp:status.chainTimestamp,freshness:freshness(status,time,ctx.validUntil)};
      req.pactFinalGuard=()=>{
        try{
          const checked=fresh(status,resource,grant);
          if(checked>=ctx.validUntil)fail('AUTH_INVALID',401);
          if(checked>=result.freshness.validUntilMs)fail('STALE_CHAIN',503);
          record('ACTIVE_LICENSE',200,'ALLOW');
        }catch(error){record(safeReason(error),error instanceof ApiError?error.status:503);throw error;}
      };
      return result;
    }catch(error){
      record(safeReason(error),error instanceof ApiError?error.status:503);
      throw error;
    }finally{release?.();}
  });
}
