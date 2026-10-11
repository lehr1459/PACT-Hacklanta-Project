import { PublicKey, SystemProgram, TransactionInstruction } from '@solana/web3.js';
import { Buffer } from 'buffer';
import { keccak256, toBytes } from 'viem';
import wire from '../../../solana/wire-spec.json';
export const DEVNET_GENESIS = 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG';
export const CLOCK_ADDRESS = new PublicKey('SysvarC1ock11111111111111111111111111111111');
export const SYSVAR_OWNER = 'Sysvar1111111111111111111111111111111111111';
export const METADATA_MAX_BYTES = 65536;
export const MAX_DURATION = BigInt(wire.maximumDurationSeconds);
export const U64_MAX = 18446744073709551615n;
export const OFFER_DISCRIMINATOR = wire.accounts.offer.discriminatorHex;
export const LICENSE_DISCRIMINATOR = wire.accounts.license.discriminatorHex;
export function parsePublicKey(value: string): PublicKey | undefined {try {const key = new PublicKey(value); return key.toBase58() === value ? key : undefined;} catch {return;}}
export function u64(value: bigint): Buffer {if (value < 0n || value > U64_MAX) throw new Error('Value is outside the u64 range.'); const bytes = Buffer.alloc(8); bytes.writeBigUInt64LE(value); return bytes;}
// Encode the public transaction signature without adding a wallet/key dependency.
export function signatureBase58(signature: Uint8Array): string {
  if (signature.length !== 64 || signature.every(byte=>byte===0)) throw new Error('The wallet returned an invalid transaction signature.');
  const alphabet='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let value=0n;for(const byte of signature)value=(value<<8n)+BigInt(byte);
  let encoded='';while(value>0n){encoded=alphabet[Number(value%58n)]+encoded;value/=58n;}
  for(const byte of signature){if(byte!==0)break;encoded='1'+encoded;}
  return encoded;
}
export function deriveOffer(program: PublicKey, seller: PublicKey, nonce: bigint) {return PublicKey.findProgramAddressSync([Buffer.from('offer'), seller.toBuffer(), u64(nonce)], program);}
export function deriveLicense(program: PublicKey, offer: PublicKey, buyer: PublicKey) {return PublicKey.findProgramAddressSync([Buffer.from('license'), offer.toBuffer(), buyer.toBuffer()], program);}
export type SolanaOffer = {address: PublicKey; seller: PublicKey; nonce: bigint; priceLamports: bigint; durationSeconds: bigint; termsHash: string; active: boolean; bump: number};
export function decodeOffer(data: Uint8Array, program: PublicKey, address: PublicKey): SolanaOffer {
  const bytes = Buffer.from(data);
  if (bytes.length !== wire.accounts.offer.size || bytes.subarray(0,8).toString('hex') !== OFFER_DISCRIMINATOR) throw new Error('Offer account has an invalid layout or discriminator.');
  const seller = new PublicKey(bytes.subarray(8,40)); const nonce = bytes.readBigUInt64LE(40);
  const [expected, bump] = deriveOffer(program, seller, nonce);
  if (!expected.equals(address) || bytes[97] !== bump) throw new Error('Offer PDA does not match its seller and nonce.');
  const priceLamports = bytes.readBigUInt64LE(48); const durationSeconds = bytes.readBigUInt64LE(56);
  if (priceLamports === 0n || durationSeconds < 1n || durationSeconds > MAX_DURATION || bytes[96] > 1 || bytes.subarray(64,96).every(byte => byte === 0)) throw new Error('Offer parameters are invalid.');
  return {address, seller, nonce, priceLamports, durationSeconds, termsHash: '0x' + bytes.subarray(64,96).toString('hex'), active: bytes[96] === 1, bump};
}
export function decodeLicense(data: Uint8Array, program: PublicKey, address: PublicKey, offer: PublicKey, buyer: PublicKey): bigint {
  const bytes = Buffer.from(data); const [expected, bump] = deriveLicense(program, offer, buyer);
  if (bytes.length !== wire.accounts.license.size || bytes.subarray(0,8).toString('hex') !== LICENSE_DISCRIMINATOR || !new PublicKey(bytes.subarray(8,40)).equals(offer) || !new PublicKey(bytes.subarray(40,72)).equals(buyer) || !expected.equals(address) || bytes[80] !== bump) throw new Error('License identity, PDA, or layout is invalid.');
  const expiry = bytes.readBigInt64LE(72); if (expiry < 0n) throw new Error('License expiry is invalid.'); return expiry;
}
export function parseLamports(value: string): bigint | undefined {
  if (!/^\d{1,20}(\.\d{1,9})?$/.test(value)) return;
  const [whole, fraction=''] = value.split('.'); const lamports = BigInt(whole) * 1000000000n + BigInt(fraction.padEnd(9,'0'));
  return lamports > 0n && lamports <= U64_MAX ? lamports : undefined;
}
export function formatSol(lamports: bigint) {return `${lamports / 1000000000n}.${(lamports % 1000000000n).toString().padStart(9,'0')}`.replace(/\.?0+$/, '');}
export function formatExpiry(expiry: bigint) {const ms=expiry*1000n;return expiry <= 0n ? 'No license recorded' : ms <= 8640000000000000n ? new Date(Number(ms)).toLocaleString() : `Unix seconds ${expiry}`;}
export type SolanaMetadata = {schema: 'pact-solana-license-v1'; title: string; terms: string; priceLamports: string; durationSeconds: string};
export function metadataWithinLimit(value: string) {return new TextEncoder().encode(value).length <= METADATA_MAX_BYTES;}
export function parseMetadata(value: string): SolanaMetadata | undefined {
  if (!metadataWithinLimit(value)) return;
  try {
    const item = JSON.parse(value) as Partial<SolanaMetadata> | null;
    if (!item || item.schema !== 'pact-solana-license-v1' || typeof item.title !== 'string' || !item.title.trim() || typeof item.terms !== 'string' || !item.terms.trim() || typeof item.priceLamports !== 'string' || !/^\d{1,20}$/.test(item.priceLamports) || BigInt(item.priceLamports) < 1n || BigInt(item.priceLamports) > U64_MAX || typeof item.durationSeconds !== 'string' || !/^\d{1,8}$/.test(item.durationSeconds) || BigInt(item.durationSeconds) < 1n || BigInt(item.durationSeconds) > MAX_DURATION) return;
    return item as SolanaMetadata;
  } catch {return;}
}
export function metadataHash(value: string) {return keccak256(toBytes(value));}
export function metadataMatches(value: string, offer?: SolanaOffer) {const item=parseMetadata(value);return Boolean(item && offer && metadataHash(value) === offer.termsHash && item.priceLamports === offer.priceLamports.toString() && BigInt(item.durationSeconds) === offer.durationSeconds);}
export function createOfferInstruction(program: PublicKey, seller: PublicKey, nonce: bigint, price: bigint, duration: bigint, hash: string) {
  if (price < 1n || duration < 1n || duration > MAX_DURATION || !/^0x[0-9a-f]{64}$/i.test(hash) || /^0x0{64}$/.test(hash)) throw new Error('Invalid offer parameters.');
  const [offer] = deriveOffer(program,seller,nonce);
  return new TransactionInstruction({programId: program, keys: [{pubkey:seller,isSigner:true,isWritable:true},{pubkey:offer,isSigner:false,isWritable:true},{pubkey:SystemProgram.programId,isSigner:false,isWritable:false}], data:Buffer.concat([Buffer.from(wire.instructions.createOffer.discriminatorHex,'hex'),u64(nonce),u64(price),u64(duration),Buffer.from(hash.slice(2),'hex')])});
}
export function buyLicenseInstruction(program: PublicKey, buyer: PublicKey, offer: SolanaOffer) {
  const [license] = deriveLicense(program,offer.address,buyer);
  return new TransactionInstruction({programId:program,keys:[{pubkey:buyer,isSigner:true,isWritable:true},{pubkey:offer.address,isSigner:false,isWritable:false},{pubkey:offer.seller,isSigner:false,isWritable:true},{pubkey:license,isSigner:false,isWritable:true},{pubkey:SystemProgram.programId,isSigner:false,isWritable:false}],data:Buffer.from(wire.instructions.buyLicense.discriminatorHex,'hex')});
}
export function deactivateInstruction(program: PublicKey, seller: PublicKey, offer: PublicKey) {return new TransactionInstruction({programId:program,keys:[{pubkey:seller,isSigner:true,isWritable:false},{pubkey:offer,isSigner:false,isWritable:true}],data:Buffer.from(wire.instructions.deactivateOffer.discriminatorHex,'hex')});}
