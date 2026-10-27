import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import Fastify from 'fastify';
import {operations,schemas,actionSchemas,runtimeSchema,validateContract,validateOutput} from '../src/contract.mjs';
import {generateOpenAPI,serializeOpenAPI} from '../src/openapi.mjs';
import {fixture,client,wallet} from './fixtures.mjs';

test('all implemented routes and frozen runtime schemas have exact generated OpenAPI coverage',async t=>{
  const service=await fixture();t.after(()=>service.cleanup());
  const inventory=[];
  for(const file of await readdir(new URL('../src/',import.meta.url))){
    if(!file.endsWith('.mjs')||file==='contract.mjs')continue;
    const source=await readFile(new URL(`../src/${file}`,import.meta.url),'utf8');
    for(const match of source.matchAll(/route\('(GET|POST|PATCH|DELETE)','([^']+)'/g))inventory.push(`${match[1]} ${match[2]}`);
  }
  assert.equal(operations.length,35);
  assert.deepEqual(operations.map(op=>`${op.method} ${op.path}`).sort(),inventory.sort());
  assert.equal(new Set(operations.map(op=>op.operationId)).size,35);
  for(const op of operations)assert.equal(service.server.hasRoute({method:op.method,url:op.path}),true);
  const openapi=generateOpenAPI();
  assert.equal(openapi.openapi,'3.1.0');
  assert.equal(Object.values(openapi.paths).flatMap(Object.values).length,35);
  assert.equal(Object.keys(actionSchemas).length,10);
  assert.throws(()=>{schemas.App.properties.name.maxLength=1;},TypeError);
  assert.throws(()=>{operations[0].output='Error';},TypeError);
  function references(value){
    if(Array.isArray(value))return value.forEach(references);
    if(!value||typeof value!=='object')return;
    if(value.$ref){assert.match(value.$ref,/^#\/components\/schemas\//);assert.ok(openapi.components.schemas[value.$ref.split('/').at(-1)]);}
    Object.values(value).forEach(references);
  }
  references(openapi);
  for(const file of[new URL('../openapi.json',import.meta.url),new URL('../../../web/public/developer/openapi.json',import.meta.url)]){
    assert.equal(await readFile(file,'utf8'),serializeOpenAPI(),'generated artifact must match current runtime contract byte-for-byte');
  }
});

test('runtime compiler accepts every contract schema; unknown properties and coercion fail without mutation or stripping',async t=>{
  const server=Fastify({logger:false,ajv:{customOptions:{removeAdditional:false,coerceTypes:false,useDefaults:false}}});
  t.after(()=>server.close());
  server.post('/test',async req=>{
    for(const name of Object.keys(schemas))assert.equal(typeof req.compileValidationSchema(runtimeSchema(name)),'function');
    const valid={walletGrant:`pact_grant_${'a'.repeat(43)}`,resourceKey:'premium'};
    assert.equal(validateContract(req,'AccessInput',valid),valid);
    for(const invalid of[{...valid,walletAddress:wallet().address},{...valid,resourceKey:42},{...valid,resourceKey:'Premium'},
      {...valid,walletGrant:'bad'},[valid],null]){
      const before=JSON.stringify(invalid);
      assert.throws(()=>validateContract(req,'AccessInput',invalid),error=>error.code==='INVALID_INPUT');
      assert.equal(JSON.stringify(invalid),before,'validation must never coerce or remove fields');
    }
    const op=operations.find(op=>op.operationId==='createApp');
    const result={schemaVersion:1,requestId:'00000000-0000-0000-0000-000000000000',app:{id:`app_${'a'.repeat(32)}`,name:'Fixture',description:'',framework:'rest',environment:'devnet',status:'draft',policyEpoch:0,createdAt:0,updatedAt:0}};
    assert.equal(validateOutput(req,op,200,result),result);
    const leaked={...result,secret:'must-never-be-stripped-or-returned'};
    assert.throws(()=>validateOutput(req,op,200,leaked),error=>error.code==='RESPONSE_SCHEMA_INVALID'&&error.status===503);
    assert.ok(Object.hasOwn(leaked,'secret'),'no response serializer hides schema errors');
    return{checked:true};
  });
  const response=await server.inject({method:'POST',url:'/test',payload:{}});
  assert.equal(response.statusCode,200,response.body);
});

test('schema-backed runtime preserves specific semantic errors, signature consumption and secret-free errors',async t=>{
  const service=await fixture();t.after(()=>service.cleanup());const admin=await client(service);
  const invalidWallet=await admin.request('POST','/v1/developer/auth/challenge',{walletAddress:'not-a-wallet'});
  assert.equal(invalidWallet.status,400);assert.equal(invalidWallet.json.error.code,'INVALID_WALLET');
  const app=(await admin.request('POST','/v1/developer/apps',{name:'Contract test',framework:'rest'})).json.app;
  const invalidScope=await admin.request('POST','/v1/developer/actions/challenge',{
    action:'credential.create',appId:app.id,payload:{name:'Fixture',scopes:['forged'],expiresAt:service.clock.value+60000}});
  assert.equal(invalidScope.status,400);assert.equal(invalidScope.json.error.code,'INVALID_SCOPE');
  const invalidExpiry=await admin.request('POST','/v1/developer/actions/challenge',{
    action:'credential.create',appId:app.id,payload:{name:'Fixture',scopes:['access:check'],expiresAt:'60000'}});
  assert.equal(invalidExpiry.status,400);assert.equal(invalidExpiry.json.error.code,'INVALID_EXPIRY');
  const buyer=wallet();
  const challenge=(await admin.request('POST','/v1/developer/auth/challenge',{walletAddress:buyer.address})).json;
  const malformed=await admin.request('POST','/v1/developer/auth/verify',{challengeId:challenge.challengeId,signatureBase64:{forged:true}});
  assert.equal(malformed.status,401);assert.equal(malformed.json.error.code,'AUTH_INVALID');
  const replay=await admin.request('POST','/v1/developer/auth/verify',{challengeId:challenge.challengeId,signatureBase64:buyer.sign(challenge.message)});
  assert.equal(replay.status,401,'schema rejection must not bypass one-use signature consumption');
  const payload={name:'Never committed'},proof=await admin.proof('app.update',app.id,payload);
  const bad=await admin.request('PATCH',`/v1/developer/apps/${app.id}`,{payload,proof:{...proof,signatureBase64:[]}});
  assert.equal(bad.status,401);assert.equal(bad.json.error.code,'ACTION_PROOF_INVALID');
  assert.equal((await admin.request('PATCH',`/v1/developer/apps/${app.id}`,{payload,proof})).status,401);
  for(const response of[invalidWallet,invalidScope,invalidExpiry,malformed,replay,bad]){
    assert.deepEqual(Object.keys(response.json).sort(),['error','requestId','schemaVersion']);
    assert.deepEqual(Object.keys(response.json.error).sort(),['code','message']);
  }
});

test('sensitive mutation response-contract failure rolls back before commit and returns only a safe error',async t=>{
  const service=await fixture();t.after(()=>service.cleanup());const admin=await client(service);
  const original=service.database.transaction.bind(service.database);let exercised=false;
  service.database.transaction=work=>original(tx=>work({query:async(sql,values)=>{
    const result=await tx.query(sql,values);
    if(sql.startsWith('INSERT INTO developer_applications')){exercised=true;result.rows[0].name=42;}
    return result;
  }}));
  const response=await admin.request('POST','/v1/developer/apps',{name:'Rollback schema fixture',framework:'rest'});
  assert.equal(exercised,true);assert.equal(response.status,503);assert.equal(response.json.error.code,'RESPONSE_SCHEMA_INVALID');
  assert.deepEqual(Object.keys(response.json).sort(),['error','requestId','schemaVersion']);
  assert.equal(Number((await service.database.query('SELECT COUNT(*) AS count FROM developer_applications')).rows[0].count),0);
});
