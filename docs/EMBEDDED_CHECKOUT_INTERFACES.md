# Embedded checkout implementation contract

Approved local Phase 1 scope: additive checkout SDK, vanilla widget and example; no real wallet approvals, simulations, signatures, broadcasts, deployments or publishing. Tests use synthetic adapters/RPCs; live checks are read-only. Saturday Lights is inspected only.

## Ownership and fixed boundaries

- Backend owns SDK checkout/adapter/internal modules, package manifest/lock/build script, SDK README and focused checkout unit tests. Preserve the existing root SDK implementation/API unless extraction is necessary and independently tested; do not modify marketplace files.
- Frontend owns SDK `src/widget.ts`, standalone `examples/pact-checkout-vanilla/**` and its README. No other SDK modules or manifest edits without Backend coordination.
- QA owns independent tests/harness and `docs/EMBEDDED_CHECKOUT_QA.md`, including regressions, tarball/browser portability and a PACT-owned Saturday Lights compatibility consumer. QA alone owns web production builds; never rebuild a serving `.next` directory.
- Lead owns this interface/runbook and coordination documents. Security/Reviewer is read-only; final release requires independent reconciliation.
- Reviewed program only: EiiiWWsW2kkqP6nugHz6iBADvhnW5xnibAtZ82ZExVqy. Explicit programId/rpcUrl/offer required for checkout; custom public RPC must pass Devnet genesis. No implicit demo-offer defaults.

## Public checkout API (`@pact/sdk/checkout`)

`createPhantomAdapter()` returns an injected-provider adapter detected lazily in browser calls (SSR-safe import); connect/disconnect/getPublicKey/signTransaction/subscribe/destroy. `subscribe(listener)` reports canonical connected public key or null and returns unsubscribe. Never use signAndSendTransaction: reuse reviewed sign-only/exact-wire/controlled Devnet submission. Missing sign-only capability fails closed.

`createCheckoutClient({programId, rpcUrl, walletAdapter?, onState?, fetch?, now?})` defaults only the adapter to createPhantomAdapter; injected fetch/clock are test seams. Returns:

- `connect(): Promise<string>`; `disconnect(): Promise<void>`; `getWallet(): string | null`.
- `subscribeWallet(listener: (wallet: string | null) => void): () => void`.
- `getOffer({offer}): Promise<OfferInfo>`.
- `getLicenseStatus({offer}): Promise<LicenseStatus>` bound to the adapter's actual connected public key and existing SDK verification/freshness policy; serialize reads and invalidate old sessions.
- `preparePurchase({offer, metadataJson}): Promise<PreparedPurchase>`: unsigned inspection only; never signs/submits. Public result includes validated quote, buyer, blockhash/lastValidBlockHeight and unsigned transaction. No caller-controlled prepared object is accepted for purchase.
- `purchaseLicense({offer, metadataJson, termsAccepted: true}): Promise<PurchaseResult>`: reconstruct fresh quote/transaction, simulate and sign only inside this explicit call, submit once, finalize, then verify fresh canonical entitlement at/after finalization slot. Already-active licenses avoid any signature/submission.
- `recoverPurchase({offer}): Promise<PurchaseResult>`: existing durable attempt only, public reads only; never creates/signs/resends a transaction.
- `getPendingPurchase({offer}): CheckoutProgress | null`: synchronous public inspection for the actual connected buyer; malformed storage fails closed. Widgets use this on reload/wallet return to disable new purchase and offer read-only recovery.
- `destroy(): void`: invalidate session and listeners; retain protected durable attempts. No callbacks after destruction.

`OfferInfo`: program, offer, seller, priceLamports, durationSeconds, termsHash, active, contextSlot, chainTimestamp, startedAtMs, receivedAtMs. Public addresses/hashes strings; integers decimal strings except safe contextSlot/timing milliseconds.

`CheckoutProgress`: stage (`idle`, `preparing`, `awaiting-signature`, `wallet-signed`, `rpc-accepted`, `processed`, `confirmed`, `finalized`, `rejected`, `failed`, `expired`, `unknown`), optional signature/buyer/offer/code/message. Frozen/copy public values; callback exceptions must not corrupt transaction execution or journals.

`PurchaseResult`: outcome (`licensed`, `already-licensed`, `rejected`, `failed`, `expired`, `unknown`, `finalized-unverified`), optional signature, license (original LicenseStatus shape), and error `{code,message}`. Finalized payment and current access are distinct. No signature or pending confirmation implies license success.

Metadata helper: `validateCheckoutMetadata(metadataJson, offer): {title, terms}` throws sanitized structured error on invalid/oversized/nonmatching exact UTF-8 JSON (same existing schema, 64 KiB, Keccak-256 hash, price and duration rules). Metadata text is rendered using textContent, never HTML. Title/terms are off-chain values matched to the on-chain hash.

## Widget API (`@pact/sdk/widget`)

`mountCheckout({element, offer, programId, rpcUrl, metadataJson?, walletAdapter?, onState?, onLicenseActive?})`: element is HTMLElement or selector. Mount inline Shadow DOM; no iframe, global CSS, React or Next dependency. Return controller with connect/disconnect/refresh/purchase/getState/destroy. mount must never auto-connect/sign/simulate/submit. User must approve matching terms before purchase; changing metadata invalidates consent.

`WidgetState`: access (`disconnected`, `checking`, `unlicensed`, `expired`, `active`, `error`, `paused`), wallet (string or null), optional offerInfo/license, transaction (CheckoutProgress), message. onState publishes copied immutable public state, including closure immediately on identity/visibility/offline/staleness/expiry/errors. onLicenseActive only receives current fresh LicenseStatus. Poll sequentially every 4 s; independent freshness/identity tick every 250 ms. Unavailable/deactivated offer disables purchase but does not revoke an existing entitlement. getState reevaluates freshness. CSS custom properties and parts provide host theming. Missing metadata shows a paste field and disabled purchase until verified; no remote metadata fetch.

## Duplicate and recovery contract

Reuse exact marketplace purchase lock identity `pact-solana-${program}:${buyer}:${offer}`. Web Locks + operation guard + persistent public journal required, fail closed when unavailable. Honor legacy `pact.solana.pending.v1` purchase entries read-only as well as new checkout journals; never bypass, overwrite or silently migrate unresolved legacy attempts. Legacy records without baseline retain conservative recovery protection. Store baseline in a separate versioned checkout record, not extra fields inside legacy whitelist schema. All ESM/IIFE client instances on same origin use the same locks/journal. Cross-origin exactly-once is not claimed; program rejects purchases while already active.

For SDK-origin attempts, persist a schema-valid legacy v1 mirror before submission alongside the separate checkout baseline record. This makes existing marketplace handlers honor SDK-origin uncertainty without any marketplace code change. Partial journal writes fail closed before broadcast. Clear own paired records only for the expected matching signature and proven resolution; never overwrite a different incarnation or blindly clear legacy-only attempts. If a marketplace resolves the mirrored record first, checkout's retained record still requires read-only reconciliation. No extra baseline fields enter the v1 schema.

For new records, capture pre-attempt canonical missing/initialized entitlement identity and expiry. Release expired attempts only after finalized height beyond lastValidBlockHeight, repeated history-null status, invalid blockhash and fresh finalized unchanged baseline. Changed entitlement/confirmed observations/outage remain protected. Never retry submission in the same call. No signed wire or wallet credentials in storage/logs/callbacks.

## Build/example contract

Backend adds pinned dev-only esbuild 0.28.2 and direct pinned existing-transitive @noble/hashes 1.8.0. Build TypeScript ESM/types for root/checkout/widget plus self-contained browser ESM `dist/pact-checkout.mjs` and IIFE `dist/pact-checkout.js` (`PACT.mountCheckout`), platform browser/target es2022, no React/Next/external runtime dependencies. Preserve original root entrypoint.

Example port defaults to 3006 and advances on EADDRINUSE through 3016, announces actual URL, binds 127.0.0.1, never stops other listeners. Explicit public demo configuration references existing program/RPC/offer. Metadata is exact host configuration or paste fallback; no fabricated title or success. Example onState controls the locked feature and rechecks controller state before actions. Production example has no synthetic mode; QA fixtures are separate. Saturday Lights (currently 3005), Prism 3004 and PACT 3003 remain untouched until an authorized coordinated build/restoration of PACT.
