import Fastify from 'fastify';
import {Resolver} from 'node:dns/promises';
import {randomUUID} from 'node:crypto';
import {createPlatformReader} from '@pact/sdk/server';
import {registerResources} from './resources.mjs';
import {ApiError, fail, random, id, digest, keyed, equal, token, canonical, walletBytes,
  signatureValid, message, origin as validateOrigin, callback, strict, text, SCOPES} from './security.mjs';

const DAY = 86400000;
const FRAMEWORKS = ['rest','express','nextjs','react-backend'];
const ACTIONS = ['app.update','callback.create','callback.verify','callback.renew','callback.revoke','credential.create','credential.rotate','credential.revoke'];

export async function createService(options) {
  const db = options.database, origin = validateOrigin(options.origin), pepper = options.pepper;
  if (!db || !token(pepper)) fail('SERVICE_CONFIGURATION_REQUIRED', 503);
  const profile = options.profile ?? 'local';
  if (!['local','test','hosted'].includes(profile)
    || !Number.isSafeInteger(options.rateLimit ?? 120) || (options.rateLimit ?? 120)<1 || (options.rateLimit ?? 120)>10000
    || !Number.isSafeInteger(options.activeLimit ?? 32) || (options.activeLimit ?? 32)<1 || (options.activeLimit ?? 32)>64) fail('SERVICE_CONFIGURATION_REQUIRED', 503);
  const local = ['local','test'].includes(profile), secure = origin.startsWith('https:');
  if (!local && !secure) fail('SERVICE_CONFIGURATION_REQUIRED', 503);
  if (!local && db.kind !== 'postgres') fail('DATABASE_CONFIGURATION_REQUIRED',503);
  let lastTime = -1;
  const additionalActions = new Map();
  const now = () => {
    const value = (options.now ?? Date.now)();
    if (!Number.isSafeInteger(value) || value < lastTime || value < 0) fail('CLOCK_UNAVAILABLE', 503);
    lastTime = value; return value;
  };
  const hash = (purpose, value) => keyed(pepper, purpose, value);
  const server = Fastify({logger: false, bodyLimit: 16384,
    requestTimeout: 10000, connectionTimeout: 10000, keepAliveTimeout: 5000,
    maxRequestsPerSocket: 100, trustProxy: false, genReqId: () => randomUUID(),
    ajv: {customOptions: {removeAdditional: false, coerceTypes: false, useDefaults: false}},
    routerOptions: {maxParamLength: 128}});
  let active = 0;
  const dnsPending = new Set();
  async function domainRecords(hostname) {
    if (dnsPending.size >= 2) fail('DOMAIN_VERIFICATION_UNAVAILABLE',503);
    const resolver = options.resolveTxt ? null : new Resolver({timeout:1000,tries:1});
    const marker = {resolver};dnsPending.add(marker);
    const task = Promise.resolve().then(() => options.resolveTxt ? options.resolveTxt(hostname) : resolver.resolveTxt(hostname));
    void task.then(()=>dnsPending.delete(marker),()=>dnsPending.delete(marker));
    let timer;
    try {
      return await Promise.race([task,new Promise((_,reject)=>{
        timer=setTimeout(()=>{resolver?.cancel();reject(new Error());},1500);
      })]);
    } finally {clearTimeout(timer);}
  }
  const envelope = (req, value) => ({schemaVersion: 1, requestId: req.id, ...value});
  const cookieNames = {binding: secure ? '__Secure-pact_hosted_binding' : 'pact_hosted_binding',
    session: secure ? '__Secure-pact_hosted_session' : 'pact_hosted_session'};
  function cookies(req) {
    const input = req.headers.cookie ?? '';
    if (input.length > 4096) fail('INVALID_COOKIE', 400);
    const out = Object.create(null);
    for (const part of input.split(';')) {
      const index = part.indexOf('=');
      if (index < 1) continue;
      const name = part.slice(0,index).trim(), value = part.slice(index+1).trim();
      if (Object.hasOwn(out,name)) fail('INVALID_COOKIE',400);
      out[name] = value;
    }
    return out;
  }
  function setCookie(reply, name, value, maxAge) {
    const header = `${name}=${value}; Path=/v1; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
    const current = reply.getHeader('set-cookie');
    reply.header('set-cookie', [...(Array.isArray(current) ? current : current ? [current] : []),header]);
  }
  function browser(req, mutate = false) {
    if (req.headers.origin !== undefined && req.headers.origin !== origin) fail('ORIGIN_DENIED',403);
    if (!mutate) return;
    if (req.headers.origin !== origin) fail('ORIGIN_DENIED',403);
    const binding = cookies(req)[cookieNames.binding];
    if (!token(binding) || !equal(req.headers['x-pact-csrf'],binding)) fail('CSRF_DENIED',403);
    return binding;
  }
  async function budget(req) {
    if (req.url === '/v1/health/live') return;
    const minute = Math.floor(now()/60000);
    const key = hash('budget',`${req.ip}\0${req.routeOptions.url ?? 'unknown'}\0${minute}`);
    const result = await db.query(`INSERT INTO request_budgets(budget_key,window_start,hits) VALUES($1,$2,1)
      ON CONFLICT(budget_key) DO UPDATE SET hits=LEAST(request_budgets.hits+1,10001) RETURNING hits`,[key,minute]);
    if (result.rows[0].hits > (options.rateLimit ?? 120)) fail('RATE_LIMITED',429);
  }
  server.addHook('onRequest', async (req, reply) => {
    reply.headers({'cache-control':'no-store','x-pact-request-id':req.id,
      'referrer-policy':'no-referrer','x-content-type-options':'nosniff','x-frame-options':'DENY',
      'content-security-policy':"default-src 'none'; frame-ancestors 'none'; base-uri 'none'"});
    if (active >= (options.activeLimit ?? 32)) fail('OVERLOADED',503);
    active++; req.pactAdmitted = true;
    if (req.raw.url.length > 4096 || req.headers.authorization?.length > 512) fail('INVALID_INPUT');
    await budget(req);
  });
  server.addHook('onResponse', async req => { if (req.pactAdmitted) active--; });
  server.setErrorHandler((error, req, reply) => {
    const status = error instanceof ApiError ? error.status : error.statusCode >= 400 && error.statusCode < 500 ? error.statusCode : 503;
    const code = error instanceof ApiError ? error.code : status === 413 ? 'BODY_TOO_LARGE' : status < 500 ? 'INVALID_INPUT' : 'SERVICE_UNAVAILABLE';
    reply.code(status).send(envelope(req,{error:{code,message:code}}));
  });
  server.setNotFoundHandler((req,reply) => reply.code(404).send(envelope(req,{error:{code:'NOT_FOUND',message:'NOT_FOUND'}})));
  function route(method,url,handler) {
    server.route({method,url,handler:async (req,reply) => {
      if (Object.keys(req.query ?? {}).length) fail('INVALID_INPUT');
      const result = await handler(req,reply);
      if (reply.sent) return;
      return envelope(req,result ?? {});
    }});
  }
  async function session(req) {
    browser(req);
    const c = cookies(req), value = c[cookieNames.session], binding = c[cookieNames.binding];
    if (!token(value) || !token(binding)) fail('AUTH_REQUIRED',401);
    const sessionHash = hash('admin-session',value);
    const result = await db.query(`SELECT s.token_hash,s.account_id,s.expires_at,a.wallet FROM admin_sessions s
      JOIN developer_accounts a ON a.id=s.account_id WHERE s.token_hash=$1 AND s.binding_hash=$2
      AND s.revoked_at IS NULL AND s.expires_at>$3 AND a.status='active'`,[sessionHash,hash('browser',binding),now()]);
    if (!result.rows[0]) fail('AUTH_REQUIRED',401);
    return result.rows[0];
  }
  async function owned(tx, appId, principal, lock = false) {
    text(appId,64);
    const result = await tx.query(`SELECT * FROM developer_applications WHERE id=$1 AND owner_id=$2${lock?' FOR UPDATE':''}`,[appId,principal.account_id]);
    if (!result.rows[0]) fail('NOT_FOUND',404);
    return result.rows[0];
  }
  async function audit(tx, req, principal, appId, type) {
    await tx.query('INSERT INTO security_audit_events(id,owner_id,app_id,type,request_id,outcome,created_at) VALUES($1,$2,$3,$4,$5,$6,$7)',
      [id('evt'),principal.account_id,appId,type,req.id,'success',now()]);
  }
  function appView(row) {
    return {id:row.id,name:row.name,description:row.description,framework:row.framework,
      environment:row.environment,status:row.status,policyEpoch:Number(row.policy_epoch??0),createdAt:Number(row.created_at),updatedAt:Number(row.updated_at)};
  }
  function keyView(row) {
    return {id:row.id,appId:row.app_id,name:row.name,prefix:row.prefix,scopes:JSON.parse(row.scopes),
      createdAt:Number(row.created_at),expiresAt:Number(row.expires_at),
      lastUsedAt:row.last_used_at === null ? null : Number(row.last_used_at),
      revokedAt:row.revoked_at === null ? null : Number(row.revoked_at),rotatedFrom:row.rotated_from};
  }
  function callbackView(row) {
    return {id:row.id,uri:row.uri,websiteOrigin:row.website_origin,status:row.status,
      local:row.local,verifiedUntil:row.verified_until === null ? null : Number(row.verified_until),
      dnsRecord:row.local ? null : `_pact.${row.hostname}`};
  }
  function validExpiry(value) {
    if (!Number.isSafeInteger(value) || value < now()+60000 || value > now()+90*DAY) fail('INVALID_EXPIRY');
  }
  function validatePayload(action, payload) {
    if (additionalActions.has(action)) {
      additionalActions.get(action)(payload);
      return digest(canonical(payload));
    }
    if (!ACTIONS.includes(action)) fail('INVALID_ACTION');
    if (action === 'app.update') {
      strict(payload,[],['name','description','framework','status']);
      if (!Object.keys(payload).length) fail('INVALID_INPUT');
      if (payload.name !== undefined) text(payload.name);
      if (payload.description !== undefined) text(payload.description,500,0);
      if (payload.framework !== undefined && !FRAMEWORKS.includes(payload.framework)) fail('INVALID_INPUT');
      if (payload.status !== undefined && !['draft','active','paused'].includes(payload.status)) fail('INVALID_INPUT');
    } else if (action === 'callback.create') {
      strict(payload,['uri','websiteOrigin']); callback(payload.uri,payload.websiteOrigin,local);
    } else if (['callback.verify','callback.renew','callback.revoke'].includes(action)) {
      strict(payload,['callbackId']); text(payload.callbackId,64);
    } else if (action === 'credential.create') {
      strict(payload,['name','scopes','expiresAt']); text(payload.name); validExpiry(payload.expiresAt);
      if (!Array.isArray(payload.scopes) || payload.scopes.length < 1 || payload.scopes.length > SCOPES.length
        || new Set(payload.scopes).size !== payload.scopes.length || payload.scopes.some(s => !SCOPES.includes(s))) fail('INVALID_SCOPE');
    } else if (action === 'credential.rotate') {
      strict(payload,['credentialId','expiresAt','overlapSeconds']); text(payload.credentialId,64); validExpiry(payload.expiresAt);
      if (!Number.isSafeInteger(payload.overlapSeconds) || payload.overlapSeconds < 0 || payload.overlapSeconds > 86400) fail('INVALID_INPUT');
    } else {
      strict(payload,['credentialId']); text(payload.credentialId,64);
    }
    return digest(canonical(payload));
  }
  async function mutate(req, action, work, prepare, finalCheck) {
    browser(req,true);
    const principal = await session(req), appId = req.params.appId;
    strict(req.body,['payload','proof']); strict(req.body.proof,['challengeId','signatureBase64']);
    const payloadHash = validatePayload(action,req.body.payload);
    const challenge = (await db.query(`SELECT * FROM action_challenges WHERE id=$1 AND account_id=$2
      AND session_hash=$3 AND app_id=$4 AND action=$5 AND payload_hash=$6 AND consumed_at IS NULL AND expires_at>$7`,
      [text(req.body.proof.challengeId,64),principal.account_id,principal.token_hash,appId,action,payloadHash,now()])).rows[0];
    if (!challenge) fail('ACTION_PROOF_INVALID',401);
    if (!signatureValid(principal.wallet,challenge.message,req.body.proof.signatureBase64)) {
      await db.query('UPDATE action_challenges SET consumed_at=$1 WHERE id=$2 AND consumed_at IS NULL',[now(),challenge.id]);
      fail('ACTION_PROOF_INVALID',401);
    }
    const prepared = prepare ? await prepare(principal,req.body.payload) : undefined;
    return db.transaction(async tx => {
      const validSession = (await tx.query(`SELECT s.token_hash FROM admin_sessions s JOIN developer_accounts a ON a.id=s.account_id
        WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at>$2 AND a.status='active' FOR UPDATE OF s,a`,[principal.token_hash,now()])).rows[0];
      if (!validSession) fail('AUTH_REQUIRED',401);
      const app = await owned(tx,appId,principal,true);
      const consumed = await tx.query(`UPDATE action_challenges SET consumed_at=$1 WHERE id=$2
        AND consumed_at IS NULL AND expires_at>$1 RETURNING id`,[now(),challenge.id]);
      if (!consumed.rows[0]) fail('ACTION_PROOF_INVALID',401);
      const result = await work(tx,principal,app,req.body.payload,prepared);
      await audit(tx,req,principal,app.id,action);
      if(finalCheck)finalCheck(prepared,principal,req.body.payload);
      return result;
    });
  }

  route('GET','/v1/health/live',async () => ({live:true}));
  route('GET','/v1/health/ready',async () => {
    await db.query('SELECT 1 FROM platform_migrations LIMIT 1');
    return {ready:true,scope:'database-control-plane',network:'solana-devnet'};
  });
  route('GET','/v1/developer/auth/session',async (req,reply) => {
    browser(req);
    let binding = cookies(req)[cookieNames.binding];
    if (!token(binding)) { binding=random(); setCookie(reply,cookieNames.binding,binding,3600); }
    try {
      const principal=await session(req);
      return {authenticated:true,account:{id:principal.account_id,walletAddress:principal.wallet},expiresAt:Number(principal.expires_at),csrfToken:binding};
    } catch (error) {
      if (!(error instanceof ApiError) || error.code !== 'AUTH_REQUIRED') throw error;
      return {authenticated:false,csrfToken:binding};
    }
  });
  route('POST','/v1/developer/auth/challenge',async req => {
    const binding=browser(req,true); strict(req.body,['walletAddress']); walletBytes(req.body.walletAddress);
    const challengeId=id('adm'), issuedAt=now(), expiresAt=issuedAt+120000;
    const issuedMessage=message({origin,wallet:req.body.walletAddress,purpose:'developer-admin-login',challengeId,
      binding:hash('browser',binding),issuedAt,expiresAt});
    await db.query('INSERT INTO admin_challenges(id,wallet,binding_hash,message,created_at,expires_at) VALUES($1,$2,$3,$4,$5,$6)',
      [challengeId,req.body.walletAddress,hash('browser',binding),issuedMessage,issuedAt,expiresAt]);
    return {challengeId,message:issuedMessage,expiresAt};
  });
  route('POST','/v1/developer/auth/verify',async (req,reply) => {
    const binding=browser(req,true); strict(req.body,['challengeId','signatureBase64']);
    const proof=(await db.query(`UPDATE admin_challenges SET consumed_at=$1 WHERE id=$2 AND binding_hash=$3
      AND expires_at>$1 AND consumed_at IS NULL RETURNING *`,[now(),text(req.body.challengeId,64),hash('browser',binding)])).rows[0];
    if (!proof || !signatureValid(proof.wallet,proof.message,req.body.signatureBase64)) fail('AUTH_INVALID',401);
    const sessionToken=random(), issuedAt=now(), expiresAt=issuedAt+900000;
    const account=await db.transaction(async tx => {
      const account=(await tx.query(`INSERT INTO developer_accounts(id,wallet,created_at) VALUES($1,$2,$3)
        ON CONFLICT(wallet) DO UPDATE SET wallet=EXCLUDED.wallet RETURNING *`,[id('dev'),proof.wallet,issuedAt])).rows[0];
      if(account.status !== 'active') fail('AUTH_INVALID',401);
      const oldToken=cookies(req)[cookieNames.session];
      if(token(oldToken)) await tx.query('UPDATE admin_sessions SET revoked_at=$1 WHERE token_hash=$2',[issuedAt,hash('admin-session',oldToken)]);
      await tx.query('INSERT INTO admin_sessions(token_hash,account_id,binding_hash,created_at,expires_at) VALUES($1,$2,$3,$4,$5)',
        [hash('admin-session',sessionToken),account.id,hash('browser',binding),issuedAt,expiresAt]);
      return account;
    });
    setCookie(reply,cookieNames.session,sessionToken,900);
    return {authenticated:true,account:{id:account.id,walletAddress:account.wallet},expiresAt};
  });
  route('POST','/v1/developer/auth/logout',async (req,reply) => {
    browser(req,true); strict(req.body,[]);
    const principal=await session(req);
    await db.query('UPDATE admin_sessions SET revoked_at=$1 WHERE token_hash=$2',[now(),principal.token_hash]);
    setCookie(reply,cookieNames.session,'',0); return {authenticated:false};
  });
  route('POST','/v1/developer/apps',async req => {
    browser(req,true); const principal=await session(req);
    strict(req.body,['name','framework'],['description']); text(req.body.name);
    text(req.body.description ?? '',500,0);
    if(!FRAMEWORKS.includes(req.body.framework)) fail('INVALID_INPUT');
    return db.transaction(async tx => {
      await tx.query('SELECT id FROM developer_accounts WHERE id=$1 FOR UPDATE',[principal.account_id]);
      const count=(await tx.query('SELECT COUNT(*) AS count FROM developer_applications WHERE owner_id=$1',[principal.account_id])).rows[0];
      if(Number(count.count)>=20) fail('APP_QUOTA',429);
      const app=(await tx.query(`INSERT INTO developer_applications(id,owner_id,name,description,framework,created_at,updated_at)
        VALUES($1,$2,$3,$4,$5,$6,$6) RETURNING *`,[id('app'),principal.account_id,req.body.name,req.body.description ?? '',req.body.framework,now()])).rows[0];
      await audit(tx,req,principal,app.id,'app.create'); return {app:appView(app)};
    });
  });
  route('GET','/v1/developer/apps',async req => {
    const principal=await session(req);
    return {apps:(await db.query('SELECT * FROM developer_applications WHERE owner_id=$1 ORDER BY created_at,id LIMIT 20',[principal.account_id])).rows.map(appView)};
  });
  route('GET','/v1/developer/apps/:appId',async req => ({app:appView(await owned(db,req.params.appId,await session(req)))}));
  route('POST','/v1/developer/actions/challenge',async req => {
    browser(req,true);const principal=await session(req);
    strict(req.body,['action','appId','payload']);const app=await owned(db,req.body.appId,principal);
    const payloadHash=validatePayload(req.body.action,req.body.payload), challengeId=id('act'), issuedAt=now(), expiresAt=issuedAt+120000;
    const issuedMessage=message({origin,wallet:principal.wallet,purpose:req.body.action,challengeId,
      binding:principal.token_hash,appId:app.id,payloadHash,issuedAt,expiresAt});
    await db.query(`INSERT INTO action_challenges(id,account_id,session_hash,app_id,action,payload_hash,message,created_at,expires_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,[challengeId,principal.account_id,principal.token_hash,app.id,req.body.action,payloadHash,issuedMessage,issuedAt,expiresAt]);
    return {challengeId,message:issuedMessage,payloadHash,expiresAt};
  });
  route('PATCH','/v1/developer/apps/:appId',req => mutate(req,'app.update',async (tx,principal,app,payload) => {
    const row=(await tx.query(`UPDATE developer_applications SET name=$1,description=$2,framework=$3,status=$4,updated_at=$5
      WHERE id=$6 AND owner_id=$7 RETURNING *`,[payload.name ?? app.name,payload.description ?? app.description,
      payload.framework ?? app.framework,payload.status ?? app.status,now(),app.id,principal.account_id])).rows[0];
    return {app:appView(row)};
  }));
  route('GET','/v1/developer/apps/:appId/callback-uris',async req => {
    await owned(db,req.params.appId,await session(req));
    return {callbacks:(await db.query('SELECT * FROM callback_uris WHERE app_id=$1 ORDER BY created_at,id LIMIT 10',[req.params.appId])).rows.map(callbackView)};
  });
  route('POST','/v1/developer/apps/:appId/callback-uris',req => mutate(req,'callback.create',async (tx,principal,app,payload) => {
    const value=callback(payload.uri,payload.websiteOrigin,local);
    if(Number((await tx.query('SELECT COUNT(*) AS count FROM callback_uris WHERE app_id=$1',[app.id])).rows[0].count)>=10) fail('CALLBACK_QUOTA',429);
    const dnsToken=random(), proofExpiresAt=now()+DAY;
    const row=(await tx.query(`INSERT INTO callback_uris(id,app_id,uri,website_origin,hostname,local,status,proof_hash,proof_expires_at,verified_until,created_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,[id('cb'),app.id,value.uri,value.websiteOrigin,value.hostname,value.local,
      value.local?'verified':'pending',value.local?null:hash('dns',dnsToken),value.local?null:proofExpiresAt,value.local?now()+30*DAY:null,now()])).rows[0];
    return {callback:callbackView(row),...(value.local?{}:{dnsToken:`pact-domain-verification=${dnsToken}`,verificationExpiresAt:proofExpiresAt})};
  }));
  route('POST','/v1/developer/apps/:appId/callback-uris/:callbackId/revoke',req=>mutate(req,'callback.revoke',async(tx,_,app,payload)=>{
    if(payload.callbackId!==req.params.callbackId)fail('INVALID_INPUT');
    const row=(await tx.query(`UPDATE callback_uris SET status='revoked',verified_until=NULL,proof_hash=NULL,proof_expires_at=NULL
      WHERE id=$1 AND app_id=$2 RETURNING *`,[payload.callbackId,app.id])).rows[0];
    if(!row)fail('NOT_FOUND',404);return{callback:callbackView(row)};
  }));
  route('POST','/v1/developer/apps/:appId/callback-uris/:callbackId/renew-proof',req=>mutate(req,'callback.renew',async(tx,_,app,payload)=>{
    if(payload.callbackId!==req.params.callbackId)fail('INVALID_INPUT');
    const current=(await tx.query('SELECT * FROM callback_uris WHERE id=$1 AND app_id=$2',[payload.callbackId,app.id])).rows[0];
    if(!current)fail('NOT_FOUND',404);
    const dnsToken=random(),proofExpiresAt=now()+DAY;
    const row=(await tx.query(`UPDATE callback_uris SET status=$1,proof_hash=$2,proof_expires_at=$3,verified_until=$4
      WHERE id=$5 AND app_id=$6 RETURNING *`,[current.local?'verified':'pending',current.local?null:hash('dns',dnsToken),
      current.local?null:proofExpiresAt,current.local?now()+30*DAY:null,current.id,app.id])).rows[0];
    return{callback:callbackView(row),...(current.local?{}:{dnsToken:`pact-domain-verification=${dnsToken}`,verificationExpiresAt:proofExpiresAt})};
  }));
  route('POST','/v1/developer/apps/:appId/callback-uris/verify',req =>
    mutate(req,'callback.verify',async(tx,_,app,payload,row)=>{
      const updated=(await tx.query(`UPDATE callback_uris SET status='verified',verified_until=$1 WHERE app_id=$2 AND id=$3
        AND proof_hash=$4 AND proof_expires_at>$5 RETURNING *`,[now()+DAY,app.id,row.id,row.proof_hash,now()])).rows[0];
      if(!updated)fail('DOMAIN_PROOF_EXPIRED',409);
      return {callback:callbackView(updated)};
    },async(principal,payload)=>{
      await owned(db,req.params.appId,principal);
      const row=(await db.query('SELECT * FROM callback_uris WHERE app_id=$1 AND id=$2',[req.params.appId,payload.callbackId])).rows[0];
      if(!row)fail('NOT_FOUND',404);
      if(row.local)fail('CALLBACK_ALREADY_VERIFIED',409);
      if(Number(row.proof_expires_at)<=now())fail('DOMAIN_PROOF_EXPIRED',409);
      let records;try{records=await domainRecords(`_pact.${row.hostname}`);}catch{fail('DOMAIN_VERIFICATION_UNAVAILABLE',503);}
      if(!Array.isArray(records)||records.length>16)fail('DOMAIN_PROOF_INVALID',403);
      const valid=records.some(parts=>Array.isArray(parts)&&parts.length<=8&&parts.every(p=>typeof p==='string'&&p.length<=512)
        && parts.join('').startsWith('pact-domain-verification=')&&equal(hash('dns',parts.join('').slice(25)),row.proof_hash));
      if(!valid)fail('DOMAIN_PROOF_INVALID',403);
      return row;
    }));
  async function mint(tx,principal,app,payload,rotatedFrom=null) {
    const keyId=id('key'), secret=`pact_sk_dev_${keyId}_${random()}`;
    const row=(await tx.query(`INSERT INTO api_credentials(id,app_id,creator_id,name,prefix,token_hash,scopes,created_at,expires_at,rotated_from)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,[keyId,app.id,principal.account_id,payload.name,
      `pact_sk_dev_${keyId}`,hash('api-key',secret),JSON.stringify(payload.scopes),now(),payload.expiresAt,rotatedFrom])).rows[0];
    return {credential:keyView(row),secret};
  }
  route('GET','/v1/developer/apps/:appId/credentials',async req=>{
    await owned(db,req.params.appId,await session(req));
    return {credentials:(await db.query('SELECT * FROM api_credentials WHERE app_id=$1 ORDER BY created_at DESC,id DESC LIMIT 50',[req.params.appId])).rows.map(keyView)};
  });
  route('POST','/v1/developer/apps/:appId/credentials',req=>mutate(req,'credential.create',async(tx,principal,app,payload)=>{
    if(Number((await tx.query('SELECT COUNT(*) AS count FROM api_credentials WHERE app_id=$1 AND revoked_at IS NULL AND expires_at>$2',[app.id,now()])).rows[0].count)>=10)fail('CREDENTIAL_QUOTA',429);
    return mint(tx,principal,app,payload);
  }));
  route('POST','/v1/developer/apps/:appId/credentials/:credentialId/rotate',req=>mutate(req,'credential.rotate',async(tx,principal,app,payload)=>{
    if(payload.credentialId!==req.params.credentialId)fail('INVALID_INPUT');
    const row=(await tx.query(`UPDATE api_credentials SET expires_at=LEAST(expires_at,$1) WHERE id=$2 AND app_id=$3
      AND revoked_at IS NULL AND expires_at>$4 RETURNING *`,[now()+payload.overlapSeconds*1000,payload.credentialId,app.id,now()])).rows[0];
    if(!row)fail('NOT_FOUND',404);
    if(Number((await tx.query('SELECT COUNT(*) AS count FROM api_credentials WHERE app_id=$1 AND revoked_at IS NULL AND expires_at>$2',[app.id,now()])).rows[0].count)>=10)fail('CREDENTIAL_QUOTA',429);
    return mint(tx,principal,app,{name:row.name,scopes:JSON.parse(row.scopes),expiresAt:payload.expiresAt},row.id);
  }));
  route('POST','/v1/developer/apps/:appId/credentials/:credentialId/revoke',req=>mutate(req,'credential.revoke',async(tx,_,app,payload)=>{
    if(payload.credentialId!==req.params.credentialId)fail('INVALID_INPUT');
    const row=(await tx.query('UPDATE api_credentials SET revoked_at=COALESCE(revoked_at,$1) WHERE id=$2 AND app_id=$3 RETURNING *',[now(),payload.credentialId,app.id])).rows[0];
    if(!row)fail('NOT_FOUND',404);return{credential:keyView(row)};
  }));
  route('GET','/v1/developer/apps/:appId/events',async req=>{
    const principal=await session(req);await owned(db,req.params.appId,principal);
    return{events:(await db.query(`SELECT id,type,request_id,outcome,created_at FROM security_audit_events
      WHERE owner_id=$1 AND app_id=$2 ORDER BY created_at DESC,id LIMIT 100`,[principal.account_id,req.params.appId])).rows.map(row=>
      ({id:row.id,type:row.type,requestId:row.request_id,outcome:row.outcome,createdAt:Number(row.created_at)}))};
  });
  route('GET','/v1/developer/apps/:appId/usage',async req=>{
    await owned(db,req.params.appId,await session(req));
    return{buckets:(await db.query('SELECT * FROM usage_aggregates WHERE app_id=$1 AND bucket>$2 ORDER BY bucket DESC LIMIT 720',[req.params.appId,now()-30*DAY])).rows.map(row=>
      ({bucket:Number(row.bucket),requests:Number(row.requests),allowed:Number(row.allowed),denied:Number(row.denied),errors:Number(row.errors)}))};
  });
  async function authenticateKey(req,scope,tx=db) {
    if(req.headers.origin!==undefined)fail('BROWSER_API_KEY_DENIED',403);
    const authorization=req.headers.authorization;
    if(typeof authorization!=='string'||!/^Bearer pact_sk_dev_key_[a-f0-9]{32}_[A-Za-z0-9_-]{43}$/.test(authorization))fail('API_KEY_INVALID',401);
    const row=(await tx.query(`SELECT c.*,a.status AS app_status,a.owner_id,a.environment FROM api_credentials c
      JOIN developer_applications a ON a.id=c.app_id JOIN developer_accounts d ON d.id=a.owner_id
      WHERE c.token_hash=$1 AND c.revoked_at IS NULL AND c.expires_at>$2 AND d.status='active'`,
      [hash('api-key',authorization.slice(7)),now()])).rows[0];
    if(!row)fail('API_KEY_INVALID',401);
    if(row.app_status!=='active')fail('APP_DISABLED',403);
    if(!JSON.parse(row.scopes).includes(scope))fail('API_KEY_SCOPE_DENIED',403);
    await tx.query('UPDATE api_credentials SET last_used_at=$1 WHERE id=$2 AND revoked_at IS NULL',[now(),row.id]);
    return row;
  }
  route('POST','/v1/credentials/validate',async req=>{
    strict(req.body,[]);const credential=await authenticateKey(req,'access:check');
    return{valid:true,appId:credential.app_id,credentialId:credential.id,environment:credential.environment,scopes:JSON.parse(credential.scopes)};
  });
  const reader=options.reader??createPlatformReader({...options.readerOptions,now});
  const service={server,database:db,reader,authenticateKey,now,hash,options:{origin,profile},
    internals:{route,envelope,session,owned,audit,mutate,browser,validatePayload,appView,keyView,callbackView,
      registerAction(action,validator){if(ACTIONS.includes(action)||additionalActions.has(action))fail('DUPLICATE_ACTION',503);additionalActions.set(action,validator);}},
    async close(){for(const entry of dnsPending)entry.resolver?.cancel();await server.close();}};
  registerResources(service);
  return service;
}
