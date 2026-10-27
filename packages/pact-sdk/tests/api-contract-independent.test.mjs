import test from 'node:test';
import assert from 'node:assert/strict';
import { PublicKey, VersionedTransaction, TransactionMessage,
  ComputeBudgetProgram, AddressLookupTableAccount, SystemProgram } from '@solana/web3.js';
import { PactClient, PactApiError } from '../dist/v1.js';
import { createPactApiHandler } from '../dist/server.js';
import { controlledRpc, signer, offer, seller, metadataJson, ORIGIN, PROGRAM } from '../../../web/tests/platform/fixtures.mjs';

const OFFER = offer.toBase58(), OTHER = new PublicKey(new Uint8Array(32).fill(23)).toBase58();
const signature = '2AXDGYSE4f2sz7tvMMzyHvUfcoJmxudvdhBcmiUSo6ijwfYmfZYsKRxboQMPh3R4kUhXRVdtSXFXMheka4Rc4P2';
const clone = value => structuredClone(value);
const isInvalid = error => error instanceof PactApiError && ['INVALID_ACCOUNT', 'AUTH_INVALID', 'STALE'].includes(error.code);
function environment(t, { identity = signer() } = {}) {
  const rpc = controlledRpc(identity.wallet), jar = new Map(), http = [];
  rpc.state.timestamp = BigInt(Math.floor(Date.now() / 1000)); rpc.state.expiry = rpc.state.timestamp + 600n;
  const handler = createPactApiHandler({ origin: ORIGIN, authMode: 'single-process', protectedOffer: OFFER,
    rpcUrl: 'http://127.0.0.1:8899', fetch: rpc.fetch });
  const e = { identity, rpc, http, handler, transform: undefined };
  e.fetch = async (url, init = {}) => {
    const headers = new Headers(init.headers);
    if (init.credentials === 'include') { headers.set('origin', ORIGIN); headers.set('cookie', [...jar].map(([k, v]) => k + '=' + v).join('; ')); }
    const response = await handler(new Request(url, { ...init, headers }));
    if (init.credentials === 'include') for (const entry of response.headers.getSetCookie()) {
      const [key, value] = entry.split(';')[0].split('='); if (value) jar.set(key, value); else jar.delete(key);
    }
    const data = await response.json(), record = { url: String(url), init, data: clone(data), status: response.status };
    http.push(record);
    const changed = e.transform ? await e.transform(clone(data), record) : undefined;
    return Response.json(changed?.data ?? data, { status: changed?.status ?? response.status, headers: response.headers });
  };
  e.client = new PactClient({ network: 'devnet', apiUrl: ORIGIN + '/api/v1', fetch: e.fetch });
  t.after(() => assert.deepEqual(rpc.calls.filter(q => !['getGenesisHash', 'getMultipleAccounts', 'getLatestBlockhash',
    'getSignatureStatuses', 'getBlockHeight', 'isBlockhashValid'].includes(q.method)), [], 'No signing/simulation/submission RPC is permitted'));
  return e;
}
function replay(value) {
  return new PactClient({ network: 'devnet', apiUrl: ORIGIN + '/api/v1', fetch: async () => Response.json(clone(value)) });
}
async function mutations(t, original, invoke, variants) {
  await invoke(replay(original)); // The complete real-handler success is the positive control.
  for (const [label, change] of Object.entries(variants)) await t.test(label, async () => {
    const value = clone(original); change(value);
    await assert.rejects(invoke(replay(value)), isInvalid, label);
  });
}
const checkoutInput = e => ({ offerAddress: OFFER, walletAddress: e.identity.wallet, metadataJson });
const licenseInput = e => ({ offerAddress: OFFER, walletAddress: e.identity.wallet });
const offerInput = () => ({ sellerWallet: seller.toBase58(), nonce: '1', metadataJson });
async function authenticate(e) {
  const challenge = await e.client.auth.challenge(e.identity.wallet);
  return e.client.auth.verify({ challengeId: challenge.challengeId, signatureBase64: e.identity.signMessage(challenge.message) });
}
function transaction(value, change) {
  const tx = VersionedTransaction.deserialize(Buffer.from(value.transactionBase64, 'base64'));
  const modified = change(tx) ?? tx;
  value.transactionBase64 = Buffer.from(modified.serialize()).toString('base64');
}
function recompile(tx, change, tables = []) {
  const message = TransactionMessage.decompile(tx.message);
  change(message);
  return new VersionedTransaction(message.compileToV0Message(tables));
}

test('real handler successes validate across public, preparation, authentication and transaction APIs', async t => {
  const e = environment(t);
  assert.equal((await e.client.offers.get(OFFER)).nonce, '1');
  assert.deepEqual(await e.client.offers.metadata(OFFER), { available: false, offerAddress: OFFER, reason: 'METADATA_UNAVAILABLE' });
  assert.equal((await e.client.licenses.get(OFFER, e.identity.wallet)).valid, true);
  const preparedOffer = await e.client.offers.prepare(offerInput()); assert.equal(preparedOffer.offer, OFFER);
  e.rpc.state.missing = true;
  const prepared = await e.client.checkout.prepare(checkoutInput(e)); assert.equal(prepared.buyer, e.identity.wallet);
  assert.equal((await e.client.auth.session()).authenticated, false);
  await authenticate(e); assert.equal((await e.client.auth.session()).walletAddress, e.identity.wallet);
  e.rpc.state.missing = false;
  assert.equal((await e.client.protected.get()).authorized, true);
  assert.deepEqual(await e.client.auth.logout(), { authenticated: false });
  for (const state of ['not-found', 'processed', 'confirmed', 'finalized', 'failed']) {
    e.rpc.state.transactionStatus = state === 'not-found' ? null : { slot: 100, confirmationStatus: state === 'failed' ? 'finalized' : state, err: state === 'failed' ? { InstructionError: [2, { Custom: 6004 }] } : null };
    assert.equal((await e.client.transactions.get(signature)).state, state);
  }
});

test('offer success validates canonical identity, PDA terms, integers and fresh snapshot timing', async t => {
  const e = environment(t), valid = await e.client.offers.get(OFFER);
  await mutations(t, valid, c => c.offers.get(OFFER), {
    program: v => { v.program = OTHER; }, offer: v => { v.offer = OTHER; }, seller: v => { v.seller = OTHER; },
    noncePda: v => { v.nonce = '2'; }, nonceLeadingZero: v => { v.nonce = '01'; }, nonceOverflow: v => { v.nonce = '18446744073709551616'; },
    priceZero: v => { v.priceLamports = '0'; }, priceNumber: v => { v.priceLamports = 1000000; }, priceOverflow: v => { v.priceLamports = '18446744073709551616'; },
    durationZero: v => { v.durationSeconds = '0'; }, durationOverflow: v => { v.durationSeconds = '31536001'; },
    emptyCommitment: v => { v.termsHash = '0x' + '00'.repeat(32); }, malformedCommitment: v => { v.termsHash = '0x1234'; },
    activeType: v => { v.active = 'true'; }, contextFraction: v => { v.contextSlot = 1.5; }, contextUnsafe: v => { v.contextSlot = Number.MAX_SAFE_INTEGER + 1; },
    negativeClock: v => { v.chainTimestamp = '-1'; }, noncanonicalClock: v => { v.chainTimestamp = '01'; },
    reversedTime: v => { v.receivedAtMs = v.startedAtMs - 1; }, fractionalTime: v => { v.startedAtMs += 0.5; },
    futureClock: v => { v.chainTimestamp = String(Math.floor(Date.now() / 1000) + 120); },
    staleTime: v => { v.startedAtMs = v.receivedAtMs = Date.now() - 8001; },
  });
});

test('all public license states validate negative proofs as strictly as positive proofs', async t => {
  for (const state of ['active', 'expired', 'missing']) await t.test(state, async t => {
    const e = environment(t); e.rpc.state.missing = state === 'missing';
    if (state === 'expired') e.rpc.state.expiry = e.rpc.state.timestamp;
    const input = licenseInput(e), valid = await e.client.licenses.verify(input);
    await mutations(t, valid, c => c.licenses.verify(input), {
      outerOffer: v => { v.offerAddress = OTHER; }, outerWallet: v => { v.walletAddress = OTHER; }, network: v => { v.network = 'mainnet'; },
      program: v => { v.program = OTHER; }, innerWallet: v => { v.status.wallet = OTHER; }, innerOffer: v => { v.status.offer = OTHER; },
      wrongPda: v => { v.status.licensePda = OTHER; }, controlClaim: v => { v.walletControlProven = true; }, authorizationClaim: v => { v.authorized = true; },
      validType: v => { v.valid = 'false'; }, activeType: v => { v.status.active = 1; }, stateMismatch: v => { v.status.state = state === 'active' ? 'expired' : 'active'; },
      validityContradiction: v => { v.valid = !v.valid; }, reason: v => { v.reason = state === 'missing' ? 'VALID' : 'MISSING'; },
      expiration: v => { v.expiration = state === 'missing' ? '0' : null; }, negativeExpiry: v => { v.status.expiry = '-1'; },
      expiryOverflow: v => { v.status.expiry = '9223372036854775808'; }, clockEncoding: v => { v.status.chainTimestamp = '01'; },
      contextNegative: v => { v.status.contextSlot = -1; }, contextFraction: v => { v.status.contextSlot += 0.5; }, contextMismatch: v => { v.freshness.contextSlot++; },
      maxAge: v => { v.freshness.maxAgeMs = 999999; }, futureReceived: v => { v.status.receivedAtMs = Date.now() + 1000; },
      progressFuture: v => { v.status.lastProgressAtMs = Date.now() + 1000; }, reversedTime: v => { v.status.startedAtMs = v.status.receivedAtMs + 1; },
      verifiedTimeMismatch: v => { v.verifiedAt = '2000-01-01T00:00:00.000Z'; },
      clockMismatch: v => { v.freshness.chainTimestamp = String(BigInt(v.status.chainTimestamp) + 1n); },
      apparentlyActivePastWallExpiry: v => {
        const now = BigInt(Math.floor(Date.now() / 1000));
        v.state = v.status.state = 'active'; v.valid = v.status.active = true; v.reason = 'VALID';
        v.status.chainTimestamp = v.freshness.chainTimestamp = (now - 50n).toString();
        v.expiration = v.status.expiry = (now - 20n).toString();
      },
      staleNegativeOrPositive: v => { const old = Date.now() - 8001; v.status.startedAtMs = old; v.status.receivedAtMs = old; v.status.lastProgressAtMs = old; v.freshness.verifiedAtMs = old; v.verifiedAt = new Date(old).toISOString(); },
    });
  });
});

test('prepared offer fields bind actual caller metadata, canonical PDA and fresh preparation context', async t => {
  const e = environment(t), input = offerInput(), valid = await e.client.offers.prepare(input);
  await mutations(t, valid, c => c.offers.prepare(input), {
    network: v => { v.network = 'mainnet'; }, program: v => { v.programId = OTHER; }, seller: v => { v.seller = OTHER; },
    nonce: v => { v.nonce = '2'; }, targetPda: v => { v.offer = OTHER; }, price: v => { v.priceLamports = '1'; }, duration: v => { v.durationSeconds = '1'; },
    commitment: v => { v.termsHash = '0x' + '01'.repeat(32); }, blockhash: v => { v.blockhash = OTHER; }, lifetime: v => { v.lastValidBlockHeight = -1; },
    context: v => { v.contextSlot = -1; }, missingContext: v => { delete v.contextSlot; }, clock: v => { v.chainTimestamp = '-1'; },
    stalePreparation: v => { v.startedAtMs = v.receivedAtMs = Date.now() - 8001; },
  });
});

test('prepared checkout fields bind requested buyer/offer, quote nonce and metadata', async t => {
  const e = environment(t); e.rpc.state.missing = true;
  const input = checkoutInput(e), valid = await e.client.checkout.prepare(input);
  await mutations(t, valid, c => c.checkout.prepare(input), {
    buyer: v => { v.buyer = OTHER; }, license: v => { v.licensePda = OTHER; }, program: v => { v.programId = OTHER; }, network: v => { v.network = 'mainnet'; },
    quoteSeller: v => { v.quote.seller = OTHER; }, quoteOffer: v => { v.quote.offer = OTHER; }, quoteNonce: v => { v.quote.nonce = '2'; },
    quotePrice: v => { v.quote.priceLamports = '1'; }, quoteDuration: v => { v.quote.durationSeconds = '1'; },
    quoteCommitment: v => { v.quote.termsHash = '0x' + '01'.repeat(32); }, inactive: v => { v.quote.active = false; },
    blockhash: v => { v.blockhash = OTHER; }, fractionalLifetime: v => { v.lastValidBlockHeight = 1.5; },
    stale: v => { v.quote.startedAtMs = v.quote.receivedAtMs = Date.now() - 8001; },
  });
});

test('unsigned prepared transactions reject hidden actions, altered semantics, privilege changes and lookup tables', async t => {
  for (const operation of ['offer', 'checkout']) await t.test(operation, async t => {
    const e = environment(t); e.rpc.state.missing = true;
    const input = operation === 'offer' ? offerInput() : checkoutInput(e);
    const invoke = c => operation === 'offer' ? c.offers.prepare(input) : c.checkout.prepare(input);
    const valid = await invoke(e.client), payer = operation === 'offer' ? valid.seller : valid.buyer;
    const editInstruction = (v, edit) => transaction(v, tx => recompile(tx, message => edit(message.instructions.at(-1))));
    await mutations(t, valid, invoke, {
      signature: v => transaction(v, tx => { tx.signatures[0][0] = 1; }),
      extraInstruction: v => transaction(v, tx => recompile(tx, message => message.instructions.push(SystemProgram.transfer({ fromPubkey: new PublicKey(payer), toPubkey: new PublicKey(OTHER), lamports: 1 })))),
      wrongProgram: v => editInstruction(v, ix => { ix.programId = new PublicKey(OTHER); }),
      wrongDiscriminator: v => editInstruction(v, ix => { ix.data[0] ^= 1; }),
      extraData: v => editInstruction(v, ix => { ix.data = Buffer.concat([ix.data, Buffer.from([0])]); }),
      extraInstructionAccount: v => editInstruction(v, ix => { ix.keys.push({ pubkey: new PublicKey(OTHER), isSigner: false, isWritable: false }); }),
      extraSigner: v => editInstruction(v, ix => { ix.keys.push({ pubkey: new PublicKey(OTHER), isSigner: true, isWritable: true }); }),
      wrongTargetAccount: v => editInstruction(v, ix => { ix.keys[1].pubkey = new PublicKey(OTHER); }),
      escalatedProgramPrivilege: v => editInstruction(v, ix => { ix.keys.at(-1).isWritable = true; }),
      missingTargetWrite: v => editInstruction(v, ix => { ix.keys[operation === 'offer' ? 1 : 3].isWritable = false; }),
      computePrice: v => transaction(v, tx => recompile(tx, message => { message.instructions[1] = ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1 }); })),
      computeLimit: v => transaction(v, tx => recompile(tx, message => { message.instructions[0] = ComputeBudgetProgram.setComputeUnitLimit({ units: 200001 }); })),
      reorderedInstructions: v => transaction(v, tx => recompile(tx, message => { message.instructions.reverse(); })),
      unusedStaticAccount: v => transaction(v, tx => { tx.message.staticAccountKeys.push(new PublicKey(OTHER)); tx.message.header.numReadonlyUnsignedAccounts++; }),
      lookupTable: v => transaction(v, tx => {
        const table = new AddressLookupTableAccount({ key: new PublicKey(OTHER), state: { deactivationSlot: 18446744073709551615n, lastExtendedSlot: 0, lastExtendedSlotStartIndex: 0, authority: undefined,
          addresses: [new PublicKey(operation === 'offer' ? valid.offer : valid.licensePda)] } });
        const rewritten = recompile(tx, () => {}, [table]);
        assert.ok(rewritten.message.addressTableLookups.length > 0, 'Exercise an actual v0 address lookup');
        return rewritten;
      }),
      noncanonicalBase64: v => { v.transactionBase64 += '\n'; },
      trailingWire: v => { v.transactionBase64 = Buffer.concat([Buffer.from(v.transactionBase64, 'base64'), Buffer.from([0])]).toString('base64'); },
    });
  });
});

test('valid buyer-equals-seller preparation accepts coalesced runtime privileges', async t => {
  const e = environment(t, { identity: { wallet: seller.toBase58() } }); e.rpc.state.missing = true;
  const value = await e.client.checkout.prepare(checkoutInput(e));
  assert.equal(value.buyer, value.quote.seller);
  const tx = VersionedTransaction.deserialize(Buffer.from(value.transactionBase64, 'base64'));
  assert.equal(tx.message.header.numRequiredSignatures, 1);
  assert.equal(tx.message.compiledInstructions.at(-1).accountKeyIndexes[0], tx.message.compiledInstructions.at(-1).accountKeyIndexes[2]);
});

test('metadata success must be available, exact, fresh and independently bound to a real offer commitment', async t => {
  const e = environment(t), quote = await e.client.offers.get(OFFER), metadata = JSON.parse(metadataJson);
  const valid = { available: true, offerAddress: OFFER, metadataJson, title: metadata.title, terms: metadata.terms, verifiedAt: new Date().toISOString() };
  const check = async value => {
    const c = new PactClient({ network: 'devnet', apiUrl: ORIGIN + '/api/v1', fetch: async url =>
      Response.json(clone(String(url).endsWith('/metadata') ? value : quote)) });
    return c.offers.metadata(OFFER);
  };
  assert.equal((await check(valid)).metadataJson, metadataJson);
  for (const [label, change] of Object.entries({
    unavailableSuccess: v => { v.available = false; }, wrongOffer: v => { v.offerAddress = OTHER; },
    changedExactBytes: v => { v.metadataJson += ' '; }, changedPrice: v => { v.metadataJson = v.metadataJson.replace('1000000', '1'); },
    displayTitle: v => { v.title += ' forged'; }, displayTerms: v => { v.terms += ' forged'; },
    malformedJson: v => { v.metadataJson = '{'; }, stale: v => { v.verifiedAt = new Date(Date.now() - 8001).toISOString(); },
    oversizedMetadata: v => { v.metadataJson = ' '.repeat(65537); },
  })) await t.test(label, async () => { const value = clone(valid); change(value); await assert.rejects(check(value), isInvalid); });
  await assert.rejects(check({}), isInvalid);
});

test('transaction status success binds signature, context and state/error/slot relationships', async t => {
  for (const state of ['not-found', 'confirmed', 'failed']) await t.test(state, async t => {
    const e = environment(t);
    e.rpc.state.transactionStatus = state === 'not-found' ? null : { slot: 100, confirmationStatus: 'confirmed', err: state === 'failed' ? { InstructionError: [2, { Custom: 6004 }] } : null };
    const valid = await e.client.transactions.get(signature);
    await mutations(t, valid, c => c.transactions.get(signature), {
      network: v => { v.network = 'mainnet'; }, signature: v => { v.signature = '3' + signature.slice(1); },
      context: v => { v.contextSlot = -1; }, unsafeSlot: v => { v.slot = Number.MAX_SAFE_INTEGER + 1; }, state: v => { v.state = 'unknown'; },
      relation: v => { if (state === 'not-found') v.slot = 100; else if (state === 'failed') v.error = null; else v.error = { InstructionError: [1, 'InvalidArgument'] }; },
      arbitraryFailureDetails: v => { v.state = 'failed'; v.slot = 100; v.error = { message: 'PRIVATE_RPC_MARKER', endpoint: 'https://provider.invalid/' }; },
      freeformFailureText: v => { v.state = 'failed'; v.slot = 100; v.error = 'PRIVATE RPC endpoint details'; },
      unboundedFailureName: v => { v.state = 'failed'; v.slot = 100; v.error = 'A'.repeat(97); },
      arrayFailure: v => { v.state = 'failed'; v.slot = 100; v.error = ['InvalidArgument']; },
      primitiveFailure: v => { v.state = 'failed'; v.slot = 100; v.error = 7; },
      customErrorNegative: v => { v.state = 'failed'; v.slot = 100; v.error = { InstructionError: [2, { Custom: -1 }] }; },
      customErrorOverflow: v => { v.state = 'failed'; v.slot = 100; v.error = { InstructionError: [2, { Custom: 4294967296 }] }; },
      instructionIndexNegative: v => { v.state = 'failed'; v.slot = 100; v.error = { InstructionError: [-1, 'InvalidArgument'] }; },
    });
  });
});

test('non-exhaustive transaction unit variants remain opaque failed details and cannot imply success', async t => {
  const e = environment(t);
  e.rpc.state.transactionStatus = { slot: 100, confirmationStatus: 'finalized', err: 'FutureUnitVariant' };
  const failed = await e.client.transactions.get(signature);
  assert.equal(failed.state, 'failed'); assert.equal(failed.error, 'FutureUnitVariant');
  assert.equal((await replay(failed).transactions.get(signature)).state, 'failed');
  for (const state of ['not-found', 'processed', 'confirmed', 'finalized']) await t.test(state, async () => {
    const value = clone(failed); value.state = state;
    if (state === 'not-found') delete value.slot;
    await assert.rejects(replay(value).transactions.get(signature), isInvalid);
  });
});

test('authentication success responses enforce discriminated sessions, integral lifetime and logout denial shape', async t => {
  const e = environment(t), anonymous = await e.client.auth.session();
  await mutations(t, anonymous, c => c.auth.session(), {
    identityOnAnonymous: v => { v.walletAddress = e.identity.wallet; }, expiryOnAnonymous: v => { v.expiresAt = Date.now() + 1000; },
    authenticatedType: v => { v.authenticated = 'false'; },
  });
  const valid = await authenticate(e);
  for (const method of ['session', 'verify']) await t.test(method, async t => {
    const challenge = await e.client.auth.challenge(e.identity.wallet);
    const input = { challengeId: challenge.challengeId, signatureBase64: e.identity.signMessage(challenge.message) };
    const invoke = c => method === 'session' ? c.auth.session() : c.auth.verify(input);
    await mutations(t, valid, invoke, {
      wallet: v => { v.walletAddress = 'not-a-key'; }, expires: v => { v.expiresAt = Date.now() - 1; },
      fractionalLifetime: v => { v.expiresAt += 0.5; }, unboundedLifetime: v => { v.expiresAt = Date.now() + 3601000; },
      authenticatedType: v => { v.authenticated = 'true'; },
    });
  });
  const loggedOut = await e.client.auth.logout();
  await mutations(t, loggedOut, c => c.auth.logout(), { authenticated: v => { v.authenticated = true; },
    wallet: v => { v.walletAddress = e.identity.wallet; } });
});

test('authentication challenge success binds the exact signing domain, wallet, browser token and lifetime', async t => {
  const e = environment(t), valid = await e.client.auth.challenge(e.identity.wallet);
  const line = (v, index, text) => { const lines = v.message.split('\n'); lines[index] = text; v.message = lines.join('\n'); };
  await mutations(t, valid, c => c.auth.challenge(e.identity.wallet), {
    challengeToken: v => { v.challengeId = 'x'.repeat(42); },
    domain: v => line(v, 1, 'Origin: https://attacker.invalid'),
    network: v => line(v, 2, 'Network: solana-mainnet'),
    genesis: v => line(v, 3, 'Genesis: ' + OTHER),
    program: v => line(v, 4, 'Program: ' + OTHER),
    wallet: v => line(v, 5, 'Wallet: ' + OTHER),
    browserBinding: v => line(v, 7, 'Session binding: invalid'),
    futureIssuance: v => line(v, 8, 'Issued at: ' + (Date.now() + 60000)),
    staleIssuance: v => line(v, 8, 'Issued at: ' + (Date.now() - 300001)),
    expiryMismatch: v => line(v, 9, 'Expires at: ' + (v.expiresAt + 1)),
    extendedLifetime: v => { v.expiresAt = Date.now() + 360000; line(v, 9, 'Expires at: ' + v.expiresAt); },
    changedPurpose: v => line(v, 10, 'Purpose: authorize a transaction.'),
  });
});

test('protected success validates nested public proof and matching private grant identities', async t => {
  const e = environment(t); await authenticate(e);
  const valid = await e.client.protected.get();
  await mutations(t, valid, c => c.protected.get(), {
    falseAuthorization: v => { v.authorized = false; },
    payloadType: v => { v.payload = { private: true }; },
    walletMismatch: v => { v.walletAddress = OTHER; },
    offerMismatch: v => { v.offerAddress = OTHER; },
    innerAuthorizationClaim: v => { v.verification.authorized = true; },
    nestedExpiry: v => { v.verification.status.expiry = '0'; },
  });
  const expiredGrant = clone(valid); expiredGrant.expiresAt = String(BigInt(valid.expiresAt) + 1n);
  await assert.rejects(replay(expiredGrant).protected.get(), error => error instanceof PactApiError && error.code === 'LICENSE_REQUIRED');
});

test('caller object mutation during HTTP awaits cannot relabel original license or preparation validation', { timeout: 10000 }, async t => {
  for (const operation of ['license', 'checkout', 'offer']) await t.test(operation, async t => {
    const e = environment(t); if (operation === 'checkout') e.rpc.state.missing = true;
    const entered = Promise.withResolvers(), release = Promise.withResolvers(); t.after(() => release.resolve());
    e.transform = async () => { entered.resolve(); await release.promise; };
    const input = operation === 'offer' ? offerInput() : operation === 'checkout' ? checkoutInput(e) : licenseInput(e), original = clone(input);
    const pending = operation === 'offer' ? e.client.offers.prepare(input) : operation === 'checkout' ? e.client.checkout.prepare(input) : e.client.licenses.verify(input);
    await entered.promise;
    if (operation === 'offer') { input.sellerWallet = OTHER; input.nonce = '2'; }
    else { input.walletAddress = OTHER; input.offerAddress = OTHER; }
    input.metadataJson = '{}'; release.resolve();
    const result = await pending;
    assert.equal(operation === 'offer' ? result.seller : operation === 'checkout' ? result.buyer : result.walletAddress,
      operation === 'offer' ? original.sellerWallet : original.walletAddress);
  });
});
