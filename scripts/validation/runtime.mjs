import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
export function validateRuntimePolicy(value,now=Date.now()){
  assert.ok(value&&value.schemaVersion===1&&/^24\.\d+\.\d+$/.test(value.node)&&/^11\.\d+\.\d+$/.test(value.npm),'Invalid reviewed runtime policy');
  assert.ok(typeof value.securityReviewDue==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value.securityReviewDue),'Invalid runtime security review date');
  const due=Date.parse(value.securityReviewDue+'T00:00:00Z');
  assert.ok(Number.isFinite(due)&&new Date(due).toISOString().slice(0,10)===value.securityReviewDue,'Invalid runtime security review date');
  assert.ok(Number.isSafeInteger(now)&&now>=0&&now<due,'Runtime security review deadline reached; review the announced advisory and update the approved pin before release validation.');
  return value;
}
export async function loadRuntimePolicy(){return validateRuntimePolicy(JSON.parse(await readFile(new URL('./runtime.json',import.meta.url),'utf8')));}
