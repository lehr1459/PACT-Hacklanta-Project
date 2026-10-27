# @pact/sdk 0.2.0

The root entrypoint provides read-only digital-license verification for PACT on **Solana Devnet**. The program is fixed to `EiiiWWsW2kkqP6nugHz6iBADvhnW5xnibAtZ82ZExVqy`. The separate checkout entrypoint described below supports an explicit purchase; root verification does not sign or submit transactions. An entitlement does not establish copyright ownership. This unpublished candidate needs the release checks and owner approvals described in [distribution policy](DISTRIBUTION.md).

## Install and package

Obtain the approved tarball and its SHA-256 manifest through an authorized channel, then install your copy in your own application:

```sh
npm install /absolute/path/to/pact-sdk-0.2.0.tgz
```

Consumers need the tarball and a resulting lockfile, without a sibling PACT checkout or its node_modules. Use `npm ci` for subsequent installs. Repository contributors can run `node scripts/release/sdk.mjs` from a clean committed checkout with the pinned runtime to prepare two independent source builds and an exact matching tarball; no publication occurs. Internal examples may use file dependencies, with SDK build first.

Compiled ESM, declarations and browser bundles are included. CommonJS can use `await import('@pact/sdk')`. Runtime dependencies are pinned `@solana/web3.js` 1.99.0, `buffer` 6.0.3 and `@noble/hashes` 1.8.0. React is optional (`>=18 <20`); server modules require Node 24.22.0 or a reviewed later Node24 patch. The validation pin is Node24.22.0/npm11.19.1, Next.js16.4 and locked Chromium. Other Node majors and native wallet environments are not validated targets. See the release's consumer evidence for exact combinations and the dated Node security review; a version pin is not a security clearance.

The 0.2 HTTP client rejects incomplete or inconsistent successful responses, including older servers omitting nonce or preparation context. Upgrade the matching API and SDK together. Offer nonce enables PDA verification, prepared offers carry context/timing, and transaction status declarations include contextSlot. Prepared v0 transactions must be unsigned, use the expected payer/program/instructions and match exact metadata. The HTTP client does not grant authorization to the browser. See [changelog](CHANGELOG.md).

## API

```ts
import {createPactClient, isLicenseStatusFresh, PactError} from '@pact/sdk';
const pact = createPactClient();
const input = {offer: 'OFFER_PUBLIC_ADDRESS', wallet: 'BUYER_PUBLIC_ADDRESS'};
const allowed = await pact.verifyLicense(input); // false on every error
const status = await pact.getLicenseStatus(input); // errors throw PactError
const active = await pact.requireLicense(input); // active status or PactError
```

`createPactClient({rpcUrl?, fetch?, now?})` defaults to the official Devnet endpoint and checks the exact Devnet genesis on every read. HTTPS RPC URLs (or localhost HTTP) are allowed; URL user/password fields are forbidden. Public RPC configuration is not a place for credentials. Custom fetch and millisecond clock are test seams and must behave honestly. Concurrent reads on the same client fail closed; schedule one read at a time.

`getLicenseStatus` returns JSON-serializable fields: `program`, `offer`, `wallet`, `licensePda`, `contextSlot`, `chainTimestamp`, `expiry`, `state`, `active`, `startedAtMs`, `receivedAtMs`, `lastProgressAtMs`. On-chain time/expiry are decimal strings. State is `active`, `expired` or `missing`. Missing account or empty system-owned pre-funded license PDA means missing; malformed accounts throw. Deactivation does not revoke an existing license.

Error codes: `INVALID_INPUT`, `WRONG_NETWORK`, `RPC_ERROR`, `TIMEOUT`, `INVALID_ACCOUNT`, `STALE`, `LICENSE_REQUIRED`. `requireLicense` uses `LICENSE_REQUIRED` for a valid missing/expired entitlement; infrastructure/validation errors retain their own codes.

The SDK checks canonical addresses, offer and license PDA seeds/bumps, account owners and discriminators, exact layouts, embedded buyer/offer links, offer terms, executable upgradeable program and same-context Clock slot. Each whole read has a five-second deadline, including response bodies. Lower slots and backwards chain/local time are rejected. Repeated identical slots stop granting access after twelve seconds. A snapshot lasts less than eight seconds; effective expiry advances with elapsed local time. `isLicenseStatusFresh(status, nowMs?)` includes entitlement expiry and returns false for missing/expired status. It is an evaluation helper, not authentication of a caller-supplied object.

## React / Next.js

Create one client per mounted verification session, poll sequentially, and close the feature on any error. A separate short timer must also re-evaluate freshness even if polling hangs. Reset displayed access when the wallet or offer changes, and discard responses belonging to the previous selection.

```tsx
'use client';
import {useEffect, useMemo, useState} from 'react';
import {createPactClient, isLicenseStatusFresh, type LicenseStatus} from '@pact/sdk';
export function LicensedFeature({offer,wallet}:{offer:string;wallet:string}) {
  const pact=useMemo(()=>createPactClient(),[offer,wallet]);
  const [status,setStatus]=useState<LicenseStatus>();
  const [now,setNow]=useState(Date.now());
  useEffect(()=>{
    let stopped=false; let timer:ReturnType<typeof setTimeout>;
    setStatus(undefined);
    const read=async()=>{
      try {const next=await pact.getLicenseStatus({offer,wallet}); if(!stopped)setStatus(next);}
      catch {if(!stopped)setStatus(undefined);}
      finally {if(!stopped)timer=setTimeout(read,2000);}
    };
    void read(); const tick=setInterval(()=>setNow(Date.now()),250);
    return()=>{stopped=true;clearTimeout(timer);clearInterval(tick);};
  },[pact,offer,wallet]);
  const allowed=!!status&&status.offer===offer&&status.wallet===wallet&&isLicenseStatusFresh(status,now);
  return allowed?<div>Licensed demo feature</div>:<div>Access closed</div>;
}
```

## Node / server

```ts
import {createPactClient, PactError} from '@pact/sdk';
const pact=createPactClient();
try {
  await pact.requireLicense({offer, wallet});
  // Return a protected result only after separately authenticating this wallet.
} catch (error) {
  if (error instanceof PactError) console.log(error.code);
}
```

Reading a public wallet address does **not** authenticate the requester. A server must independently bind its authenticated session to the wallet before delivering confidential resources. Client-side hiding is suitable for a demo, not confidential asset protection. Boolean verification is a momentary decision; never cache it indefinitely. SDK timeouts and failures always close access.

## Known dependency limitation

Independent `npm audit --omit=dev` reported four moderate findings in the web3.js/jayson/stream-json/uuid dependency chain, with zero high or critical findings. This SDK uses `PublicKey` and its own fetch implementation rather than the reported advisory paths; that observation is not a security clearance. See the repository's `docs/SDK_DEMO.md` for the audit evidence and limits. Dependency findings remain a known limitation of the pinned demo package.

## Embedded checkout

Checkout is an additive opt-in module. Importing or constructing it never connects a wallet, signs, simulates or submits. `preparePurchase` performs public reads and returns an unsigned transaction. Only an explicit `purchaseLicense` call with `termsAccepted: true` can request signing and submit a transaction. Automated validation uses synthetic adapters and RPCs, not real wallets or live purchases.

```ts
import {createCheckoutClient} from '@pact/sdk/checkout';
const checkout=createCheckoutClient({
  programId:'EiiiWWsW2kkqP6nugHz6iBADvhnW5xnibAtZ82ZExVqy',
  rpcUrl:'https://api.devnet.solana.com',
  onState:state=>console.log(state.stage),
});
// Host UI must connect and review exact matching metadata explicitly.
await checkout.connect();
const quote=await checkout.getOffer({offer});
const preview=await checkout.preparePurchase({offer,metadataJson});
// In a separate, explicit user click after approval:
const result=await checkout.purchaseLicense({offer,metadataJson,termsAccepted:true});
// On uncertainty, inspect/reconcile the existing attempt; do not retry payment:
const pending=checkout.getPendingPurchase({offer});
if(pending) await checkout.recoverPurchase({offer});
checkout.destroy();
```

`OfferInfo` exposes validated seller, lamport price, duration, opaque terms hash, availability and snapshot context. Title and terms are off-chain: `validateCheckoutMetadata(metadataJson, quote)` checks the existing schema, 64 KiB UTF-8 limit, exact Keccak-256 hash, price and duration. Do not invent metadata from a hash. Render text as text, never HTML. Price settles directly to the seller; buyer also pays network fees and any entitlement-account rent. Expiry begins at the executing chain Clock, not the displayed quote time.

`WalletAdapter` supports connect, disconnect, getPublicKey, signTransaction, subscribe and destroy. The default injected Phantom adapter is detected lazily and imports safely on servers. It requires sign-only support and identity events; it never invokes signAndSendTransaction. A host-supplied adapter/fetch/clock must be trustworthy. Only the reviewed fixed program is accepted; program and public RPC configuration are explicit, and genesis is rechecked throughout the flow.

`PurchaseResult.outcome` distinguishes `licensed`, `already-licensed`, `rejected`, `failed`, `expired`, `unknown` and `finalized-unverified`. Finalized payment does not itself prove current access. A new checkout's licensed result requires a fresh finalized, correctly bound entitlement verified by the original SDK at or beyond the transaction slot. Already-licensed checks and normal reads without a protected attempt retain the root SDK's fresh confirmed-read policy. The widget keeps unresolved purchases and invalid journals locked until recovery completes. Wallet changes, hidden documents, offline state and destruction close access and invalidate approvals before submission. An in-flight send cannot be undone by closing the UI.

Checkout preserves explicit compute budget (200,000 CU, zero priority price), reviewed message bytes, one controlled submission and blockhash lifetime. It never automatically resends. On uncertainty, a public journal retains buyer/offer/signature/blockhash/lifetime and pre-purchase entitlement baseline; signed wire bytes and credentials are never stored. Same-origin Web Locks use the marketplace's exact purchase lock identity. SDK attempts mirror the marketplace's strict legacy journal while keeping baseline data separate, preventing the marketplace from bypassing an unresolved SDK attempt. Existing marketplace-only entries are read-only and retain conservative expiry protection. Missing, malformed or inconsistent storage fails closed. Browser Web Locks and writable verified localStorage are required for purchases. Cross-origin exactly-once behavior is not claimed.

Recovery only reads an existing signature. It tolerates transient read failures and preserves observed confirmation. Expiry requires finalized height past validity, repeated history-null status, invalid blockhash and a fresh finalized entitlement matching the original baseline. Changed entitlement or unavailable evidence remains protected. Storage cleanup failures retain retry protection; a successful payment must not be described as unknown solely because local cleanup failed.

For a framework-free UI, use `mountCheckout` from `@pact/sdk/widget`, or the self-contained browser files `dist/pact-checkout.mjs` and `dist/pact-checkout.js` (`PACT.mountCheckout`). The widget is inline Shadow DOM, with explicit terms approval and sequential verification polling. No React, Next, iframe or external runtime dependency is bundled. Runtime adds pinned `@noble/hashes` 1.8.0 for exact metadata hashing; browser bundling uses dev-only esbuild 0.28.2. Run `npm run build`, `npm run typecheck` and `npm test` locally; pack only after all owned widget sources are ready.

Hosts that require wallet ownership authentication can pass `purchaseAccess: {allowed: false, reason: 'Authenticate Wallet before purchasing.'}` to `mountCheckout` or the React `PactCheckout` component. The disabled reason appears beside purchase; `WidgetState.purchase` exposes the same `{enabled, reason}` readiness used by the button and imperative `purchase()` call. After authenticating the connected wallet on the host server, use `controller.setPurchaseAccess({allowed: true})`, `controller.resetUnsubmittedAttempt()`, and `await controller.refresh()`. The React prop updates without remounting checkout or destroying its adapter. Omitting host access preserves normal SDK behavior; it never bypasses metadata, terms, freshness, wallet, journal, or entitlement checks. Server authorization remains mandatory for protected resources.

`resetUnsubmittedAttempt(): boolean` clears unsigned progress/errors and returns `false` during an operation, with signed diagnostics, or when pending journals are protected/unavailable. It does not remove signed journals or release recovery protections. Adapter errors with explicit `AUTH_REQUIRED`, `AUTH_INVALID`, or `AUTH_UNAVAILABLE` codes return `failed` and retain their codes; the widget identifies authentication blocking with no transaction submitted. Actual user signature rejection (including wallet code `4001`) remains `rejected`. Preparation/simulation failures publish `failed` with an unsigned diagnostic; deterministic signed preflight rejection and unknown recovery retain their existing transaction outcomes.

`resetResolvedFailure(): boolean` separately clears `rejected`, `failed`, or `expired` diagnostics, including a retained public signature, only when checkout is idle and a fresh pending-journal inspection confirms protection is released. It returns `false` during connection, purchase, or recovery, with unavailable/protected journals, or for finalized, unknown, or confirmed states. It never edits journals or consent. A valid new purchase invokes both safe diagnostic resets; hosts can also invoke this method after authentication succeeds.

### Server concurrency and actual resources

`createPlatformReader` supports eight concurrent operations and sixteen queued operations with a five-second deadline including queue time. Pass `{signal}` as the optional second method argument to cancel. Request state is isolated; endpoint slot/Clock progress history persists across requests. Cancelled work that ignores abort keeps its worker capacity until it settles. The original `createPactClient` retains its single-read contract.

`createPactApiHandler` reserves public and protected read capacity separately and applies independent public/auth/protected request budgets. Configure server-owned `resources` policies to protect actual assets/actions; `/protected` is only a compatibility demonstration. Resource preparation is side-effect-free and bounded; the original authenticated session and current entitlement are rechecked before delivering copied bytes or a synchronous, nonthrowing host commit. See [the full authorization contract](../../docs/development/AUTHORIZATION.md) and the executable platform example. One persistent customer-hosted Node process is the supported auth topology; restarting closes all sessions. Detected serverless, cluster and worker-thread configurations cannot enable this mode.

New marketplace purchases now write the SDK-compatible primary baseline journal and unchanged legacy mirror. Expired unsuccessful repurchases can be released only after finality/history/lifetime checks and an exact unchanged finalized entitlement baseline. Older baseline-less attempts retain conservative expiry protection. Finalized success/failure remains distinct from a failed account refresh or journal cleanup; no automatic resubmission is introduced.
