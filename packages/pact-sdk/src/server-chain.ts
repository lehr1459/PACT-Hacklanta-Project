import { PublicKey, TransactionInstruction, TransactionMessage, VersionedTransaction, ComputeBudgetProgram } from '@solana/web3.js';
import { Buffer } from 'buffer';
import { PACT_PROGRAM_ID } from './index.js';
import { validateCheckoutMetadata } from './checkout.js';
import { PlatformError, canonicalAddress } from './server-auth.js';
import { keccak_256 } from '@noble/hashes/sha3';
import { createReadEngine, createEndpointHistory, numeric, type EndpointHistory } from './internal/license-reader.js';
import { createReaderPool, type ReadOptions } from './internal/reader-pool.js';
import { isTransactionError } from './internal/transaction-error.js';

export type PlatformReaderOptions = { rpcUrl?: string; fetch?: typeof fetch; now?: () => number };
export type PrepareOfferInput = { network: 'devnet'; programId?: string; sellerWallet: string; nonce: string; metadataJson: string };
export type PrepareCheckoutInput = { network: 'devnet'; programId?: string; offerAddress: string; walletAddress: string; metadataJson: string };
const system = '11111111111111111111111111111111', program = new PublicKey(PACT_PROGRAM_ID);

function address(value: unknown) {
  if (typeof value !== 'string' || value.length < 32 || value.length > 44) throw new PlatformError('INVALID_INPUT', 'Expected a canonical Solana public address.');
  return canonicalAddress(value);
}
function u64(value: unknown, max = 18446744073709551615n) {
  if (typeof value !== 'string' || !/^(?:0|[1-9]\d{0,19})$/.test(value) || BigInt(value) > max) {
    throw new PlatformError('INVALID_INPUT', 'Expected a canonical unsigned decimal integer.');
  }
  return BigInt(value);
}
function network(value: unknown) {
  if (value !== 'devnet') throw new PlatformError('WRONG_NETWORK', 'Only Solana Devnet is supported.');
}
function metadata(value: unknown): asserts value is string {
  if (typeof value !== 'string' || value.length > 65536 || Buffer.byteLength(value) > 65536
    || Buffer.from(value, 'utf8').toString('utf8') !== value) throw new PlatformError('INVALID_INPUT', 'Invalid exact UTF-8 metadata.');
}
function transaction(payer: string, blockhash: string, ix: TransactionInstruction) {
  return Buffer.from(new VersionedTransaction(new TransactionMessage({
    payerKey: new PublicKey(payer), recentBlockhash: blockhash,
    instructions: [ComputeBudgetProgram.setComputeUnitLimit({ units: 200000 }), ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 0 }), ix],
  }).compileToV0Message()).serialize()).toString('base64');
}

/** Internal factories are imported by server.ts, never re-exported from the package. */
export { createEndpointHistory };
export function createPlatformReaderPool(options: PlatformReaderOptions, bounds: { history: EndpointHistory; activeLimit: number; queueLimit: number }) {
  const engine = createReadEngine({ ...options }, bounds.history);
  const operation = createReaderPool(engine.time, bounds.activeLimit, bounds.queueLimit);
  async function latest(context: Parameters<typeof engine.rpc>[0], minimumSlot: number) {
    const result = await engine.rpc(context, 'getLatestBlockhash', [{ commitment: 'confirmed', minContextSlot: minimumSlot }]);
    if (!numeric(result?.context?.slot) || result.context.slot < minimumSlot || !result?.value || !numeric(result.value.lastValidBlockHeight)) throw new PlatformError('RPC_ERROR', 'Invalid blockhash context or lifetime.', 503);
    address(result.value.blockhash);
    return result.value as { blockhash: string; lastValidBlockHeight: number };
  }
  return {
    getOffer(input: { offer: string }, options?: ReadOptions) {
      const offer = address(input.offer);
      return operation(async context => (await engine.snapshot(context, { offer, wallet: system })).quote, options);
    },
    getLicenseStatus(input: { offer: string; wallet: string }, options?: ReadOptions) {
      const offer = address(input.offer), wallet = address(input.wallet);
      return operation(async context => (await engine.snapshot(context, { offer, wallet })).status, options);
    },
    prepareCheckout(input: PrepareCheckoutInput, options?: ReadOptions) {
      const x = { ...input };
      network(x.network);
      if (x.programId !== undefined && x.programId !== PACT_PROGRAM_ID) throw new PlatformError('WRONG_NETWORK', 'Only the reviewed program is supported.');
      const offer = address(x.offerAddress), buyer = address(x.walletAddress);
      metadata(x.metadataJson);
      return operation(async context => {
        const { quote, status } = await engine.snapshot(context, { offer, wallet: buyer });
        validateCheckoutMetadata(x.metadataJson, quote);
        if (!quote.active) throw new PlatformError('OFFER_INACTIVE', 'Offer is inactive.', 409);
        if (status.active) throw new PlatformError('ALREADY_LICENSED', 'Wallet already has an active license.', 409);
        const block = await latest(context, quote.contextSlot), licensePda = status.licensePda;
        const ix = new TransactionInstruction({ programId: program, keys: [
          { pubkey: new PublicKey(buyer), isSigner: true, isWritable: true },
          { pubkey: new PublicKey(offer), isSigner: false, isWritable: false },
          { pubkey: new PublicKey(quote.seller), isSigner: false, isWritable: true },
          { pubkey: new PublicKey(licensePda), isSigner: false, isWritable: true },
          { pubkey: new PublicKey(system), isSigner: false, isWritable: false },
        ], data: Buffer.from('ff518198a9c9e869', 'hex') });
        return { network: 'devnet' as const, programId: PACT_PROGRAM_ID, quote, buyer, licensePda, ...block, transactionBase64: transaction(buyer, block.blockhash, ix) };
      }, options);
    },
    prepareOffer(input: PrepareOfferInput, options?: ReadOptions) {
      const x = { ...input };
      network(x.network);
      if (x.programId !== undefined && x.programId !== PACT_PROGRAM_ID) throw new PlatformError('WRONG_NETWORK', 'Only the reviewed program is supported.');
      const seller = address(x.sellerWallet), nonce = u64(x.nonce);
      metadata(x.metadataJson);
      let m: any;
      try { m = JSON.parse(x.metadataJson); } catch { throw new PlatformError('INVALID_INPUT', 'Invalid metadata JSON.'); }
      if (!m || m.schema !== 'pact-solana-license-v1' || typeof m.title !== 'string' || !m.title.trim() || typeof m.terms !== 'string' || !m.terms.trim()) {
        throw new PlatformError('INVALID_INPUT', 'Invalid metadata schema.');
      }
      const price = u64(m.priceLamports), duration = u64(m.durationSeconds, 31536000n);
      if (!price || !duration) throw new PlatformError('INVALID_INPUT', 'Price and duration must be positive.');
      const hash = Buffer.from(keccak_256(Buffer.from(x.metadataJson, 'utf8'))), n = Buffer.alloc(8);
      n.writeBigUInt64LE(nonce);
      const [offer] = PublicKey.findProgramAddressSync([Buffer.from('offer'), new PublicKey(seller).toBuffer(), n], program);
      return operation(async context => {
        const snapshot = await engine.preparationSnapshot(context, offer.toBase58());
        const block = await latest(context, snapshot.contextSlot), pv = Buffer.alloc(8), dv = Buffer.alloc(8);
        pv.writeBigUInt64LE(price); dv.writeBigUInt64LE(duration);
        const ix = new TransactionInstruction({ programId: program, keys: [
          { pubkey: new PublicKey(seller), isSigner: true, isWritable: true },
          { pubkey: offer, isSigner: false, isWritable: true },
          { pubkey: new PublicKey(system), isSigner: false, isWritable: false },
        ], data: Buffer.concat([Buffer.from('ede9c0a8f807f9f1', 'hex'), n, pv, dv, hash]) });
        return { network: 'devnet' as const, programId: PACT_PROGRAM_ID, offer: offer.toBase58(), seller, nonce: x.nonce, priceLamports: price.toString(), durationSeconds: duration.toString(), termsHash: '0x' + hash.toString('hex'), ...snapshot, ...block, transactionBase64: transaction(seller, block.blockhash, ix) };
      }, options);
    },
    getTransactionStatus(input: { signature: string }, options?: ReadOptions) {
      const signature = input.signature;
      if (typeof signature !== 'string' || !/^[1-9A-HJ-NP-Za-km-z]{64,88}$/.test(signature)) throw new PlatformError('INVALID_INPUT', 'Invalid transaction signature.');
      return operation(async context => {
        await engine.genesis(context);
        const result = await engine.rpc(context, 'getSignatureStatuses', [[signature], { searchTransactionHistory: true }]);
        if (!numeric(result?.context?.slot) || !Array.isArray(result.value) || result.value.length !== 1) throw new PlatformError('RPC_ERROR', 'Invalid transaction status.', 503);
        const status = result.value[0];
        if (status === null) return { network: 'devnet' as const, signature, state: 'not-found' as const, slot: null, error: null, contextSlot: result.context.slot };
        if (!numeric(status.slot) || status.slot > result.context.slot || !['processed', 'confirmed', 'finalized'].includes(status.confirmationStatus)
          || !(status.err === null || isTransactionError(status.err))) throw new PlatformError('RPC_ERROR', 'Malformed transaction status.', 503);
        return { network: 'devnet' as const, signature, state: status.err ? 'failed' : status.confirmationStatus, slot: status.slot, error: status.err, contextSlot: result.context.slot };
      }, options);
    },
  };
}

export function createPlatformReader(options: PlatformReaderOptions = {}) {
  return createPlatformReaderPool(options, { history: createEndpointHistory(), activeLimit: 8, queueLimit: 16 });
}
