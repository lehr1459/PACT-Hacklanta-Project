import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,client} from './fixtures.mjs';
import {proxyHostedRequest} from '../../../web/lib/hosted-gateway.mjs';

test('maximum retained usage stays below96KiB and succeeds through the actual HTTP fixed gateway',async t=>{
  const service=await fixture();t.after(()=>service.cleanup());const admin=await client(service);
  const app=(await admin.request('POST','/v1/developer/apps',{name:'Usage boundary fixture',framework:'rest'})).json.app;
  const bucket=Math.floor(service.clock.value/3600000)*3600000;
  await service.database.query(`INSERT INTO usage_aggregates(app_id,bucket,requests,allowed,denied,errors,latency_total_ms,latency_max_ms)
    SELECT $1,$2::bigint-i::bigint*3600000,9007199254740991,9007199254740991,9007199254740991,9007199254740991,9007199254740991,9007199254740991
    FROM generate_series(0,719) AS i`,[app.id,bucket]);
  await service.database.query(`INSERT INTO usage_reasons(app_id,bucket,reason,requests)
    SELECT $1,$2::bigint-i::bigint*3600000,'CHAIN_UNAVAILABLE',9007199254740991 FROM generate_series(0,719) AS i`,[app.id,bucket]);
  const upstream=await service.server.listen({host:'127.0.0.1',port:0});
  const path=`/v1/developer/apps/${app.id}/usage`;
  const response=await proxyHostedRequest(new Request(service.options.origin+path,{headers:{cookie:[...admin.jar].map(([key,value])=>`${key}=${value}`).join('; ')}}),{upstream});
  assert.equal(response.status,200);
  const body=await response.text();assert.ok(Buffer.byteLength(body)<96*1024,'common envelope must fit in the96KiB bound');
  const value=JSON.parse(body);assert.equal(value.schemaVersion,1);
  assert.deepEqual(Object.keys(value).sort(),['buckets','reasons','requestId','schemaVersion']);
  assert.ok(value.buckets.length>0&&value.reasons.length>0);
  assert.ok(value.buckets.length<720||value.reasons.length<720,'exercise actual truncation of the maximum valid data');
  assert.equal(value.buckets[0].bucket,bucket);assert.equal(value.reasons[0].bucket,bucket);
  for(const rows of[value.buckets,value.reasons])for(let i=1;i<rows.length;i++)assert.ok(rows[i].bucket<=rows[i-1].bucket);
  const hypothetical={...value,buckets:Array.from({length:720},(_,i)=>({...value.buckets[0],bucket:bucket-i*3600000})),
    reasons:Array.from({length:720},(_,i)=>({...value.reasons[0],bucket:bucket-i*3600000}))};
  assert.ok(Buffer.byteLength(JSON.stringify(hypothetical))>128*1024,'old maximum would exceed the gateway limit');
});
