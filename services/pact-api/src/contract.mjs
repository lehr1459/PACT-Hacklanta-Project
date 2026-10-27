// One private, versioned wire contract. JSON Schema validates runtime values;
// the OpenAPI generator translates only the local reference prefix.
import {fail,PROGRAM} from './security.mjs';

const object=(properties,required=Object.keys(properties),extra={})=>({type:'object',properties,required,additionalProperties:false,...extra});
const string=(maxLength=80,minLength=1)=>({type:'string',minLength,maxLength});
const enumeration=values=>({type:'string',enum:values});
const constant=value=>({const:value});
const ref=name=>({$ref:`#/definitions/${name}`});
const nullable=schema=>({anyOf:[schema,{type:'null'}]});
const array=(items,maxItems)=>({type:'array',items,maxItems});
const integer={type:'integer',minimum:0,maximum:Number.MAX_SAFE_INTEGER};
const positive={...integer,minimum:1};
const decimal={type:'string',pattern:'^(?:0|[1-9][0-9]{0,19})$'};
const wallet={type:'string',pattern:'^[1-9A-HJ-NP-Za-km-z]{32,44}$'};
const token={type:'string',pattern:'^[A-Za-z0-9_-]{43}$'};
const signature={type:'string',pattern:'^[A-Za-z0-9+/]{86}==$'};
const opaque=prefix=>({type:'string',pattern:`^${prefix}_[a-f0-9]{32}$`});
const proof=object({challengeId:string(64),signatureBase64:signature});
const envelope=properties=>object({schemaVersion:constant(1),requestId:{type:'string',pattern:'^[a-f0-9-]{36}$'},...properties});
const scopes={type:'array',items:enumeration(['access:check','connect:write']),minItems:1,maxItems:2,uniqueItems:true};

export const actionSchemas={
  'app.update':object({name:string(),description:string(500,0),framework:ref('Framework'),status:ref('AppStatus')},[],{minProperties:1}),
  'callback.create':object({uri:string(2048),websiteOrigin:string(2048)}),
  'callback.verify':object({callbackId:string(64)}),
  'callback.renew':object({callbackId:string(64)}),
  'callback.revoke':object({callbackId:string(64)}),
  'credential.create':object({name:string(),scopes,expiresAt:integer}),
  'credential.rotate':object({credentialId:string(64),expiresAt:integer,overlapSeconds:{...integer,maximum:86400}}),
  'credential.revoke':object({credentialId:string(64)}),
  'resource.bind':object({resourceKey:ref('ResourceKey'),offerAddress:wallet}),
  'resource.update':object({resourceKey:ref('ResourceKey'),expectedVersion:{...positive,maximum:2147483646},offerAddress:wallet,enabled:{type:'boolean'}},
    ['resourceKey','expectedVersion'],{anyOf:[{required:['offerAddress']},{required:['enabled']}]}),
};

export const schemas={
  Framework:enumeration(['rest','express','nextjs','react-backend']),AppStatus:enumeration(['draft','active','paused']),
  ResourceKey:{type:'string',pattern:'^[a-z][a-z0-9-]{0,63}$'},
  Account:object({id:opaque('dev'),walletAddress:wallet}),
  App:object({id:opaque('app'),name:string(),description:string(500,0),framework:ref('Framework'),environment:constant('devnet'),
    status:ref('AppStatus'),policyEpoch:integer,createdAt:integer,updatedAt:integer}),
  Callback:object({id:opaque('cb'),uri:string(2048),websiteOrigin:string(2048),status:enumeration(['pending','verified','revoked']),
    local:{type:'boolean'},revision:integer,verifiedUntil:nullable(integer),dnsRecord:nullable(string(260))}),
  Credential:object({id:opaque('key'),appId:opaque('app'),name:string(),prefix:string(80),scopes,createdAt:integer,expiresAt:integer,
    lastUsedAt:nullable(integer),revokedAt:nullable(integer),rotatedFrom:nullable(opaque('key'))}),
  Resource:object({resourceKey:ref('ResourceKey'),offerAddress:wallet,version:positive,enabled:{type:'boolean'},createdAt:integer,updatedAt:integer,verifiedAt:integer,contextSlot:integer}),
  ResourceVersion:object({version:positive,offerAddress:wallet,enabled:{type:'boolean'},verifiedAt:integer,contextSlot:integer,actorWallet:wallet,createdAt:integer}),
  Error:envelope({error:object({code:{type:'string',pattern:'^[A-Z][A-Z0-9_]{0,79}$'},message:{type:'string',pattern:'^[A-Z][A-Z0-9_]{0,79}$'}})}),
  Live:envelope({live:constant(true)}),
  Ready:envelope({ready:constant(true),scope:constant('database-and-chain'),network:constant('solana-devnet'),programId:constant(PROGRAM),contextSlot:integer}),
  Session:{oneOf:[envelope({authenticated:constant(false),csrfToken:token}),envelope({authenticated:constant(true),account:ref('Account'),expiresAt:integer,csrfToken:token})]},
  Authenticated:envelope({authenticated:constant(true),account:ref('Account'),expiresAt:integer}),
  LoggedOut:envelope({authenticated:constant(false)}),
  Challenge:envelope({challengeId:string(64),message:string(4096),expiresAt:integer}),
  ActionChallenge:envelope({challengeId:opaque('act'),message:string(4096),payloadHash:{type:'string',pattern:'^[a-f0-9]{64}$'},expiresAt:integer}),
  AppResult:envelope({app:ref('App')}),AppList:envelope({apps:array(ref('App'),20)}),
  CallbackList:envelope({callbacks:array(ref('Callback'),10)}),
  CallbackResult:envelope({callback:ref('Callback')}),
  CallbackProofResult:{oneOf:[envelope({callback:ref('Callback')}),envelope({callback:ref('Callback'),dnsToken:{type:'string',pattern:'^pact-domain-verification=[A-Za-z0-9_-]{43}$'},verificationExpiresAt:integer})]},
  CredentialList:envelope({credentials:array(ref('Credential'),50)}),
  CredentialResult:envelope({credential:ref('Credential')}),
  CredentialSecret:envelope({credential:ref('Credential'),secret:{type:'string',pattern:'^pact_sk_dev_key_[a-f0-9]{32}_[A-Za-z0-9_-]{43}$'}}),
  ResourceList:envelope({resources:array(ref('Resource'),50)}),ResourceResult:envelope({resource:ref('Resource')}),
  ResourceHistory:envelope({resource:ref('Resource'),versions:array(ref('ResourceVersion'),100)}),
  Events:envelope({events:array(object({id:opaque('evt'),type:string(),requestId:string(80),outcome:string(),createdAt:integer}),100)}),
  Usage:envelope({buckets:array(object({bucket:integer,requests:integer,allowed:integer,denied:integer,errors:integer,latencyTotalMs:integer,latencyMaxMs:integer}),720),
    reasons:array(object({bucket:integer,reason:string(),requests:integer}),720)}),
  ValidCredential:envelope({valid:constant(true),appId:opaque('app'),credentialId:opaque('key'),environment:constant('devnet'),scopes}),
  LoginCreated:envelope({transactionId:opaque('con'),loginUrl:string(2048),expiresAt:integer,issuer:string(2048)}),
  Login:envelope({transaction:object({id:opaque('con'),app:object({id:opaque('app'),name:string()}),websiteOrigin:string(2048),purpose:string(200),expiresAt:integer,issuer:string(2048)}),csrfToken:token}),
  CallbackDestination:envelope({callbackUrl:string(4096)}),
  Grant:envelope({walletGrant:{type:'string',pattern:'^pact_grant_[A-Za-z0-9_-]{43}$'},walletAddress:wallet,appId:opaque('app'),environment:constant('devnet'),expiresAt:integer,issuer:string(2048)}),
  Revoked:envelope({revoked:constant(true)}),
  Freshness:object({readStartedAtMs:integer,receivedAtMs:integer,lastProgressAtMs:integer,verifiedAtMs:integer,maxAgeMs:constant(8000),maxProgressAgeMs:constant(12000),validUntilMs:integer}),
  Empty:object({}),AdminChallengeInput:object({walletAddress:wallet}),AdminVerifyInput:object({challengeId:string(64),signatureBase64:signature}),
  AppCreateInput:object({name:string(),framework:ref('Framework'),description:string(500,0)},['name','framework']),
  ActionChallengeInput:{oneOf:Object.entries(actionSchemas).map(([action,payload])=>object({action:constant(action),appId:string(64),payload}))},
  LoginCreateInput:object({redirectUri:string(2048),state:token,codeChallenge:token,codeChallengeMethod:constant('S256'),purpose:string(200)}),
  BuyerChallengeInput:object({transactionId:string(64),walletAddress:wallet}),
  BuyerVerifyInput:object({transactionId:string(64),challengeId:string(64),signatureBase64:signature}),
  TokenInput:object({code:{type:'string',pattern:'^pact_code_[A-Za-z0-9_-]{43}$'},redirectUri:string(2048),state:token,
    codeVerifier:{type:'string',pattern:'^[A-Za-z0-9._~-]{43,128}$'},issuer:string(2048)}),
  RevokeInput:object({walletGrant:{type:'string',pattern:'^pact_grant_[A-Za-z0-9_-]{43}$'}}),
  AccessInput:object({walletGrant:{type:'string',pattern:'^pact_grant_[A-Za-z0-9_-]{43}$'},resourceKey:ref('ResourceKey')}),
};
for(const[action,payload]of Object.entries(actionSchemas))schemas[`Signed_${action.replace('.','_')}`]=object({payload,proof});
schemas.Signed_resource_disable=object({payload:object({resourceKey:ref('ResourceKey'),expectedVersion:{...positive,maximum:2147483646},enabled:constant(false)}),proof});
const accessBinding={appId:opaque('app'),resourceKey:ref('ResourceKey'),resourceVersion:positive,policyEpoch:decimal,offerAddress:wallet,walletAddress:wallet,
  network:constant('solana-devnet'),programId:constant(PROGRAM)};
schemas.Allow=envelope({decision:constant('ALLOW'),reason:constant('ACTIVE_LICENSE'),...accessBinding,expiresAt:decimal,verifiedAt:string(40),contextSlot:integer,chainTimestamp:decimal,freshness:ref('Freshness')});
const denial=(reason,known,purchase=false)=>envelope({decision:constant('DENY'),reason:enumeration(reason),...accessBinding,
  expiresAt:known==='expired'?decimal:{type:'null'},verifiedAt:string(40),contextSlot:known?integer:{type:'null'},chainTimestamp:known?decimal:{type:'null'},freshness:known?ref('Freshness'):{type:'null'},
  ...(purchase?{purchase:object({url:string(4096),metadata:constant('SELLER_EXACT_BYTES_REQUIRED')})}:{})});
schemas.LicenseDenied={oneOf:[denial(['LICENSE_REQUIRED'],'missing',true),denial(['EXPIRED'],'expired',true),denial(['RESOURCE_DISABLED'],false)]};
schemas.ChainDenied=denial(['CHAIN_UNAVAILABLE','STALE_CHAIN','OVERLOADED'],false);

const routes=[];
function add(method,path,operationId,summary,security,input,output,extra={}){
  routes.push({method,path,operationId,summary,security,input,output,...extra});
}
const app='/v1/developer/apps/:appId';
add('GET','/v1/health/live','liveness','Cheap process liveness','public',null,'Live');
add('GET','/v1/health/ready','readiness','Exact SQL schema and fresh Devnet reader readiness','public',null,'Ready');
add('GET','/v1/developer/auth/session','adminSession','Bootstrap browser CSRF binding or inspect admin session','browser',null,'Session');
add('POST','/v1/developer/auth/challenge','adminChallenge','Issue an exact two-minute developer wallet challenge','binding','AdminChallengeInput','Challenge');
add('POST','/v1/developer/auth/verify','adminVerify','Consume admin proof and issue a fifteen-minute HttpOnly session','binding','AdminVerifyInput','Authenticated');
add('POST','/v1/developer/auth/logout','adminLogout','Revoke current developer session','admin','Empty','LoggedOut');
add('POST','/v1/developer/apps','createApp','Create an owned Devnet application draft','admin','AppCreateInput','AppResult');
add('GET','/v1/developer/apps','listApps','List owned applications','admin',null,'AppList');
add('GET',app,'getApp','Read an owned application','admin',null,'AppResult');
add('POST','/v1/developer/actions/challenge','actionChallenge','Issue exact action/payload/session-bound two-minute proof','admin','ActionChallengeInput','ActionChallenge');
add('PATCH',app,'updateApp','Apply signed application settings or pause','signed','Signed_app_update','AppResult');
add('GET',`${app}/callback-uris`,'listCallbacks','List owned exact callbacks','admin',null,'CallbackList');
add('POST',`${app}/callback-uris`,'createCallback','Register signed exact callback; reveal remote DNS token once','signed','Signed_callback_create','CallbackProofResult');
add('POST',`${app}/callback-uris/:callbackId/revoke`,'revokeCallback','Revoke callback and increment its incarnation','signed','Signed_callback_revoke','CallbackResult');
add('POST',`${app}/callback-uris/:callbackId/renew-proof`,'renewCallback','Renew callback proof; reveal new remote DNS token once','signed','Signed_callback_renew','CallbackProofResult');
add('POST',`${app}/callback-uris/verify`,'verifyCallback','Verify fixed DNS TXT proof with signed admin authority','signed','Signed_callback_verify','CallbackResult');
add('GET',`${app}/credentials`,'listCredentials','List metadata only, active credentials first','admin',null,'CredentialList');
add('POST',`${app}/credentials`,'createCredential','Mint signed scoped expiring credential; secret shown once','signed','Signed_credential_create','CredentialSecret');
add('POST',`${app}/credentials/:credentialId/rotate`,'rotateCredential','Rotate signed credential with bounded overlap','signed','Signed_credential_rotate','CredentialSecret');
add('POST',`${app}/credentials/:credentialId/revoke`,'revokeCredential','Revoke signed credential, including while paused','signed','Signed_credential_revoke','CredentialResult');
add('GET',`${app}/events`,'listEvents','Read at most one hundred redacted owner audit events','admin',null,'Events');
add('GET',`${app}/usage`,'getUsage','Read thirty-day bounded eventual usage aggregates','admin',null,'Usage');
add('POST','/v1/credentials/validate','validateCredential','Backend-only access-scope credential validation','access','Empty','ValidCredential');
add('GET',`${app}/resources`,'listResources','List owned server-selected resource policies','admin',null,'ResourceList');
add('GET',`${app}/resources/:resourceKey`,'getResource','Read policy and latest hundred versions','admin',null,'ResourceHistory');
add('POST',`${app}/resources`,'bindResource','Bind fresh active seller-owned offer with signed admin proof','signed','Signed_resource_bind','ResourceResult');
add('PATCH',`${app}/resources/:resourceKey`,'updateResource','Version-check signed offer policy; bump app epoch','signed','Signed_resource_update','ResourceResult');
add('DELETE',`${app}/resources/:resourceKey`,'disableResource','Soft-disable signed policy without RPC; retain history','signed','Signed_resource_disable','ResourceResult');
add('POST','/v1/connect/transactions','createLogin','Backend starts five-minute login with exact callback/state/S256','connect','LoginCreateInput','LoginCreated');
add('GET','/v1/connect/transactions/:transactionId','getLogin','Claim login using distinct HttpOnly buyer binding','buyer',null,'Login');
add('POST','/v1/connect/challenge','buyerChallenge','Issue superseding exact buyer wallet challenge','buyer','BuyerChallengeInput','Challenge');
add('POST','/v1/connect/verify','buyerVerify','Consume buyer proof and return one-use exact callback code','buyer','BuyerVerifyInput','CallbackDestination');
add('POST','/v1/connect/token','exchangeCode','Atomically exchange one-minute code and S256 for fifteen-minute grant','connect','TokenInput','Grant');
add('POST','/v1/connect/revoke','revokeGrant','Backend revokes its own grant, including while paused','connect','RevokeInput','Revoked');
add('POST','/v1/access/check','checkAccess','Read fresh entitlement for app-bound grant and registered resource','access','AccessInput','Allow',
  {responses:{403:['LicenseDenied','Error'],503:['ChainDenied','Error']}});

function freeze(value){if(value&&typeof value==='object'&&!Object.isFrozen(value)){for(const item of Object.values(value))freeze(item);Object.freeze(value);}return value;}
export const operations=freeze(routes);
freeze(schemas);freeze(actionSchemas);
const registry=new Map(operations.map(op=>[`${op.method} ${op.path}`,op]));
export function operation(method,path){const value=registry.get(`${method} ${path}`);if(!value)fail('CONTRACT_ROUTE_MISSING',503);return value;}
export function runtimeSchema(name){if(!Object.hasOwn(schemas,name))fail('CONTRACT_SCHEMA_MISSING',503);return{$ref:`#/definitions/${name}`,definitions:schemas};}
const runtime=new Map(Object.keys(schemas).map(name=>[name,freeze(runtimeSchema(name))]));
export function validateContract(req,name,value,code='INVALID_INPUT',status=400){
  const schema=runtime.get(name);if(!schema)fail('CONTRACT_SCHEMA_MISSING',503);
  if(!req.compileValidationSchema(schema)(value))fail(code,status);
  return value;
}
export function validateBody(req){
  const op=operation(req.method,req.routeOptions.url);
  if(!op.input)fail('CONTRACT_SCHEMA_MISSING',503);
  return validateContract(req,op.input,req.body);
}
export function validateOutput(req,op,status,value){
  const variants=op.responses?.[status]??(status===200?[op.output]:['Error']);
  if(!variants.some(name=>req.compileValidationSchema(runtime.get(name))(value)))fail('RESPONSE_SCHEMA_INVALID',503);
  return value;
}
