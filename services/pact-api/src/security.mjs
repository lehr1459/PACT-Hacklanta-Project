import {createHash, createHmac, randomBytes, timingSafeEqual, createPublicKey, verify} from 'node:crypto';

export const PROGRAM = 'EiiiWWsW2kkqP6nugHz6iBADvhnW5xnibAtZ82ZExVqy';
export const GENESIS = 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG';
export const SCOPES = ['access:check', 'connect:write'];
export class ApiError extends Error {
  constructor(code, status = 400) { super(code); this.code = code; this.status = status; }
}
export const fail = (code, status) => { throw new ApiError(code, status); };
export const random = () => randomBytes(32).toString('base64url');
export const id = prefix => `${prefix}_${randomBytes(16).toString('hex')}`;
export const digest = value => createHash('sha256').update(value).digest('hex');
export const keyed = (pepper, purpose, value) => createHmac('sha256', pepper).update(`${purpose}\0${value}`).digest('hex');
export function equal(a, b) {
  return typeof a === 'string' && typeof b === 'string' && Buffer.byteLength(a) === Buffer.byteLength(b)
    && timingSafeEqual(Buffer.from(a), Buffer.from(b));
}
export function token(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value)
    && Buffer.from(value, 'base64url').length === 32 && Buffer.from(value, 'base64url').toString('base64url') === value;
}
export function canonical(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isSafeInteger(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && Object.getPrototypeOf(value) === Object.prototype) {
    return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
  }
  fail('INVALID_INPUT');
}
const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
export function walletBytes(wallet) {
  if (typeof wallet !== 'string' || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(wallet)) fail('INVALID_WALLET');
  let value = 0n;
  for (const char of wallet) value = value * 58n + BigInt(alphabet.indexOf(char));
  const hex = value ? value.toString(16).padStart(Math.ceil(value.toString(16).length / 2) * 2, '0') : '';
  const bytes = Buffer.concat([Buffer.alloc(wallet.length - wallet.replace(/^1+/, '').length), Buffer.from(hex, 'hex')]);
  if (bytes.length !== 32) fail('INVALID_WALLET');
  return bytes;
}
export function signatureValid(wallet, message, signatureBase64) {
  try {
    if (typeof signatureBase64 !== 'string' || !/^[A-Za-z0-9+/]{86}==$/.test(signatureBase64)) return false;
    const bytes = Buffer.from(signatureBase64, 'base64');
    if (bytes.length !== 64 || bytes.toString('base64') !== signatureBase64) return false;
    const key = createPublicKey({key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), walletBytes(wallet)]), format: 'der', type: 'spki'});
    return verify(null, Buffer.from(message, 'utf8'), key, bytes);
  } catch { return false; }
}
export function message({origin, wallet, purpose, challengeId, binding, issuedAt, expiresAt, appId = '-', payloadHash = '-'}) {
  return ['PACT hosted wallet proof v1', `Issuer: ${origin}`, `Origin: ${origin}`,
    `Purpose: ${purpose}`, `Application: ${appId}`, 'Environment: devnet',
    `Genesis: ${GENESIS}`, `Program: ${PROGRAM}`, `Wallet: ${wallet}`,
    `Challenge: ${challengeId}`, `Browser/session binding: ${binding}`,
    `Payload SHA256: ${payloadHash}`, `Issued at: ${issuedAt}`, `Expires at: ${expiresAt}`,
    'This proves wallet control for the stated purpose. No transaction or purchase.'].join('\n');
}
export function origin(value) {
  try {
    const parsed = new URL(value);
    if (parsed.origin !== value || parsed.username || parsed.password || parsed.protocol !== 'https:'
      && !(parsed.protocol === 'http:' && ['localhost','127.0.0.1','[::1]'].includes(parsed.hostname))) throw Error();
    return value;
  } catch { fail('INVALID_ORIGIN'); }
}
export function callback(uri, websiteOrigin, localAllowed) {
  try {
    if (typeof uri !== 'string' || uri.length > 2048 || /[\s\\%*]/u.test(uri)) throw Error();
    const url = new URL(uri);
    if (url.href !== uri || url.username || url.password || url.hash || url.search) throw Error();
    if (origin(websiteOrigin) !== url.origin) throw Error();
    const local = ['localhost','127.0.0.1','[::1]'].includes(url.hostname);
    if (local && !localAllowed || !local && (url.protocol !== 'https:' || !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z][a-z0-9-]+$/.test(url.hostname)
      || url.hostname.endsWith('.localhost') || url.hostname.endsWith('.local') || url.hostname.endsWith('.internal'))) throw Error();
    return {uri, websiteOrigin, hostname: url.hostname, local};
  } catch { fail('INVALID_CALLBACK'); }
}
export function strict(value, required, optional = []) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || required.some(k => !Object.hasOwn(value, k))
    || Object.keys(value).some(k => ![...required,...optional].includes(k))) fail('INVALID_INPUT');
  return value;
}
export function text(value, max = 80, min = 1) {
  if (typeof value !== 'string' || value.length < min || value.length > max || value.trim() !== value
    || /[\u0000-\u001f\u007f]/u.test(value)) fail('INVALID_INPUT');
  return value;
}
