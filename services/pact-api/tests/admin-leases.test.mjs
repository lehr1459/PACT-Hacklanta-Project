import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,client} from './fixtures.mjs';

for(const kind of ['credential-proof','callback-proof','app-update-proof','credential-session','app-create-session','login-proof','login-session']){
  test(`admin ${kind} expiry during the final SQL write denies and rolls back`,async t=>{
    const service=await fixture();t.after(()=>service.cleanup());
    const admin=await client(service);
    const app=(await admin.request('POST','/v1/developer/apps',{name:'Lease fixture',framework:'rest'})).json.app;
    const original=service.database.transaction.bind(service.database);
    let hook,triggered=false;
    service.database.transaction=work=>original(tx=>work({query:async(sql,values)=>{
      const result=await tx.query(sql,values);
      if(hook&&!triggered&&hook.match(sql)){triggered=true;service.clock.value=hook.deadline;}
      return result;
    }}));
    let response,committed;
    if(kind.startsWith('login')){
      const proof=(await admin.request('POST','/v1/developer/auth/challenge',{walletAddress:admin.identity.address})).json;
      hook={match:sql=>sql.startsWith('INSERT INTO admin_sessions'),
        deadline:kind==='login-proof'?proof.expiresAt:service.clock.value+900000};
      response=await admin.request('POST','/v1/developer/auth/verify',{
        challengeId:proof.challengeId,signatureBase64:admin.identity.sign(proof.message)});
      committed=Number((await service.database.query('SELECT COUNT(*) AS count FROM admin_sessions')).rows[0].count);
    }else if(kind==='app-create-session'){
      const deadline=service.clock.value+1000;
      await service.database.query('UPDATE admin_sessions SET expires_at=$1',[deadline]);
      hook={match:sql=>sql.startsWith('INSERT INTO security_audit_events'),deadline};
      response=await admin.request('POST','/v1/developer/apps',{name:'Expired session draft',framework:'rest'});
      committed=Number((await service.database.query("SELECT COUNT(*) AS count FROM developer_applications WHERE name='Expired session draft'")).rows[0].count);
    }else{
      const deadline=service.clock.value+1000;
      if(kind==='credential-session')await service.database.query('UPDATE admin_sessions SET expires_at=$1',[deadline]);
      const path=`/v1/developer/apps/${app.id}`;
      const action=kind.startsWith('credential')?'credential.create':kind==='callback-proof'?'callback.create':'app.update';
      const payload=action==='credential.create'?{name:'Late key',scopes:['access:check'],expiresAt:service.clock.value+3600000}
        :action==='callback.create'?{uri:'http://localhost:3555/callback',websiteOrigin:'http://localhost:3555'}:{name:'Late settings'};
      const proof=await admin.proof(action,app.id,payload);
      const challenge=(await service.database.query('SELECT expires_at FROM action_challenges WHERE id=$1',[proof.challengeId])).rows[0];
      hook={match:sql=>sql.startsWith('INSERT INTO security_audit_events'),deadline:kind==='credential-session'?deadline:Number(challenge.expires_at)};
      response=await admin.request(action==='app.update'?'PATCH':'POST',path+
        (action==='credential.create'?'/credentials':action==='callback.create'?'/callback-uris':''),{payload,proof});
      const sql=action==='credential.create'?'SELECT COUNT(*) AS count FROM api_credentials WHERE app_id=$1'
        :action==='callback.create'?'SELECT COUNT(*) AS count FROM callback_uris WHERE app_id=$1'
          :"SELECT COUNT(*) AS count FROM developer_applications WHERE id=$1 AND name='Late settings'";
      committed=Number((await service.database.query(sql,[app.id])).rows[0].count);
    }
    assert.equal(triggered,true,'must exercise the actual final-write boundary');
    assert.equal(response.status,401);assert.equal(Object.hasOwn(response.json,'secret'),false);
    assert.equal(committed,kind.startsWith('login')?1:0,'expired authority must not commit its mutation');
  });
}

for(const kind of ['session-revoked','account-disabled']){
  test(`draft creation rechecks ${kind} after preliminary session lookup`,async t=>{
    const service=await fixture();t.after(()=>service.cleanup());const admin=await client(service);
    const original=service.database.transaction.bind(service.database);let triggered=false;
    service.database.transaction=async work=>{
      if(!triggered){
        triggered=true;
        if(kind==='session-revoked')await service.database.query(`UPDATE admin_sessions SET revoked_at=$1
          WHERE account_id IN(SELECT id FROM developer_accounts WHERE wallet=$2)`,[service.clock.value,admin.identity.address]);
        else await service.database.query("UPDATE developer_accounts SET status='disabled' WHERE wallet=$1",[admin.identity.address]);
      }
      return original(work);
    };
    const response=await admin.request('POST','/v1/developer/apps',{name:'Raced draft',framework:'rest'});
    assert.equal(triggered,true);assert.equal(response.status,401);
    assert.equal(Number((await service.database.query('SELECT COUNT(*) AS count FROM developer_applications')).rows[0].count),0);
  });
}
