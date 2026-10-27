import {HostedError, isRecord} from './api';

export type Framework = 'rest' | 'express' | 'nextjs' | 'react-backend';
export type Application = {id: string; name: string; description: string; framework: Framework;
  environment: 'devnet'; status: 'draft' | 'active' | 'paused'; policyEpoch: number; createdAt: number; updatedAt: number};
export type AdminSession = {account: {id: string; walletAddress: string}; expiresAt: number};
export type Callback = {id: string; uri: string; websiteOrigin: string; status: 'pending' | 'verified' | 'revoked';
  local: boolean; verifiedUntil: number | null; dnsRecord: string | null};
export type Resource = {resourceKey: string; offerAddress: string; version: number; enabled: boolean;
  createdAt: number; updatedAt: number; verifiedAt: number; contextSlot: number};
export type Credential = {id: string; appId: string; name: string; prefix: string; scopes: string[];
  createdAt: number; expiresAt: number; lastUsedAt: number | null; revokedAt: number | null; rotatedFrom: string | null};
export type SignedAction = {action: string; appId: string; payload: Record<string, unknown>; path: string;
  method?: 'POST' | 'PATCH' | 'DELETE'; title: string; warning?: string};
export type ConsoleControl = {
  request(path: string, options?: {body?: Record<string, unknown>; method?: 'POST' | 'PATCH' | 'DELETE'}): Promise<Record<string, unknown>>;
  review(action: SignedAction): Promise<void>;
  blocked: boolean; canSign: boolean; revision: number; draftOwner: string;
};
export const frameworkLabels: Record<Framework, string> = {
  rest: 'Generic REST / cURL', express: 'Node / Express', nextjs: 'Next.js App Router', 'react-backend': 'React + backend',
};
export const appPath = (id: string) => `/v1/developer/apps/${id}`;
export const dateLabel = (value: number | null) => value === null ? 'Never' : new Date(value).toISOString().replace('T', ' ').replace('.000Z', ' UTC');
export function invalid(): never { throw new HostedError('INVALID_RESPONSE'); }
export function numberValue(value: unknown): value is number { return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0; }
export function parseApp(value: unknown): Application {
  if (!isRecord(value) || typeof value.id !== 'string' || !/^app_[a-f0-9]{32}$/.test(value.id)
    || typeof value.name !== 'string' || !value.name.length || value.name.length > 80
    || typeof value.description !== 'string' || value.description.length > 500
    || typeof value.framework !== 'string' || !Object.hasOwn(frameworkLabels, value.framework)
    || value.environment !== 'devnet' || typeof value.status !== 'string' || !['draft', 'active', 'paused'].includes(value.status)
    || !numberValue(value.policyEpoch) || !numberValue(value.createdAt) || !numberValue(value.updatedAt)) invalid();
  return value as Application;
}
export function parseList<T>(value: unknown, parse: (item: unknown) => T): T[] {
  if (!Array.isArray(value) || value.length > 1000) invalid();
  return value.map(parse);
}
export function consoleError(error: unknown): string {
  if (!(error instanceof HostedError)) return 'The wallet request was refused, cancelled, or interrupted. Review a new message before trying again.';
  const fixed: Record<string, string> = {
    AUTH_INVALID: 'Your developer session expired or changed. Sign in again.',
    AUTH_REQUIRED: 'Your developer session expired or changed. Sign in again.',
    WALLET_PROOF_INVALID: 'Wallet proof was rejected. Review a fresh message before retrying.',
    ACTION_PROOF_INVALID: 'The action proof expired or was already used. Reload records and review a new action.',
    RESOURCE_VERSION_CONFLICT: 'This resource changed. Reload its latest version and review your changes again.',
    DOMAIN_PROOF_INVALID: 'The expected DNS TXT proof was not found. Check the exact record and allow DNS propagation before retrying.',
    DOMAIN_PROOF_EXPIRED: 'This DNS proof expired. Renew the proof before verifying it.',
    OFFER_SELLER_MISMATCH: 'This offer does not belong to your proven admin wallet.',
    OFFER_OWNERSHIP_REQUIRED: 'This offer does not belong to your proven admin wallet.',
    OFFER_INACTIVE: 'This offer is inactive. Select an active seller-owned offer for a new binding or enable operation. Existing unexpired entitlements retain their established behavior.',
    CREDENTIAL_QUOTA: 'The app has reached its active-key limit. Revoke an unused key or review zero-overlap rotation before creating another.',
    SELLER_CONTROL_REQUIRED: 'This offer does not belong to your proven admin wallet.',
    INVALID_INPUT: 'Check the entered values. The server rejected this request.',
    NOT_FOUND: 'This record is missing or is not available to your account. Reload your applications.',
    INVALID_RESPONSE: 'The service response could not be safely validated. Reload before trying again.',
    ORIGIN_DENIED: 'The console origin was rejected. Check the local service origin configuration.',
    CSRF_DENIED: 'The browser binding changed. Reload your developer session.',
    HOSTED_API_NOT_CONFIGURED: 'The hosted service is not configured here. Start the local API and its fixed gateway configuration.',
  };
  const message = fixed[error.code] ?? (error.code.includes('QUOTA') || error.code.includes('LIMIT') || error.code.includes('OVERLOAD')
    ? 'The service limit was reached. Wait before retrying; no success is assumed.'
    : 'The service could not complete this request. Reload records before retrying an uncertain mutation.');
  return message + (error.requestId ? ` Request ID: ${error.requestId}` : '');
}
