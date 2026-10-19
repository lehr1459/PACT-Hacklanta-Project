import {DEVNET_GENESIS, PACT_PROGRAM_ID} from '@pact/sdk';
import {HostedError, isRecord} from './api';

export type ReviewedProof = {challengeId: string; message: string; expiresAt: number};
export function canonicalPayload(value: unknown): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean'
    || typeof value === 'number' && Number.isSafeInteger(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalPayload).join(',')}]`;
  if (isRecord(value)) return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalPayload(value[key])}`).join(',')}}`;
  throw new HostedError('INVALID_RESPONSE');
}
export async function payloadDigest(payload: Record<string, unknown>): Promise<string> {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalPayload(payload)))))
    .map(byte => byte.toString(16).padStart(2, '0')).join('');
}
export function validateProof(value: Record<string, unknown>, {wallet, purpose, appId = '-', payloadHash = '-'}: {
  wallet: string; purpose: string; appId?: string; payloadHash?: string;
}): ReviewedProof {
  const {challengeId, message, expiresAt} = value;
  if (typeof challengeId !== 'string' || !(purpose === 'developer-admin-login' ? /^adm_[a-f0-9]{32}$/ : /^act_[a-f0-9]{32}$/).test(challengeId)
    || typeof message !== 'string' || message.length > 8192 || typeof expiresAt !== 'number'
    || !Number.isSafeInteger(expiresAt) || expiresAt <= Date.now() || expiresAt > Date.now() + 121000) throw new HostedError('INVALID_RESPONSE');
  const lines = message.split('\n');
  const issued = /^Issued at: ([1-9][0-9]*)$/.exec(lines[12] ?? '');
  if (lines.length !== 15 || lines[0] !== 'PACT hosted wallet proof v1'
    || lines[1] !== `Issuer: ${window.location.origin}` || lines[2] !== `Origin: ${window.location.origin}`
    || lines[3] !== `Purpose: ${purpose}` || lines[4] !== `Application: ${appId}`
    || lines[5] !== 'Environment: devnet' || lines[6] !== `Genesis: ${DEVNET_GENESIS}`
    || lines[7] !== `Program: ${PACT_PROGRAM_ID}` || lines[8] !== `Wallet: ${wallet}`
    || lines[9] !== `Challenge: ${challengeId}` || !/^Browser\/session binding: [a-f0-9]{64}$/.test(lines[10])
    || lines[11] !== `Payload SHA256: ${payloadHash}` || !issued || !Number.isSafeInteger(Number(issued[1]))
    || Number(issued[1]) > expiresAt || lines[13] !== `Expires at: ${expiresAt}`
    || lines[14] !== 'This proves wallet control for the stated purpose. No transaction or purchase.'
    || payloadHash !== '-' && value.payloadHash !== payloadHash) throw new HostedError('INVALID_RESPONSE');
  return {challengeId, message, expiresAt};
}
