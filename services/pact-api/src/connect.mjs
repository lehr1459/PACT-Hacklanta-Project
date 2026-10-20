import {createHash} from 'node:crypto';
import {fail,random,id,token,equal,digest,canonical,message,signatureValid,strict,text,walletBytes} from './security.mjs';

const TRANSACTION_TTL=300000,CHALLENGE_TTL=120000,CODE_TTL=60000,GRANT_TTL=900000;
function opaque(value,prefix){return typeof value==='string'&&value.startsWith(prefix)&&token(value.slice(prefix.length));}
export function registerConnect(service){
  const {database:db,now,hash,authenticateKey,options:{origin,profile}}=service;
  const {route,browser,cookies,setCookie,cookieNames,domainRecords,validateBody,validateResult,requestGuard}=service.internals;
  const buyer=(req,mutation=false)=>browser(req,mutation,'connectBinding');
  function liveCallback(row){
    if(!row||row.status!=='verified'||Number(row.verified_until)<=now()||profile==='hosted'&&row.local)fail('CALLBACK_UNAVAILABLE',403);
    return row;
  }
  // Lock ordering matches control-plane operations: account, app, credentials.
  async function context(tx,{appId,callbackId,callbackRevision,epoch,credentialId,creatorCredentialId,allowPaused=false,request}){
    let validUntil=Infinity;
    const account=(await tx.query(`SELECT d.id,d.status FROM developer_accounts d JOIN developer_applications a ON a.owner_id=d.id
      WHERE a.id=$1 FOR UPDATE OF d`,[appId])).rows[0];
    if(!account||account.status!=='active')fail('AUTH_INVALID',401);
    const app=(await tx.query('SELECT * FROM developer_applications WHERE id=$1 FOR UPDATE',[appId])).rows[0];
    if(!app||app.status!=='active'&&!(allowPaused&&app.status==='paused'))fail('APP_DISABLED',403);
    if(epoch!==undefined&&String(app.policy_epoch)!==String(epoch))fail('LOGIN_INVALID',401);
    for(const keyId of [...new Set([credentialId,creatorCredentialId].filter(Boolean))].sort()){
      const key=(await tx.query(`SELECT * FROM api_credentials WHERE id=$1 AND app_id=$2 AND revoked_at IS NULL
        AND expires_at>$3 FOR UPDATE`,[keyId,appId,now()])).rows[0];
      if(!key||!JSON.parse(key.scopes).includes('connect:write'))fail('API_KEY_INVALID',401);
      validUntil=Math.min(validUntil,Number(key.expires_at));
    }
    const callback=callbackId?(await tx.query('SELECT * FROM callback_uris WHERE id=$1 AND app_id=$2 FOR UPDATE',[callbackId,appId])).rows[0]:null;
    if(callbackId){
      liveCallback(callback);validUntil=Math.min(validUntil,Number(callback.verified_until));
      if(callbackRevision!==undefined&&String(callback.revision)!==String(callbackRevision))fail('LOGIN_INVALID',401);
    }
    const check=(deadlines=[])=>{const time=now();if(time>=Math.min(validUntil,...deadlines.map(Number)))fail('LOGIN_INVALID',401);if(request)requestGuard(request);};
    check();return{app,callback,check};
  }
  async function transaction(transactionId,tx=db){
    text(transactionId,64);
    const row=(await tx.query('SELECT * FROM login_transactions WHERE id=$1',[transactionId])).rows[0];
    if(!row||Number(row.expires_at)<=now()||row.redeemed_at!==null)fail('LOGIN_INVALID',401);
    return row;
  }
  async function current(transactionId,{needsUnproven=false,bindingHash,claimBinding=false,request}={}){
    const login=await transaction(transactionId);
    if(needsUnproven&&login.wallet!==null)fail('LOGIN_INVALID',401);
    const result=await db.transaction(async tx=>{
      const ctx=await context(tx,{appId:login.app_id,callbackId:login.callback_id,
        epoch:login.policy_epoch,callbackRevision:login.callback_revision,creatorCredentialId:login.creator_credential_id,request});
      if(bindingHash){
        if(claimBinding){
          const claimed=(await tx.query(`UPDATE login_transactions SET browser_binding_hash=$1 WHERE id=$2
            AND (browser_binding_hash IS NULL OR browser_binding_hash=$1) AND expires_at>$3 AND wallet IS NULL RETURNING id`,
            [bindingHash,login.id,now()])).rows[0];
          if(!claimed)fail('LOGIN_INVALID',401);
        }else if(!equal(login.browser_binding_hash,bindingHash))fail('LOGIN_INVALID',401);
      }
      ctx.check([login.expires_at]);return ctx;
    });
    return{login,...result};
  }
  async function currentDNS(callback){
    liveCallback(callback);
    if(callback.local)return;
    let records;try{records=await domainRecords(`_pact.${callback.hostname}`);}catch{fail('DOMAIN_VERIFICATION_UNAVAILABLE',503);}
    if(!Array.isArray(records)||records.length>16)fail('DOMAIN_PROOF_INVALID',403);
    if(!records.some(parts=>Array.isArray(parts)&&parts.length<=8&&parts.every(p=>typeof p==='string'&&p.length<=512)
      &&parts.join('').startsWith('pact-domain-verification=')&&equal(hash('dns',parts.join('').slice(25)),callback.proof_hash)))fail('DOMAIN_PROOF_INVALID',403);
  }
  route('POST','/v1/connect/transactions',async req=>{
    const key=await authenticateKey(req,'connect:write');
    strict(req.body,['redirectUri','state','codeChallenge','codeChallengeMethod','purpose']);
    text(req.body.redirectUri,2048);text(req.body.purpose,200);
    if(!token(req.body.state)||!token(req.body.codeChallenge)||req.body.codeChallengeMethod!=='S256')fail('INVALID_LOGIN_INPUT');
    validateBody(req);
    const callback=(await db.query('SELECT * FROM callback_uris WHERE app_id=$1 AND uri=$2',[key.app_id,req.body.redirectUri])).rows[0];
    await currentDNS(liveCallback(callback));
    const transactionId=id('con'),createdAt=now(),expiresAt=createdAt+TRANSACTION_TTL;
    const loginUrl=new URL('/connect',origin);loginUrl.searchParams.set('transactionId',transactionId);
    const result=validateResult(req,{transactionId,loginUrl:loginUrl.href,expiresAt,issuer:origin});
    await db.transaction(async tx=>{
      const ctx=await context(tx,{appId:key.app_id,callbackId:callback.id,credentialId:key.id,request:req});
      if(ctx.callback.uri!==req.body.redirectUri||ctx.callback.proof_hash!==callback.proof_hash)fail('CALLBACK_UNAVAILABLE',403);
      const count=(await tx.query('SELECT COUNT(*) AS count FROM login_transactions WHERE app_id=$1 AND expires_at>$2 AND redeemed_at IS NULL',[key.app_id,now()])).rows[0];
      if(Number(count.count)>=100)fail('LOGIN_QUOTA',429);
      await tx.query(`INSERT INTO login_transactions(id,app_id,creator_credential_id,callback_id,redirect_uri,policy_epoch,purpose,state,state_hash,code_challenge,created_at,expires_at,callback_revision)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,[transactionId,key.app_id,key.id,callback.id,req.body.redirectUri,
        ctx.app.policy_epoch,req.body.purpose,req.body.state,hash('login-state',req.body.state),req.body.codeChallenge,createdAt,expiresAt,ctx.callback.revision]);
      if(now()>=expiresAt)fail('LOGIN_INVALID',401);
      ctx.check([expiresAt]);
    });
    return result;
  });
  route('GET','/v1/connect/transactions/:transactionId',async(req,reply)=>{
    buyer(req);
    let binding=cookies(req)[cookieNames.connectBinding];
    if(!token(binding)){binding=random();setCookie(reply,cookieNames.connectBinding,binding,600);}
    const {login,app,callback}=await current(req.params.transactionId,{needsUnproven:true,bindingHash:hash('buyer-browser',binding),claimBinding:true,request:req});
    return{transaction:{id:login.id,app:{id:app.id,name:app.name},websiteOrigin:callback.website_origin,
      purpose:login.purpose,expiresAt:Number(login.expires_at),issuer:origin},csrfToken:binding};
  });
  route('POST','/v1/connect/challenge',async req=>{
    const binding=buyer(req,true);strict(req.body,['transactionId','walletAddress']);walletBytes(req.body.walletAddress);
    validateBody(req);
    const {login}=await current(req.body.transactionId,{needsUnproven:true,bindingHash:hash('buyer-browser',binding),request:req});
    const challengeId=id('buy'),createdAt=now(),expiresAt=Math.min(createdAt+CHALLENGE_TTL,Number(login.expires_at));
    const payloadHash=digest(canonical({transactionId:login.id,redirectUri:login.redirect_uri,stateHash:login.state_hash,
      callbackRevision:String(login.callback_revision),codeChallenge:login.code_challenge,purpose:login.purpose,policyEpoch:String(login.policy_epoch)}));
    const issued=message({origin,wallet:req.body.walletAddress,purpose:`application-login: ${login.purpose}`,appId:login.app_id,
      challengeId,binding:hash('buyer-browser',binding),payloadHash,issuedAt:createdAt,expiresAt});
    const exactMessage=`${issued}\nLogin transaction: ${login.id}`;
    const result=validateResult(req,{challengeId,message:exactMessage,expiresAt});
    await db.transaction(async tx=>{
      const ctx=await context(tx,{appId:login.app_id,callbackId:login.callback_id,callbackRevision:login.callback_revision,epoch:login.policy_epoch,creatorCredentialId:login.creator_credential_id,request:req});
      const currentLogin=await transaction(login.id,tx);
      if(currentLogin.wallet!==null||!equal(currentLogin.browser_binding_hash,hash('buyer-browser',binding)))fail('LOGIN_INVALID',401);
      const count=(await tx.query('SELECT COUNT(*) AS count FROM wallet_challenges WHERE transaction_id=$1 AND expires_at>$2 AND consumed_at IS NULL',[login.id,now()])).rows[0];
      if(Number(count.count)>=5)fail('CHALLENGE_QUOTA',429);
      await tx.query(`UPDATE wallet_challenges SET consumed_at=$1 WHERE transaction_id=$2 AND binding_hash=$3
        AND consumed_at IS NULL`,[now(),login.id,hash('buyer-browser',binding)]);
      await tx.query(`INSERT INTO wallet_challenges(id,transaction_id,wallet,binding_hash,message,created_at,expires_at)
        VALUES($1,$2,$3,$4,$5,$6,$7)`,[challengeId,login.id,req.body.walletAddress,hash('buyer-browser',binding),exactMessage,createdAt,expiresAt]);
      await tx.query('UPDATE login_transactions SET active_challenge_id=$1 WHERE id=$2',[challengeId,login.id]);
      if(now()>=expiresAt)fail('LOGIN_INVALID',401);
      ctx.check([expiresAt]);
    });
    return result;
  });
  route('POST','/v1/connect/verify',async req=>{
    const binding=buyer(req,true);strict(req.body,['transactionId','challengeId','signatureBase64']);
    text(req.body.transactionId,64);text(req.body.challengeId,64);
    const challenge=(await db.query(`UPDATE wallet_challenges SET consumed_at=$1 WHERE id=$2 AND transaction_id=$3
      AND binding_hash=$4 AND expires_at>$1 AND consumed_at IS NULL RETURNING *`,[now(),req.body.challengeId,req.body.transactionId,hash('buyer-browser',binding)])).rows[0];
    if(!challenge||!signatureValid(challenge.wallet,challenge.message,req.body.signatureBase64))fail('WALLET_PROOF_INVALID',401);
    validateBody(req);
    const code=`pact_code_${random()}`;
    const result=await db.transaction(async tx=>{
      const login=await transaction(req.body.transactionId,tx);
      const ctx=await context(tx,{appId:login.app_id,callbackId:login.callback_id,callbackRevision:login.callback_revision,epoch:login.policy_epoch,creatorCredentialId:login.creator_credential_id,request:req});
      if(ctx.callback.uri!==login.redirect_uri||now()>=Number(challenge.expires_at)
        ||!equal(login.browser_binding_hash,hash('buyer-browser',binding))||login.active_challenge_id!==challenge.id)fail('LOGIN_INVALID',401);
      const expiresAt=Math.min(now()+CODE_TTL,Number(login.expires_at));
      const issued=(await tx.query(`UPDATE login_transactions SET wallet=$1,code_hash=$2,code_expires_at=$3 WHERE id=$4
        AND wallet IS NULL AND code_hash IS NULL AND redeemed_at IS NULL AND expires_at>$5 AND active_challenge_id=$6 RETURNING *`,
        [challenge.wallet,hash('login-code',code),expiresAt,login.id,now(),challenge.id])).rows[0];
      if(!issued||now()>=expiresAt||now()>=Number(challenge.expires_at))fail('LOGIN_INVALID',401);
      const destination=new URL(issued.redirect_uri);
      destination.searchParams.set('code',code);destination.searchParams.set('state',issued.state);destination.searchParams.set('iss',origin);
      const result=validateResult(req,{callbackUrl:destination.href});
      if(now()>=expiresAt||now()>=Number(challenge.expires_at))fail('LOGIN_INVALID',401);
      ctx.check([expiresAt,challenge.expires_at]);
      return result;
    });
    return result;
  });
  route('POST','/v1/connect/token',async req=>{
    const key=await authenticateKey(req,'connect:write');
    strict(req.body,['code','redirectUri','state','codeVerifier','issuer']);
    if(!opaque(req.body.code,'pact_code_')||!token(req.body.state)||req.body.issuer!==origin
      ||typeof req.body.codeVerifier!=='string'||!/^[A-Za-z0-9._~-]{43,128}$/.test(req.body.codeVerifier))fail('LOGIN_INVALID',401);
    text(req.body.redirectUri,2048);
    validateBody(req);
    const codeHash=hash('login-code',req.body.code),challenge=createHash('sha256').update(req.body.codeVerifier,'ascii').digest('base64url');
    const grant=`pact_grant_${random()}`;
    const result=await db.transaction(async tx=>{
      const found=(await tx.query('SELECT * FROM login_transactions WHERE code_hash=$1 AND app_id=$2',[codeHash,key.app_id])).rows[0];
      if(!found)fail('LOGIN_INVALID',401);
      const ctx=await context(tx,{appId:key.app_id,callbackId:found.callback_id,callbackRevision:found.callback_revision,epoch:found.policy_epoch,credentialId:key.id,creatorCredentialId:found.creator_credential_id,request:req});
      const login=(await tx.query('SELECT * FROM login_transactions WHERE id=$1 FOR UPDATE',[found.id])).rows[0];
      if(!login||login.redeemed_at!==null||login.wallet===null||Number(login.expires_at)<=now()||Number(login.code_expires_at)<=now()
        ||ctx.callback.uri!==login.redirect_uri
        ||login.redirect_uri!==req.body.redirectUri||!equal(login.state_hash,hash('login-state',req.body.state))
        ||!equal(login.code_challenge,challenge))fail('LOGIN_INVALID',401);
      const consumed=(await tx.query(`UPDATE login_transactions SET redeemed_at=$1 WHERE id=$2 AND redeemed_at IS NULL
        AND code_expires_at>$1 AND expires_at>$1 RETURNING id`,[now(),login.id])).rows[0];
      if(!consumed)fail('LOGIN_INVALID',401);
      const createdAt=now(),expiresAt=createdAt+GRANT_TTL;
      await tx.query(`INSERT INTO wallet_grants(id,token_hash,app_id,wallet,policy_epoch,provenance_login_id,created_at,expires_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,[id('grt'),hash('wallet-grant',grant),login.app_id,login.wallet,login.policy_epoch,login.id,createdAt,expiresAt]);
      const result=validateResult(req,{walletGrant:grant,walletAddress:login.wallet,appId:login.app_id,environment:'devnet',expiresAt,issuer:origin});
      if(Number(login.code_expires_at)<=now()||Number(login.expires_at)<=now())fail('LOGIN_INVALID',401);
      ctx.check([login.code_expires_at,login.expires_at,expiresAt]);
      return result;
    });
    return result;
  });
  route('POST','/v1/connect/revoke',async req=>{
    const key=await authenticateKey(req,'connect:write',db,true);strict(req.body,['walletGrant']);
    if(!opaque(req.body.walletGrant,'pact_grant_'))fail('GRANT_INVALID',401);
    validateBody(req);
    const result=validateResult(req,{revoked:true});
    await db.transaction(async tx=>{
      const ctx=await context(tx,{appId:key.app_id,credentialId:key.id,allowPaused:true,request:req});
      const row=(await tx.query(`UPDATE wallet_grants SET revoked_at=COALESCE(revoked_at,$1) WHERE token_hash=$2 AND app_id=$3
        RETURNING id`,[now(),hash('wallet-grant',req.body.walletGrant),key.app_id])).rows[0];
      if(!row)fail('GRANT_INVALID',401);
      ctx.check();
    });
    return result;
  });
  async function authenticateGrant(walletGrant,app,tx=db){
    if(!opaque(walletGrant,'pact_grant_'))fail('GRANT_INVALID',401);
    const row=(await tx.query(`SELECT g.* FROM wallet_grants g JOIN developer_applications a ON a.id=g.app_id
      JOIN developer_accounts d ON d.id=a.owner_id WHERE g.token_hash=$1 AND g.app_id=$2 AND g.environment='devnet'
      AND g.revoked_at IS NULL AND g.expires_at>$3 AND g.policy_epoch=a.policy_epoch AND a.status='active' AND d.status='active'`,
      [hash('wallet-grant',walletGrant),app.app_id??app.id,now()])).rows[0];
    if(!row||Number(row.expires_at)<=now())fail('GRANT_INVALID',401);return row;
  }
  service.authenticateGrant=authenticateGrant;
  service.internals.connectContext=context;
}
