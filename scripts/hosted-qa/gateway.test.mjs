import test from 'node:test';
import assert from 'node:assert/strict';
import {proxyHostedRequest} from '../../web/lib/hosted-gateway.mjs';

const upstream = 'http://127.0.0.1:4100';
const request = (path = '/v1/developer/apps', options) => new Request('http://localhost:3000' + path, options);
const json = (body = {}, status = 200, extra = {}) => Response.json(body, {status, headers: extra});

test('gateway is opt-in, validates the operator origin and refuses caller-controlled routing', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls++; return json(); };
  for (const value of [undefined, 'http://remote.example', upstream + '/', upstream + '?token=private', 'https://user:pass@example.com']) {
    assert.equal((await proxyHostedRequest(request(), {upstream: value, fetchImpl})).status, 503);
  }
  for (const path of ['/v1/apps?url=https://attacker.example', '/v1/apps/%2f%2fattacker.example', '/v1/apps/..%2fprivate', '/api/v1/offers']) {
    assert.equal((await proxyHostedRequest(request(path), {upstream, fetchImpl})).status, 400);
  }
  assert.equal((await proxyHostedRequest(request('/v1/apps', {method: 'OPTIONS'}), {upstream, fetchImpl})).status, 405);
  assert.equal(calls, 0);
});

test('gateway forwards only exact trust headers and preserves separate HttpOnly cookies without CORS', async () => {
  const response = await proxyHostedRequest(request(undefined, {
    method: 'POST', headers: {'content-type': 'application/json', origin: 'http://localhost:3000', cookie: 'binding=fixture',
      'x-pact-csrf': 'fixture', 'x-forwarded-for': 'fake', 'x-forwarded-host': 'attacker.example', 'x-pact-request-id': 'fake'}, body: '{}',
  }), {upstream, fetchImpl: async (target, options) => {
    assert.equal(target, upstream + '/v1/developer/apps');
    assert.equal(options.headers.get('origin'), 'http://localhost:3000');
    assert.equal(options.headers.get('cookie'), 'binding=fixture');
    assert.equal(options.headers.get('x-forwarded-for'), null);
    assert.equal(options.headers.get('x-forwarded-host'), null);
    assert.equal(options.headers.get('x-pact-request-id'), null);
    assert.equal(options.redirect, 'error');
    const result = json({schemaVersion: 1, requestId: 'fixture'}, 200, {'access-control-allow-origin': '*', 'x-pact-request-id': 'fixture'});
    result.headers.append('set-cookie', 'one=fixture; HttpOnly; Path=/v1');
    result.headers.append('set-cookie', 'two=fixture; HttpOnly; Path=/v1');
    return result;
  }});
  assert.equal(response.status, 200);
  assert.equal(response.headers.getSetCookie().length, 2);
  assert.equal(response.headers.get('access-control-allow-origin'), null);
  assert.equal(response.headers.get('cache-control'), 'no-store');
});

test('backend keys remain server-to-server, Origin absence is preserved and service denials stay denied', async () => {
  const response = await proxyHostedRequest(request('/v1/credentials/validate', {
    method: 'POST', headers: {authorization: 'Bearer synthetic-local-key', 'content-type': 'application/json'}, body: '{}',
  }), {upstream, fetchImpl: async (_, options) => {
    assert.equal(options.headers.get('origin'), null);
    assert.equal(options.headers.get('authorization'), 'Bearer synthetic-local-key');
    return json({schemaVersion: 1, error: {code: 'API_KEY_INVALID'}}, 401);
  }});
  assert.equal(response.status, 401);
});

test('gateway bounds ingress/egress, rejects redirects and never retries or exposes transport errors', async () => {
  let calls = 0;
  const oversized = request('/v1/connect/token', {method: 'POST', body: 'a'.repeat(16385)});
  assert.equal((await proxyHostedRequest(oversized, {upstream, fetchImpl: async () => { calls++; return json(); }})).status, 413);
  assert.equal(calls, 0);
  for (const fetchImpl of [async () => Response.redirect('https://attacker.example'),
    async () => new Response('x'.repeat(131073), {headers: {'content-type': 'application/json'}}),
    async () => { throw Error('private-upstream-password-and-key'); }]) {
    calls = 0;
    const response = await proxyHostedRequest(request(), {upstream, fetchImpl: (...args) => { calls++; return fetchImpl(...args); }});
    assert.equal(response.status, 503); assert.equal(calls, 1);
    assert.ok(!(await response.text()).includes('private-upstream'));
  }
});

test('gateway propagates timeout cancellation and denies the request', async () => {
  const keepAlive = setTimeout(() => {}, 100);
  try {
    const response = await proxyHostedRequest(request(), {upstream, deadlineMs: 5, fetchImpl: async (_, {signal}) => {
      await new Promise((_, reject) => signal.addEventListener('abort', () => reject(Error('abort')), {once: true}));
    }});
    assert.equal(response.status, 503);
  } finally { clearTimeout(keepAlive); }
});

test('empty successful revocation stays successful', async () => {
  const response = await proxyHostedRequest(request('/v1/connect/revoke', {method: 'POST', body: '{}'}), {
    upstream, fetchImpl: async () => new Response(null, {status: 204}),
  });
  assert.equal(response.status, 204);
  assert.equal(await response.text(), '');
});
