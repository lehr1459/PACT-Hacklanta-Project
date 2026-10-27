import test from 'node:test';
import assert from 'node:assert/strict';
import {validateRuntimePolicy} from './runtime.mjs';
const policy={schemaVersion:1,node:'24.22.0',npm:'11.19.1',securityReviewDue:'2026-10-21'};
test('runtime review policy fails closed on missing, malformed, normalized and expired dates',()=>{
  const last=Date.parse('2026-10-20T23:59:59.999Z');assert.equal(validateRuntimePolicy(policy,last),policy);
  for(const securityReviewDue of [undefined,null,'','not-a-date','2026-02-31','2026-10-20T23:59:59Z'])assert.throws(()=>validateRuntimePolicy({...policy,securityReviewDue},last));
  assert.throws(()=>validateRuntimePolicy(policy,last+1),/deadline/);
  assert.throws(()=>validateRuntimePolicy(policy,NaN));
});
