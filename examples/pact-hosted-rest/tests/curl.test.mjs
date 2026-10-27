import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {randomBytes} from 'node:crypto';
import {curlPost} from '../curl.mjs';
test('actual curl receives credentials through stdin and sends exact REST JSON',async t=>{
 const key='pact_sk_dev_key_'+'a'.repeat(32)+'_'+randomBytes(32).toString('base64url');let seen;
 const server=createServer(async(req,res)=>{let bytes='';for await(const c of req)bytes+=c;seen={url:req.url,authorization:req.headers.authorization,body:JSON.parse(bytes)};res.setHeader('content-type','application/json');res.end('{"valid":true}');});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
 const result=await curlPost({origin:`http://127.0.0.1:${server.address().port}`,apiKey:key,path:'/v1/credentials/validate',body:{}});
 assert.deepEqual(result,{status:200,body:{valid:true}});assert.equal(seen.url,'/v1/credentials/validate');assert.deepEqual(seen.body,{});assert.ok(seen.authorization==='Bearer '+key,'private authorization header must match without printing it');
 await assert.rejects(curlPost({origin:'http://example.com',apiKey:key,path:'/v1/credentials/validate',body:{}}),/CONFIGURATION_INVALID/);
});
