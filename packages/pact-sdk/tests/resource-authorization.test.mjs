import test from 'node:test';
import assert from 'node:assert/strict';
import { createPactApiHandler } from '../dist/server.js';
import { controlledRpc, signer, offer, seller, ORIGIN } from '../../../web/tests/platform/fixtures.mjs';

// Disposable message proofs and synthetic account bytes only. Every recorded RPC
// is checked outside the handler, so swallowed provider errors cannot hide writes.
const PRIVATE = 'PRIVATE_RESOURCE_INDEPENDENT_QA_72d3';
const address = offer.toBase58();
const bounds = { timeout: 15000 };
function barrier(t) {
  const result = Promise.withResolvers();
  t.after(() => result.resolve());
  return result;
}
function environment(t, { prepare, resources, options = {}, rpcHook } = {}) {
  const identity = signer(), rpc = controlledRpc(identity.wallet);
  const counts = { prepare: 0, commit: 0 }, contexts = [], events = [];
  const clock = { value: 1000000 };
  const descriptor = { offer: address, prepare: async context => {
    counts.prepare++; contexts.push(context); events.push('prepare');
    return prepare ? prepare(context) : { body: PRIVATE, contentType: 'text/plain', commit() { counts.commit++; events.push('commit'); } };
  } };
  const config = { origin: ORIGIN, authMode: 'single-process', now: () => clock.value,
    rpcUrl: 'http://127.0.0.1:8899', resources: resources ?? { asset: descriptor },
    fetch: async (url, init) => {
      const q = JSON.parse(init.body);
      events.push(q.method);
      if (rpcHook) await rpcHook(q, init);
      return rpc.fetch(url, init);
    }, ...options };
  const handler = createPactApiHandler(config);
  t.after(() => assert.deepEqual(rpc.calls.filter(q => !['getGenesisHash', 'getMultipleAccounts'].includes(q.method)), []));
  return { identity, rpc, counts, contexts, events, clock, descriptor, config, handler };
}
async function call(e, route = '/resources/asset', { cookie = '', method = 'GET', body, origin = ORIGIN, signal, headers = {} } = {}) {
  const h = { ...headers };
  if (origin !== null) h.origin = origin;
  if (cookie) h.cookie = cookie;
  const response = await e.handler(new Request(ORIGIN + '/api/v1' + route, {
    method, headers: h, signal, ...(body !== undefined ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}),
  }));
  return { response, status: response.status, text: await response.text() };
}
async function authenticate(e, identity = e.identity, previous = '') {
  const challenge = await call(e, '/auth/challenge', { method: 'POST', cookie: previous,
    headers: { 'content-type': 'application/json' }, body: { walletAddress: identity.wallet } });
  assert.equal(challenge.status, 200, challenge.text);
  const data = JSON.parse(challenge.text), binding = challenge.response.headers.get('set-cookie').split(';')[0];
  const verified = await call(e, '/auth/verify', { method: 'POST', cookie: [binding, previous].filter(Boolean).join('; '),
    headers: { 'content-type': 'application/json' }, body: { challengeId: data.challengeId, signatureBase64: identity.signMessage(data.message) } });
  assert.equal(verified.status, 200, verified.text);
  return { cookie: binding + '; ' + verified.response.headers.get('set-cookie').split(';')[0], ...JSON.parse(verified.text) };
}
function denied(result) {
  assert.ok(result.status >= 400, `Unexpected resource response ${result.status}: ${result.text}`);
  assert.equal(result.text.includes(PRIVATE), false, 'A denial must never disclose server-owned bytes');
}
function zero(e) { assert.equal(e.counts.prepare, 0); assert.equal(e.counts.commit, 0); }
function committed(e) {
  assert.equal(e.counts.prepare, 1); assert.equal(e.counts.commit, 1);
  assert.equal(e.contexts[0].walletAddress, e.identity.wallet);
  assert.equal(e.contexts[0].offerAddress, address);
  assert.ok(e.contexts[0].signal instanceof AbortSignal);
  assert.equal(e.events.filter(v => v === 'getMultipleAccounts').length, 2, 'Both authorization boundaries need a fresh chain read');
}

test('resource delivers private bytes only after wallet proof and two fresh entitlement reads', bounds, async t => {
  const e = environment(t), session = await authenticate(e), result = await call(e, undefined, session);
  assert.equal(result.status, 200, result.text); assert.equal(result.text, PRIVATE);
  assert.match(result.response.headers.get('content-type'), /^text\/plain(?:;|$)/);
  assert.match(result.response.headers.get('cache-control'), /no-store/);
  assert.equal(result.response.headers.get('access-control-allow-origin'), null);
  assert.equal(result.response.headers.get('x-content-type-options'), 'nosniff');
  committed(e);
  assert.deepEqual(e.events, ['getGenesisHash', 'getMultipleAccounts', 'prepare', 'getGenesisHash', 'getMultipleAccounts', 'commit']);
});

test('public active-license lookup is not resource authorization; forged cookies cannot invoke prepare', bounds, async t => {
  const e = environment(t);
  const publicRead = await call(e, '/licenses/' + address + '/' + e.identity.wallet);
  assert.equal(publicRead.status, 200); assert.equal(JSON.parse(publicRead.text).valid, true);
  denied(await call(e)); denied(await call(e, undefined, { cookie: 'pact_session=' + e.identity.wallet })); zero(e);
});

test('missing, expired, failed, wrong-genesis and corrupt entitlement reads never reach resource callback', bounds, async t => {
  for (const mode of ['missing', 'expired', 'rpc-failed', 'wrong-genesis', 'corrupt-owner']) {
    await t.test(mode, async t => {
      const e = environment(t), session = await authenticate(e);
      if (mode === 'missing') e.rpc.state.missing = true;
      if (mode === 'expired') e.rpc.state.expiry = e.rpc.state.timestamp;
      if (mode === 'rpc-failed') e.rpc.state.fail = true;
      if (mode === 'wrong-genesis') e.rpc.state.genesis = 'wrong-network';
      if (mode === 'corrupt-owner') e.rpc.state.mutate = result => { result.value[1].owner = '11111111111111111111111111111111'; };
      denied(await call(e, undefined, session)); zero(e);
    });
  }
});

test('resource policy and prepare function are snapshots, unaffected by caller mutation after factory creation', bounds, async t => {
  const e = environment(t), session = await authenticate(e);
  e.descriptor.offer = seller.toBase58(); e.descriptor.method = 'POST';
  e.descriptor.prepare = () => { throw Error('Mutated descriptor must not be consulted'); };
  e.config.resources.asset = { offer: seller.toBase58(), prepare() { throw Error('Replaced map must not be consulted'); } };
  const result = await call(e, undefined, session);
  assert.equal(result.status, 200, result.text); assert.equal(result.text, PRIVATE); committed(e);
});

test('query identity/offer injection, unknown IDs, wrong methods, duplicate cookies and cross-origin requests cannot invoke prepare', bounds, async t => {
  const e = environment(t), session = await authenticate(e);
  for (const [route, extra] of [
    ['/resources/asset?walletAddress=' + e.identity.wallet, {}],
    ['/resources/asset?offerAddress=' + seller.toBase58(), {}],
    ['/resources/unknown', {}], ['/resources/asset/extra', {}],
    ['/resources/asset', { method: 'POST' }],
    ['/resources/asset', { origin: 'https://attacker.example' }],
    ['/resources/asset', { method: 'OPTIONS', origin: 'https://attacker.example' }],
    ['/resources/asset', { cookie: session.cookie + '; pact_session=' + 'A'.repeat(43) }],
  ]) denied(await call(e, route, { ...session, ...extra }));
  zero(e);
});

test('configured POST operation requires same origin and rejects every request body before prepare', bounds, async t => {
  let prepared = 0, committed = 0;
  const e = environment(t, { resources: { operation: { offer: address, method: 'POST', prepare() {
    prepared++; return { body: PRIVATE, contentType: 'text/plain', commit() { committed++; } };
  } } } }), session = await authenticate(e);
  for (const body of ['', '{}', JSON.stringify({ walletAddress: e.identity.wallet, offerAddress: address }), 'x'.repeat(131073)])
    denied(await call(e, '/resources/operation', { ...session, method: 'POST', body }));
  denied(await call(e, '/resources/operation', { ...session, method: 'POST', origin: null }));
  assert.equal(prepared, 0); assert.equal(committed, 0);
  const result = await call(e, '/resources/operation', { ...session, method: 'POST' });
  assert.equal(result.status, 200, result.text); assert.equal(result.text, PRIVATE);
  assert.equal(prepared, 1); assert.equal(committed, 1);
});

test('logout while prepare is suspended invalidates resource and never commits prepared bytes', bounds, async t => {
  const entered = barrier(t), release = barrier(t);
  let commits = 0;
  const e = environment(t, { prepare: async () => { entered.resolve(); await release.promise; return { body: PRIVATE, commit() { commits++; } }; } });
  const session = await authenticate(e), pending = call(e, undefined, session);
  await entered.promise;
  assert.equal((await call(e, '/auth/logout', { ...session, method: 'POST' })).status, 200);
  release.resolve(); denied(await pending); assert.equal(e.counts.prepare, 1); assert.equal(commits, 0);
});

test('logout then login with the SAME wallet cannot revive an old in-flight operation', bounds, async t => {
  const entered = barrier(t), release = barrier(t); let commits = 0;
  const e = environment(t, { prepare: async () => { entered.resolve(); await release.promise; return { body: PRIVATE, commit() { commits++; } }; } });
  const old = await authenticate(e), pending = call(e, undefined, old);
  await entered.promise; await call(e, '/auth/logout', { ...old, method: 'POST' });
  const fresh = await authenticate(e);
  assert.notEqual(fresh.cookie, old.cookie); assert.equal(fresh.walletAddress, old.walletAddress);
  release.resolve(); denied(await pending); assert.equal(commits, 0);
  const current = await call(e, undefined, fresh); assert.equal(current.status, 200, current.text); assert.equal(commits, 1);
});

test('account switch replaces the session incarnation and cannot relabel old prepared data', bounds, async t => {
  const entered = barrier(t), release = barrier(t); let commits = 0;
  const e = environment(t, { prepare: async () => { entered.resolve(); await release.promise; return { body: PRIVATE, commit() { commits++; } }; } });
  const old = await authenticate(e), pending = call(e, undefined, old);
  await entered.promise;
  const replacement = await authenticate(e, signer(), old.cookie.split('; ').find(c => c.startsWith('pact_session=')));
  assert.notEqual(replacement.walletAddress, old.walletAddress);
  release.resolve(); denied(await pending); assert.equal(commits, 0);
  assert.equal(e.contexts[0].walletAddress, old.walletAddress);
});

test('logout during the FINAL chain read is checked after RPC before synchronous commit', bounds, async t => {
  const entered = barrier(t), release = barrier(t); let snapshots = 0;
  const e = environment(t, { rpcHook: async q => { if (q.method === 'getMultipleAccounts' && ++snapshots === 2) { entered.resolve(); await release.promise; } } });
  const session = await authenticate(e), pending = call(e, undefined, session);
  await entered.promise; assert.equal((await call(e, '/auth/logout', { ...session, method: 'POST' })).status, 200);
  release.resolve(); denied(await pending); assert.equal(e.counts.prepare, 1); assert.equal(e.counts.commit, 0);
});

test('session expiry during final RPC denies commit even when chain entitlement remains active', bounds, async t => {
  let snapshots = 0, expiry;
  const e = environment(t, { options: { sessionTtlMs: 1000 }, rpcHook: q => {
    if (q.method === 'getMultipleAccounts' && ++snapshots === 2) e.clock.value = expiry;
  } });
  const session = await authenticate(e); expiry = session.expiresAt;
  denied(await call(e, undefined, session)); assert.equal(e.counts.prepare, 1); assert.equal(e.counts.commit, 0);
});

test('logout and same-wallet replacement during FINAL RPC cannot authorize original resource operation', bounds, async t => {
  const entered = barrier(t), release = barrier(t); let snapshots = 0;
  const e = environment(t, { rpcHook: async q => { if (q.method === 'getMultipleAccounts' && ++snapshots === 2) { entered.resolve(); await release.promise; } } });
  const old = await authenticate(e), pending = call(e, undefined, old);
  await entered.promise; await call(e, '/auth/logout', { ...old, method: 'POST' });
  const fresh = await authenticate(e);
  assert.equal(fresh.walletAddress, old.walletAddress); assert.notEqual(fresh.cookie, old.cookie);
  release.resolve(); denied(await pending); assert.equal(e.counts.commit, 0);
  assert.equal((await call(e, undefined, fresh)).status, 200); assert.equal(e.counts.commit, 1);
});

test('license expiry, RPC failure and backwards wall clock after preparation all deny commit', bounds, async t => {
  for (const mode of ['license-expiry', 'rpc-failure', 'clock-backwards']) await t.test(mode, async t => {
    let commits = 0;
    const e = environment(t, { prepare() {
      if (mode === 'license-expiry') e.rpc.state.timestamp = e.rpc.state.expiry;
      if (mode === 'rpc-failure') e.rpc.state.fail = true;
      if (mode === 'clock-backwards') e.clock.value--;
      return { body: PRIVATE, commit() { commits++; } };
    } });
    denied(await call(e, undefined, await authenticate(e)));
    assert.equal(e.counts.prepare, 1); assert.equal(commits, 0);
  });
});

test('request cancellation before authorization does no chain or resource work', bounds, async t => {
  const e = environment(t), session = await authenticate(e), controller = new AbortController();
  controller.abort(); denied(await call(e, undefined, { ...session, signal: controller.signal }));
  zero(e); assert.equal(e.rpc.calls.length, 0);
});

test('cancellation during ignored preparation aborts context and quarantines capacity until producer settles', bounds, async t => {
  const entered = barrier(t), release = barrier(t); let commits = 0;
  const e = environment(t, { options: { requestBudgets: { protected: { perMinute: 180, maxConcurrent: 1 } } },
    prepare: async () => { entered.resolve(); await release.promise; return { body: PRIVATE, commit() { commits++; } }; } });
  const session = await authenticate(e), controller = new AbortController();
  const pending = call(e, undefined, { ...session, signal: controller.signal }); await entered.promise; controller.abort();
  denied(await pending); assert.equal(e.contexts[0].signal.aborted, true);
  denied(await call(e, undefined, session)); assert.equal(e.counts.prepare, 1); assert.equal(commits, 0);
  release.resolve(); await new Promise(resolve => setImmediate(resolve));
  const recovered = await call(e, undefined, session); assert.equal(recovered.status, 200, recovered.text); assert.equal(commits, 1);
});

test('whole-resource five-second deadline holds ignored prepare capacity until actual settlement', bounds, async t => {
  const entered = barrier(t), release = barrier(t); let commits = 0, prepareStarted, delayed = false;
  const e = environment(t, { options: { requestBudgets: { protected: { perMinute: 180, maxConcurrent: 1 } } },
    rpcHook: async q => { if (!delayed && q.method === 'getGenesisHash') { delayed = true; await new Promise(resolve => setTimeout(resolve, 1000)); } },
    prepare: async () => { prepareStarted = Date.now(); entered.resolve(); await release.promise; return { body: PRIVATE, commit() { commits++; } }; } });
  const session = await authenticate(e), started = Date.now(), pending = call(e, undefined, session);
  await entered.promise; denied(await pending);
  assert.ok(Date.now() - started >= 4500); assert.ok(Date.now() - started < 6500);
  assert.ok(Date.now() - prepareStarted < 4700, 'Preparation must use the remaining whole-request deadline, not a reset five-second timer');
  assert.equal(e.contexts[0].signal.aborted, true);
  denied(await call(e, undefined, session)); assert.equal(e.counts.prepare, 1); assert.equal(commits, 0);
  release.resolve(); await new Promise(resolve => setImmediate(resolve));
  const recovered = await call(e, undefined, session); assert.equal(recovered.status, 200, recovered.text); assert.equal(commits, 1);
});

test('cancellation during final RPC prevents commit even if provider ignores abort and later returns valid state', bounds, async t => {
  const entered = barrier(t), release = barrier(t); let snapshots = 0;
  const e = environment(t, { rpcHook: async q => { if (q.method === 'getMultipleAccounts' && ++snapshots === 2) { entered.resolve(); await release.promise; } } });
  const session = await authenticate(e), controller = new AbortController(), pending = call(e, undefined, { ...session, signal: controller.signal });
  await entered.promise; controller.abort(); denied(await pending);
  release.resolve(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(e.counts.prepare, 1); assert.equal(e.counts.commit, 0);
});

test('cancelled ignored RPCs retain four protected chain workers, start no fifth transport, and leave auth responsive', bounds, async t => {
  const entered = Array.from({ length: 4 }, () => barrier(t)), release = barrier(t); let snapshots = 0;
  const e = environment(t, { options: { requestBudgets: { protected: { perMinute: 180, maxConcurrent: 1 } } },
    rpcHook: async q => { if (q.method === 'getMultipleAccounts' && ++snapshots <= 4) { entered[snapshots - 1].resolve(); await release.promise; } } });
  const session = await authenticate(e);
  for (let i = 0; i < 4; i++) {
    const controller = new AbortController(), pending = call(e, undefined, { ...session, signal: controller.signal });
    await entered[i].promise; controller.abort(); denied(await pending);
  }
  const controller = new AbortController(), fifth = call(e, undefined, { ...session, signal: controller.signal });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(snapshots, 4); zero(e);
  assert.equal((await call(e, '/auth/session', session)).status, 200);
  controller.abort(); denied(await fifth);
  release.resolve(); await new Promise(resolve => setImmediate(resolve));
  const recovered = await call(e, undefined, session); assert.equal(recovered.status, 200, recovered.text);
  assert.equal(e.counts.prepare, 1); assert.equal(e.counts.commit, 1); assert.equal(snapshots, 6);
});

test('response body is copied before final RPC and cannot change through producer-held byte array', bounds, async t => {
  const bytes = new TextEncoder().encode(PRIVATE); let snapshots = 0;
  const e = environment(t, { prepare: () => ({ body: bytes, contentType: 'application/octet-stream' }),
    rpcHook: q => { if (q.method === 'getMultipleAccounts' && ++snapshots === 2) bytes.fill(88); } });
  const result = await call(e, undefined, await authenticate(e));
  assert.equal(result.status, 200, result.text); assert.equal(result.text, PRIVATE);
});

test('UTF-8 byte limit permits exactly one MiB and refuses oversized strings or byte arrays before commit', bounds, async t => {
  for (const [name, body, success] of [
    ['exact-bytes', new Uint8Array(1048576).fill(65), true],
    ['oversized-bytes', new Uint8Array(1048577), false],
    ['oversized-utf8', 'é'.repeat(524289), false],
  ]) await t.test(name, async t => {
    let commits = 0;
    const e = environment(t, { prepare: () => ({ body, commit() { commits++; } }) });
    const result = await call(e, undefined, await authenticate(e));
    if (success) { assert.equal(result.status, 200, result.text.slice(0, 100)); assert.equal(Buffer.byteLength(result.text), 1048576); assert.equal(commits, 1); }
    else { denied(result); assert.equal(commits, 0); }
  });
});

test('invalid prepared bodies and unsafe content types fail before commit and do not expose callback errors', bounds, async t => {
  for (const value of [{ body: {} }, { body: PRIVATE, contentType: 'text/plain\r\nX-Evil: yes' }]) {
    let commits = 0;
    const e = environment(t, { prepare: () => ({ ...value, commit() { commits++; } }) });
    denied(await call(e, undefined, await authenticate(e))); assert.equal(commits, 0);
  }
  const e = environment(t, { prepare() { throw Error(PRIVATE); } });
  denied(await call(e, undefined, await authenticate(e)));
});

test('async commit functions are refused before invocation; promise-returning contract violations never deliver bytes', bounds, async t => {
  let asyncCommits = 0;
  const asynchronous = environment(t, { prepare: () => ({ body: PRIVATE, async commit() { asyncCommits++; } }) });
  denied(await call(asynchronous, undefined, await authenticate(asynchronous)));
  assert.equal(asyncCommits, 0);
  let invoked = 0;
  const disguised = environment(t, { prepare: () => ({ body: PRIVATE, commit() { invoked++; return Promise.resolve(); } }) });
  denied(await call(disguised, undefined, await authenticate(disguised)));
  // Trusted callbacks must obey the synchronous contract. Detecting a returned
  // promise cannot undo effects already started inside a violating callback.
  assert.equal(invoked, 1);
});

test('invalid resource policy or request-capacity configuration fails at factory creation', () => {
  for (const resources of [
    { asset: { offer: 'not-a-key', prepare() {} } },
    { asset: { offer: address, method: 'DELETE', prepare() {} } },
    { 'path/to/asset': { offer: address, prepare() {} } },
    { asset: { offer: address } },
  ]) assert.throws(() => createPactApiHandler({ origin: ORIGIN, resources }), error => error.code === 'INVALID_INPUT');
  for (const requestBudgets of [{ public: { perMinute: 0 } }, { auth: { maxConcurrent: 0 } },
    { protected: { perMinute: 1.5 } }, { protected: { maxConcurrent: 65 } }])
    assert.throws(() => createPactApiHandler({ origin: ORIGIN, requestBudgets }), error => error.code === 'INVALID_INPUT');
});

test('public rate exhaustion cannot consume authentication or protected-operation budgets', bounds, async t => {
  const e = environment(t, { options: { requestBudgets: { public: { perMinute: 1, maxConcurrent: 1 } } } });
  assert.equal((await call(e, '/licenses/' + address + '/' + e.identity.wallet)).status, 200);
  assert.equal((await call(e, '/licenses/' + address + '/' + e.identity.wallet)).status, 429);
  const session = await authenticate(e), result = await call(e, undefined, session);
  assert.equal(result.status, 200, result.text); assert.equal(result.text, PRIVATE);
});

test('saturated public chain pool cannot starve authentication or resource chain rechecks', bounds, async t => {
  const entered = barrier(t), release = barrier(t); let starts = 0;
  const e = environment(t, { rpcHook: async q => {
    if (q.method === 'getGenesisHash' && ++starts <= 4) { if (starts === 4) entered.resolve(); await release.promise; }
  } });
  const pending = Array.from({ length: 4 }, () => call(e, '/licenses/' + address + '/' + e.identity.wallet));
  t.after(async () => { release.resolve(); await Promise.allSettled(pending); });
  await entered.promise;
  const session = await authenticate(e), result = await call(e, undefined, session);
  assert.equal(result.status, 200, result.text); assert.equal(result.text, PRIVATE);
  assert.equal(e.counts.prepare, 1); assert.equal(e.counts.commit, 1);
  release.resolve(); for (const result of await Promise.all(pending)) assert.equal(result.status, 200, result.text);
});

test('protected concurrency refusal never invokes another prepare, while auth remains responsive', bounds, async t => {
  const entered = barrier(t), release = barrier(t);
  const e = environment(t, { options: { requestBudgets: { protected: { perMinute: 180, maxConcurrent: 1 } } },
    prepare: async () => { entered.resolve(); await release.promise; return { body: PRIVATE }; } });
  const session = await authenticate(e), pending = call(e, undefined, session); await entered.promise;
  denied(await call(e, undefined, session)); assert.equal(e.counts.prepare, 1);
  assert.equal((await call(e, '/auth/session', session)).status, 200);
  release.resolve(); assert.equal((await pending).status, 200);
});
