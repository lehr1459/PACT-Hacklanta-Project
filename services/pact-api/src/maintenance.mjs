import {fail} from './security.mjs';
const DAY=86400000;
// Operator-only fixed SQL. No HTTP route or caller-selected table/predicate.
const retention=[
 ['action_challenges',['id'],'expires_at < $1','expires_at',DAY],
 ['admin_challenges',['id'],'expires_at < $1','expires_at',DAY],
 ['wallet_challenges',['id'],'expires_at < $1','expires_at',DAY],
 ['admin_sessions',['token_hash'],'expires_at < $1 AND NOT EXISTS(SELECT 1 FROM action_challenges c WHERE c.session_hash=admin_sessions.token_hash)','expires_at',DAY],
 ['wallet_grants',['id'],'expires_at < $1','expires_at',DAY],
 ['login_transactions',['id'],'expires_at < $1 AND NOT EXISTS(SELECT 1 FROM wallet_challenges c WHERE c.transaction_id=login_transactions.id)','expires_at',DAY],
 ['api_credentials',['id'],'(expires_at < $1 OR revoked_at < $1) AND NOT EXISTS(SELECT 1 FROM login_transactions l WHERE l.creator_credential_id=api_credentials.id) AND NOT EXISTS(SELECT 1 FROM api_credentials c WHERE c.rotated_from=api_credentials.id)','expires_at',90*DAY],
 ['usage_reasons',['app_id','bucket','reason'],'bucket < $1','bucket',30*DAY],
 ['usage_aggregates',['app_id','bucket'],'bucket < $1','bucket',30*DAY],
 ['security_audit_events',['id'],'created_at < $1','created_at',90*DAY],
 ['request_budgets',['budget_key'],'window_start < $1','window_start',null],
];
function options(database,apply,batchSize){
 if(!database||typeof database.query!=='function'||typeof database.transaction!=='function'||typeof apply!=='boolean'
  ||!Number.isSafeInteger(batchSize)||batchSize<1||batchSize>1000)fail('MAINTENANCE_CONFIGURATION_REQUIRED');
}
export async function maintainDatabase({database,now=Date.now(),apply=false,batchSize=100}={}){
 options(database,apply,batchSize);if(!Number.isSafeInteger(now)||now<0)fail('CLOCK_UNAVAILABLE',503);
 const results=[];
 for(const[table,keys,predicate,order,age]of retention){
  const cutoff=age===null?Math.floor(now/60000)-2:now-age;
  if(table==='api_credentials'){
   const selection='SELECT c.id FROM api_credentials c JOIN api_credentials p ON c.rotated_from=p.id WHERE (p.expires_at < $1 OR p.revoked_at < $1) ORDER BY p.expires_at,c.id LIMIT $2';
   const result=await database.transaction(async tx=>{
    const candidates=(await tx.query(selection,[cutoff,batchSize+1])).rows;let removed=0;
    if(apply&&candidates.length)removed=(await tx.query(`UPDATE api_credentials SET rotated_from=NULL WHERE id IN(${selection}) RETURNING 1`,[cutoff,batchSize])).rows.length;
    return{table:'credential_lineage',eligibleInBatch:Math.min(candidates.length,batchSize),more:candidates.length>batchSize,removed};
   });results.push(result);
  }
  // Bound both returned candidates and effects; never count an entire large table.
  const selection=`SELECT ${keys.join(',')} FROM ${table} WHERE ${predicate} ORDER BY ${order} LIMIT $2`;
  const result=await database.transaction(async tx=>{
   const candidates=(await tx.query(selection,[cutoff,batchSize+1])).rows;
   let removed=0;
   if(apply&&candidates.length){
    const tuple=keys.length===1?keys[0]:`(${keys.join(',')})`;
    const output=await tx.query(`DELETE FROM ${table} WHERE ${tuple} IN (${selection}) RETURNING 1`,[cutoff,batchSize]);
    removed=output.rows.length;
   }
   return{table,eligibleInBatch:Math.min(candidates.length,batchSize),more:candidates.length>batchSize,removed};
  });results.push(result);
 }
 return{mode:apply?'apply':'dry-run',batchSize,results};
}

const owned='SELECT id FROM developer_applications WHERE owner_id=$1';
const accountTables=[
 ['action_challenges','account_id=$1'],
 ['wallet_challenges',`transaction_id IN(SELECT id FROM login_transactions WHERE app_id IN(${owned}))`],
 ['wallet_grants',`app_id IN(${owned})`],
 ['login_transactions',`app_id IN(${owned})`],
 ['security_audit_events','owner_id=$1'],
 ['usage_reasons',`app_id IN(${owned})`],
 ['usage_aggregates',`app_id IN(${owned})`],
 ['resource_versions',`app_id IN(${owned})`],
 ['app_resources',`app_id IN(${owned})`],
 ['callback_uris',`app_id IN(${owned})`],
 ['api_credentials',`app_id IN(${owned})`],
 ['admin_sessions','account_id=$1'],
 ['admin_challenges','wallet=$1'],
 ['developer_applications','owner_id=$1'],
 ['developer_accounts','id=$1'],
];
const primaryKeys={usage_reasons:['app_id','bucket','reason'],usage_aggregates:['app_id','bucket'],
 resource_versions:['app_id','resource_key','version'],app_resources:['app_id','resource_key'],admin_sessions:['token_hash']};
function accountOptions(database,accountId,apply,expectedWallet){
 options(database,apply,100);
 if(typeof accountId!=='string'||!/^dev_[a-f0-9]{32}$/.test(accountId)||apply&&typeof expectedWallet!=='string')fail('OWNER_CONFIRMATION_REQUIRED');
}
async function lockedAccount(tx,accountId,expectedWallet,apply){
 const account=(await tx.query('SELECT id,wallet,status FROM developer_accounts WHERE id=$1 FOR UPDATE',[accountId])).rows[0];
 if(!account)fail('OWNER_NOT_FOUND',404);
 if(apply&&account.wallet!==expectedWallet)fail('OWNER_CONFIRMATION_REQUIRED');
 return account;
}
export async function quarantineDeveloper({database,accountId,expectedWallet,apply=false}={}){
 accountOptions(database,accountId,apply,expectedWallet);
 return database.transaction(async tx=>{
  const account=await lockedAccount(tx,accountId,expectedWallet,apply);
  if(apply)await tx.query("UPDATE developer_accounts SET status='disabled' WHERE id=$1",[account.id]);
  return{mode:apply?'apply':'dry-run',accountId:account.id,status:apply?'disabled':account.status};
 });
}
export async function deleteDeveloper({database,accountId,expectedWallet,apply=false,ingressQuiesced=false}={}){
 accountOptions(database,accountId,apply,expectedWallet);
 if(apply&&ingressQuiesced!==true)fail('OWNER_QUIESCENCE_REQUIRED',409);
 return database.transaction(async tx=>{
  const account=await lockedAccount(tx,accountId,expectedWallet,apply);
  if(apply&&account.status!=='disabled')fail('OWNER_QUARANTINE_REQUIRED',409);
  // Account lock excludes all supported authority-bearing owner mutations.
  await tx.query(`SELECT id FROM developer_applications WHERE owner_id=$1 FOR UPDATE`,[accountId]);
  const counts=[];let total=0;
  for(const[table,predicate]of accountTables){
   const values=table==='admin_challenges'?[account.wallet]:[accountId];
   const count=(await tx.query(`SELECT 1 FROM ${table} WHERE ${predicate} LIMIT 10001`,values)).rows.length;
   counts.push({table,count});total+=count;
   if(total>10000)fail('OWNER_DELETE_LIMIT',409);
  }
  let deletedRows=0;
  if(apply)for(const[table,predicate]of accountTables){
   const values=table==='admin_challenges'?[account.wallet]:[accountId];
   const keys=primaryKeys[table]??['id'],tuple=keys.length===1?keys[0]:`(${keys.join(',')})`;
   // Bound the actual effects too: public challenges have no account FK/lock.
   const removed=await tx.query(`DELETE FROM ${table} WHERE ${tuple} IN(SELECT ${keys.join(',')} FROM ${table} WHERE ${predicate} LIMIT 10001) RETURNING 1`,values);
   deletedRows+=removed.rows.length;if(deletedRows>10000)fail('OWNER_DELETE_LIMIT',409);
  }
  return{mode:apply?'apply':'dry-run',accountId,totalRows:total,counts,
   ...(apply?{deletedRows}:{}),scope:'hosted-account-and-owned-apps-only',backupsAndPublicChainErased:false};
 });
}
