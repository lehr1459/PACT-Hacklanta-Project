import assert from 'node:assert/strict';
import {randomBytes,createHash} from 'node:crypto';
import {createDatabase,migrate} from '../../services/pact-api/src/database.mjs';
import {createService} from '../../services/pact-api/src/service.mjs';
import {prepareDatabase,nonce,wallet} from './helpers.mjs';
import {Browser,ORIGIN} from './browser.mjs';
import {rpcFixture} from './rpc-fixture.mjs';

const random=()=>randomBytes(32).toString('base64url');
export async function accessFixture({serviceOptions={},wrapDatabase}={}){
 const origin=serviceOptions.origin??ORIGIN;
 const native=await createDatabase({connectionString:await prepareDatabase(),profile:'test'});await migrate(native);
 const rpc=await rpcFixture(),clock={value:Date.now()};rpc.state.timestampSeconds=Math.floor(clock.value/1000);
 const database=wrapDatabase?wrapDatabase(native,{rpc,clock}):native;
 const service=await createService({database,origin:ORIGIN,pepper:random(),profile:'test',now:()=>clock.value,
  rateLimit:1000,readerOptions:{rpcUrl:rpc.url},...serviceOptions});
 const base=await service.server.listen({port:0,host:'127.0.0.1'}),admin=new Browser(base,origin);await admin.login();
 async function app(owner=admin){
  const created=await owner.request('POST','/v1/developer/apps',{name:`Access ${nonce()}`,framework:'rest'});assert.equal(created.status,200);
  const id=created.data.app.id,path=`/v1/developer/apps/${id}`;
  assert.equal((await owner.mutate('PATCH',path,id,'app.update',{status:'active'})).status,200);
  const callback='http://127.0.0.1:4200/callback';
  assert.equal((await owner.mutate('POST',path+'/callback-uris',id,'callback.create',{uri:callback,websiteOrigin:'http://127.0.0.1:4200'})).status,200);
  const minted=await owner.mutate('POST',path+'/credentials',id,'credential.create',
   {name:'private access fixture',scopes:['connect:write','access:check'],expiresAt:clock.value+3600000});assert.equal(minted.status,200);
  return{id,path,callback,key:minted.data.secret,credentialId:minted.data.credential.id,owner};
 }
 const own=await app(),offer=rpc.addOffer({seller:admin.wallet});
 assert.equal((await admin.mutate('POST',own.path+'/resources',own.id,'resource.bind',{resourceKey:'premium',offerAddress:offer.address})).status,200);
 async function grant(target=own,identity=wallet()){
  const verifier=random(),state=random(),api=new Browser(base,origin);
  let response=await api.backend('/v1/connect/transactions',target.key,{redirectUri:target.callback,state,
   codeChallenge:createHash('sha256').update(verifier).digest('base64url'),codeChallengeMethod:'S256',purpose:'Independent protected access'});
  assert.equal(response.status,200,JSON.stringify(response.data));const transactionId=response.data.transactionId,browser=new Browser(base,origin);
  response=await browser.request('GET',`/v1/connect/transactions/${transactionId}`);assert.equal(response.status,200);browser.csrf=response.data.csrfToken;
  response=await browser.request('POST','/v1/connect/challenge',{transactionId,walletAddress:identity.address});assert.equal(response.status,200);
  response=await browser.request('POST','/v1/connect/verify',{transactionId,challengeId:response.data.challengeId,signatureBase64:identity.sign(response.data.message)});assert.equal(response.status,200);
  const code=new URL(response.data.callbackUrl).searchParams.get('code');
  response=await api.backend('/v1/connect/token',target.key,{code,redirectUri:target.callback,state,codeVerifier:verifier,issuer:origin});
  assert.equal(response.status,200);return{...response.data,identity};
 }
 const buyer=await grant();
 const check=(payload={walletGrant:buyer.walletGrant,resourceKey:'premium'},key=own.key)=>new Browser(base,origin).backend('/v1/access/check',key,payload);
 return{native,database,rpc,clock,service,base,admin,own,offer,buyer,app,grant,check,
  license:()=>rpc.addLicense({offer,buyer:buyer.identity,expirySeconds:BigInt(Math.floor(clock.value/1000)+60)}),
  async close(){await service.close();await native.close();await rpc.close();}};
}
