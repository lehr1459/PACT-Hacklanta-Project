import { PublicKey, VersionedTransaction, TransactionMessage, TransactionInstruction, ComputeBudgetProgram, SendTransactionError } from '@solana/web3.js';
import { Buffer } from 'buffer';
import { keccak_256 } from '@noble/hashes/sha3';
import { createPactClient, PACT_PROGRAM_ID, DEVNET_GENESIS, PactError, isLicenseStatusFresh, type LicenseStatus } from './index.js';
import { createPhantomAdapter, canonicalWallet, type WalletAdapter } from './adapter.js';
export { createPhantomAdapter };
export type { WalletAdapter };
export type OfferInfo = {
    program: string;
    offer: string;
    seller: string;
    priceLamports: string;
    durationSeconds: string;
    termsHash: string;
    active: boolean;
    contextSlot: number;
    chainTimestamp: string;
    startedAtMs: number;
    receivedAtMs: number;
};
export type CheckoutProgress = {
    stage: 'idle' | 'preparing' | 'awaiting-signature' | 'wallet-signed' | 'rpc-accepted' | 'processed' | 'confirmed' | 'finalized' | 'rejected' | 'failed' | 'expired' | 'unknown';
    signature?: string;
    buyer?: string;
    offer?: string;
    code?: string;
    message?: string;
};
export type PreparedPurchase = {
    quote: OfferInfo;
    buyer: string;
    blockhash: string;
    lastValidBlockHeight: number;
    transaction: VersionedTransaction;
};
export type PurchaseResult = {
    outcome: 'licensed' | 'already-licensed' | 'rejected' | 'failed' | 'expired' | 'unknown' | 'finalized-unverified';
    signature?: string;
    license?: LicenseStatus;
    error?: {
        code: string;
        message: string;
    };
};
export type CheckoutOptions = {
    programId: string;
    rpcUrl: string;
    walletAdapter?: WalletAdapter;
    onState?: (state: CheckoutProgress) => void;
    fetch?: typeof fetch;
    now?: () => number;
};
export interface CheckoutClient {
    connect(): Promise<string>;
    disconnect(): Promise<void>;
    getWallet(): string | null;
    subscribeWallet(listener: (wallet: string | null) => void): () => void;
    getOffer(input: {
        offer: string;
    }): Promise<OfferInfo>;
    getLicenseStatus(input: {
        offer: string;
    }): Promise<LicenseStatus>;
    preparePurchase(input: {
        offer: string;
        metadataJson: string;
    }): Promise<PreparedPurchase>;
    purchaseLicense(input: {
        offer: string;
        metadataJson: string;
        termsAccepted: true;
    }): Promise<PurchaseResult>;
    recoverPurchase(input: {
        offer: string;
    }): Promise<PurchaseResult>;
    getPendingPurchase(input: {
        offer: string;
    }): CheckoutProgress | null;
    destroy(): void;
}
function error(message: string): never { throw new PactError('INVALID_INPUT', message); }
function key(text: string) { const canonical = canonicalWallet(text); if (!canonical)
    error('Expected a canonical public address.'); return new PublicKey(canonical); }
function integer(n: unknown): n is number { return typeof n === 'number' && Number.isSafeInteger(n) && n >= 0; }
const clock = 'SysvarC1ock11111111111111111111111111111111', sysvar = 'Sysvar1111111111111111111111111111111111111', system = '11111111111111111111111111111111', loader = 'BPFLoaderUpgradeab1e11111111111111111111111';
export function validateCheckoutMetadata(json: string, offer: OfferInfo): {
    title: string;
    terms: string;
} {
    if (typeof json !== 'string' || new TextEncoder().encode(json).length > 65536)
        error('License metadata exceeds the 64 KiB limit.');
    try {
        const m = JSON.parse(json);
        if (!m || m.schema !== 'pact-solana-license-v1' || typeof m.title !== 'string' || !m.title.trim() || typeof m.terms !== 'string' || !m.terms.trim() || typeof m.priceLamports !== 'string' || !/^\d{1,20}$/.test(m.priceLamports) || BigInt(m.priceLamports) < 1n || BigInt(m.priceLamports) > 18446744073709551615n || typeof m.durationSeconds !== 'string' || !/^\d{1,8}$/.test(m.durationSeconds) || BigInt(m.durationSeconds) < 1n || BigInt(m.durationSeconds) > 31536000n || m.priceLamports !== offer.priceLamports || BigInt(m.durationSeconds) !== BigInt(offer.durationSeconds) || '0x' + Buffer.from(keccak_256(new TextEncoder().encode(json))).toString('hex') !== offer.termsHash)
            error('Metadata does not match the offer terms, price and duration.');
        return { title: m.title, terms: m.terms };
    }
    catch {
        error('Metadata is invalid or does not match the offer.');
    }
}
type Raw = {
    owner: string;
    executable: boolean;
    data: [
        string,
        string
    ];
    lamports: number;
};
function bytes(a: Raw, owner: string) { if (!a || a.owner !== owner || a.executable !== false || !integer(a.lamports) || !Array.isArray(a.data) || a.data.length !== 2 || a.data[1] !== 'base64' || typeof a.data[0] !== 'string')
    error('Invalid account owner or layout.'); const b = Buffer.from(a.data[0], 'base64'); if (b.toString('base64') !== a.data[0])
    error('Invalid account encoding.'); return b; }
type Baseline = {
    kind: 'missing' | 'initialized';
    expiry: string;
    data: string | null;
};
type Journal = {
    version: 1;
    network: 'devnet';
    program: string;
    buyer: string;
    offer: string;
    action: 'Purchase license';
    signature: string;
    blockhash: string;
    lastValidBlockHeight: number;
    state: 'wallet-signed' | 'rpc-accepted' | 'unknown' | 'confirmed';
    baseline: Baseline;
    legacyOnly?: boolean;
};
const memory = new Map<string, Journal>();
const prefix = 'pact.solana.checkout.v1:', legacy = 'pact.solana.pending.v1:';
function identity(program: string, buyer: string, offer: string) { return `${program}:${buyer}:${offer}`; }
function validateJournal(value: unknown, id: string): Journal { const a = value as Journal; if (!a || a.version !== 1 || a.network !== 'devnet' || a.program !== PACT_PROGRAM_ID || !canonicalWallet(a.buyer) || !canonicalWallet(a.offer) || identity(a.program, a.buyer, a.offer) !== id || a.action !== 'Purchase license' || !/^[1-9A-HJ-NP-Za-km-z]{64,88}$/.test(a.signature) || !canonicalWallet(a.blockhash) || !integer(a.lastValidBlockHeight) || !['wallet-signed', 'rpc-accepted', 'unknown', 'confirmed'].includes(a.state) || !a.baseline || !['missing', 'initialized'].includes(a.baseline.kind) || !/^\d+$/.test(a.baseline.expiry) || !(a.baseline.data === null || typeof a.baseline.data === 'string'))
    error('Protected checkout journal is invalid.'); return a; }
function legacyRecord(v: unknown, id: string) { const a = v as Journal; if (!a || Object.keys(a).some(k => !['network', 'program', 'buyer', 'offer', 'action', 'signature', 'blockhash', 'lastValidBlockHeight', 'state', 'createdOffer'].includes(k)) || a.network !== 'devnet' || a.program !== PACT_PROGRAM_ID || !canonicalWallet(a.buyer) || !canonicalWallet(a.offer) || identity(a.program, a.buyer, a.offer) !== id || a.action !== 'Purchase license' || typeof a.signature !== 'string' || !/^[1-9A-HJ-NP-Za-km-z]{64,88}$/.test(a.signature) || !canonicalWallet(a.blockhash) || !integer(a.lastValidBlockHeight) || !['wallet-signed', 'rpc-accepted', 'unknown', 'confirmed'].includes(a.state))
    error('Protected marketplace journal is invalid.'); return a; }
function sameIncarnation(a: Journal,b: Journal){return a.signature===b.signature&&a.blockhash===b.blockhash&&a.lastValidBlockHeight===b.lastValidBlockHeight;}
function pendingUnsafe(id: string) { const old = localStorage.getItem(legacy + id), raw = localStorage.getItem(prefix + id), remembered = memory.get(id), stored = raw ? validateJournal(JSON.parse(raw), id) : undefined, other = old ? legacyRecord(JSON.parse(old), id) : undefined; if(remembered&&stored&&!sameIncarnation(remembered,stored))error('Pending journal incarnation changed; protection remains closed.');const own = remembered?.state === 'confirmed'&&(!stored||sameIncarnation(remembered,stored)) ? remembered : stored ?? remembered; if (own && other && (own.signature !== other.signature || own.blockhash !== other.blockhash || own.lastValidBlockHeight !== other.lastValidBlockHeight))
    error('Pending journals disagree; protection remains closed.'); if (own) {
    return other?.state === 'confirmed' ? { ...own, state: 'confirmed' as const } : own;
} if (other)
    return { ...other, version: 1 as const, baseline: { kind: 'initialized' as const, expiry: '0', data: null }, legacyOnly: true }; return undefined; }
function pending(id: string) { try {
    return pendingUnsafe(id);
}
catch (e) {
    if (e instanceof PactError)
        throw e;
    throw new PactError('INVALID_INPUT', 'Pending purchase storage is unavailable or invalid.');
} }
function save(id: string, a: Journal) { if (a.legacyOnly)
    return; const old = pending(id); if (old && (old.legacyOnly || !sameIncarnation(old,a)))
    error('A different checkout attempt is protected.'); const record = old?.state === 'confirmed' ? { ...a, state: 'confirmed' as const } : a; memory.set(id, record); const encoded = JSON.stringify(record); localStorage.setItem(prefix + id, encoded); if (old && localStorage.getItem(legacy + id) === null) {
    if (localStorage.getItem(prefix + id) !== encoded)
        error('Pending storage could not be verified.');
    return;
} const mirror = JSON.stringify({ network: a.network, program: a.program, buyer: a.buyer, offer: a.offer, action: a.action, signature: a.signature, blockhash: a.blockhash, lastValidBlockHeight: a.lastValidBlockHeight, state: record.state }); localStorage.setItem(legacy + id, mirror); if (localStorage.getItem(prefix + id) !== encoded || localStorage.getItem(legacy + id) !== mirror)
    error('Pending paired storage could not be verified.'); }
function clear(id: string, signature: string) { const old = pending(id); if (old?.legacyOnly)
    return; if (old && old.signature !== signature)
    error('Pending signature changed.'); localStorage.removeItem(legacy + id); localStorage.removeItem(prefix + id); if (localStorage.getItem(prefix + id) !== null || localStorage.getItem(legacy + id) !== null)
    error('Pending storage could not be cleared.'); memory.delete(id); }
function signature(bytes: Uint8Array) { if (bytes.length !== 64 || bytes.every(b => b === 0))
    error('Wallet returned an invalid signature.'); const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'; let n = 0n, out = ''; for (const b of bytes)
    n = n * 256n + BigInt(b); while (n) {
    out = alphabet[Number(n % 58n)] + out;
    n /= 58n;
} for (const b of bytes) {
    if (b)
        break;
    out = '1' + out;
} return out; }
function equal(a: Uint8Array, b: Uint8Array) { return a.length === b.length && a.every((v, i) => v === b[i]); }
function diagnostic(e: unknown) { let m = e instanceof SendTransactionError ? e.transactionError.message : e instanceof Error ? e.message : 'Checkout request failed.'; return m.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/https?:\/\/\S+/gi, '[RPC endpoint]').replace(/\b(?:private key|seed phrase|recovery phrase|mnemonic|api[_ -]?key|authorization|bearer)\b[^.;]*/gi, '[redacted]').replace(/[A-Za-z0-9+/=_-]{100,}/g, '[encoded data omitted]').slice(0, 420); }
export function createCheckoutClient(options: CheckoutOptions): CheckoutClient {
    const settings = { ...options };
    if (settings.programId !== PACT_PROGRAM_ID)
        error('Only the reviewed PACT Devnet program is supported.');
    if (!settings.rpcUrl)
        error('An explicit public Devnet RPC URL is required.');
    const adapter = settings.walletAdapter ?? createPhantomAdapter(), fetcher = settings.fetch ?? globalThis.fetch, now = settings.now ?? Date.now;
    const program = key(settings.programId);
    let disposed = false, session = 0, busy = false, lastNow = -Infinity, requestId = 0;
    const listeners = new Set<(wallet: string | null) => void>();
    type VerificationRead={token:symbol;session:number;offer:string;buyer:string;ids:string[];commitment:'confirmed'|'finalized';minimum?:number;closed:boolean;requestId?:number;raw?:any};
    let activeRead:VerificationRead|undefined;
    const verificationFetch:typeof fetch=async(input,init)=>{
        const read=activeRead;
        const current=()=>!!read&&!read.closed&&!disposed&&read.session===session&&activeRead===read&&!init?.signal?.aborted;
        if(!current())throw new PactError('STALE','Verification read is no longer current.');
        const request=JSON.parse(String(init?.body));
        const accountRequest=request.method==='getMultipleAccounts';
        if(accountRequest){
            if(!Array.isArray(request.params?.[0])||JSON.stringify(request.params[0])!==JSON.stringify(read!.ids))error('Verification account identities changed.');
            request.params[1]={...request.params[1],commitment:read!.commitment};
            if(read!.minimum!==undefined)request.params[1].minContextSlot=Math.max(request.params[1].minContextSlot??0,read!.minimum);
            read!.requestId=request.id;
        }
        const response=await fetcher(input,{...init,body:JSON.stringify(request)});
        if(!current())throw new PactError('STALE','Verification response belongs to a closed read.');
        const text=await response.text();
        if(!current())throw new PactError('STALE','Verification body belongs to a closed read.');
        if(accountRequest){let data:any;try{data=JSON.parse(text);}catch{}if(data?.jsonrpc==='2.0'&&data.id===read!.requestId&&!data.error)read!.raw=data.result;}
        return new Response(text,{status:response.status,statusText:response.statusText,headers:response.headers});
    };
    const makeVerifier = () => createPactClient({ rpcUrl: settings.rpcUrl, fetch: verificationFetch, now });
    let verifier = makeVerifier();
    function alive() { if (disposed)
        error('Checkout was destroyed.'); }
    function time() { alive(); const n = now(); if (!Number.isFinite(n) || n < lastNow)
        throw new PactError('STALE', 'Local clock moved backwards.'); lastNow = n; return n; }
    function wallet() { alive(); try {
        return canonicalWallet(adapter.getPublicKey());
    }
    catch {
        error('Wallet identity is unavailable.');
    } }
    function buyer() { const b = wallet(); if (!b)
        error('Connect a wallet first.'); return b; }
    function check(b: string, s: number) { alive(); if ((typeof document !== 'undefined' && document.visibilityState === 'hidden') || (typeof navigator !== 'undefined' && navigator.onLine === false))
        error('Checkout is paused while hidden or offline.'); if (session !== s || wallet() !== b)
        error('Wallet session changed; checkout stopped.'); }
    function emit(stage: CheckoutProgress['stage'], fields: Omit<CheckoutProgress, 'stage'> = {}) { if (disposed)
        return; try {
        settings.onState?.(Object.freeze({ ...fields, stage }));
    }
    catch { } }
    const cancelSession = () => { if (disposed)
        return; session++; for (const listener of listeners)
        try {
            listener(wallet());
        }
        catch { } };
    const visibility = () => { if (document.visibilityState === 'hidden')
        cancelSession(); };
    if (typeof document !== 'undefined')
        document.addEventListener('visibilitychange', visibility);
    if (typeof globalThis.addEventListener === 'function')
        globalThis.addEventListener('offline', cancelSession);
    const unsubscribe = adapter.subscribe(value => { if (disposed)
        return; session++; verifier = makeVerifier(); const address = canonicalWallet(value); for (const listener of listeners)
        try {
            listener(address);
        }
        catch { } });
    async function rpc(method: string, params: unknown[] = [], timeout = 5000) { alive(); if (!['getGenesisHash', 'getMultipleAccounts', 'getLatestBlockhash', 'getBlockHeight', 'isBlockhashValid', 'getSignatureStatuses', 'simulateTransaction', 'sendTransaction'].includes(method))
        error('Unsupported checkout RPC method.'); const controller = new AbortController(); let timer: ReturnType<typeof setTimeout>; let expired = false; try {
        return await Promise.race([(async () => { const id = ++requestId; const response = await fetcher(settings.rpcUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id, method, params }), signal: controller.signal, cache: 'no-store' }); if (!response.ok)
                throw new PactError('RPC_ERROR', `RPC HTTP ${response.status}.`); const data = await response.json(); if (expired)
                throw new PactError('TIMEOUT', 'RPC request timed out.'); if (!data || data.jsonrpc !== '2.0' || data.id !== id)
                throw new PactError('RPC_ERROR', 'Malformed RPC response.'); if (data.error) {
                if (method === 'sendTransaction') {
                    const e = new SendTransactionError({ action: 'simulate', signature: '', transactionMessage: typeof data.error.message === 'string' ? data.error.message : 'RPC rejected request.', logs: data.error.data?.logs });
                    throw e;
                }
                throw new PactError('RPC_ERROR', 'RPC request failed.');
            } if (!Object.hasOwn(data, 'result'))
                throw new PactError('RPC_ERROR', 'RPC result is missing.'); return data.result; })(), new Promise<never>((_, reject) => { timer = setTimeout(() => { expired = true; controller.abort(); reject(new PactError('TIMEOUT', 'RPC request timed out.')); }, timeout); })]);
    }
    finally {
        clearTimeout(timer!);
        controller.abort();
    } }
    async function genesis() { if (await rpc('getGenesisHash') !== DEVNET_GENESIS)
        throw new PactError('WRONG_NETWORK', 'Only Solana Devnet is supported.'); }
    async function validatedRead(offerText:string,b:string,commitment:'confirmed'|'finalized'='confirmed',minSlot?:number){
        alive();const offer=key(offerText),walletKey=key(b);
        const [license]=PublicKey.findProgramAddressSync([Buffer.from('license'),offer.toBuffer(),walletKey.toBuffer()],program);
        const read:VerificationRead={token:Symbol('verification'),session,offer:offerText,buyer:b,ids:[offerText,license.toBase58(),clock,settings.programId],commitment,minimum:minSlot,closed:false};
        if(activeRead&&!activeRead.closed)error('A verification read is already active.');
        activeRead=read;const verificationClient=verifier;
        try{
            const status=await verificationClient.getLicenseStatus({offer:offerText,wallet:b});
            alive();if(read.closed||read.session!==session||activeRead!==read||status.offer!==read.offer||status.wallet!==read.buyer||status.licensePda!==read.ids[1])error('Verification session or identity changed.');
            const raw=read.raw;if(!raw?.context||raw.context.slot!==status.contextSlot||!Array.isArray(raw.value)||raw.value.length!==4)error('Associated validated snapshot capture is missing.');
            if(minSlot!==undefined&&status.contextSlot<minSlot)error('Snapshot is below finalization slot.');
            return{status,raw};
        }finally{read.closed=true;read.raw=undefined;if(activeRead===read)activeRead=undefined;}
    }
    async function snapshot(offerText: string, b: string, commitment: 'confirmed' | 'finalized' = 'confirmed', minSlot?: number) {
        const {status:licenseStatus,raw}=await validatedRead(offerText,b,commitment,minSlot);
        if (!raw?.context || raw.context.slot !== licenseStatus.contextSlot || !Array.isArray(raw.value) || raw.value.length !== 4)
            error('Validated snapshot capture is missing.');
        if (minSlot !== undefined && licenseStatus.contextSlot < minSlot)
            error('Snapshot is below finalization slot.');
        const o = Buffer.from(raw.value[0].data[0], 'base64');
        const quote: OfferInfo = { program: settings.programId, offer: offerText, seller: new PublicKey(o.subarray(8, 40)).toBase58(), priceLamports: o.readBigUInt64LE(48).toString(), durationSeconds: o.readBigUInt64LE(56).toString(), termsHash: '0x' + o.subarray(64, 96).toString('hex'), active: o[96] === 1, contextSlot: licenseStatus.contextSlot, chainTimestamp: licenseStatus.chainTimestamp, startedAtMs: licenseStatus.startedAtMs, receivedAtMs: licenseStatus.receivedAtMs };
        const account = raw.value[1];
        const baseline: Baseline = account?.owner === settings.programId ? { kind: 'initialized', expiry: licenseStatus.expiry, data: account.data[0] } : { kind: 'missing', expiry: '0', data: null };
        return { quote, baseline, expiry: BigInt(licenseStatus.expiry), license: licenseStatus.licensePda, licenseStatus };
    }
    async function status(offer: string, b: string, s: number) { check(b, s); const {status:result}=await validatedRead(offer,b); check(b, s); return result; }
    async function prepare(offer: string, json: string, b: string, s: number) { emit('preparing', { buyer: b, offer }); const snap = await snapshot(offer, b); check(b, s); if (!snap.quote.active)
        error('Offer is deactivated.'); validateCheckoutMetadata(json, snap.quote); const r = await rpc('getLatestBlockhash', [{ commitment: 'confirmed' }]); check(b, s); if (!r?.value || !integer(r.value.lastValidBlockHeight))
        error('Invalid blockhash lifetime.'); const blockhash = key(r.value.blockhash).toBase58(); const ix = new TransactionInstruction({ programId: program, keys: [{ pubkey: key(b), isSigner: true, isWritable: true }, { pubkey: key(offer), isSigner: false, isWritable: false }, { pubkey: key(snap.quote.seller), isSigner: false, isWritable: true }, { pubkey: key(snap.license), isSigner: false, isWritable: true }, { pubkey: key(system), isSigner: false, isWritable: false }], data: Buffer.from('ff518198a9c9e869', 'hex') }); const transaction = new VersionedTransaction(new TransactionMessage({ payerKey: key(b), recentBlockhash: blockhash, instructions: [ComputeBudgetProgram.setComputeUnitLimit({ units: 200000 }), ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 0 }), ix] }).compileToV0Message()); return { quote: snap.quote, buyer: b, blockhash, lastValidBlockHeight: r.value.lastValidBlockHeight, transaction, baseline: snap.baseline }; }
    function result(outcome: PurchaseResult['outcome'], record?: Journal, e?: unknown): PurchaseResult { return { outcome, ...(record ? { signature: record.signature } : {}), ...(e ? { error: { code: e instanceof PactError ? e.code : 'CHECKOUT_ERROR', message: diagnostic(e) } } : {}) }; }
    async function recover(record: Journal, id: string): Promise<PurchaseResult> {
        const recoverySession = session;
        check(record.buyer, recoverySession);
        const started = time(), deadline = started + 120000;
        let confirmed = record.state === 'confirmed', statusSlot = -1;
        const readStatus = async () => { const r = await rpc('getSignatureStatuses', [[record.signature], { searchTransactionHistory: true }]); if (!r?.context || !integer(r.context.slot) || r.context.slot < statusSlot || !Array.isArray(r.value) || r.value.length !== 1)
            error('Invalid status response.'); statusSlot = r.context.slot; const x = r.value[0]; if (x !== null && (!x || !integer(x.slot) || x.slot > r.context.slot || !Object.hasOwn(x, 'err') || (x.err !== null && !(typeof x.err === 'string' && x.err.length > 0) && !(typeof x.err === 'object' && x.err !== null && !Array.isArray(x.err))) || !['processed', 'confirmed', 'finalized'].includes(x.confirmationStatus)))
            error('Invalid signature status.'); return x; };
        const observe = async (x: any): Promise<PurchaseResult | undefined> => { check(record.buyer, recoverySession); if (x?.confirmationStatus === 'finalized') {
            confirmed = true;
            record = { ...record, state: 'confirmed' };
            if (!record.legacyOnly) {
                memory.set(id, record);
                try {
                    save(id, record);
                }
                catch { }
            }
            if (x.err) {
                emit('failed', { signature: record.signature });
                try {
                    clear(id, record.signature);
                }
                catch (e) {
                    return result('failed', record, e);
                }
                return result('failed', record, new Error('Transaction failed on Devnet.'));
            }
            emit('finalized', { signature: record.signature });
            try {
                if (!integer(x.slot))
                    error('Invalid finalization slot.');
                const finalized = await snapshot(record.offer, record.buyer, 'finalized', x.slot);
                check(record.buyer, recoverySession);
                const license = finalized.licenseStatus;
                check(record.buyer, recoverySession);
                if (license.contextSlot < finalized.quote.contextSlot || license.expiry !== finalized.expiry.toString() || !isLicenseStatusFresh(license, time()))
                    return result('finalized-unverified', record);
                try {
                    clear(id, record.signature);
                }
                catch (e) {
                    return { outcome: 'licensed', signature: record.signature, license, error: { code: 'JOURNAL_ERROR', message: diagnostic(e) } };
                }
                return { outcome: 'licensed', signature: record.signature, license };
            }
            catch (e) {
                return result('finalized-unverified', record, e);
            }
        } if (x?.confirmationStatus === 'confirmed') {
            confirmed = true;
            record = { ...record, state: 'confirmed' };
            emit('confirmed', { signature: record.signature });
            save(id, record);
        }
        else if (x?.confirmationStatus === 'processed')
            emit('processed', { signature: record.signature }); return undefined; };
        let lastError: unknown;
        while (time() < deadline) {
            alive();
            try {
                await genesis();
                const x = await readStatus(), outcome = await observe(x);
                if (outcome)
                    return outcome;
                if (!confirmed && x === null) {
                    const height = await rpc('getBlockHeight', [{ commitment: 'finalized' }]);
                    if (!integer(height))
                        error('Invalid finalized height.');
                    if (height > record.lastValidBlockHeight) {
                        const second = await readStatus(), done = await observe(second);
                        if (done)
                            return done;
                        if (!confirmed && second === null) {
                            const valid = await rpc('isBlockhashValid', [record.blockhash, { commitment: 'finalized' }]);
                            if (typeof valid?.value !== 'boolean')
                                error('Invalid blockhash validity.');
                            if (!valid.value) {
                                const snap = await snapshot(record.offer, record.buyer, 'finalized', statusSlot);
                                check(record.buyer, recoverySession);
                                if (record.legacyOnly || JSON.stringify(snap.baseline) !== JSON.stringify(record.baseline))
                                    return result('unknown', record, new Error('Entitlement changed; purchase remains protected.'));
                                clear(id, record.signature);
                                emit('expired', { signature: record.signature });
                                return result('expired', record);
                            }
                        }
                    }
                }
            }
            catch (e) {
                if (disposed || session !== recoverySession || wallet() !== record.buyer)
                    throw e;
                lastError = e;
            }
            await new Promise(resolve => setTimeout(resolve, Math.min(1000, Math.max(0, deadline - time()))));
        }
        record = { ...record, state: confirmed ? 'confirmed' : 'unknown' };
        try{save(id,record);}catch(e){lastError=e;const remembered=memory.get(id);if(!remembered||sameIncarnation(remembered,record))memory.set(id,record);}
        emit(confirmed?'confirmed':'unknown',{signature:record.signature,message:confirmed?'Transaction confirmed; finalization is still pending. No automatic retry will occur.':undefined});
        if(confirmed)return{outcome:'unknown',signature:record.signature,error:{code:'FINALIZATION_PENDING',message:'Transaction confirmed; finalization is still pending.'+(lastError?' '+diagnostic(lastError):'')}};
        return result('unknown', record, lastError);
    }
    async function operation<T>(fn: () => Promise<T>): Promise<T> { alive(); if (busy)
        error('Checkout operation is already in progress.'); busy = true; try {
        return await fn();
    }
    catch (e) {
        if (e instanceof PactError)
            throw e;
        throw new PactError('RPC_ERROR', diagnostic(e));
    }
    finally {
        busy = false;
    } }
    async function locked(offer: string, fn: (b: string, s: number, id: string) => Promise<PurchaseResult>) { const b = buyer(), s = session, id = identity(settings.programId, b, offer); key(offer); if (!globalThis.navigator?.locks)
        error('Web Locks are required for duplicate purchase protection.'); return navigator.locks.request('pact-solana-' + id, { ifAvailable: true }, async (lock) => { if (!lock)
        error('Another tab is handling this purchase.'); check(b, s); return fn(b, s, id); }); }
    return { async connect() { alive(); const b = canonicalWallet(await adapter.connect()); alive(); if (!b || wallet() !== b)
            error('Wallet connection changed.'); return b; }, async disconnect() { alive(); session++; await adapter.disconnect(); }, getWallet: wallet, subscribeWallet(listener) { alive(); listeners.add(listener); return () => listeners.delete(listener); }, getOffer: ({ offer }) => operation(async () => { const captured = key(offer).toBase58(), s = session; const snap = await snapshot(captured, wallet() ?? system); alive(); if (s !== session)
            error('Wallet session changed.'); return snap.quote; }), getLicenseStatus: ({ offer }) => operation(() => { const b = buyer(), s = session; return status(key(offer).toBase58(), b, s); }), preparePurchase: ({ offer, metadataJson }) => operation(async () => { const b = buyer(), s = session; const p = await prepare(offer, metadataJson, b, s); return { quote: { ...p.quote }, buyer: b, blockhash: p.blockhash, lastValidBlockHeight: p.lastValidBlockHeight, transaction: VersionedTransaction.deserialize(p.transaction.serialize()) }; }),
        purchaseLicense: input => { const captured = { ...input }; return operation(() => locked(captured.offer, async (b, s, id) => { if (captured.termsAccepted !== true)
            error('Explicit approval of matching terms is required.'); const old = pending(id); if (old)
            return recover(old, id); const existing = await status(captured.offer, b, s); if (isLicenseStatusFresh(existing, time()))
            return { outcome: 'already-licensed', license: existing }; const p = await prepare(captured.offer, captured.metadataJson, b, s); const original = Uint8Array.from(p.transaction.message.serialize()); await genesis(); check(b, s); const simulation = await rpc('simulateTransaction', [Buffer.from(p.transaction.serialize()).toString('base64'), { encoding: 'base64', sigVerify: false, commitment: 'confirmed' }]); check(b, s); if (!simulation?.value || !Object.hasOwn(simulation.value, 'err') || simulation.value.err)
            error('Purchase simulation failed. Nothing was signed.'); await genesis(); check(b, s); emit('awaiting-signature', { buyer: b, offer: captured.offer }); let signed: VersionedTransaction; try {
            signed = await adapter.signTransaction(VersionedTransaction.deserialize(p.transaction.serialize()));
        }
        catch (e) {
            check(b, s);
            emit('rejected', { buyer: b, offer: captured.offer });
            return result('rejected', undefined, e);
        } check(b, s); const wire = Uint8Array.from(signed.serialize()), canonical = VersionedTransaction.deserialize(wire); if (!equal(wire, canonical.serialize()) || !equal(original, canonical.message.serialize()))
            error('Wallet changed the reviewed transaction. Nothing was submitted.'); const hash = signature(canonical.signatures[0]); let record: Journal = { version: 1, network: 'devnet', program: settings.programId, buyer: b, offer: captured.offer, action: 'Purchase license', signature: hash, blockhash: p.blockhash, lastValidBlockHeight: p.lastValidBlockHeight, state: 'wallet-signed', baseline: p.baseline }; save(id, record); emit('wallet-signed', { signature: hash, buyer: b, offer: captured.offer }); await genesis(); check(b, s); const height = await rpc('getBlockHeight', [{ commitment: 'confirmed' }]), valid = await rpc('isBlockhashValid', [p.blockhash, { commitment: 'confirmed' }]); check(b, s); if (!integer(height) || height > p.lastValidBlockHeight || valid?.value !== true)
            error('Signed transaction is expired or blockhash could not be verified; it was not submitted.'); let accepted = false; try {
            const returned = await rpc('sendTransaction', [Buffer.from(wire).toString('base64'), { encoding: 'base64', skipPreflight: false, maxRetries: 0, preflightCommitment: 'confirmed' }]);
            if (returned !== hash)
                error('RPC returned a different signature.');
            accepted = true;
        }
        catch (e) {
            if (e instanceof SendTransactionError && /^(Transaction simulation failed\b|Transaction signature verification failure\b|Signature verification failed\b)/i.test(e.transactionError.message)) {
                clear(id, hash);
                emit('rejected', { signature: hash });
                return result('rejected', record, e);
            }
            record = { ...record, state: 'unknown' };
            try {
                save(id, record);
            }
            catch { }
            emit('unknown', { signature: hash, message: diagnostic(e) });
        } if (accepted) {
            record = { ...record, state: 'rpc-accepted' };
            emit('rpc-accepted', { signature: hash, buyer: b, offer: captured.offer });
            try {
                save(id, record);
            }
            catch (e) {
                emit('rpc-accepted', { signature: hash, message: 'Accepted; journal update failed. ' + diagnostic(e) });
            }
        } return recover(record, id); })); }, recoverPurchase: ({ offer }) => operation(() => locked(offer, async (_b, _s, id) => { const record = pending(id); if (!record)
            error('No protected checkout attempt exists.'); return recover(record, id); })), getPendingPurchase: ({ offer }) => { const b = buyer(), record = pending(identity(settings.programId, b, key(offer).toBase58())); return record ? Object.freeze({ stage: record.state === 'confirmed' ? 'confirmed' : record.state === 'rpc-accepted' ? 'rpc-accepted' : 'unknown', signature: record.signature, buyer: b, offer: record.offer, message: 'Protected purchase exists. Recover its signature only.' }) : null; }, destroy() { if (disposed)
            return; disposed = true; session++; unsubscribe(); if (typeof document !== 'undefined')
            document.removeEventListener('visibilitychange', visibility); globalThis.removeEventListener?.('offline', cancelSession); listeners.clear(); adapter.destroy(); } };
}
