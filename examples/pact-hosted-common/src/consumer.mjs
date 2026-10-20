import {createHash, randomBytes, timingSafeEqual} from 'node:crypto';
import cluster from 'node:cluster';
import {isMainThread} from 'node:worker_threads';

const random = () => randomBytes(32).toString('base64url');
const hash = value => createHash('sha256').update(value).digest('hex');
const TOKEN = /^[A-Za-z0-9_-]{43}$/;
const equal = (a, b) => typeof a === 'string' && typeof b === 'string' && TOKEN.test(a) && TOKEN.test(b)
  && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const safeOrigin = value => {
  try {
    const url = new URL(value);
    if (url.origin !== value || url.username || url.password || url.protocol !== 'https:'
      && !(url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname))) throw Error();
    return url.origin;
  } catch { throw new Error('EXAMPLE_CONFIGURATION_REQUIRED'); }
};

export function readConsumerConfig(env = process.env) {
  if (!isMainThread || cluster.isWorker || env.WEB_CONCURRENCY !== undefined && env.WEB_CONCURRENCY !== '1'
    || ['VERCEL', 'AWS_LAMBDA_FUNCTION_NAME', 'FUNCTIONS_WORKER_RUNTIME', 'NODE_UNIQUE_ID', 'CF_PAGES',
      'AWS_EXECUTION_ENV', 'K_SERVICE', 'NETLIFY', 'AZURE_FUNCTIONS_ENVIRONMENT'].some(name => env[name])) throw new Error('EXAMPLE_SINGLE_PROCESS_REQUIRED');
  const origin = safeOrigin(env.PACT_CONSUMER_ORIGIN);
  const pactOrigin = safeOrigin(env.PACT_API_BASE_URL);
  if (!/^app_[a-f0-9]{32}$/.test(env.PACT_APP_ID ?? '')
    || !/^pact_sk_dev_key_[a-f0-9]{32}_[A-Za-z0-9_-]{43}$/.test(env.PACT_API_KEY ?? '')
    || !/^[a-z][a-z0-9-]{0,63}$/.test(env.PACT_RESOURCE_KEY ?? '')) throw new Error('EXAMPLE_CONFIGURATION_REQUIRED');
  return {origin, pactOrigin, appId: env.PACT_APP_ID, apiKey: env.PACT_API_KEY,
    resourceKey: env.PACT_RESOURCE_KEY, redirectUri: `${origin}/api/login/callback`};
}

class ConsumerError extends Error {
  constructor(code, status = 400, purchase) { super(code); this.code = code; this.status = status; this.purchase = purchase; }
}
const fail = (code, status) => { throw new ConsumerError(code, status); };

/**
 * Deliberately bounded ONE-PROCESS example session store. Restart loses all local sessions.
 * client is a trusted server-only @pact/hosted-client instance; no key/grant is returned to a browser.
 */
export function createConsumerApp({client, origin, pactOrigin, appId, resourceKey, now = Date.now}) {
  safeOrigin(origin); safeOrigin(pactOrigin);
  if (!client || !/^app_[a-f0-9]{32}$/.test(appId) || !/^[a-z][a-z0-9-]{0,63}$/.test(resourceKey)) throw new Error('EXAMPLE_CONFIGURATION_REQUIRED');
  const sessions = new Map();
  const cookieName = origin.startsWith('https:') ? '__Host-pact_consumer' : 'pact_consumer';
  const redirectUri = `${origin}/api/login/callback`;
  const TTL = 900000, MAX_ENTRIES = 512, MAX_ACTIVE = 32;
  let active = 0;
  function response(value, status = 200, extra = {}) {
    return Response.json(value, {status, headers: {'cache-control': 'no-store', 'referrer-policy': 'no-referrer',
      'x-content-type-options': 'nosniff', 'x-frame-options': 'DENY', ...extra}});
  }
  function cookie(token, maxAge = TTL / 1000) {
    return `${cookieName}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${origin.startsWith('https:') ? '; Secure' : ''}`;
  }
  function sweep() {
    const time = now();
    for (const [id, entry] of sessions) {
      if (entry.record.expiresAt <= time || !entry.record.active || entry.retiredUntil && entry.retiredUntil <= time) sessions.delete(id);
    }
  }
  function invalidate(record) {
    record.active = false; record.version++; record.pending = null;
    const grant = record.grant; record.grant = null; record.wallet = null;
    for (const [id, entry] of sessions) if (entry.record === record) sessions.delete(id);
    return grant;
  }
  async function revokeQuietly(grant) {
    if (!grant) return true;
    try { await client.revokeGrant({walletGrant: grant}); return true; } catch { return false; }
  }
  function readCookie(request) {
    const raw = request.headers.get('cookie') ?? '';
    if (raw.length > 4096) fail('INVALID_COOKIE');
    let value;
    for (const part of raw.split(';')) {
      const index = part.indexOf('='); if (index < 1) continue;
      if (part.slice(0, index).trim() !== cookieName) continue;
      if (value !== undefined) fail('INVALID_COOKIE');
      value = part.slice(index + 1).trim();
    }
    return typeof value === 'string' && TOKEN.test(value) ? value : null;
  }
  function findSession(request, allowRetired = false) {
    const token = readCookie(request), entry = token ? sessions.get(hash(token)) : null;
    if (!entry || !entry.record.active || entry.record.expiresAt <= now()
      || entry.retiredUntil && (!allowRetired || entry.retiredUntil <= now())) fail('APP_SESSION_REQUIRED', 401);
    return entry;
  }
  function current(record, version) {
    if (!record.active || record.version !== version || record.expiresAt <= now()) fail('APP_SESSION_CHANGED', 401);
  }
  function newSession() {
    if (sessions.size >= MAX_ENTRIES) fail('APP_CAPACITY', 503);
    const token = random(), csrf = random();
    const record = {active: true, version: 0, expiresAt: now() + TTL, pending: null,
      grant: null, grantExpiresAt: 0, wallet: null, csrf, actions: 0};
    sessions.set(hash(token), {record, csrf, retiredUntil: null});
    return {record, token};
  }
  async function mutation(request, entry) {
    if (request.headers.get('origin') !== origin || !equal(request.headers.get('x-pact-csrf'), entry.csrf)) fail('APP_CSRF_DENIED', 403);
    if (!/^application\/json(?:;|$)/i.test(request.headers.get('content-type') ?? '')) fail('INVALID_BODY');
    const length = request.headers.get('content-length');
    if (length !== null && (!/^\d+$/.test(length) || Number(length) > 1024)) fail('BODY_TOO_LARGE', 413);
    const reader = request.body?.getReader();
    let total = 0; const chunks = [];
    if (reader) {
      const deadline = AbortSignal.any([request.signal, AbortSignal.timeout(2000)]);
      const abort = () => { void reader.cancel().catch(() => {}); };
      deadline.addEventListener('abort', abort, {once: true});
      try {
        for (let reads = 0; ; reads++) {
          deadline.throwIfAborted(); if (reads >= 1024) fail('BODY_TOO_LARGE', 413);
          const part = await reader.read(); deadline.throwIfAborted(); if (part.done) break;
          total += part.value.byteLength; if (total > 1024) fail('BODY_TOO_LARGE', 413); chunks.push(part.value);
        }
      } catch (error) { void reader.cancel().catch(() => {}); throw error; }
      finally { deadline.removeEventListener('abort', abort); reader.releaseLock(); }
    }
    let body;
    try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { fail('INVALID_BODY'); }
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length) fail('INVALID_BODY');
  }
  function cleanRedirect(record, message) {
    if (record?.active) record.flash = message;
    return new Response(null, {status: 303, headers: {location: `${origin}/`, 'cache-control': 'no-store',
      'referrer-policy': 'no-referrer', 'x-content-type-options': 'nosniff', 'x-frame-options': 'DENY'}});
  }
  async function authorization(record) {
    const version = record.version, grant = record.grant, walletAddress = record.wallet;
    if (!grant || !walletAddress || record.grantExpiresAt <= now()) fail('APP_LOGIN_REQUIRED', 401);
    const receipt = await client.checkAccess({walletGrant: grant, resourceKey, walletAddress});
    current(record, version);
    if (record.grant !== grant || record.wallet !== walletAddress || record.grantExpiresAt <= now()
      || receipt.decision !== 'ALLOW') fail('APP_ACCESS_DENIED', 403);
    receipt.assertFresh();
    return {receipt, version};
  }
  async function handle(request) {
    if (active >= MAX_ACTIVE) return response({error: {code: 'APP_BUSY'}}, 503);
    active++;
    let callbackRecord;
    try {
      sweep();
      const url = new URL(request.url);
      if (url.origin !== origin || url.href.length > 4096) fail('INVALID_REQUEST');
      if (request.headers.get('origin') !== null && request.headers.get('origin') !== origin) fail('APP_ORIGIN_DENIED', 403);
      const path = url.pathname;
      if (path !== '/api/login/callback' && url.search) fail('INVALID_REQUEST');
      if (path === '/api/session' && request.method === 'GET') {
        let entry, fresh;
        try { entry = findSession(request); }
        catch (error) {
          const token = readCookie(request);
          if (token && sessions.get(hash(token))?.retiredUntil) throw error;
          fresh = newSession(); entry = {record: fresh.record};
        }
        const record = entry.record;
        const flash = record.flash ?? null; record.flash = null;
        return response({authenticated: Boolean(record.grant && record.grantExpiresAt > now()), walletAddress: record.wallet,
          csrfToken: record.csrf, expiresAt: record.expiresAt, appId, resourceKey, message: flash,
          store: 'single-process-local-restart-denies'}, 200, fresh ? {'set-cookie': cookie(fresh.token)} : {});
      }
      if (path === '/api/logout' && request.method === 'POST') {
        const entry = findSession(request, true); await mutation(request, entry);
        if (!entry.record.active || entry.record.expiresAt <= now() || entry.retiredUntil && entry.retiredUntil <= now()) fail('APP_SESSION_CHANGED', 401);
        const grant = invalidate(entry.record); // No await before local invalidation.
        const revoked = await revokeQuietly(grant);
        return response({loggedOut: true, grantRevocationConfirmed: revoked}, 200, {'set-cookie': cookie('', 0)});
      }
      const entry = findSession(request), record = entry.record;
      if (path === '/api/login/start' && request.method === 'POST') {
        const admittedVersion = record.version;
        await mutation(request, entry);
        current(record, admittedVersion);
        if (entry.retiredUntil) fail('APP_SESSION_CHANGED', 401);
        const version = ++record.version, previousGrant = record.grant;
        record.grant = null; record.wallet = null; record.grantExpiresAt = 0;
        const flow = {state: random(), verifier: random(), phase: 'starting', expiresAt: now() + 300000};
        record.pending = flow;
        await revokeQuietly(previousGrant); current(record, version);
        const started = await client.startLogin({redirectUri, state: flow.state,
          codeChallenge: createHash('sha256').update(flow.verifier, 'ascii').digest('base64url'), codeChallengeMethod: 'S256',
          purpose: 'Sign in to this independent PACT licensing example'});
        current(record, version);
        if (record.pending !== flow || started.issuer !== pactOrigin || started.expiresAt <= now()) fail('APP_LOGIN_CHANGED', 401);
        const destination = new URL(started.loginUrl);
        if (destination.origin !== pactOrigin || destination.pathname !== '/connect') fail('APP_LOGIN_INVALID', 401);
        flow.expiresAt = Math.min(flow.expiresAt, started.expiresAt); flow.phase = 'issued';
        return response({loginUrl: destination.href, expiresAt: flow.expiresAt});
      }
      if (path === '/api/login/callback' && request.method === 'GET') {
        callbackRecord = record;
        const keys = [...url.searchParams.keys()];
        const code = url.searchParams.get('code'), state = url.searchParams.get('state'), issuer = url.searchParams.get('iss');
        if (keys.length !== 3 || keys.some(key => !['code', 'state', 'iss'].includes(key))
          || ['code', 'state', 'iss'].some(key => url.searchParams.getAll(key).length !== 1)
          || !/^pact_code_[A-Za-z0-9_-]{43}$/.test(code ?? '') || !TOKEN.test(state ?? '') || issuer !== pactOrigin) fail('APP_CALLBACK_INVALID', 401);
        const flow = record.pending, version = record.version;
        if (!flow || flow.phase !== 'issued' || flow.expiresAt <= now() || !equal(flow.state, state)) fail('APP_LOGIN_CHANGED', 401);
        flow.phase = 'consuming'; // Atomic in this ONE process, before the asynchronous exchange.
        const exchanged = await client.exchangeCode({code, redirectUri, state, codeVerifier: flow.verifier, issuer});
        if (!record.active || record.version !== version || record.pending !== flow || record.expiresAt <= now() || flow.expiresAt <= now()) {
          await revokeQuietly(exchanged.walletGrant); fail('APP_SESSION_CHANGED', 401);
        }
        if (exchanged.appId !== appId || exchanged.issuer !== pactOrigin || exchanged.environment !== 'devnet'
          || exchanged.expiresAt <= now() || !/^pact_grant_[A-Za-z0-9_-]{43}$/.test(exchanged.walletGrant)
          || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(exchanged.walletAddress)) {
          await revokeQuietly(exchanged.walletGrant); fail('APP_LOGIN_INVALID', 401);
        }
        if (sessions.size >= MAX_ENTRIES) { await revokeQuietly(exchanged.walletGrant); fail('APP_CAPACITY', 503); }
        // Rotate the browser's opaque session token. Old alias is logout-only for 10 seconds.
        entry.retiredUntil = now() + 10000;
        record.version++; record.pending = null; record.grant = exchanged.walletGrant; record.wallet = exchanged.walletAddress;
        record.grantExpiresAt = exchanged.expiresAt; record.csrf = random();
        const nextToken = random(); sessions.set(hash(nextToken), {record, csrf: record.csrf, retiredUntil: null});
        const result = cleanRedirect(record, 'Wallet sign-in completed. License access is checked separately on every protected request.');
        result.headers.set('set-cookie', cookie(nextToken, Math.max(1, Math.floor((record.expiresAt - now()) / 1000))));
        return result;
      }
      if (path === '/api/protected' && request.method === 'GET') {
        const {receipt, version} = await authorization(record);
        current(record, version); receipt.assertFresh();
        return response({protected: true, message: 'This premium response was returned only after a fresh server-side ALLOW.',
          resourceKey, requestId: receipt.requestId});
      }
      if (path === '/api/action' && request.method === 'POST') {
        const admittedVersion = record.version;
        await mutation(request, entry);
        current(record, admittedVersion);
        if (entry.retiredUntil) fail('APP_SESSION_CHANGED', 401);
        const {receipt, version} = await authorization(record);
        current(record, version); receipt.assertFresh();
        // Synchronous demonstration effect. Recheck after any async/DB boundary in a real app.
        record.actions++;
        return response({performed: true, actionCount: record.actions, requestId: receipt.requestId});
      }
      return response({error: {code: 'NOT_FOUND'}}, 404);
    } catch (error) {
      if (new URL(request.url).pathname === '/api/login/callback') return cleanRedirect(callbackRecord, 'Sign-in could not be completed. Start a fresh login. Access remains denied.');
      const code = typeof error?.code === 'string' && /^[A-Z][A-Z0-9_]{0,79}$/.test(error.code) ? error.code : 'APP_UNAVAILABLE';
      const status = Number.isInteger(error?.status) && error.status >= 400 && error.status <= 599 ? error.status : 503;
      let purchase;
      if (['LICENSE_REQUIRED', 'EXPIRED'].includes(code) && error.purchase?.url) {
        try { const url = new URL(error.purchase.url); if (url.origin === pactOrigin && url.pathname === '/') purchase = {url: url.href}; } catch { /* No unvalidated navigation. */ }
      }
      return response({error: {code}, ...(purchase ? {purchase} : {})}, status);
    } finally { active--; }
  }
  return Object.freeze({handle, diagnostics: () => ({sessionEntries: sessions.size, active})});
}
