import { PublicKey } from '@solana/web3.js';
import { Buffer } from 'buffer';

export const PACT_PROGRAM_ID = 'EiiiWWsW2kkqP6nugHz6iBADvhnW5xnibAtZ82ZExVqy';
export const DEVNET_GENESIS = 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG';
export const DEFAULT_RPC_URL = 'https://api.devnet.solana.com';
export const FRESHNESS_MS = 8000, SLOT_PROGRESS_MS = 12000, READ_TIMEOUT_MS = 5000;
const RESPONSE_LIMIT = 128 * 1024;
const MAX_CHAIN_CLOCK_SKEW_MS = 60000n;
const program = new PublicKey(PACT_PROGRAM_ID);
const clockAddress = 'SysvarC1ock11111111111111111111111111111111';
const system = '11111111111111111111111111111111';
const sysvar = 'Sysvar1111111111111111111111111111111111111';
const loader = 'BPFLoaderUpgradeab1e11111111111111111111111';

export type PactErrorCode = 'INVALID_INPUT' | 'WRONG_NETWORK' | 'RPC_ERROR' | 'TIMEOUT' | 'INVALID_ACCOUNT' | 'STALE' | 'LICENSE_REQUIRED';
export class PactError extends Error {
  readonly name = 'PactError';
  constructor(public readonly code: PactErrorCode, message: string) { super(message); }
}
export type LicenseInput = { offer: string; wallet: string };
/** Decimal strings preserve on-chain integers and allow JSON serialization. */
export type LicenseStatus = {
  program: string; offer: string; wallet: string; licensePda: string;
  contextSlot: number; chainTimestamp: string; expiry: string;
  state: 'active' | 'expired' | 'missing'; active: boolean;
  startedAtMs: number; receivedAtMs: number; lastProgressAtMs: number;
};
export type PactClientOptions = {
  rpcUrl?: string; fetch?: typeof globalThis.fetch;
  /** Clock in milliseconds; defaults to Date.now. Must not move backwards. */
  now?: () => number;
};
export type ReadContext = {
  startedAtMs: number; signal: AbortSignal;
  check(): void;
  /** Retain raw work even after the caller has timed out. */
  track<T>(promise: Promise<T>): Promise<T>;
};
export type EndpointHistory = {
  lastNow: number; slot: number; timestamp: bigint;
  slotProgress: number; timestampProgress: number; requireTimestampProgress: boolean;
  requireWallClockAlignment: boolean;
};
/** Internal: share only between pools for the same trusted endpoint and clock. */
export function createEndpointHistory(serverPolicy = true): EndpointHistory {
  return {
    lastNow: -Infinity, slot: -1, timestamp: -1n, slotProgress: 0, timestampProgress: 0,
    requireTimestampProgress: serverPolicy, requireWallClockAlignment: serverPolicy,
  };
}
function fail(code: PactErrorCode, message: string): never { throw new PactError(code, message); }
function key(value: string): PublicKey {
  try {
    if (typeof value !== 'string' || value.length < 32 || value.length > 44) throw Error();
    const result = new PublicKey(value);
    if (result.toBase58() !== value) throw Error();
    return result;
  } catch { return fail('INVALID_INPUT', 'Expected a canonical public address.'); }
}
export function numeric(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}
type Account = { owner: string; executable: boolean; data: [string, string]; lamports: number };
export function accountBytes(value: unknown, owner: string): Buffer {
  const a = value as Account;
  if (!a || a.owner !== owner || a.executable !== false || !numeric(a.lamports)
    || !Array.isArray(a.data) || a.data.length !== 2 || a.data[1] !== 'base64'
    || typeof a.data[0] !== 'string' || a.data[0].length > 10000
    || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(a.data[0])) {
    fail('INVALID_ACCOUNT', 'Invalid account owner or encoding.');
  }
  const result = Buffer.from(a.data[0], 'base64');
  if (result.toString('base64') !== a.data[0]) fail('INVALID_ACCOUNT', 'Noncanonical account encoding.');
  return result;
}
export function isLicenseStatusFresh(status: LicenseStatus, nowMs = Date.now()): boolean {
  try {
    const age = nowMs - status.startedAtMs, progress = nowMs - status.lastProgressAtMs;
    return Number.isFinite(nowMs) && Number.isFinite(age) && Number.isFinite(progress)
      && age >= 0 && age < FRESHNESS_MS && progress >= 0 && progress < SLOT_PROGRESS_MS
      && status.receivedAtMs >= status.startedAtMs && nowMs >= status.receivedAtMs
      && status.active && status.state === 'active'
      && BigInt(status.expiry) > BigInt(status.chainTimestamp) + BigInt(Math.floor(age / 1000));
  } catch { return false; }
}

export function createReadEngine(options: PactClientOptions, history: EndpointHistory) {
  const url = options.rpcUrl ?? DEFAULT_RPC_URL;
  let parsed: URL;
  try { parsed = new URL(url); } catch { return fail('INVALID_INPUT', 'Invalid RPC URL.'); }
  if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname))) {
    fail('INVALID_INPUT', 'RPC requires HTTPS or local HTTP.');
  }
  if (parsed.username || parsed.password) fail('INVALID_INPUT', 'RPC URL must not contain credentials.');
  const fetcher = options.fetch ?? globalThis.fetch, now = options.now ?? Date.now;
  let id = 0;
  function time() {
    const value = now();
    if (!Number.isFinite(value) || value < history.lastNow) fail('STALE', 'Local clock moved backwards.');
    history.lastNow = value;
    return value;
  }
  async function responseBody(response: Response, context: ReadContext) {
    const reader = response.body?.getReader();
    if (!reader) fail('RPC_ERROR', 'RPC body is missing.');
    const chunks: Uint8Array[] = [];
    let size = 0;
    const cancel = () => {
      try { void context.track(Promise.resolve(reader.cancel())).catch(() => {}); } catch { /* Reader may already be closed. */ }
    };
    context.signal.addEventListener('abort', cancel, { once: true });
    try {
      context.check();
      while (true) {
        const part = await reader.read();
        context.check();
        if (part.done) break;
        size += part.value.byteLength;
        if (size > RESPONSE_LIMIT) { cancel(); fail('RPC_ERROR', 'RPC response exceeded 128 KiB.'); }
        chunks.push(part.value);
      }
      return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)));
    } finally {
      context.signal.removeEventListener('abort', cancel);
      reader.releaseLock();
    }
  }
  async function rpc(context: ReadContext, method: string, params: unknown[] = []): Promise<any> {
    try {
      context.check();
      const requestId = ++id;
      const response = await context.track(Promise.resolve().then(() => {
        context.check();
        return fetcher(url, {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: requestId, method, params }),
          signal: context.signal, cache: 'no-store',
        });
      }));
      const discard = () => {
        try { if (response.body) void context.track(response.body.cancel()).catch(() => {}); }
        catch { /* A failed transport may already have closed the stream. */ }
      };
      try { context.check(); } catch (error) { discard(); throw error; }
      if (!response.ok) { discard(); fail('RPC_ERROR', `RPC HTTP ${response.status}.`); }
      const stated = response.headers?.get('content-length');
      if (stated && (!/^\d+$/.test(stated) || Number(stated) > RESPONSE_LIMIT)) {
        discard(); fail('RPC_ERROR', 'RPC response exceeded 128 KiB.');
      }
      const body = await context.track(responseBody(response, context));
      context.check();
      if (!body || body.jsonrpc !== '2.0' || body.id !== requestId || body.error || !Object.hasOwn(body, 'result')) {
        fail('RPC_ERROR', 'Invalid RPC response.');
      }
      return body.result;
    } catch (error) {
      // Preserve deadline/cancellation errors thrown by the owning context, but
      // never expose transport messages, URLs or malformed JSON decoder details.
      context.check();
      if (error instanceof PactError) throw error;
      fail('RPC_ERROR', 'RPC transport or response failed.');
    }
  }
  async function genesis(context: ReadContext) {
    if (await rpc(context, 'getGenesisHash') !== DEVNET_GENESIS) fail('WRONG_NETWORK', 'Only Solana Devnet is supported.');
  }
  function config() {
    return { encoding: 'base64', commitment: 'confirmed', ...(history.slot >= 0 ? { minContextSlot: history.slot } : {}) };
  }
  function clock(value: unknown, slot: number) {
    const bytes = accountBytes(value, sysvar);
    if (bytes.length !== 40 || bytes.readBigUInt64LE(0) !== BigInt(slot)) fail('INVALID_ACCOUNT', 'Clock does not match snapshot context.');
    const timestamp = bytes.readBigInt64LE(32);
    if (timestamp < 0n) fail('STALE', 'Chain time moved backwards.');
    return timestamp;
  }
  function executable(value: unknown) {
    const p = value as Account;
    if (!p || p.executable !== true || p.owner !== loader) fail('INVALID_ACCOUNT', 'Expected executable deployed PACT program.');
  }
  // Synchronous read boundary: later application errors never undo a valid observation.
  function observe(context: ReadContext, slot: number, timestamp: bigint) {
    const received = time();
    context.check();
    if (history.requireWallClockAlignment) {
      const wallTime = BigInt(Math.trunc(received)), chainTime = timestamp * 1000n;
      if (chainTime < wallTime - MAX_CHAIN_CLOCK_SKEW_MS || chainTime > wallTime + MAX_CHAIN_CLOCK_SKEW_MS) {
        fail('STALE', 'Chain Clock is outside the trusted server time window.');
      }
    }
    if (slot < history.slot) fail('INVALID_ACCOUNT', 'Invalid or backwards snapshot context.');
    if (timestamp < history.timestamp) fail('STALE', 'Chain time moved backwards.');
    const slotProgress = slot > history.slot ? received : history.slotProgress;
    const timestampProgress = timestamp > history.timestamp ? received : history.timestampProgress;
    if (received - slotProgress >= SLOT_PROGRESS_MS
      || history.requireTimestampProgress && received - timestampProgress >= SLOT_PROGRESS_MS) {
      fail('STALE', 'RPC slot or Clock stopped progressing.');
    }
    history.slot = slot; history.timestamp = timestamp;
    history.slotProgress = slotProgress; history.timestampProgress = timestampProgress;
    return { received, progress: history.requireTimestampProgress ? Math.min(slotProgress, timestampProgress) : slotProgress };
  }
  async function snapshot(context: ReadContext, input: LicenseInput) {
    const offer = key(input.offer), wallet = key(input.wallet);
    const [license, bump] = PublicKey.findProgramAddressSync([Buffer.from('license'), offer.toBuffer(), wallet.toBuffer()], program);
    await genesis(context);
    const result = await rpc(context, 'getMultipleAccounts', [[input.offer, license.toBase58(), clockAddress, PACT_PROGRAM_ID], config()]);
    if (!result?.context || !numeric(result.context.slot) || !Array.isArray(result.value) || result.value.length !== 4) {
      fail('INVALID_ACCOUNT', 'Invalid or backwards snapshot context.');
    }
    const [oa, la, ca, pa] = result.value;
    executable(pa);
    const o = accountBytes(oa, PACT_PROGRAM_ID);
    if (o.length !== 98 || o.subarray(0, 8).toString('hex') !== 'd7583c47aaa249e5') fail('INVALID_ACCOUNT', 'Invalid offer layout.');
    const nonce = o.subarray(40, 48), seller = o.subarray(8, 40);
    const [expected, offerBump] = PublicKey.findProgramAddressSync([Buffer.from('offer'), seller, nonce], program);
    if (!expected.equals(offer) || o[97] !== offerBump || o.readBigUInt64LE(48) === 0n
      || o.readBigUInt64LE(56) < 1n || o.readBigUInt64LE(56) > 31536000n || o[96] > 1
      || o.subarray(64, 96).every(b => b === 0)) fail('INVALID_ACCOUNT', 'Invalid offer PDA or terms.');
    const timestamp = clock(ca, result.context.slot);
    let expiry = 0n, missing = true, licenseData: string | null = null;
    if (la !== null) {
      const owner = (la as Account)?.owner;
      const l = accountBytes(la, owner === system ? system : PACT_PROGRAM_ID);
      if (owner === system) {
        if (l.length !== 0) fail('INVALID_ACCOUNT', 'Uninitialized license must be empty.');
      } else {
        if (l.length !== 81 || l.subarray(0, 8).toString('hex') !== 'f898c364b96cb0e7'
          || !l.subarray(8, 40).equals(offer.toBuffer()) || !l.subarray(40, 72).equals(wallet.toBuffer()) || l[80] !== bump) {
          fail('INVALID_ACCOUNT', 'Invalid license identity or layout.');
        }
        expiry = l.readBigInt64LE(72);
        if (expiry < 0n) fail('INVALID_ACCOUNT', 'Invalid license expiry.');
        missing = false; licenseData = l.toString('base64');
      }
    }
    const { received, progress } = observe(context, result.context.slot, timestamp);
    const active = expiry > timestamp;
    // Server authorization also fails closed when a lagging, otherwise tolerated
    // Clock would make an entitlement look active past the trusted wall expiry.
    // The valid chain observation remains anchored; its interpretation is stale.
    if (history.requireWallClockAlignment && active && expiry <= BigInt(Math.floor(received / 1000))) {
      fail('STALE', 'License expiry has passed the trusted server clock.');
    }
    const status: LicenseStatus = {
      program: PACT_PROGRAM_ID, offer: input.offer, wallet: input.wallet, licensePda: license.toBase58(),
      contextSlot: result.context.slot, chainTimestamp: timestamp.toString(), expiry: expiry.toString(),
      state: active ? 'active' : missing ? 'missing' : 'expired', active,
      startedAtMs: context.startedAtMs, receivedAtMs: received, lastProgressAtMs: progress,
    };
    if (active && !isLicenseStatusFresh(status, received)) fail('STALE', 'License snapshot is stale.');
    return {
      status, licenseData,
      quote: {
        program: PACT_PROGRAM_ID, offer: input.offer, seller: new PublicKey(seller).toBase58(),
        priceLamports: o.readBigUInt64LE(48).toString(), durationSeconds: o.readBigUInt64LE(56).toString(),
        termsHash: '0x' + o.subarray(64, 96).toString('hex'), active: o[96] === 1,
        contextSlot: status.contextSlot, chainTimestamp: status.chainTimestamp,
        startedAtMs: context.startedAtMs, receivedAtMs: received,
      },
    };
  }
  async function preparationSnapshot(context: ReadContext, offer: string) {
    await genesis(context);
    const result = await rpc(context, 'getMultipleAccounts', [[offer, clockAddress, PACT_PROGRAM_ID], config()]);
    if (!numeric(result?.context?.slot) || !Array.isArray(result.value) || result.value.length !== 3) fail('INVALID_ACCOUNT', 'Invalid preparation context.');
    const [account, ca, pa] = result.value;
    if (account !== null && accountBytes(account, system).length !== 0) fail('INVALID_ACCOUNT', 'Offer account must be uninitialized.');
    executable(pa);
    const timestamp = clock(ca, result.context.slot);
    observe(context, result.context.slot, timestamp);
  }
  return { time, rpc, genesis, snapshot, preparationSnapshot };
}
