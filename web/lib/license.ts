import { isAddress, keccak256, toBytes, type Abi, type Address, type Hex } from 'viem';

export const LICENSE_CHAIN_ID = 84532;
export const READ_TIMEOUT_MS = 5000;
export const FRESHNESS_MS = 8000;
export const CHAIN_PROGRESS_MS = 12000;
export const METADATA_MAX_BYTES = 64 * 1024;
export const UINT64_MAX = 18446744073709551615n;
export const UINT256_MAX = 2n ** 256n - 1n;
export function validOfferId(value: string): boolean {
  return /^\d{1,78}$/.test(value) && BigInt(value) <= UINT256_MAX;
}
export type LicenseSnapshot = {
  offerId: string; holder: Address; chainId: number; contract: Address; session: number;
  blockNumber: bigint; chainTimestamp: bigint; valid: boolean; expiry: bigint;
  startedAtMs: number; receivedAtMs: number;
};
export type SnapshotSource = {
  getChainId(): Promise<number>;
  getBlock(): Promise<{number: bigint | null; timestamp: bigint}>;
  getCode(args: {address: Address; blockNumber: bigint}): Promise<Hex | undefined>;
  readContract(args: {address: Address; abi: Abi; functionName: string; args?: readonly unknown[]; blockNumber: bigint}): Promise<unknown>;
};
export function withTimeout<T>(operation: Promise<T>, milliseconds = READ_TIMEOUT_MS): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([operation, new Promise<never>((_, reject) => {timer = setTimeout(() => reject(new Error('Chain check timed out. Access is closed until a fresh check succeeds.')), milliseconds);})]).finally(() => clearTimeout(timer));
}
export async function acquireLicenseSnapshot({source, contract, abi, offerId, holder, session, clock}: {
  source: SnapshotSource; contract: Address; abi: Abi; offerId: string; holder: Address; session: number; clock: () => number;
}): Promise<LicenseSnapshot> {
  if (!validOfferId(offerId) || !isAddress(holder)) throw new Error('Enter a valid offer ID and wallet address.');
  const startedAtMs = clock();
  return withTimeout((async () => {
    if (await source.getChainId() !== LICENSE_CHAIN_ID) throw new Error('The configured RPC is not Base Sepolia (84532).');
    const block = await source.getBlock();
    if (block.number === null) throw new Error('The RPC did not return a mined block.');
    const base = {address: contract, blockNumber: block.number};
    const [code, count, valid, expiry] = await Promise.all([
      source.getCode(base), source.readContract({...base, abi, functionName: 'nextOfferId'}),
      source.readContract({...base, abi, functionName: 'isLicenseValid', args: [BigInt(offerId), holder]}),
      source.readContract({...base, abi, functionName: 'licenseExpiry', args: [BigInt(offerId), holder]}),
    ]);
    if (!code || code === '0x') throw new Error('No contract exists at the configured Base Sepolia address.');
    if (typeof count !== 'bigint' || BigInt(offerId) >= count) throw new Error('This offer does not exist.');
    if (typeof valid !== 'boolean' || typeof expiry !== 'bigint') throw new Error('The RPC returned an invalid license response.');
    if (valid !== (expiry > block.timestamp)) throw new Error('The chain snapshot contains inconsistent license values.');
    return {offerId, holder, chainId: LICENSE_CHAIN_ID, contract, session, blockNumber: block.number, chainTimestamp: block.timestamp, valid, expiry, startedAtMs, receivedAtMs: clock()};
  })());
}
export function snapshotHasAccess(snapshot: LicenseSnapshot, nowMs: number, lastProgressMs: number): boolean {
  const age = nowMs - snapshot.startedAtMs;
  if (!Number.isFinite(age) || age < 0 || age >= FRESHNESS_MS || nowMs - lastProgressMs >= CHAIN_PROGRESS_MS) return false;
  const projectedTimestamp = snapshot.chainTimestamp + BigInt(Math.floor(age / 1000));
  return snapshot.valid && snapshot.expiry > projectedTimestamp;
}
export function formatExpiry(expiry: bigint): string {
  if (expiry <= 0n) return 'No license recorded';
  const milliseconds = expiry * 1000n;
  return milliseconds <= 8640000000000000n ? new Date(Number(milliseconds)).toLocaleString() : `Unix seconds ${expiry.toString()} (outside calendar display range)`;
}
export type LicenseMetadata = {schema: 'pact-license-v1'; title: string; terms: string; priceWei: string; durationSeconds: string};
export function metadataBytesWithinLimit(value: string): boolean {return new TextEncoder().encode(value).length <= METADATA_MAX_BYTES;}
export function parseLicenseMetadata(value: string): LicenseMetadata | undefined {
  if (!metadataBytesWithinLimit(value)) return;
  try {
    const record = JSON.parse(value) as Partial<LicenseMetadata> | null;
    if (!record || typeof record !== 'object' || record.schema !== 'pact-license-v1' || typeof record.title !== 'string' || !record.title.trim() || typeof record.terms !== 'string' || !record.terms.trim() || typeof record.priceWei !== 'string' || !validOfferId(record.priceWei) || BigInt(record.priceWei) < 1n || typeof record.durationSeconds !== 'string' || !/^\d{1,20}$/.test(record.durationSeconds) || BigInt(record.durationSeconds) < 1n || BigInt(record.durationSeconds) > UINT64_MAX) return;
    return record as LicenseMetadata;
  } catch {return;}
}
export function metadataMatchesOffer(raw: string, offer: {termsHash: Hex; price: bigint; duration: bigint} | undefined): boolean {
  const metadata = parseLicenseMetadata(raw);
  return Boolean(metadata && offer && keccak256(toBytes(raw)) === offer.termsHash && metadata.priceWei === offer.price.toString() && BigInt(metadata.durationSeconds) === offer.duration);
}
