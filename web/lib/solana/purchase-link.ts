import { Buffer } from 'buffer';
import { parseMetadata, parsePublicKey } from './protocol';

export const PURCHASE_LINK_MAX_LENGTH = 2048;
export const PURCHASE_LINK_METADATA_MAX_BYTES = 1024;
const VERSION = 'v1';
const blockedSettings = /^(?:rpc|rpcUrl|program|programId|network|cluster|wallet|buyer|privateKey|seed)$/i;
const rawUrlControls = /[\u0000-\u0020\u007f]/;
// The existing browser Buffer polyfill supports base64, not Node's base64url
// encoding name. Keep the wire format identical in both browser and Node.
function base64url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function supportedLocation(url: URL) {
  return !url.username && !url.password && (url.protocol === 'https:' ||
    (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)));
}

export type PurchaseLinkResult =
  | { ok: true; url: string }
  | { ok: false; error: string };
export type ParsedPurchaseLink =
  | { kind: 'none' }
  | { kind: 'offer-only'; offer: string }
  | { kind: 'complete'; offer: string; metadata: string }
  | { kind: 'invalid'; error: string; offer?: string };

function publicOrigin(value: string): string | undefined {
  try {
    if (rawUrlControls.test(value)) return;
    const url = new URL(value);
    if (url.pathname !== '/' || url.search || url.hash || !supportedLocation(url)) return;
    return url.origin;
  } catch { return; }
}

/** Preserve the exact string bytes committed on chain; never serialize parsed JSON here. */
export function encodePurchaseLink(input: { origin: string; offer: string; metadata: string }): PurchaseLinkResult {
  const origin = publicOrigin(input.origin);
  if (!origin) return { ok: false, error: 'Use the PACT HTTPS origin or a local preview to create a purchase link.' };
  if (!parsePublicKey(input.offer)) return { ok: false, error: 'A canonical Solana offer address is required.' };
  // A UTF-16 code-unit bound prevents allocating an arbitrarily large payload first.
  if (input.metadata.length > PURCHASE_LINK_METADATA_MAX_BYTES) return { ok: false, error: 'Metadata is too large for a purchase link. Use the manual JSON workflow.' };
  const bytes = new TextEncoder().encode(input.metadata);
  if (bytes.length > PURCHASE_LINK_METADATA_MAX_BYTES) return { ok: false, error: 'Metadata exceeds the 1 KiB purchase-link limit. Use the manual JSON workflow.' };
  if (new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes) !== input.metadata || !parseMetadata(input.metadata)) {
    return { ok: false, error: 'A purchase link requires valid license metadata with exact UTF-8 text.' };
  }
  const url = `${origin}/?offer=${input.offer}#pact=${VERSION}&metadata=${base64url(bytes)}`;
  if (url.length > PURCHASE_LINK_MAX_LENGTH) return { ok: false, error: 'The complete purchase link exceeds 2,048 characters. Use the manual JSON workflow.' };
  return { ok: true, url };
}

/** Decode untrusted public data only. On-chain matching and consent remain the buyer's responsibility. */
export function parsePurchaseLink(href: string): ParsedPurchaseLink {
  if (href.length > PURCHASE_LINK_MAX_LENGTH) return { kind: 'invalid', error: 'This purchase link is too large. Use the manual JSON workflow.' };
  if (rawUrlControls.test(href)) return { kind: 'invalid', error: 'This purchase link contains unescaped whitespace or control characters.' };
  let url: URL;
  try { url = new URL(href); } catch { return { kind: 'invalid', error: 'This purchase link is not a valid URL. Use the manual offer and metadata fields.' }; }
  if (!supportedLocation(url)) return { kind: 'invalid', error: 'Use an HTTPS PACT purchase link or a local preview URL.' };
  const fragment = new URLSearchParams(url.hash.slice(1));
  const query = url.searchParams;
  const suppliedOffer = query.get('offer');
  const offer = suppliedOffer && parsePublicKey(suppliedOffer) ? suppliedOffer : undefined;
  const invalid = (error: string): ParsedPurchaseLink => ({ kind: 'invalid', error, ...(offer ? { offer } : {}) });
  const hasPayload = fragment.has('pact') || fragment.has('metadata') || query.has('pact') || query.has('metadata');
  if (!hasPayload) {
    if (!query.has('offer')) return { kind: 'none' };
    if (query.getAll('offer').length !== 1 || !offer) return invalid('The offer address in this link is invalid. Enter a canonical Solana address manually.');
    return { kind: 'offer-only', offer };
  }
  if (/%(?![\da-f]{2})/i.test(url.search + url.hash)) return invalid('This purchase link contains malformed URL encoding. Use the manual JSON workflow.');
  if (query.has('pact') || query.has('metadata')) return invalid('Purchase-link metadata must use the supported versioned link format. Use the manual JSON workflow.');
  if (query.getAll('offer').length !== 1 || !offer) return invalid('A complete purchase link requires one valid Solana offer address.');
  if ([...query.keys()].some(key => blockedSettings.test(key)) || [...fragment.keys()].some(key => !['pact', 'metadata'].includes(key))) {
    return invalid('Purchase links cannot change network, program, wallet, or other application settings.');
  }
  if (fragment.getAll('pact').length !== 1 || fragment.get('pact') !== VERSION || fragment.getAll('metadata').length !== 1) {
    return invalid('This purchase link has missing, duplicate, or unsupported metadata parameters.');
  }
  const payload = fragment.get('metadata')!;
  if (!payload || payload.length > Math.ceil(PURCHASE_LINK_METADATA_MAX_BYTES * 4 / 3) || !/^[A-Za-z0-9_-]+$/.test(payload) || payload.length % 4 === 1) {
    return invalid('The encoded license metadata is invalid or too large. Use the manual JSON workflow.');
  }
  try {
    const standard = payload.replace(/-/g, '+').replace(/_/g, '/');
    const bytes = Buffer.from(standard + '='.repeat((4 - standard.length % 4) % 4), 'base64');
    if (bytes.length > PURCHASE_LINK_METADATA_MAX_BYTES || base64url(bytes) !== payload) return invalid('License metadata encoding is not canonical or exceeds the supported size.');
    const metadata = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
    if (!parseMetadata(metadata)) return invalid('The link does not contain valid PACT license metadata. Use the manual JSON workflow.');
    return { kind: 'complete', offer, metadata };
  } catch { return invalid('License metadata could not be decoded as UTF-8. Use the manual JSON workflow.'); }
}
