import type {LicenseStatus} from './index.js';
import type {OfferInfo} from './checkout.js';
export type PlatformErrorCode = 'INVALID_INPUT'|'WRONG_NETWORK'|'RPC_ERROR'|'TIMEOUT'|'INVALID_ACCOUNT'|'STALE'|'LICENSE_REQUIRED'|'METADATA_UNAVAILABLE'|'AUTH_REQUIRED'|'AUTH_UNAVAILABLE'|'AUTH_INVALID'|'FORBIDDEN'|'RATE_LIMITED'|'BODY_TOO_LARGE'|'OFFER_INACTIVE'|'ALREADY_LICENSED'|'NOT_CONFIGURED'|'NOT_FOUND'|'INTERNAL_ERROR'|'BUSY';
export type ApiErrorBody = {error:{code:string;message:string}};
export type PublicLicenseResult = {
 network:'devnet';program:string;offerAddress:string;walletAddress:string;valid:boolean;
 state:'active'|'expired'|'missing';expiration:string|null;verifiedAt:string;
 reason:'VALID'|'EXPIRED'|'MISSING';walletControlProven:false;authorized:false;
 freshness:{verifiedAtMs:number;maxAgeMs:number;contextSlot:number;chainTimestamp:string};status:LicenseStatus;
};
export type PreparedOfferResponse = {network:'devnet';programId:string;seller:string;nonce:string;offer:string;transactionBase64:string;blockhash:string;lastValidBlockHeight:number;termsHash:string;priceLamports:string;durationSeconds:string};
export type PreparedCheckoutResponse = {network:'devnet';programId:string;quote:OfferInfo;buyer:string;licensePda:string;transactionBase64:string;blockhash:string;lastValidBlockHeight:number};
export type WalletChallenge = {challengeId:string;message:string;expiresAt:number};
export type WalletSession = {authenticated:boolean;walletAddress?:string;expiresAt?:number};
export type AuthenticatedSession = {authenticated:true;walletAddress:string;expiresAt:number};
export type ProtectedResult = {authorized:true;walletAddress:string;offerAddress:string;expiresAt:string;payload:string;verification:PublicLicenseResult};
export type VerifiedMetadata = {available:true;offerAddress:string;metadataJson:string;title:string;terms:string;verifiedAt:string};
export type MetadataUnavailable = {available:false;offerAddress:string;reason:'METADATA_UNAVAILABLE'};
export type TransactionStatus = {network:'devnet';signature:string;state:'not-found'|'processed'|'confirmed'|'finalized'|'failed';slot:number|null;error:unknown};
