import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes, createHash} from 'node:crypto';
import {fixture, client, wallet} from './fixtures.mjs';

const random = () => randomBytes(32).toString('base64url');
const cookie = browser => [...browser.jar].map(([key, value]) => `${key}=${value}`).join('; ');
async function backend(service, key, url, payload) {
  const response = await service.server.inject({method: 'POST', url, payload,
    headers: {authorization: `Bearer ${key}`}});
  return {status: response.statusCode, data: response.json()};
}

test('same SQL and pepper cannot transfer keys, sessions, proofs, codes or grants between issuers', async t => {
  const first = await fixture();
  const second = await fixture({database: first.database, pepper: first.pepper, origin: 'http://localhost:3001'});
  t.after(async () => { await second.cleanup(); await first.cleanup(); });
  const owner = await client(first);
  const app = (await owner.request('POST', '/v1/developer/apps', {name: 'Issuer boundary', framework: 'rest'})).json.app;
  const path = `/v1/developer/apps/${app.id}`;
  const redirectUri = 'http://127.0.0.1:4200/callback';
  await owner.mutation('POST', path + '/callback-uris', 'callback.create', app.id,
    {uri: redirectUri, websiteOrigin: 'http://127.0.0.1:4200'});
  await owner.mutation('PATCH', path, 'app.update', app.id, {status: 'active'});
  const mint = async admin => {
    const r = await admin.mutation('POST', path + '/credentials', 'credential.create', app.id,
      {name: 'Issuer key', scopes: ['access:check', 'connect:write'], expiresAt: Date.now() + 3600000});
    assert.equal(r.status, 200); return r.json.secret;
  };
  const firstKey = await mint(owner);
  assert.equal((await backend(first, firstKey, '/v1/credentials/validate', {})).status, 200);
  assert.equal((await backend(second, firstKey, '/v1/credentials/validate', {})).status, 401);
  const foreignSession = await second.server.inject({url: path, headers: {cookie: cookie(owner), origin: second.options.origin}});
  assert.equal(foreignSession.statusCode, 401);

  const oldProof = await owner.request('POST', '/v1/developer/auth/challenge', {walletAddress: owner.identity.address});
  const proofBody = {challengeId: oldProof.json.challengeId, signatureBase64: owner.identity.sign(oldProof.json.message)};
  const proofAtOtherIssuer = await second.server.inject({method: 'POST', url: '/v1/developer/auth/verify', payload: proofBody,
    headers: {origin: second.options.origin, cookie: cookie(owner), 'x-pact-csrf': owner.csrf}});
  assert.equal(proofAtOtherIssuer.statusCode, 401);
  assert.equal((await owner.request('POST', '/v1/developer/auth/verify', proofBody)).status, 200);

  const newOwner = await client(second, owner.identity);
  assert.equal((await newOwner.request('GET', path)).status, 200, 'registration survives deliberate issuer migration');
  const secondKey = await mint(newOwner);
  assert.equal((await backend(first, secondKey, '/v1/credentials/validate', {})).status, 401);
  assert.equal((await backend(second, secondKey, '/v1/credentials/validate', {})).status, 200);

  async function issue(service, adminKey, otherService, otherKey) {
    const state = random(), verifier = random();
    const start = await backend(service, adminKey, '/v1/connect/transactions', {redirectUri, state,
      codeChallenge: createHash('sha256').update(verifier).digest('base64url'), codeChallengeMethod: 'S256', purpose: 'Issuer-bound login'});
    assert.equal(start.status, 200);
    const buyer = await client(service, wallet());
    assert.equal((await buyer.request('GET', `/v1/connect/transactions/${start.data.transactionId}`)).status, 200);
    const challenge = await buyer.request('POST', '/v1/connect/challenge',
      {transactionId: start.data.transactionId, walletAddress: buyer.identity.address});
    assert.equal(challenge.status, 200);
    const body = {transactionId: start.data.transactionId, challengeId: challenge.json.challengeId,
      signatureBase64: buyer.identity.sign(challenge.json.message)};
    const foreign = await otherService.server.inject({method: 'POST', url: '/v1/connect/verify', payload: body,
      headers: {origin: otherService.options.origin, cookie: cookie(buyer), 'x-pact-csrf': buyer.csrf}});
    assert.equal(foreign.statusCode, 401);
    const signed = await buyer.request('POST', '/v1/connect/verify', body); assert.equal(signed.status, 200);
    const destination = new URL(signed.json.callbackUrl);
    const payload = {code: destination.searchParams.get('code'), redirectUri, state, codeVerifier: verifier, issuer: service.options.origin};
    assert.equal((await backend(otherService, otherKey, '/v1/connect/token', {...payload, issuer: otherService.options.origin})).status, 401);
    const redeemed = await backend(service, adminKey, '/v1/connect/token', payload); assert.equal(redeemed.status, 200);
    await service.authenticateGrant(redeemed.data.walletGrant, app);
    await assert.rejects(otherService.authenticateGrant(redeemed.data.walletGrant, app), error => error.code === 'GRANT_INVALID');
  }
  await issue(first, firstKey, second, secondKey);
  await issue(second, secondKey, first, firstKey);
});
