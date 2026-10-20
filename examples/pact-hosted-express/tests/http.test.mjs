import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer, request as httpRequest} from 'node:http';
import {randomBytes} from 'node:crypto';
import {createExpressExample} from '../server.mjs';

test('actual Express HTTP denies missing license, allows fresh backend checks, logs out and bounds slow-body admission', async () => {
  const server = createServer();
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  const origin = `http://127.0.0.1:${server.address().port}`, pactOrigin = 'http://127.0.0.1:3000';
  const appId = `app_${'a'.repeat(32)}`;
  let flow, licensed = false, checks = 0, revoked = 0;
  const random = () => randomBytes(32).toString('base64url');
  const client = {
    async startLogin(input) { flow = input; return {issuer: pactOrigin, loginUrl: `${pactOrigin}/connect?transactionId=con_${'b'.repeat(32)}`, expiresAt: Date.now() + 300000}; },
    async exchangeCode() { return {walletGrant: `pact_grant_${random()}`, walletAddress: '11111111111111111111111111111111', appId, issuer: pactOrigin, environment: 'devnet', expiresAt: Date.now() + 900000}; },
    async revokeGrant() { revoked++; return {revoked: true}; },
    async checkAccess() { checks++; if (!licensed) throw Object.assign(new Error('fixed'), {code: 'LICENSE_REQUIRED', status: 403}); return {decision: 'ALLOW', requestId: '511356ef-34e4-4183-b905-0e6a4c83af83', assertFresh() {}}; },
  };
  const {app, consumer} = createExpressExample({config: {origin, pactOrigin, appId, resourceKey: 'premium-features'}, client});
  server.on('request', app);
  const held = [];
  try {
    const home = await fetch(origin); assert.equal(home.status, 200); assert.ok((await home.text()).includes('Premium workspace'));
    const anonymous = await fetch(`${origin}/api/session`);
    const cookie = anonymous.headers.get('set-cookie').split(';')[0]; const {csrfToken} = await anonymous.json();
    const headers = {cookie, origin, 'content-type': 'application/json', 'x-pact-csrf': csrfToken};
    assert.equal((await fetch(`${origin}/api/login/start`, {method: 'POST', headers, body: '{}'})).status, 200);
    const callback = await fetch(`${origin}/api/login/callback?code=pact_code_${random()}&state=${flow.state}&iss=${encodeURIComponent(pactOrigin)}`, {headers: {cookie}, redirect: 'manual'});
    assert.equal(callback.status, 303); assert.equal(callback.headers.get('location'), `${origin}/`);
    const currentCookie = callback.headers.get('set-cookie').split(';')[0];
    assert.equal((await fetch(`${origin}/api/protected`, {headers: {cookie: currentCookie}})).status, 403);
    licensed = true;
    assert.equal((await fetch(`${origin}/api/protected`, {headers: {cookie: currentCookie}})).status, 200); assert.equal(checks, 2);
    const currentSession = await (await fetch(`${origin}/api/session`, {headers: {cookie: currentCookie}})).json();
    const logout = await fetch(`${origin}/api/logout`, {method: 'POST', headers: {...headers, cookie: currentCookie, 'x-pact-csrf': currentSession.csrfToken}, body: '{}'});
    assert.equal(logout.status, 200); assert.equal(revoked, 1);
    assert.equal((await fetch(`${origin}/api/protected`, {headers: {cookie: currentCookie}})).status, 401);
    const slowSessionResponse = await fetch(`${origin}/api/session`);
    const slowCookie = slowSessionResponse.headers.get('set-cookie').split(';')[0], slowCsrf = (await slowSessionResponse.json()).csrfToken;
    for (let i = 0; i < 32; i++) {
      const req = httpRequest(`${origin}/api/login/start`, {method: 'POST', headers: {cookie: slowCookie, origin,
        'content-type': 'application/json', 'x-pact-csrf': slowCsrf, 'content-length': '2'}});
      req.on('error', () => {}); req.write('{'); held.push(req);
    }
    for (let i = 0; i < 100 && consumer.diagnostics().active < 32; i++) await new Promise(done => setTimeout(done, 5));
    assert.equal(consumer.diagnostics().active, 32);
    assert.equal((await fetch(`${origin}/api/session`)).status, 503);
  } finally {
    for (const req of held) req.destroy(); server.closeAllConnections(); await new Promise(done => server.close(done));
  }
});
