import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {Readable} from 'node:stream';
import {proxyHostedRequest} from '../../web/lib/hosted-gateway.mjs';
import {createDatabase,migrate} from '../../services/pact-api/src/database.mjs';
import {createService} from '../../services/pact-api/src/service.mjs';
import {prepareDatabase,nonce,assertSecretAbsent} from './helpers.mjs';
import {Browser,ORIGIN} from './browser.mjs';
import {clockDirectory} from './phase7-clock-fixture.mjs';

test('actual HTTP fixed gateway carries admin and connect cookies into real PostgreSQL service',async t=>{
 const database=await createDatabase({connectionString:await prepareDatabase(),profile:'test'});await migrate(database);
 const service=await createService({database,origin:ORIGIN,pepper:randomBytes(32).toString('base64url'),profile:'test',rateLimit:1000,clockDirectory:await clockDirectory()});
 const upstream=await service.server.listen({port:0,host:'127.0.0.1'});
 const gateway=createServer(async(req,res)=>{
  try{
   const input=new Request(ORIGIN+req.url,{method:req.method,headers:req.headers,
    ...(['GET','HEAD'].includes(req.method)?{}:{body:Readable.toWeb(req),duplex:'half'})});
   const result=await proxyHostedRequest(input,{upstream});res.statusCode=result.status;
   for(const [name,value]of result.headers)if(name!=='set-cookie')res.setHeader(name,value);
   const cookies=result.headers.getSetCookie();if(cookies.length)res.setHeader('set-cookie',cookies);
   res.end(Buffer.from(await result.arrayBuffer()));
  }catch{res.statusCode=500;res.end();}
 });
 await new Promise((resolve,reject)=>{gateway.once('error',reject);gateway.listen(0,'127.0.0.1',resolve);});
 t.after(async()=>{await new Promise(resolve=>gateway.close(resolve));await service.close();await database.close();});
 const base=`http://127.0.0.1:${gateway.address().port}`,admin=new Browser(base);await admin.login();
 const app=(await admin.request('POST','/v1/developer/apps',{name:`Gateway ${nonce()}`,framework:'rest'})).data.app.id;
 assert.equal((await admin.mutate('PATCH',`/v1/developer/apps/${app}`,app,'app.update',{status:'active'})).status,200);
 const callback='http://127.0.0.1:4200/callback';
 assert.equal((await admin.mutate('POST',`/v1/developer/apps/${app}/callback-uris`,app,'callback.create',{uri:callback,websiteOrigin:'http://127.0.0.1:4200'})).status,200);
 const issued=await admin.mutate('POST',`/v1/developer/apps/${app}/credentials`,app,'credential.create',
  {name:'gateway backend',scopes:['access:check','connect:write'],expiresAt:Date.now()+3600000});assert.equal(issued.status,200);
 const key=issued.data.secret;
 const verifier=randomBytes(32).toString('base64url'),state=randomBytes(32).toString('base64url');
 let r=await admin.backend('/v1/connect/transactions',key,{redirectUri:callback,state,
  codeChallenge:createHash('sha256').update(verifier).digest('base64url'),codeChallengeMethod:'S256',purpose:'Gateway test sign-in'});
 assert.equal(r.status,200);const tx=r.data.transactionId,buyer=new Browser(base);
 r=await buyer.request('GET',`/v1/connect/transactions/${tx}`);assert.equal(r.status,200);buyer.csrf=r.data.csrfToken;
 r=await buyer.request('POST','/v1/connect/challenge',{transactionId:tx,walletAddress:buyer.wallet.address});assert.equal(r.status,200);
 r=await buyer.request('POST','/v1/connect/verify',{transactionId:tx,challengeId:r.data.challengeId,signatureBase64:buyer.wallet.sign(r.data.message)});
 assert.equal(r.status,200);const url=new URL(r.data.callbackUrl);assertSecretAbsent(r.data,[key]);
 r=await admin.backend('/v1/connect/token',key,{code:url.searchParams.get('code'),redirectUri:callback,state,codeVerifier:verifier,issuer:ORIGIN});
 assert.equal(r.status,200);assert.equal(r.data.walletAddress,buyer.wallet.address);assert.equal(r.data.appId,app);
 const grant=r.data.walletGrant;
 assert.equal((await admin.backend('/v1/connect/revoke',key,{walletGrant:grant})).status,200);
 await assert.rejects(service.authenticateGrant(grant,{id:app}));
});
