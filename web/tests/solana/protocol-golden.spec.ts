import { test, expect } from '@playwright/test';
import { PublicKey, type TransactionInstruction } from '@solana/web3.js';
import { Buffer } from 'buffer';
import { deriveOffer, deriveLicense, decodeOffer, decodeLicense, metadataHash, metadataMatches, metadataWithinLimit, createOfferInstruction, buyLicenseInstruction, deactivateInstruction, u64 } from '../../lib/solana/protocol';
import golden from '../../../packages/pact-sdk/tests/golden/protocol-v1.json';

// Expected bytes are generated independently with Python struct, solders and
// Foundry cast. Neither the web implementation nor SDK generated these values.
const program = new PublicKey(golden.program), seller = new PublicKey(golden.seller), buyer = new PublicKey(golden.buyer);
function instruction(value: TransactionInstruction) {
  return { dataHex: value.data.toString('hex'), accounts: value.keys.map(key => ({ address: key.pubkey.toBase58(), signer: key.isSigner, writable: key.isWritable })) };
}
for (const vector of golden.vectors) test(`independent marketplace protocol vector: ${vector.name}`, () => {
  const offer = new PublicKey(vector.offer), license = new PublicKey(vector.license);
  const [derivedOffer, offerBump] = deriveOffer(program, seller, BigInt(vector.nonce));
  const [derivedLicense, licenseBump] = deriveLicense(program, offer, buyer);
  expect([derivedOffer.toBase58(), offerBump]).toEqual([vector.offer, vector.offerBump]);
  expect([derivedLicense.toBase58(), licenseBump]).toEqual([vector.license, vector.licenseBump]);
  expect(Buffer.from(vector.metadataJson, 'utf8').toString('hex')).toBe(vector.metadataUtf8Hex);
  expect(metadataHash(vector.metadataJson)).toBe(vector.metadataKeccak256);
  expect(metadataHash(vector.metadataJson + ' ')).toBe(vector.metadataWithTrailingSpaceKeccak256);
  const decoded = decodeOffer(Buffer.from(vector.offerDataHex, 'hex'), program, offer);
  expect(decoded.priceLamports.toString()).toBe(vector.priceLamports);
  expect(decoded.durationSeconds.toString()).toBe(vector.durationSeconds);
  expect(decoded.termsHash).toBe(vector.metadataKeccak256);
  expect(metadataMatches(vector.metadataJson, decoded)).toBe(true);
  expect(metadataMatches(vector.metadataJson + ' ', decoded)).toBe(false);
  for (const [state, bytes] of Object.entries(vector.licenseDataHex)) {
    const expiry = decodeLicense(Buffer.from(bytes as string, 'hex'), program, license, offer, buyer);
    expect(expiry >= 0n).toBe(true);
    if (state === 'equal') expect(expiry).toBe(BigInt(golden.clock.timestamp));
    if (state === 'active') expect(expiry > BigInt(golden.clock.timestamp)).toBe(true);
    if (state === 'expired') expect(expiry < BigInt(golden.clock.timestamp)).toBe(true);
    if (state === 'maximum') expect(expiry).toBe(9223372036854775807n);
  }
  expect(instruction(createOfferInstruction(program, seller, BigInt(vector.nonce), BigInt(vector.priceLamports), BigInt(vector.durationSeconds), vector.metadataKeccak256))).toEqual(vector.instructions.create);
  expect(instruction(buyLicenseInstruction(program, buyer, decoded))).toEqual(vector.instructions.buy);
  expect(instruction(deactivateInstruction(program, seller, offer))).toEqual(vector.instructions.deactivate);
  const corruptOffer = Buffer.from(vector.offerDataHex, 'hex'); corruptOffer[97] ^= 1;
  expect(() => decodeOffer(corruptOffer, program, offer)).toThrow();
  expect(() => decodeLicense(Buffer.from(vector.licenseDataHex.active, 'hex'), program, license, offer, seller)).toThrow();
});
test('independent exact UTF-8 metadata boundary and unsigned integer limits', () => {
  const boundary = golden.metadataBoundary;
  const metadata = JSON.stringify({ ...boundary.base, terms: boundary.fillCharacter.repeat(boundary.fillCount) + boundary.asciiSuffix });
  expect(Buffer.byteLength(metadata, 'utf8')).toBe(boundary.utf8Bytes);
  expect(metadataHash(metadata)).toBe(boundary.keccak256);
  expect(metadataWithinLimit(metadata)).toBe(true);
  expect(metadataWithinLimit(metadata + ' ')).toBe(false);
  expect(u64(18446744073709551615n).toString('hex')).toBe('ffffffffffffffff');
  expect(() => u64(18446744073709551616n)).toThrow();
  expect(() => u64(-1n)).toThrow();
});
