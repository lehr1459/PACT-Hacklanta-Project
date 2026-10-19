import {FRESHNESS_MS} from '@pact/sdk';
import {PROGRAM,ApiError,fail,strict,text,walletBytes,digest} from './security.mjs';

function resourceKey(value){
  if(typeof value!=='string'||!/^[a-z][a-z0-9-]{0,63}$/.test(value))fail('INVALID_RESOURCE_KEY');
  return value;
}
function view(row){
  return{resourceKey:row.resource_key,offerAddress:row.offer_address,version:Number(row.version),enabled:row.enabled,
    createdAt:Number(row.created_at),updatedAt:Number(row.updated_at),verifiedAt:Number(row.verified_at),contextSlot:Number(row.context_slot)};
}
export function registerResources(service){
  const {database:db,reader,now}=service;
  const {route,session,owned,mutate,registerAction}=service.internals;
  registerAction('resource.bind',payload=>{
    strict(payload,['resourceKey','offerAddress']);resourceKey(payload.resourceKey);walletBytes(payload.offerAddress);
  });
  registerAction('resource.update',payload=>{
    strict(payload,['resourceKey','expectedVersion'],['offerAddress','enabled']);resourceKey(payload.resourceKey);
    if(!Number.isSafeInteger(payload.expectedVersion)||payload.expectedVersion<1||payload.expectedVersion>2147483646)fail('INVALID_RESOURCE_VERSION');
    if(!Object.hasOwn(payload,'offerAddress')&&!Object.hasOwn(payload,'enabled'))fail('INVALID_INPUT');
    if(Object.hasOwn(payload,'offerAddress'))walletBytes(payload.offerAddress);
    if(Object.hasOwn(payload,'enabled')&&typeof payload.enabled!=='boolean')fail('INVALID_INPUT');
  });
  function checkedQuote(quote,offerAddress,principal){
    const time=now();
    if(!quote||quote.offer!==offerAddress||quote.program!==PROGRAM||quote.seller!==principal.wallet)fail('OFFER_OWNERSHIP_REQUIRED',403);
    if(quote.active!==true)fail('OFFER_INACTIVE',409);
    if(!Number.isSafeInteger(quote.contextSlot)||quote.contextSlot<0||!Number.isSafeInteger(quote.startedAtMs)
      ||!Number.isSafeInteger(quote.receivedAtMs)||quote.receivedAtMs<quote.startedAtMs||quote.receivedAtMs>time
      ||time<quote.startedAtMs||time-quote.startedAtMs>=FRESHNESS_MS)fail('CHAIN_UNAVAILABLE',503);
    return quote;
  }
  async function verifiedOffer(offerAddress,principal){
    let quote;
    try{quote=await reader.getOffer({offer:offerAddress});}
    catch(error){if(error instanceof ApiError)throw error;fail('CHAIN_UNAVAILABLE',503);}
    return checkedQuote(quote,offerAddress,principal);
  }
  async function history(tx,req,principal,row){
    await tx.query(`INSERT INTO resource_versions(app_id,resource_key,version,offer_address,enabled,verified_at,
      context_slot,actor_id,actor_wallet,action_challenge_id,signature_hash,created_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,[row.app_id,row.resource_key,row.version,row.offer_address,
      row.enabled,row.verified_at,row.context_slot,principal.account_id,principal.wallet,req.body.proof.challengeId,
      digest(req.body.proof.signatureBase64),now()]);
    await tx.query('UPDATE developer_applications SET policy_epoch=policy_epoch+1,updated_at=$1 WHERE id=$2',[now(),row.app_id]);
  }
  route('GET','/v1/developer/apps/:appId/resources',async req=>{
    await owned(db,req.params.appId,await session(req));
    return{resources:(await db.query('SELECT * FROM app_resources WHERE app_id=$1 ORDER BY resource_key LIMIT 50',[req.params.appId])).rows.map(view)};
  });
  route('GET','/v1/developer/apps/:appId/resources/:resourceKey',async req=>{
    await owned(db,req.params.appId,await session(req));resourceKey(req.params.resourceKey);
    const row=(await db.query('SELECT * FROM app_resources WHERE app_id=$1 AND resource_key=$2',[req.params.appId,req.params.resourceKey])).rows[0];
    if(!row)fail('NOT_FOUND',404);
    const versions=(await db.query(`SELECT version,offer_address,enabled,verified_at,context_slot,actor_wallet,created_at
      FROM resource_versions WHERE app_id=$1 AND resource_key=$2 ORDER BY version DESC LIMIT 100`,[req.params.appId,req.params.resourceKey])).rows.map(version=>
      ({version:Number(version.version),offerAddress:version.offer_address,enabled:version.enabled,verifiedAt:Number(version.verified_at),
        contextSlot:Number(version.context_slot),actorWallet:version.actor_wallet,createdAt:Number(version.created_at)}));
    return{resource:view(row),versions};
  });
  route('POST','/v1/developer/apps/:appId/resources',req=>mutate(req,'resource.bind',async(tx,principal,app,payload,quote)=>{
    checkedQuote(quote,payload.offerAddress,principal);
    if(Number((await tx.query('SELECT COUNT(*) AS count FROM app_resources WHERE app_id=$1',[app.id])).rows[0].count)>=50)fail('RESOURCE_QUOTA',429);
    const row=(await tx.query(`INSERT INTO app_resources(app_id,resource_key,offer_address,version,enabled,created_at,updated_at,verified_at,context_slot)
      VALUES($1,$2,$3,1,true,$4,$4,$5,$6) RETURNING *`,[app.id,payload.resourceKey,payload.offerAddress,now(),quote.receivedAtMs,quote.contextSlot])).rows[0];
    await history(tx,req,principal,row);return{resource:view(row)};
  },(principal,payload)=>verifiedOffer(payload.offerAddress,principal),
  (quote,principal,payload)=>checkedQuote(quote,payload.offerAddress,principal)));
  async function update(req){
    return mutate(req,'resource.update',async(tx,principal,app,payload,prepared)=>{
      if(payload.resourceKey!==req.params.resourceKey)fail('INVALID_INPUT');
      const current=(await tx.query('SELECT * FROM app_resources WHERE app_id=$1 AND resource_key=$2 FOR UPDATE',[app.id,payload.resourceKey])).rows[0];
      if(!current)fail('NOT_FOUND',404);
      if(Number(current.version)!==payload.expectedVersion)fail('RESOURCE_VERSION_CONFLICT',409);
      const target=payload.offerAddress??current.offer_address;
      if(prepared.quote)checkedQuote(prepared.quote,target,principal);
      if(req.method==='DELETE'&&(payload.enabled!==false||Object.hasOwn(payload,'offerAddress')))fail('INVALID_INPUT');
      const row=(await tx.query(`UPDATE app_resources SET offer_address=$1,enabled=$2,version=version+1,updated_at=$3,
        verified_at=$4,context_slot=$5 WHERE app_id=$6 AND resource_key=$7 RETURNING *`,[target,payload.enabled??current.enabled,now(),
        prepared.quote?prepared.quote.receivedAtMs:current.verified_at,prepared.quote?prepared.quote.contextSlot:current.context_slot,app.id,payload.resourceKey])).rows[0];
      await history(tx,req,principal,row);return{resource:view(row)};
    },async(principal,payload)=>{
      if(payload.resourceKey!==req.params.resourceKey)fail('INVALID_INPUT');
      await owned(db,req.params.appId,principal);
      const current=(await db.query('SELECT * FROM app_resources WHERE app_id=$1 AND resource_key=$2',[req.params.appId,payload.resourceKey])).rows[0];
      if(!current)fail('NOT_FOUND',404);
      if(Number(current.version)!==payload.expectedVersion)fail('RESOURCE_VERSION_CONFLICT',409);
      // Emergency disable of an existing policy remains available during an RPC outage.
      if(payload.enabled===false&&!Object.hasOwn(payload,'offerAddress'))return{};
      return{quote:await verifiedOffer(payload.offerAddress??current.offer_address,principal)};
    },(prepared,principal,payload)=>{
      if(prepared.quote)checkedQuote(prepared.quote,payload.offerAddress??prepared.quote.offer,principal);
    });
  }
  route('PATCH','/v1/developer/apps/:appId/resources/:resourceKey',update);
  route('DELETE','/v1/developer/apps/:appId/resources/:resourceKey',update);
}
