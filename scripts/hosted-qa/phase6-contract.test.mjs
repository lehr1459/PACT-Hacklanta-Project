import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {accessFixture} from './access-fixture.mjs';
import {wallet} from './helpers.mjs';

test('Phase6 independent frozen OpenAPI inventory and security semantics match actual route declarations',async()=>{
 const api=JSON.parse(await readFile(new URL('../../services/pact-api/openapi.json',import.meta.url),'utf8'));
 const publicCopy=JSON.parse(await readFile(new URL('../../web/public/developer/openapi.json',import.meta.url),'utf8'));assert.deepEqual(api,publicCopy);assert.equal(api.openapi,'3.1.0');
 const routes=[];for(const file of await readdir(new URL('../../services/pact-api/src/',import.meta.url))){if(!file.endsWith('.mjs'))continue;
  const source=await readFile(new URL('../../services/pact-api/src/'+file,import.meta.url),'utf8');for(const match of source.matchAll(/route\('(GET|POST|PATCH|DELETE)','([^']+)'/g))routes.push(match[1]+' '+match[2].replace(/:([A-Za-z]+)/g,'{$1}'));
 }
 const operations=Object.entries(api.paths).flatMap(([path,item])=>Object.entries(item).map(([method,op])=>({path,method,op})));
 assert.equal(operations.length,35);assert.deepEqual(operations.map(({path,method})=>method.toUpperCase()+' '+path).sort(),routes.sort());
 assert.equal(new Set(operations.map(({op})=>op.operationId)).size,35);
 for(const{path,method,op}of operations){
  assert.ok(op.responses.default);assert.equal(op.responses['200'].headers['Cache-Control'].schema.const,'no-store');
  if(path==='/v1/access/check'||path.startsWith('/v1/connect/')&&['/v1/connect/transactions','/v1/connect/token','/v1/connect/revoke'].includes(path)){
   assert.deepEqual(op.security,[{AppKey:[]}]);assert.ok(op.description.includes('Origin'));assert.equal(op.parameters.some(p=>p.name==='Origin'),false);
  }
  if(path.startsWith('/v1/developer/')&&!path.includes('/auth/')&&method!=='get'){
   assert.deepEqual(op.security,[{AdminSession:[],AdminBinding:[]}]);for(const name of ['Origin','x-pact-csrf'])assert.equal(op.parameters.some(p=>p.name===name&&p.required),true);
  }
 }
 function references(value){if(!value||typeof value!=='object')return;if(value.$ref){assert.match(value.$ref,/^#\/components\/schemas\//);assert.ok(api.components.schemas[value.$ref.slice('#/components/schemas/'.length)]);}for(const child of Object.values(value))references(child);}
 references(api);
 const input=api.components.schemas.AccessInput;assert.equal(input.additionalProperties,false);assert.deepEqual(Object.keys(input.properties).sort(),['resourceKey','walletGrant']);
 assert.match(api.servers[0].url,/\.invalid$/);assert.match(api.info.description,/private|Private/);
});

test('Phase6 native HTTP schemas reject overrides without coercion and consume identified malformed proofs once',async t=>{
 const c=await accessFixture();t.after(()=>c.close());
 const rpcCalls=c.rpc.calls.length;
 for(const payload of [{walletGrant:c.buyer.walletGrant,resourceKey:'premium',walletAddress:c.buyer.identity.address},
  {walletGrant:c.buyer.walletGrant,resourceKey:42},{walletGrant:c.buyer.walletGrant,resourceKey:'premium',programId:'forged'}]){
  const response=await c.check(payload);assert.equal(response.status,400);assert.deepEqual(Object.keys(response.data).sort(),['error','requestId','schemaVersion']);
 }
 assert.equal(c.rpc.calls.length,rpcCalls,'invalid access bodies never enter reader');
 const identity=wallet(),challenge=await c.admin.request('POST','/v1/developer/auth/challenge',{walletAddress:identity.address});assert.equal(challenge.status,200);
 assert.equal((await c.admin.request('POST','/v1/developer/auth/verify',{challengeId:challenge.data.challengeId,signatureBase64:{forged:true}})).status,401);
 assert.equal((await c.admin.request('POST','/v1/developer/auth/verify',{challengeId:challenge.data.challengeId,signatureBase64:identity.sign(challenge.data.message)})).status,401);
 const payload={name:'Must remain unchanged'},proof=await c.admin.proof(c.own.id,'app.update',payload);
 assert.equal((await c.admin.request('PATCH',c.own.path,{payload,proof:{...proof,signatureBase64:[]}})).status,401);
 assert.equal((await c.admin.request('PATCH',c.own.path,{payload,proof})).status,401);
 const app=await c.admin.request('GET',c.own.path);assert.equal(app.status,200);assert.notEqual(app.data.app.name,payload.name);
});
