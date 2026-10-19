import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomBytes} from 'node:crypto';
import {fixture,client,wallet} from './fixtures.mjs';
const nonce=()=>randomBytes(32).toString('base64url');
async function setup(){
  const service=await fixture(),admin=await client(service);
  const app=(await admin.request('POST','/v1/developer/apps',{name:'Consumer',framework:'rest'})).json.app;
  const url=`/v1/developer/apps/${app.id}`;
  const callback=(await admin.mutation('POST',`${url}/callback-uris`,'callback.create',app.id,
    {uri:'http://localhost:3008/callback',websiteOrigin:'http://localhost:3008'})).json.callback;
  await admin.mutation('PATCH',url,'app.update',app.id,{status:'active'});
  const key=(await admin.mutation('POST',`${url}/credentials`,'credential.create',app.id,
    {name:'Backend',scopes:['connect:write','access:check'],expiresAt:service.clock.value+3600000})).json;
  async function backend(path,payload,secret=key.secret){
    const response=await service.server.inject({method:'POST',url:`/v1/connect/${path}`,payload,headers:{authorization:`Bearer ${secret}`}});
    return{status:response.statusCode,json:response.json()};
  }
  async function begin(overrides={}){
    const codeVerifier=nonce(),state=nonce(),issuer='http://localhost:3000',redirectUri=callback.uri;
    const result=await backend('transactions',{redirectUri,state,codeChallenge:createHash('sha256').update(codeVerifier).digest('base64url'),
      codeChallengeMethod:'S256',purpose:'Use premium feature',...overrides});
    return{...result,codeVerifier,state,issuer,redirectUri};
  }
  function buyer(){
    const jar=new Map();let csrf;
    async function request(method,path,payload,headers={}){
      const response=await service.server.inject({method,url:`/v1/connect/${path}`,payload,headers:{origin:'http://localhost:3000',
        cookie:[...jar].map(([k,v])=>`${k}=${v}`).join('; '),...(csrf?{'x-pact-csrf':csrf}:{}),...headers}});
      for(const c of response.cookies)jar.set(c.name,c.value);
      const json=response.json();if(json.csrfToken)csrf=json.csrfToken;
      return{status:response.statusCode,json};
    }
    return{request,jar};
  }
  async function code(flow,user=wallet(),browser=buyer()){
    assert.equal(flow.status,200,JSON.stringify(flow.json));
    assert.equal((await browser.request('GET',`transactions/${flow.json.transactionId}`)).status,200);
    const challenge=await browser.request('POST','challenge',{transactionId:flow.json.transactionId,walletAddress:user.address});
    assert.equal(challenge.status,200,JSON.stringify(challenge.json));
    const verified=await browser.request('POST','verify',{transactionId:flow.json.transactionId,challengeId:challenge.json.challengeId,
      signatureBase64:user.sign(challenge.json.message)});
    assert.equal(verified.status,200,JSON.stringify(verified.json));
    const returned=new URL(verified.json.callbackUrl);
    assert.equal(returned.searchParams.get('state'),flow.state);assert.equal(returned.searchParams.get('iss'),flow.issuer);
    return{code:returned.searchParams.get('code'),redirectUri:flow.redirectUri,state:flow.state,codeVerifier:flow.codeVerifier,issuer:flow.issuer};
  }
  return{service,admin,app,url,callback,key,backend,begin,buyer,code};
}
test('backend launch, distinct buyer binding, exact one-use proof, S256/state/callback/issuer and grant revocation',async t=>{
  const {service,backend,begin,buyer,code,app,key}=await setup();t.after(()=>service.cleanup());
  assert.equal((await begin({codeChallengeMethod:'plain'})).status,400);
  assert.equal((await begin({redirectUri:'http://localhost:3008/unregistered'})).status,403);
  const flow=await begin(),browser=buyer(),otherBrowser=buyer(),user=wallet();
  assert.equal((await browser.request('GET',`transactions/${flow.json.transactionId}`)).status,200);
  assert.equal((await otherBrowser.request('GET',`transactions/${flow.json.transactionId}`)).status,401);
  const challenge=(await browser.request('POST','challenge',{transactionId:flow.json.transactionId,walletAddress:user.address})).json;
  const verify={transactionId:flow.json.transactionId,challengeId:challenge.challengeId,signatureBase64:user.sign(challenge.message)};
  assert.equal((await browser.request('POST','verify',verify,{'x-pact-csrf':'wrong'})).status,403);
  const response=await browser.request('POST','verify',verify);assert.equal(response.status,200);
  assert.equal((await browser.request('POST','verify',verify)).status,401);
  assert.ok(!JSON.stringify(response.json).includes('pact_grant_'));
  const params={code:new URL(response.json.callbackUrl).searchParams.get('code'),state:flow.state,
    redirectUri:flow.redirectUri,codeVerifier:flow.codeVerifier,issuer:flow.issuer};
  for(const override of [{state:nonce()},{codeVerifier:nonce()},{issuer:'https://wrong.example'},{redirectUri:'http://localhost:3008/other'}]){
    assert.equal((await backend('token',{...params,...override})).status,401);
  }
  const token=await backend('token',params);assert.equal(token.status,200,JSON.stringify(token.json));
  assert.equal(token.json.walletAddress,user.address);assert.equal((await backend('token',params)).status,401);
  assert.equal((await service.authenticateGrant(token.json.walletGrant,{id:app.id})).wallet,user.address);
  const stored=(await service.database.query('SELECT * FROM wallet_grants WHERE app_id=$1',[app.id])).rows;
  assert.ok(!JSON.stringify(stored).includes(token.json.walletGrant));
  assert.ok(!JSON.stringify((await service.database.query('SELECT * FROM login_transactions WHERE app_id=$1',[app.id])).rows).includes(params.code));
  assert.equal((await backend('revoke',{walletGrant:token.json.walletGrant})).status,200);
  await assert.rejects(()=>service.authenticateGrant(token.json.walletGrant,{id:app.id}),error=>error.status===401);
});
test('wallet switching invalidates old challenges; invalid signature consumed, exact code expiry and policy epoch',async t=>{
  const {service,backend,begin,buyer,code,app}=await setup();t.after(()=>service.cleanup());
  const flow=await begin(),browser=buyer(),a=wallet(),b=wallet(),transactionId=flow.json.transactionId;
  await browser.request('GET',`transactions/${transactionId}`);
  const first=(await browser.request('POST','challenge',{transactionId,walletAddress:a.address})).json;
  const second=(await browser.request('POST','challenge',{transactionId,walletAddress:b.address})).json;
  assert.equal((await browser.request('POST','verify',{transactionId,challengeId:first.challengeId,signatureBase64:a.sign(first.message)})).status,401);
  assert.equal((await browser.request('POST','verify',{transactionId,challengeId:second.challengeId,signatureBase64:'bad'})).status,401);
  assert.equal((await browser.request('POST','verify',{transactionId,challengeId:second.challengeId,signatureBase64:b.sign(second.message)})).status,401);
  const expiredFlow=await begin(),expiredCode=await code(expiredFlow);
  service.clock.value+=60000;
  assert.equal((await backend('token',expiredCode)).status,401);
  const validFlow=await begin(),validCode=await code(validFlow);
  const granted=await backend('token',validCode);assert.equal(granted.status,200);
  await service.database.query('UPDATE developer_applications SET policy_epoch=policy_epoch+1 WHERE id=$1',[app.id]);
  await assert.rejects(()=>service.authenticateGrant(granted.json.walletGrant,{id:app.id}));
  const pending=await begin(),pendingCode=await code(pending);
  await service.database.query('UPDATE developer_applications SET policy_epoch=policy_epoch+1 WHERE id=$1',[app.id]);
  assert.equal((await backend('token',pendingCode)).status,401);
});
test('code exchange race issues one grant and revoked callback invalidates pending code',async t=>{
  const {service,admin,app,url,callback,backend,begin,code}=await setup();t.after(()=>service.cleanup());
  const flow=await begin(),params=await code(flow);
  const raced=await Promise.all([backend('token',params),backend('token',params)]);
  assert.deepEqual(raced.map(r=>r.status).sort(),[200,401]);
  assert.equal(Number((await service.database.query('SELECT COUNT(*) AS count FROM wallet_grants WHERE app_id=$1',[app.id])).rows[0].count),1);
  const another=await begin(),anotherCode=await code(another);
  const revoked=await admin.mutation('POST',`${url}/callback-uris/${callback.id}/revoke`,'callback.revoke',app.id,{callbackId:callback.id});
  assert.equal(revoked.status,200);
  assert.equal((await backend('token',anotherCode)).status,403);
  assert.equal((await admin.mutation('POST',`${url}/callback-uris/${callback.id}/renew-proof`,'callback.renew',app.id,{callbackId:callback.id})).status,200);
  assert.equal((await backend('token',anotherCode)).status,401,'renewal must never resurrect pending code from revoked callback incarnation');
});
test('new wallet challenge supersedes an old verify already consumed but awaiting its transaction',async t=>{
  const {service,begin,buyer}=await setup();t.after(()=>service.cleanup());
  const flow=await begin(),browser=buyer(),firstWallet=wallet(),nextWallet=wallet(),transactionId=flow.json.transactionId;
  await browser.request('GET',`transactions/${transactionId}`);
  const old=(await browser.request('POST','challenge',{transactionId,walletAddress:firstWallet.address})).json;
  const originalQuery=service.database.query.bind(service.database),originalTx=service.database.transaction.bind(service.database);
  let consumed=false,paused=false,release,reached;
  const gate=new Promise(resolve=>release=resolve),entered=new Promise(resolve=>reached=resolve);
  service.database.query=async(sql,values)=>{
    const result=await originalQuery(sql,values);
    if(sql.startsWith('UPDATE wallet_challenges SET consumed_at')&&values[1]===old.challengeId)consumed=true;
    return result;
  };
  service.database.transaction=async work=>{
    if(consumed&&!paused){paused=true;reached();await gate;}
    return originalTx(work);
  };
  const inFlight=browser.request('POST','verify',{transactionId,challengeId:old.challengeId,signatureBase64:firstWallet.sign(old.message)});
  await entered;
  const next=(await browser.request('POST','challenge',{transactionId,walletAddress:nextWallet.address})).json;
  release();assert.equal((await inFlight).status,401);
  assert.equal((await browser.request('POST','verify',{transactionId,challengeId:next.challengeId,signatureBase64:nextWallet.sign(next.message)})).status,200);
});
test('callback or credential expiry during final grant insertion rolls back code consumption and grant',async t=>{
  for(const expiryKind of ['callback','credential']){
    const {service,backend,begin,code,callback,key}=await setup();
    try{
      const flow=await begin(),params=await code(flow),boundary=service.clock.value+1000;
      if(expiryKind==='callback')await service.database.query('UPDATE callback_uris SET verified_until=$1 WHERE id=$2',[boundary,callback.id]);
      else await service.database.query('UPDATE api_credentials SET expires_at=$1 WHERE id=$2',[boundary,key.credential.id]);
      const originalTx=service.database.transaction.bind(service.database);
      service.database.transaction=work=>originalTx(tx=>work({query:async(sql,values)=>{
        const result=await tx.query(sql,values);
        if(sql.includes('INSERT INTO wallet_grants'))service.clock.value=boundary;
        return result;
      }}));
      const result=await backend('token',params);assert.equal(result.status,401);
      assert.equal(Number((await service.database.query('SELECT COUNT(*) AS count FROM wallet_grants')).rows[0].count),0);
      assert.equal((await service.database.query('SELECT redeemed_at FROM login_transactions WHERE id=$1',[flow.json.transactionId])).rows[0].redeemed_at,null);
    }finally{await service.cleanup();}
  }
});
