import {randomUUID} from 'node:crypto';

const REQUEST_LIMIT = 16384;
const RESPONSE_LIMIT = 131072;
const REQUEST_HEADERS = ['authorization', 'cookie', 'origin', 'x-pact-csrf', 'content-type', 'accept'];
const RESPONSE_HEADERS = ['content-type', 'x-pact-request-id', 'referrer-policy', 'x-content-type-options', 'x-frame-options', 'content-security-policy'];

function upstreamOrigin(value) {
  try {
    const url = new URL(value);
    if (url.origin !== value || url.username || url.password || url.protocol !== 'https:'
      && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) throw Error();
    return url.origin;
  } catch { return null; }
}

async function boundedBytes(body, limit, signal) {
  if (!body) return new Uint8Array();
  const reader = body.getReader();
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener('abort', cancel, {once: true});
  const chunks = [];
  let size = 0;
  try {
    for (let reads = 0; ; reads++) {
      if (reads >= 4096) { cancel(); throw new RangeError('BODY_LIMIT'); }
      signal.throwIfAborted();
      const part = await reader.read();
      signal.throwIfAborted();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > limit) { cancel(); throw new RangeError('BODY_LIMIT'); }
      chunks.push(part.value);
    }
    const result = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength; }
    return result;
  } finally {
    signal.removeEventListener('abort', cancel);
    reader.releaseLock();
  }
}

/**
 * Fixed operator-configured upstream only. No caller-controlled host, redirects or forwarding headers.
 * @param {Request} request
 * @param {{upstream?: string, fetchImpl?: typeof globalThis.fetch, deadlineMs?: number}} [options]
 */
export async function proxyHostedRequest(request, {upstream, fetchImpl = globalThis.fetch, deadlineMs = 8000} = {}) {
  const requestId = randomUUID();
  const failure = (code, status) => Response.json({schemaVersion: 1, requestId, error: {code, message: code}}, {
    status, headers: {'cache-control': 'no-store', 'referrer-policy': 'no-referrer',
      'x-content-type-options': 'nosniff', 'x-frame-options': 'DENY', 'x-pact-request-id': requestId},
  });
  const target = upstreamOrigin(upstream);
  if (!target) return failure('HOSTED_API_NOT_CONFIGURED', 503);
  const url = new URL(request.url);
  if (url.search || url.href.length > 4096 || !/^\/v1(?:\/[A-Za-z0-9_-]+){1,8}$/.test(url.pathname)) {
    return failure('INVALID_INPUT', 400);
  }
  if (!['GET', 'POST', 'PATCH', 'DELETE'].includes(request.method)) return failure('METHOD_NOT_ALLOWED', 405);
  if (!Number.isSafeInteger(deadlineMs) || deadlineMs < 1 || deadlineMs > 10000) return failure('HOSTED_API_UNAVAILABLE', 503);
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(deadlineMs)]);
  let response;
  try {
    const length = request.headers.get('content-length');
    if (length !== null && (!/^\d+$/.test(length) || Number(length) > REQUEST_LIMIT)) return failure('BODY_TOO_LARGE', 413);
    let bytes;
    try { bytes = await boundedBytes(request.body, REQUEST_LIMIT, signal); }
    catch (error) { if (error instanceof RangeError) return failure('BODY_TOO_LARGE', 413); throw error; }
    if (request.method === 'GET' && bytes.byteLength) return failure('INVALID_INPUT', 400);
    const headers = new Headers();
    for (const name of REQUEST_HEADERS) {
      const value = request.headers.get(name);
      if (value !== null) headers.set(name, value);
    }
    // URL concatenation follows a strict path grammar, never URL resolution of an untrusted authority.
    response = await fetchImpl(target + url.pathname, {
      method: request.method, headers, body: request.method === 'GET' ? undefined : bytes,
      redirect: 'error', cache: 'no-store', signal,
    });
    const returnedHeaders = new Headers({'cache-control': 'no-store'});
    for (const name of RESPONSE_HEADERS) {
      const value = response.headers.get(name);
      if (value !== null) returnedHeaders.set(name, value);
    }
    for (const cookie of response.headers.getSetCookie()) returnedHeaders.append('set-cookie', cookie);
    if (response.status === 204) return new Response(null, {status: 204, headers: returnedHeaders});
    if (response.status < 200 || response.status >= 300 && response.status < 400
      || !/^application\/json(?:;|$)/i.test(response.headers.get('content-type') ?? '')) throw Error();
    const body = await boundedBytes(response.body, RESPONSE_LIMIT, signal);
    return new Response(body, {status: response.status, headers: returnedHeaders});
  } catch {
    try { if (response?.body && !response.body.locked) void response.body.cancel().catch(() => {}); } catch { /* Secret-safe failure. */ }
    return failure('HOSTED_API_UNAVAILABLE', 503);
  }
}
