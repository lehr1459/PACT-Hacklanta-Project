export interface Envelope { readonly schemaVersion:1; readonly requestId:string }
export interface Grant extends Envelope { readonly walletGrant:string; readonly walletAddress:string; readonly appId:string; readonly environment:'devnet'; readonly expiresAt:number; readonly issuer:string }
export interface LoginInput {redirectUri:string;state:string;codeChallenge:string;codeChallengeMethod:'S256';purpose:string}
export interface ExchangeInput {code:string;redirectUri:string;state:string;codeVerifier:string;issuer:string}
export interface Receipt extends Envelope {
 readonly decision:'ALLOW'; readonly reason:'ACTIVE_LICENSE'; readonly appId:string; readonly resourceKey:string; readonly resourceVersion:number; readonly policyEpoch:string;
 readonly offerAddress:string; readonly walletAddress:string; readonly network:'solana-devnet'; readonly programId:string; readonly expiresAt:string; readonly verifiedAt:string; readonly contextSlot:number; readonly chainTimestamp:string;
 readonly freshness:Readonly<{readStartedAtMs:number;receivedAtMs:number;lastProgressAtMs:number;verifiedAtMs:number;maxAgeMs:8000;maxProgressAgeMs:12000;validUntilMs:number}>;
 assertFresh():void;
}
export class PactError extends Error {readonly code:string;readonly status:number;readonly requestId?:string;readonly purchase?:Readonly<{url:string;metadata:'SELLER_EXACT_BYTES_REQUIRED'}>}
export function createPactClient(options:{origin:string;apiKey:string;appId:string;timeoutMs?:number}):Readonly<{
 validateCredential():Promise<Envelope & {readonly valid:true;readonly appId:string;readonly credentialId:string;readonly environment:'devnet';readonly scopes:readonly ('access:check'|'connect:write')[]}>;
 startLogin(input:LoginInput):Promise<Envelope & {readonly transactionId:string;readonly loginUrl:string;readonly expiresAt:number;readonly issuer:string}>;
 exchangeCode(input:ExchangeInput):Promise<Grant>;
 revokeGrant(input:{walletGrant:string}):Promise<Envelope & {readonly revoked:true}>;
 checkAccess(input:{walletGrant:string;resourceKey:string;walletAddress:string}):Promise<Receipt>;
}>;
