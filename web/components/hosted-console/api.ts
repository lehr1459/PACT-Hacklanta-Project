export type HostedEnvelope = Record<string, unknown> & {schemaVersion: 1; requestId: string};

export class HostedError extends Error {
  constructor(public readonly code: string, public readonly requestId?: string) {
    super(code);
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Browser control/connect requests only. Backend keys and grants never belong here. */
export async function browserRequest(path: string, {body, csrf, signal}: {
  body?: Record<string, unknown>; csrf?: string; signal: AbortSignal;
}): Promise<HostedEnvelope> {
  if (!/^\/v1\/(?:connect|developer)\/[A-Za-z0-9_/-]+$/.test(path)) throw new HostedError('INVALID_RESPONSE');
  let response: Response;
  try {
    response = await fetch(path, {method: body ? 'POST' : 'GET', credentials: 'same-origin',
      cache: 'no-store', redirect: 'error', signal,
      headers: {accept: 'application/json', ...(body ? {'content-type': 'application/json'} : {}),
        ...(csrf ? {'x-pact-csrf': csrf} : {})}, ...(body ? {body: JSON.stringify(body)} : {})});
  } catch (error) {
    if (signal.aborted) throw error;
    throw new HostedError('HOSTED_API_UNAVAILABLE');
  }
  let data: unknown;
  try { data = await response.json(); } catch { throw new HostedError('INVALID_RESPONSE'); }
  if (!isRecord(data) || data.schemaVersion !== 1 || typeof data.requestId !== 'string'
    || !/^[A-Za-z0-9_-]{1,100}$/.test(data.requestId)) throw new HostedError('INVALID_RESPONSE');
  if (!response.ok) {
    const code = isRecord(data.error) && typeof data.error.code === 'string'
      && /^[A-Z][A-Z0-9_]{0,79}$/.test(data.error.code) ? data.error.code : 'HOSTED_API_UNAVAILABLE';
    throw new HostedError(code, data.requestId);
  }
  return data as HostedEnvelope;
}

export function friendlyConnectError(error: unknown): string {
  if (!(error instanceof HostedError)) return 'The wallet request was cancelled or could not complete. Access remains denied. Try again when ready.';
  if (['LOGIN_INVALID', 'WALLET_PROOF_INVALID', 'CALLBACK_UNAVAILABLE'].includes(error.code)) {
    return 'This sign-in has expired, was already used, or is no longer available. Return to the requesting application and start again.';
  }
  if (['ORIGIN_INVALID', 'CSRF_INVALID', 'ORIGIN_DENIED', 'CSRF_DENIED', 'INVALID_RESPONSE'].includes(error.code)) {
    return 'PACT could not safely validate this sign-in. Return to the requesting application and start again.';
  }
  if (error.code.includes('QUOTA') || error.code.includes('LIMIT') || error.code.includes('OVERLOAD')) {
    return 'Sign-in is temporarily busy. Wait briefly before retrying. Access remains denied.';
  }
  return 'The PACT sign-in service is unavailable. Access remains denied. Retry or return to the requesting application.';
}
