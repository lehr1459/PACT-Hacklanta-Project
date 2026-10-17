import test from 'node:test';
import assert from 'node:assert/strict';
import {createWalletAuth,createPactApiHandler} from '../dist/server.js';
import {PactClient} from '../dist/v1.js';
import {controlledRpc,signer,offer,ORIGIN,request} from '../../../web/tests/platform/fixtures.mjs';

test('authentication rejects fractional TTLs and invalid epoch clocks before issuing malformed credentials',()=>{
 for(const field of ['challengeTtlMs','sessionTtlMs'])assert.throws(()=>createWalletAuth({origin:ORIGIN,authMode:'single-process',[field]:1000.5}),error=>error.code==='INVALID_INPUT');
 for(const value of [NaN,Infinity,-1,1000000.5,Number.MAX_SAFE_INTEGER]){
  const auth=createWalletAuth({origin:ORIGIN,authMode:'single-process',now:()=>value});
  assert.throws(()=>auth.challenge(signer().wallet),error=>error.code==='AUTH_UNAVAILABLE');
  assert.equal(auth.diagnostics().storedChallenges,0);assert.equal(auth.diagnostics().storedSessions,0);
 }
});
test('authentication diagnostics expose bounded storage counts without session or challenge material',()=>{
 const identity=signer(),auth=createWalletAuth({origin:ORIGIN,authMode:'single-process',now:()=>1000000,capacity:2});
 assert.deepEqual(auth.diagnostics(),{enabled:true,storedChallenges:0,storedSessions:0,capacity:2});
 const challenge=auth.challenge(identity.wallet);assert.equal(auth.diagnostics().storedChallenges,1);
 const session=auth.verify(challenge.challengeId,identity.signMessage(challenge.message),challenge.binding),snapshot=auth.diagnostics();
 assert.equal(snapshot.storedChallenges,0);assert.equal(snapshot.storedSessions,1);assert.equal(Object.isFrozen(snapshot),true);
 for(const value of [identity.wallet,challenge.challengeId,challenge.binding,session.sessionId])assert.equal(JSON.stringify(snapshot).includes(value),false);
 auth.logout(session.sessionId);assert.equal(auth.diagnostics().storedSessions,0);assert.equal(snapshot.storedSessions,1);
});
test('noncanonical preexisting binding cookies are replaced with valid browser-portable challenges',async()=>{
 const identity=signer(),invalid='A'.repeat(42)+'B';let response;
 const handler=createPactApiHandler({origin:ORIGIN,authMode:'single-process'});
 const client=new PactClient({network:'devnet',apiUrl:ORIGIN+'/api/v1',fetch:async(url,init)=>{
  response=await handler(new Request(url,{...init,headers:{...init.headers,origin:ORIGIN,cookie:'pact_binding='+invalid}}));return response;
 }});
 const challenge=await client.auth.challenge(identity.wallet),binding=response.headers.get('set-cookie').split(';')[0].slice('pact_binding='.length);
 assert.notEqual(binding,invalid);assert.equal(Buffer.from(binding,'base64url').length,32);assert.equal(Buffer.from(binding,'base64url').toString('base64url'),binding);
 assert.ok(challenge.message.includes('Session binding: '+binding));
});

for(const incident of ['logout','expiry'])test('legacy protected delivery rechecks '+incident+' after constructing the response',async t=>{
 const identity=signer(),rpc=controlledRpc(identity.wallet),clock={value:1000000};
 const handler=createPactApiHandler({origin:ORIGIN,authMode:'single-process',protectedOffer:offer.toBase58(),now:()=>clock.value,rpcUrl:'http://127.0.0.1:8899',fetch:rpc.fetch});
 const challenge=await request(handler,'/auth/challenge',{method:'POST',body:{walletAddress:identity.wallet}});assert.equal(challenge.status,200);
 const proof=await request(handler,'/auth/verify',{method:'POST',cookie:challenge.cookie,body:{challengeId:challenge.body.challengeId,signatureBase64:identity.signMessage(challenge.body.message)}});assert.equal(proof.status,200);
 const cookie=challenge.cookie+'; '+proof.cookie,baseline=await request(handler,'/protected',{cookie});assert.equal(baseline.status,200);assert.equal(baseline.body.authorized,true);
 const OriginalResponse=globalThis.Response;let armed=true,logout;
 globalThis.Response=class extends OriginalResponse{
  constructor(body,init){super(body,init);let data;try{data=typeof body==='string'?JSON.parse(body):undefined;}catch{}
   if(armed&&data?.authorized===true){armed=false;
    if(incident==='logout')logout=handler(new Request(ORIGIN+'/api/v1/auth/logout',{method:'POST',headers:{origin:ORIGIN,cookie}}));
    else clock.value=Number(rpc.state.expiry)*1000;
   }
  }
 };
 try{
  const result=await request(handler,'/protected',{cookie});
  assert.equal(armed,false,'The complete positive response must reach the independent decision-boundary hook');
  assert.equal(result.status,incident==='logout'?401:403);assert.equal(result.body.authorized,undefined);assert.equal(JSON.stringify(result.body).includes('PACT protected server-side demo content.'),false);
  if(logout)assert.equal((await logout).status,200);
 }finally{globalThis.Response=OriginalResponse;}
 t.after(()=>assert.deepEqual(rpc.calls.filter(call=>!['getGenesisHash','getMultipleAccounts'].includes(call.method)),[]));
});
