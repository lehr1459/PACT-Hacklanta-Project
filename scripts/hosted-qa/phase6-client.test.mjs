import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {randomBytes,createHash} from 'node:crypto';
import {accessFixture} from './access-fixture.mjs';
import {Browser} from './browser.mjs';
import {wallet} from './helpers.mjs';
import {createPactClient} from '../../packages/pact-hosted-client/index.mjs';
test('Phase6 private client works against actual native PG/HTTP/SDK and fails closed',async t=>{
 let upstream;
 const proxy=createServer(async(req,res)=>{
  try{let body='';for await(const chunk of req)body+=chunk;
   const response=await fetch(upstream+req.url,{method:req.method,headers:{'content-type':'application/json',authorization:req.headers.authorization},body,redirect:'error'});
   res.writeHead(response.status,{'content-type':'application/json','cache-control':'no-store'});res.end(await response.text());
  }catch{res.writeHead(503,{'content-type':'application/json','cache-control':'no-store'});res.end('{}');}
 });await new Promise(r=>proxy.listen(0,'127.0.0.1',r));
 t.after(()=>new Promise(r=>{proxy.closeAllConnections();proxy.close(r);}));
 const origin=`http://127.0.0.1:${proxy.address().port}`,c=await accessFixture({serviceOptions:{origin}});upstream=c.base;t.after(()=>c.close());
 const client=createPactClient({origin,apiKey:c.own.key,appId:c.own.id});
 const valid=await client.validateCredential();assert.equal(valid.credentialId,c.own.credentialId);
 const expected={walletGrant:c.buyer.walletGrant,walletAddress:c.buyer.identity.address,resourceKey:'premium'};
 const denied=await client.checkAccess(expected).catch(e=>e);assert.equal(denied.code,'LICENSE_REQUIRED');assert.equal(new URL(denied.purchase.url).origin,origin);
 const license=c.license();const receipt=await client.checkAccess(expected);receipt.assertFresh();assert.equal(receipt.decision,'ALLOW');
 const verifier=randomBytes(32).toString('base64url'),state=randomBytes(32).toString('base64url');
 const login=await client.startLogin({redirectUri:c.own.callback,state,codeChallenge:createHash('sha256').update(verifier).digest('base64url'),codeChallengeMethod:'S256',purpose:'Working private client'});
 const buyer=new Browser(c.base,origin),identity=wallet();let r=await buyer.request('GET','/v1/connect/transactions/'+login.transactionId);buyer.csrf=r.data.csrfToken;
 r=await buyer.request('POST','/v1/connect/challenge',{transactionId:login.transactionId,walletAddress:identity.address});
 r=await buyer.request('POST','/v1/connect/verify',{transactionId:login.transactionId,challengeId:r.data.challengeId,signatureBase64:identity.sign(r.data.message)});
 const callback=new URL(r.data.callbackUrl),grant=await client.exchangeCode({code:callback.searchParams.get('code'),redirectUri:c.own.callback,state,codeVerifier:verifier,issuer:login.issuer});assert.equal(grant.walletAddress,identity.address);
 await client.revokeGrant({walletGrant:grant.walletGrant});await assert.rejects(client.checkAccess({walletGrant:grant.walletGrant,walletAddress:identity.address,resourceKey:'premium'}),{code:'GRANT_INVALID'});
 license.expirySeconds=BigInt(Math.floor(c.clock.value/1000));await assert.rejects(client.checkAccess(expected),{code:'EXPIRED'});
 license.expirySeconds+=60n;c.rpc.state.fail=true;await assert.rejects(client.checkAccess(expected));c.rpc.state.fail=false;
 await client.revokeGrant({walletGrant:c.buyer.walletGrant});await assert.rejects(client.checkAccess(expected),{code:'GRANT_INVALID'});
});
