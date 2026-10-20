import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeConsumerRequest, ConsumerRequestError} from '../lib/request.mjs';
import {createConsumerApp} from '@pact/hosted-example-server';

const origin = 'http://127.0.0.1:4011';
test('Next loopback normalization preserves the configured origin, callback bytes, cookie and CSRF', async () => {
  const request = new Request('http://localhost:4011/api/login/callback?code=test&state=a%2Fb&iss=http%3A%2F%2F127.0.0.1%3A3000',
    {headers: {host: '127.0.0.1:4011', cookie: 'example=test', origin, 'x-pact-csrf': 'public-test'}});
  const result = normalizeConsumerRequest(request, origin);
  assert.equal(new URL(result.url).origin, origin);
  assert.equal(new URL(result.url).search, new URL(request.url).search);
  assert.equal(result.headers.get('cookie'), 'example=test'); assert.equal(result.headers.get('origin'), origin);
  assert.equal(result.headers.get('x-pact-csrf'), 'public-test');
});

test('a wrong, absent or duplicate-looking Host cannot be repaired using URL or forwarding metadata', () => {
  for (const host of [undefined, 'localhost:4011', 'attacker.example', '127.0.0.1:4011,attacker.example']) {
    const headers = {'x-forwarded-host': '127.0.0.1:4011', 'x-forwarded-proto': 'http'};
    if (host) headers.host = host;
    assert.throws(() => normalizeConsumerRequest(new Request(`${origin}/api/session`, {headers}), origin), ConsumerRequestError);
  }
});

test('untrusted forwarding headers are stripped and never change the original mutation Origin/CSRF/body', async () => {
  const request = new Request('https://localhost:4011/api/action', {method: 'POST', body: '{}', headers: {
    host: '127.0.0.1:4011', origin: 'https://attacker.example', 'x-pact-csrf': 'unchanged', 'content-type': 'application/json',
    forwarded: 'host=attacker.example;proto=https', 'x-forwarded-host': 'attacker.example', 'x-forwarded-proto': 'https',
    'x-forwarded-port': '444', 'x-forwarded-for': '1.2.3.4', 'x-original-url': '/api/login/callback',
  }});
  const result = normalizeConsumerRequest(request, origin);
  assert.equal(result.url, `${origin}/api/action`);
  assert.equal(result.headers.get('origin'), 'https://attacker.example'); assert.equal(result.headers.get('x-pact-csrf'), 'unchanged');
  assert.equal([...result.headers.keys()].some(name => name.includes('forward') || name === 'x-original-url'), false);
  assert.equal(await result.text(), '{}');
});

test('the normalized request succeeds at real engine bootstrap while cross-origin mutation still denies', async () => {
  const client = {async startLogin() { throw Error('must not reach'); }};
  const engine = createConsumerApp({origin, pactOrigin: 'http://127.0.0.1:3000', appId: `app_${'a'.repeat(32)}`, resourceKey: 'premium', client});
  const boot = await engine.handle(normalizeConsumerRequest(new Request('http://localhost:4011/api/session', {headers: {host: '127.0.0.1:4011'}}), origin));
  assert.equal(boot.status, 200);
  const csrf = (await boot.json()).csrfToken, cookie = boot.headers.get('set-cookie').split(';')[0];
  const action = new Request('https://localhost:4011/api/login/start', {method: 'POST', body: '{}', headers: {
    host: '127.0.0.1:4011', cookie, 'x-pact-csrf': csrf, 'content-type': 'application/json', origin: 'https://attacker.example',
    'x-forwarded-host': '127.0.0.1:4011', 'x-forwarded-proto': 'http',
  }});
  assert.equal((await engine.handle(normalizeConsumerRequest(action, origin))).status, 403);
});
