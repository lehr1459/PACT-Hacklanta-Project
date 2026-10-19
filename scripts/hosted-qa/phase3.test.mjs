import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomBytes} from 'node:crypto';
import {createDatabase,migrate} from '../../services/pact-api/src/database.mjs';
import {createService} from '../../services/pact-api/src/service.mjs';
import {prepareDatabase,wallet,nonce,assertSecretAbsent} from './helpers.mjs';
import {Browser,ORIGIN} from './browser.mjs';
import {rpcFixture,PROGRAM,GENESIS} from './rpc-fixture.mjs';

const random=()=>randomBytes(32).toString('base64url');
const pkce=()=>{const verifier=random();return{verifier,challenge:createHash('sha256').update(verifier).digest('base64url')};};
const callback='http://127.0.0.1:4200/callback';

test('Phase3 independent hosted wallet login: native PostgreSQL, actual HTTP, two isolated services',async t=>{
 const connectionString=await prepareDatabase(),pepper=random();let clock=Date.now();
 const rpc=await rpcFixture();let nodes=[];
 async function node(issuer=ORIGIN){
  const database=await createDatabase({connectionString,profile:'test'});await migrate(database);
  const service=await createService({database,origin:issuer,pepper,profile:'test',now:()=>clock,rateLimit:1000,readerOptions:{rpcUrl:rpc.url}});
  const base=await service.server.listen({port:0,host:'127.0.0.1'}),result={database,service,base,closed:false};nodes.push(result);return result;
 }
 async function close(n){if(n.closed)return;await n.service.close();await n.database.close();n.closed=true;}
 let first=await node(),second=await node();
 t.after(async()=>{for(const n of nodes)await close(n);await rpc.close();});
 const a=new Browser(first.base),b=new Browser(first.base);await a.login();await b.login();
 async function app(admin,name){
  const appId=(await admin.request('POST','/v1/developer/apps',{name:`${name} ${nonce()}`,framework:'rest'})).data.app.id;
  let r=await admin.mutate('POST',`/v1/developer/apps/${appId}/callback-uris`,appId,'callback.create',{uri:callback,websiteOrigin:'http://127.0.0.1:4200'});
  assert.equal(r.status,200);const callbackId=r.data.callback.id;
  r=await admin.mutate('PATCH',`/v1/developer/apps/${appId}`,appId,'app.update',{status:'active'});assert.equal(r.status,200);
  r=await admin.mutate('POST',`/v1/developer/apps/${appId}/credentials`,appId,'credential.create',
   {name:'connect test',scopes:['access:check','connect:write'],expiresAt:clock+3600000});assert.equal(r.status,200);
  return{id:appId,callbackId,key:r.data.secret,credentialId:r.data.credential.id};
 }
 const appA=await app(a,'Connect A'),appB=await app(b,'Connect B');
 const offer=rpc.addOffer({seller:a.wallet});
 assert.equal((await a.mutate('POST',`/v1/developer/apps/${appA.id}/resources`,appA.id,'resource.bind',{resourceKey:'premium',offerAddress:offer.address})).status,200);
 const api=()=>new Browser(first.base);
 async function launch(app=appA,overrides={}){
  const codes=pkce(),state=random(),payload={redirectUri:callback,state,codeChallenge:codes.challenge,codeChallengeMethod:'S256',purpose:'Access premium report',...overrides};
  const r=await api().backend('/v1/connect/transactions',app.key,payload);assert.equal(r.status,200,JSON.stringify(r.data));
  return{...codes,state,...r.data};
 }
 async function proof(tx,buyer=new Browser(first.base),identity=buyer.wallet){
  let r=await buyer.request('GET',`/v1/connect/transactions/${tx.transactionId}`);assert.equal(r.status,200,JSON.stringify(r.data));buyer.csrf=r.data.csrfToken;
  assert.equal(r.data.transaction.app.id,appA.id);assert.equal(r.data.transaction.issuer,ORIGIN);
  r=await buyer.request('POST','/v1/connect/challenge',{transactionId:tx.transactionId,walletAddress:identity.address});assert.equal(r.status,200);
  assert.ok(r.data.message.includes(identity.address));assert.ok(r.data.message.includes(appA.id));
  assert.ok(r.data.message.includes(PROGRAM));assert.ok(r.data.message.includes(GENESIS));
  assert.ok(!r.data.message.includes('Purpose: developer-admin-login'));
  return{buyer,identity,challengeId:r.data.challengeId,message:r.data.message};
 }
 async function finish(tx,p=undefined){
  p??=await proof(tx);
  const r=await p.buyer.request('POST','/v1/connect/verify',{transactionId:tx.transactionId,challengeId:p.challengeId,signatureBase64:p.identity.sign(p.message)});
  assert.equal(r.status,200,JSON.stringify(r.data));const url=new URL(r.data.callbackUrl);
  assert.equal(url.origin+url.pathname,callback);assert.deepEqual([...url.searchParams.keys()].sort(),['code','iss','state']);
  assert.equal(url.searchParams.get('state'),tx.state);assert.equal(url.searchParams.get('iss'),ORIGIN);
  assertSecretAbsent(r.data,[appA.key,appB.key]);
  return{...tx,p,code:url.searchParams.get('code')};
 }
 const tokenPayload=tx=>({code:tx.code,redirectUri:callback,state:tx.state,codeVerifier:tx.verifier,issuer:ORIGIN});
 const exchange=(tx,app=appA,body={},base=first.base)=>new Browser(base).backend('/v1/connect/token',app.key,{...tokenPayload(tx),...body});
 let goodGrant;
 await t.test('only authenticated backend launches exact callback and S256 transactions',async()=>{
  const p=pkce(),body={redirectUri:callback,state:random(),codeChallenge:p.challenge,codeChallengeMethod:'S256',purpose:'sign in'};
  assert.equal((await api().backend('/v1/connect/transactions','invalid',body)).status,401);
  assert.equal((await api().request('POST','/v1/connect/transactions',body,{Authorization:`Bearer ${appA.key}`})).status,403);
  for(const override of [{codeChallengeMethod:'plain'},{state:'weak'},{redirectUri:'http://127.0.0.1:4200/other'},{appId:appB.id}])
   assert.ok((await api().backend('/v1/connect/transactions',appA.key,{...body,...override})).status>=400);
 });
 await t.test('browser proof is app/wallet/purpose bound; CSRF, stolen binding and invalid signature deny',async()=>{
  const tx=await launch(),p=await proof(tx),body={transactionId:tx.transactionId,challengeId:p.challengeId,signatureBase64:p.identity.sign(p.message)};
  assert.equal((await p.buyer.request('POST','/v1/connect/verify',body,{'x-pact-csrf':null})).status,403);
  assert.equal((await p.buyer.request('POST','/v1/connect/verify',body,{Origin:'https://evil.invalid'})).status,403);
  const thief=new Browser(first.base);let r=await thief.request('GET',`/v1/connect/transactions/${tx.transactionId}`);
  if(r.status===200)thief.csrf=r.data.csrfToken;else assert.ok(r.status>=400);
  assert.ok((await thief.request('POST','/v1/connect/verify',body)).status>=400);
  const invalid=await p.buyer.request('POST','/v1/connect/verify',{...body,signatureBase64:wallet().sign(p.message)});assert.ok(invalid.status>=400);
  assert.ok((await p.buyer.request('POST','/v1/connect/verify',body)).status>=400,'invalid attempt must consume matching challenge');
  const fresh=await finish(await launch());const grant=await exchange(fresh);assert.equal(grant.status,200);goodGrant=grant.data;
  assert.equal(goodGrant.walletAddress,fresh.p.identity.address);assert.equal(goodGrant.appId,appA.id);assert.match(goodGrant.walletGrant,/^pact_grant_/);
  assert.equal((await first.service.authenticateGrant(goodGrant.walletGrant,appA)).wallet,fresh.p.identity.address);
  assert.equal((await second.service.authenticateGrant(goodGrant.walletGrant,appA)).wallet,fresh.p.identity.address);
  await assert.rejects(first.service.authenticateGrant(goodGrant.walletGrant,appB));
  const persisted=(await first.database.query('SELECT * FROM wallet_grants WHERE app_id=$1 AND wallet=$2',[appA.id,goodGrant.walletAddress])).rows[0];
  assertSecretAbsent(persisted,[goodGrant.walletGrant,appA.key]);assert.match(persisted.token_hash,/^[a-f0-9]{64}$/);
 });
 await t.test('explicit wallet switch replaces prior unconsumed buyer challenge',async()=>{
  const tx=await launch(),p=await proof(tx),nextWallet=wallet();
  const next=await p.buyer.request('POST','/v1/connect/challenge',{transactionId:tx.transactionId,walletAddress:nextWallet.address});assert.equal(next.status,200);
  assert.equal((await p.buyer.request('POST','/v1/connect/verify',{transactionId:tx.transactionId,challengeId:p.challengeId,signatureBase64:p.identity.sign(p.message)})).status,401);
  const switched=await finish(tx,{buyer:p.buyer,identity:nextWallet,challengeId:next.data.challengeId,message:next.data.message});
  const r=await exchange(switched);assert.equal(r.status,200);assert.equal(r.data.walletAddress,nextWallet.address);assert.notEqual(r.data.walletAddress,p.identity.address);
 });
 await t.test('same pepper and database cannot cross the configured issuer namespace',async()=>{
  const otherOrigin='http://localhost:3999',other=await node(otherOrigin),browser=new Browser(other.base,otherOrigin);
  browser.jar=new Map(a.jar);browser.csrf=a.csrf;
  assert.equal((await browser.request('GET',`/v1/developer/apps/${appA.id}`)).status,401);
  assert.equal((await browser.key(appA.key)).status,401);
  await assert.rejects(other.service.authenticateGrant(goodGrant.walletGrant,appA));
  await close(other);
 });
 await t.test('wrong app, state, verifier, issuer and callback cannot redeem a code',async()=>{
  for(const override of [{state:random()},{codeVerifier:random()},{issuer:'https://evil.invalid'},{redirectUri:'http://127.0.0.1:4200/other'}]){
   const tx=await finish(await launch());assert.ok((await exchange(tx,appA,override)).status>=400);
  }
  const tx=await finish(await launch());assert.ok((await exchange(tx,appB)).status>=400);
  const correct=await exchange(tx);assert.equal(correct.status,200);assert.equal((await exchange(tx)).status,401);
 });
 await t.test('separate service instances and pools redeem exactly once',async()=>{
  const tx=await finish(await launch());
  const race=await Promise.all([exchange(tx,appA,{},first.base),exchange(tx,appA,{},second.base)]);
  assert.deepEqual(race.map(x=>x.status).sort(),[200,401]);
 });
 await t.test('callback revoke and policy epoch changes invalidate pending issuance',async()=>{
  let tx=await finish(await launch());
  assert.equal((await a.mutate('POST',`/v1/developer/apps/${appA.id}/callback-uris/${appA.callbackId}/revoke`,appA.id,'callback.revoke',{callbackId:appA.callbackId})).status,200);
  assert.ok((await exchange(tx)).status>=400);
  assert.equal((await a.mutate('POST',`/v1/developer/apps/${appA.id}/callback-uris/${appA.callbackId}/renew-proof`,appA.id,'callback.renew',{callbackId:appA.callbackId})).status,200);
  assert.equal((await exchange(tx)).status,401,'renewed callback must not revive its prior incarnation code');
  tx=await finish(await launch());
  assert.equal((await a.mutate('PATCH',`/v1/developer/apps/${appA.id}/resources/premium`,appA.id,'resource.update',
   {resourceKey:'premium',expectedVersion:1,enabled:false})).status,200);
  assert.ok((await exchange(tx)).status>=400);
  await assert.rejects(first.service.authenticateGrant(goodGrant.walletGrant,appA));
  await assert.rejects(second.service.authenticateGrant(goodGrant.walletGrant,appA));
 });
 await t.test('restart retains nonce/code and one-use state; unavailable DB denies',async()=>{
  const tx=await launch(),p=await proof(tx);
  await close(first);first=await node();a.base=first.base;b.base=first.base;p.buyer.base=first.base;
  const complete=await finish(tx,p);await close(first);first=await node();a.base=first.base;b.base=first.base;
  const r=await exchange(complete);assert.equal(r.status,200);assert.equal((await exchange(complete,appA,{},second.base)).status,401);
  await close(first);first=await node();a.base=first.base;b.base=first.base;
  await first.service.authenticateGrant(r.data.walletGrant,appA);await second.service.authenticateGrant(r.data.walletGrant,appA);
  await first.database.close();
  assert.equal((await new Browser(first.base).backend('/v1/connect/revoke',appA.key,{walletGrant:r.data.walletGrant})).status,503);
  await first.service.close();first.closed=true;first=await node();a.base=first.base;b.base=first.base;
  assert.equal((await new Browser(first.base).backend('/v1/connect/revoke',appA.key,{walletGrant:r.data.walletGrant})).status,200);
  await assert.rejects(first.service.authenticateGrant(r.data.walletGrant,appA));
  await assert.rejects(second.service.authenticateGrant(r.data.walletGrant,appA));
 });
 await t.test('grant revoke is app scoped and rejects another app',async()=>{
  assert.ok((await api().backend('/v1/connect/revoke',appB.key,{walletGrant:goodGrant.walletGrant})).status>=400);
  assert.equal((await api().backend('/v1/connect/revoke',appA.key,{walletGrant:goodGrant.walletGrant})).status,200);
 });
 await t.test('challenge/code expire at strict TTL without replay success',async()=>{
  let tx=await launch(),p=await proof(tx);clock+=120000;
  assert.ok((await p.buyer.request('POST','/v1/connect/verify',{transactionId:tx.transactionId,challengeId:p.challengeId,signatureBase64:p.identity.sign(p.message)})).status>=400);
  tx=await finish(await launch());clock+=60000;assert.equal((await exchange(tx)).status,401);
  tx=await launch();clock+=300000;assert.equal((await api().request('GET',`/v1/connect/transactions/${tx.transactionId}`)).status,401);
  const grant=await exchange(await finish(await launch()));assert.equal(grant.status,200);
  clock+=900000;
  await assert.rejects(first.service.authenticateGrant(grant.data.walletGrant,appA));
  await assert.rejects(second.service.authenticateGrant(grant.data.walletGrant,appA));
 });
});
