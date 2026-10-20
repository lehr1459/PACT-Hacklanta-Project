export class ConsumerRequestError extends Error {
  constructor() { super('INVALID_CONSUMER_HOST'); this.code = 'INVALID_CONSUMER_HOST'; }
}

/**
 * Next16.4 NextURL rewrites 127.0.0.1/[::1] to localhost. Its server can also derive
 * an internal URL from listener/forwarded metadata. Neither URL authority is the
 * browser's trusted issuer: require the actual Host to match the fixed operator
 * origin, then carry only path/query and the original Origin/CSRF into the engine.
 */
export function normalizeConsumerRequest(request, origin) {
  const configured = new URL(origin);
  if (configured.origin !== origin || request.headers.get('host') !== configured.host || request.url.length > 4096) {
    throw new ConsumerRequestError();
  }
  const internal = new URL(request.url);
  if (internal.username || internal.password || internal.hash) throw new ConsumerRequestError();
  const headers = new Headers();
  for (const name of ['cookie', 'origin', 'x-pact-csrf', 'content-type', 'content-length']) {
    const value = request.headers.get(name); if (value !== null) headers.set(name, value);
  }
  // Concatenation cannot reinterpret a //path as another authority.
  return new Request(origin + internal.pathname + internal.search, {
    method: request.method, headers, signal: request.signal,
    ...(!['GET', 'HEAD'].includes(request.method) && request.body ? {body: request.body, duplex: 'half'} : {}),
  });
}
