import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {createConsumerApp, readConsumerConfig} from '../src/consumer.mjs';

const origin = 'http://127.0.0.1:4010', pactOrigin = 'http://127.0.0.1:3000', appId = `app_${'a'.repeat(32)}`;
const random = () => randomBytes(32).toString('base64url');
const pause = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return {promise, resolve}; };
function setup() {
  let clock = Date.now(), flow, gate, problem;
  const observations = {starts: 0, exchanges: 0, checks: 0, freshness: 0, revoked: 0};
  const client = {
    async startLogin(input) { observations.starts++; flow = input; return {issuer: pactOrigin, loginUrl: `${pactOrigin}/connect?transactionId=con_${'b'.repeat(32)}`, expiresAt: clock + 300000}; },
    async exchangeCode() { observations.exchanges++; if (gate) await gate.promise; return {walletGrant: `pact_grant_${random()}`, walletAddress: '11111111111111111111111111111111', appId, issuer: pactOrigin, environment: 'devnet', expiresAt: clock + 900000}; },
    async revokeGrant() { observations.revoked++; return {revoked: true}; },
    async checkAccess() {
      observations.checks++; if (problem) throw problem;
      return {decision: 'ALLOW', requestId: 'd55f32e7-6df5-44f0-a6c2-d531ee32e8b7', assertFresh() { observations.freshness++; if (problem) throw problem; }};
    },
  };
  const app = createConsumerApp({client, origin, pactOrigin, appId, resourceKey: 'premium-features', now: () => clock});
  function request(path, {cookie, csrf, method = 'GET', body = '{}', headers = {}} = {}) {
    return new Request(`${origin}${path}`, {method, headers: {...(cookie ? {cookie} : {}),
      ...(method === 'POST' ? {origin, 'content-type': 'application/json', 'x-pact-csrf': csrf ?? ''} : {}), ...headers},
      ...(method === 'POST' ? {body} : {})});
  }
  async function bootstrap() {
    const response = await app.handle(request('/api/session'));
    return {cookie: response.headers.get('set-cookie').split(';')[0], csrf: (await response.json()).csrfToken};
  }
  async function start(session) { return app.handle(request('/api/login/start', {...session, method: 'POST'})); }
  function callback(session, extra = '') {
    return request(`/api/login/callback?code=pact_code_${random()}&state=${flow.state}&iss=${encodeURIComponent(pactOrigin)}${extra}`, session);
  }
  async function login() {
    const session = await bootstrap(); await start(session);
    const response = await app.handle(callback(session));
    const cookie = response.headers.get('set-cookie').split(';')[0];
    const data = await (await app.handle(request('/api/session', {cookie}))).json();
    return {before: session, cookie, csrf: data.csrfToken, data};
  }
  return {app, request, bootstrap, start, callback, login, observations,
    hold() { gate = pause(); return gate; }, expire() { clock += 900001; },
    deny() { problem = Object.assign(new Error('fixed'), {code: 'CHAIN_UNAVAILABLE', status: 503}); }};
}

test('configuration accepts only fixed origins and one-process topology', () => {
  const env = {PACT_CONSUMER_ORIGIN: origin, PACT_API_BASE_URL: pactOrigin, PACT_APP_ID: appId,
    PACT_RESOURCE_KEY: 'premium-features', PACT_API_KEY: `pact_sk_dev_key_${'c'.repeat(32)}_${random()}`};
  assert.equal(readConsumerConfig(env).redirectUri, `${origin}/api/login/callback`);
  for (const unsafe of [{...env, PACT_API_BASE_URL: 'https://api.example/path'}, {...env, WEB_CONCURRENCY: '2'}, {...env, PACT_RESOURCE_KEY: 'other/offer'}]) {
    assert.throws(() => readConsumerConfig(unsafe), /EXAMPLE_/);
  }
});

test('anonymous sessions and mutations require exact origin, CSRF and empty bounded JSON', async () => {
  const s = setup(), session = await s.bootstrap();
  assert.equal((await s.app.handle(s.request('/api/protected', session))).status, 401);
  for (const options of [{...session, csrf: random()}, {...session, headers: {origin: 'https://unrelated.example'}}, {...session, body: '{"walletAddress":"forged"}'}, {...session, body: 'x'.repeat(1025)}]) {
    assert.ok((await s.app.handle(s.request('/api/login/start', {...options, method: 'POST'}))).status >= 400);
  }
  assert.equal(s.observations.starts, 0);
});

test('callback binds state/issuer/exact fields and rotates opaque session without exposing backend material', async () => {
  const s = setup(), session = await s.bootstrap(); await s.start(session);
  const invalid = await s.app.handle(s.callback(session, '&state=duplicate'));
  assert.equal(invalid.status, 303); assert.equal(s.observations.exchanges, 0);
  const result = await s.app.handle(s.callback(session));
  assert.equal(result.status, 303); assert.equal(result.headers.get('location'), `${origin}/`);
  const cookie = result.headers.get('set-cookie').split(';')[0]; assert.ok(cookie !== session.cookie);
  assert.equal((await s.app.handle(s.request('/api/session', session))).status, 401);
  const data = await (await s.app.handle(s.request('/api/session', {cookie}))).json();
  assert.equal(data.authenticated, true); assert.ok(data.csrfToken !== session.csrf);
  assert.equal(/pact_grant_|pact_sk_|codeVerifier|pact_code_/.test(JSON.stringify(data)), false);
});

test('every GET/POST protected operation checks access and synchronously rechecks freshness', async () => {
  const s = setup(), session = await s.login();
  const first = await s.app.handle(s.request('/api/protected', session)); assert.equal(first.status, 200);
  const action = await s.app.handle(s.request('/api/action', {...session, method: 'POST'}));
  assert.equal((await action.json()).actionCount, 1); assert.equal(s.observations.checks, 2); assert.equal(s.observations.freshness, 4);
  s.deny();
  assert.equal((await s.app.handle(s.request('/api/action', {...session, method: 'POST'}))).status, 503);
  assert.equal((await s.app.handle(s.request('/api/protected', session))).status, 503);
});

test('parallel callback redemption exchanges once and logout cannot resurrect an exchanged grant', async () => {
  const s = setup(), session = await s.bootstrap(); await s.start(session);
  const gate = s.hold(), first = s.app.handle(s.callback(session));
  await new Promise(done => setImmediate(done));
  const second = await s.app.handle(s.callback(session)); assert.equal(second.status, 303); assert.equal(s.observations.exchanges, 1);
  const logout = await s.app.handle(s.request('/api/logout', {...session, method: 'POST'})); assert.equal(logout.status, 200);
  gate.resolve(); const completed = await first;
  assert.equal(completed.headers.has('set-cookie'), false); assert.equal(s.observations.revoked, 1);
  const data = await (await s.app.handle(s.request('/api/session', session))).json(); assert.equal(data.authenticated, false);
});

test('retired cookie permits only one exact-CSRF logout of its intended successor', async () => {
  const s = setup(), session = await s.login();
  for (const path of ['/api/session', '/api/protected']) assert.equal((await s.app.handle(s.request(path, session.before))).status, 401);
  assert.equal((await s.app.handle(s.request('/api/login/start', {...session.before, method: 'POST'}))).status, 401);
  const logout = await s.app.handle(s.request('/api/logout', {...session.before, method: 'POST'})); assert.equal(logout.status, 200);
  assert.equal(s.observations.revoked, 1);
  assert.equal((await s.app.handle(s.request('/api/logout', {...session.before, method: 'POST'}))).status, 401);
  assert.equal((await (await s.app.handle(s.request('/api/session', session))).json()).authenticated, false);
});

test('hard session expiry and process restart deny existing local sessions', async () => {
  const s = setup(), session = await s.login(); s.expire();
  assert.equal((await s.app.handle(s.request('/api/protected', session))).status, 401);
  const restarted = setup(); assert.equal((await restarted.app.handle(restarted.request('/api/protected', session))).status, 401);
});

test('session creation has a strict bounded capacity and no active lease leaks', async () => {
  const s = setup();
  for (let i = 0; i < 512; i++) assert.equal((await s.app.handle(s.request('/api/session'))).status, 200);
  assert.equal((await s.app.handle(s.request('/api/session'))).status, 503);
  assert.deepEqual(s.app.diagnostics(), {sessionEntries: 512, active: 0});
});

test('a pre-authentication slow action body cannot use the later authenticated grant', async () => {
  const s = setup(), session = await s.bootstrap(); await s.start(session);
  let controller;
  const body = new ReadableStream({start(value) { controller = value; }});
  const request = new Request(`${origin}/api/action`, {method: 'POST', duplex: 'half', body,
    headers: {cookie: session.cookie, origin, 'content-type': 'application/json', 'x-pact-csrf': session.csrf}});
  const pending = s.app.handle(request);
  await new Promise(done => setImmediate(done));
  const callback = await s.app.handle(s.callback(session)); assert.equal(callback.status, 303);
  controller.enqueue(new TextEncoder().encode('{}')); controller.close();
  assert.equal((await pending).status, 401); assert.equal(s.observations.checks, 0);
});
