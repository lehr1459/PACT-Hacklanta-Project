# PACT embedded checkout — Phase 1

**READY for local integration and operator review.** All automated acceptance and independent QA/Security evidence reconciliation passed. Real Phantom signing, settlement, unlock and expiry verification for the new embedded checkout remain pending separate operator authorization.

## Build and launch (Windows PowerShell)

From a new terminal:

```powershell
Set-Location 'C:\Hackathon\PACT Hacklanta Project'
npm --prefix packages/pact-sdk ci
npm --prefix packages/pact-sdk run build
npm --prefix packages/pact-sdk run typecheck
node examples/pact-checkout-vanilla/server.mjs
```

Open the exact localhost URL printed by the server. Default is `http://localhost:3006/`; occupied ports are skipped through 3016 without stopping other listeners. To choose a starting port, set `$env:PORT = '3007'` before launching, then `Remove-Item Env:PORT` afterward if you no longer need the override. The supported override range is 3006–3016. Stop your foreground example with Ctrl+C. Do not start another copy if the desired preview is already running.

The example uses a static-file allowlist and serves the built SDK browser files; it does not expose arbitrary repository, operator configuration or signer paths. Serve browser artifacts over HTTP/HTTPS, not `file://`.

For SDK and widget regression checks, use another terminal after stopping any QA server on port 3008. These commands use synthetic providers only; the `live` mode below permits public offer reads and has no wallet provider:

```powershell
Set-Location 'C:\Hackathon\PACT Hacklanta Project'
npm --prefix packages/pact-sdk test
node examples/pact-checkout-vanilla/tests/build-saturday-consumer.mjs
$env:PACT_CHECKOUT_QA_MODE = 'mock'
& '.\web\node_modules\.bin\playwright.cmd' test --config examples/pact-checkout-vanilla/tests/playwright.config.ts
$env:PACT_CHECKOUT_QA_MODE = 'live'
& '.\web\node_modules\.bin\playwright.cmd' test --config examples/pact-checkout-vanilla/tests/playwright.config.ts
Remove-Item Env:PACT_CHECKOUT_QA_MODE
```

Use the existing installed Playwright browser/tooling. Full marketplace/wizard production checks require coordinated shutdown of the PACT preview before rebuilding its `.next` directory; do not rebuild a serving production directory. The independent QA report records the complete acceptance commands and results.

## Installation and vanilla quickstart

The SDK is not published to npm. Build it as above, then install from the target application's directory:

```powershell
npm install 'C:/Hackathon/PACT Hacklanta Project/packages/pact-sdk'
```

For another machine, run `npm pack` inside the built SDK package, copy its generated tarball, and install the tarball's actual path. Do not assume a registry package is available. `npm pack` only produces a local artifact; no publication is authorized.

Bundled applications import `mountCheckout` from `@pact/sdk/widget`. Plain HTML applications copy `dist/pact-checkout.mjs` into their public assets and load it as a browser module, or copy `dist/pact-checkout.js` and use its classic-script global:

```html
<div id="license-checkout"></div>
<div id="premium-feature" hidden>Local premium demo interface</div>
<script src="./pact-checkout.js"></script>
<script>
  const premium = document.querySelector('#premium-feature');
  const checkout = PACT.mountCheckout({
    element: '#license-checkout',
    offer: 'YOUR_EXISTING_OFFER_PDA',
    programId: 'EiiiWWsW2kkqP6nugHz6iBADvhnW5xnibAtZ82ZExVqy',
    rpcUrl: 'https://api.devnet.solana.com',
    // Optional metadataJson: the seller's exact saved UTF-8 JSON string.
    onState(state) { premium.hidden = state.access !== 'active'; },
  });
  // Recheck checkout.getState().access === 'active' before each premium action.
  // On host teardown: checkout.destroy(). Never cache an active callback forever.
</script>
```

For browser ESM, replace the classic script with `import {mountCheckout} from './pact-checkout.mjs'` in a module script and call `mountCheckout` with the same options. Both browser artifacts are self-contained; the npm entrypoint is for bundlers/ESM module consumers. Host content-security policy must permit the chosen scripts and widget styles; Shadow DOM is style isolation, not a security boundary.

## Configuration and lifecycle

| Option | Meaning |
|---|---|
| `element` | Existing HTMLElement or matching selector; inline mount |
| `offer` | Required canonical existing offer PDA; no implicit demo default |
| `programId` | Required reviewed PACT Devnet program ID |
| `rpcUrl` | Required public HTTPS endpoint (local HTTP allowed); Devnet genesis verified |
| `metadataJson` | Optional exact seller JSON; omitted means paste fallback |
| `walletAdapter` | Optional trusted adapter; defaults to injected Phantom |
| `onState` | Full public state, including immediate access closure |
| `onLicenseActive` | Optional current fresh status notification; not permanent authorization |

The controller exposes `connect`, `disconnect`, `refresh`, `purchase`, `getState`, and `destroy`. Mounting performs public offer reads but never auto-connects or transacts. Use the widget's terms checkbox and purchase button; calling `purchase` programmatically still requires its current verified quote, consent and connected identity. `refresh` reconciles a protected existing attempt using reads only, then verifies access. Automatic four-second polling performs verification only; an independent 250 ms identity/freshness timer closes stale access.

SDK checkout entrypoint exposes `createCheckoutClient`, `createPhantomAdapter`, `validateCheckoutMetadata`, `getOffer`, `preparePurchase`, `purchaseLicense`, `recoverPurchase`, and `getPendingPurchase` through the client methods described in `docs/EMBEDDED_CHECKOUT_INTERFACES.md`. `preparePurchase` returns an unsigned inspection object; `purchaseLicense` always reconstructs its own transaction from fresh validated inputs.

Widget access states are `disconnected`, `checking`, `unlicensed`, `expired`, `active`, `error`, and `paused`. Transaction states are independent: constructed/preparing, awaiting signature, wallet-signed, RPC-accepted, processed/confirmed, finalized, rejected, failed, expired, or unknown. SDK purchase results distinguish `licensed`, `already-licensed`, `rejected`, `failed`, `expired`, `unknown`, and `finalized-unverified`. An existing active license avoids another payment; a finalized payment with unavailable/expired verification stays locked.

Host themes use `--pact-ink`, `--pact-background`, `--pact-muted`, `--pact-border`, `--pact-accent`, `--pact-radius`, and `--pact-font`, plus documented Shadow DOM parts in the example README. Dynamic metadata is displayed as text, not injected HTML.

## Wallet requirements and common errors

Use Chrome with Phantom's injected Solana provider on HTTPS or localhost; purchase requires sign-only support, identity events, Web Locks and writable localStorage. Select Solana Devnet in Phantom manually; extension network settings are not always exposed, so the SDK verifies the RPC genesis and sends only to the configured Devnet endpoint. No seed/private key belongs in the host application.

- Missing/rejected Phantom: access stays closed; install/unlock the extension and explicitly reconnect when authorized.
- Wrong program/network or malformed account: correct public configuration; never bypass checks.
- Metadata mismatch: obtain the exact seller download, including whitespace. A title cannot be recovered from the on-chain hash.
- Insufficient test SOL: buyer needs price plus network fee and possible 81-byte entitlement rent/top-up. The example does not fund wallets.
- RPC timeout, offline/hidden page, frozen slot or expired license: access closes; restore connectivity and request a fresh read.
- Unknown/pending transaction: inspect its Devnet Explorer link and use **Check pending transaction**. Never click another payment blindly or delete protected journal entries to force a retry.
- Unresolved legacy marketplace record: checkout honors it; inspect/recover the original transaction in PACT. It does not silently replace or clear legacy uncertainty.
- Storage/locking failure: no new purchase is permitted; use a supported normal Chrome session. Do not bypass duplicate protection.

## Architecture and boundaries

The root `@pact/sdk` remains the compatible read-only verification API. New opt-in `@pact/sdk/checkout` and `@pact/sdk/widget` entrypoints enable an explicitly requested Devnet purchase inside the host browser document. The widget is vanilla JavaScript, not React, Next.js or an iframe. A Worker can serve its files; wallet operations run in the browser.

Every checkout requires explicit offer PDA, program ID and public RPC URL. Phase 1 accepts only reviewed PACT program `EiiiWWsW2kkqP6nugHz6iBADvhnW5xnibAtZ82ZExVqy` and verifies Devnet genesis on the configured RPC. The reference offer `7EdfowQEZyVyyp7bYdQyzmprZtVU9mVba8cysHm2Ardh` is example configuration, not a purchase default.

Offer price, duration, seller and agreement hash come from validated on-chain accounts. Title and legal terms are **off-chain** seller metadata: the exact UTF-8 JSON must match the stored Keccak-256 hash, price and duration before purchase. Hosts can supply exact metadata or customers can paste the seller's downloaded JSON. No automatic remote metadata fetch, registration database or backend authentication service is added.

Purchase and entitlement states are separate. The reviewed message is simulated before approval, signed using the injected adapter, copied/validated, submitted once to verified Devnet, finalized through historical status reads, then followed by fresh buyer-bound account verification. A signature, RPC acceptance or confirmed-but-not-finalized transaction is not an active license. Uncertain attempts are protected; recovery is read-only and never automatically resends. An unresolved purchase or unreadable purchase journal keeps widget access closed even if a normal confirmed account read reports an active entitlement. With no protected attempt, existing entitlements use the preserved root SDK's fresh confirmed-read policy; a new checkout must complete its stricter finalized recovery gate first.

## Security limitations

Client-side gating is appropriate for demos and low-security UI restrictions; it is not tamper-proof DRM or server authorization. Host scripts can alter UI/provider objects. Public wallet addresses and widget callbacks do not prove authenticated ownership to a server. Confidential APIs/files require a separately authenticated wallet session and fresh server-side entitlement verification before returning resources. Do not ship confidential content merely as hidden UI.

Freshness, identity, expiry and failures close access. Hidden/offline pages, account changes, disconnects and stale asynchronous responses invalidate the current session. A destroyed widget stops access callbacks and leaves unresolved transaction protection intact. Same-origin locks prevent local concurrent sends; cross-origin exactly-once purchases are not claimed. The on-chain program rejects purchases while an entitlement remains active.

Browser configuration is public; never embed RPC secrets, private keys, recovery phrases or deployment signer files. No real wallet request, signing, simulation, broadcast, transfer, deployment, npm publication or Git push is authorized by implementation/testing. Synthetic fixtures are test evidence only.

The configured RPC and host-supplied adapter, fetch and clock are trusted infrastructure. A dishonest RPC can fabricate coherent genesis/account responses; these checks are not independent cryptographic proof of RPC honesty. Use a trusted Devnet endpoint. The existing SDK's documented transitive dependency advisories remain; this local release is not a production security audit.

Phantom sign-only support is used deliberately to retain PACT's reviewed exact-message and controlled-RPC safeguards. It is documented as a traditional injected-provider capability and may change; missing capability fails closed. Chrome HTTPS/localhost is the initial supported environment; no iframe/native mobile checkout claim.

## Compatibility and ownership

Saturday Lights at `C:\Hackathon\saturday-lights` currently serves on port 3005 and embeds a vendored copy of the existing read-only SDK. Its source was inspected read-only; it is not modified or deployed by this task. Independent QA compiled its original gate against the updated SDK inside a PACT-owned compatibility harness and tested active, expired and wallet-mismatch closure with synthetic providers. That is distinct from a new real Saturday Lights wallet purchase test.

PACT 3003, Prism 3004 and Saturday Lights 3005 are preserved. The new example defaults to 3006 and announces the next available loopback port through 3016 if occupied. Existing SDK exports, marketplace purchase handlers, wizard, Base fallback, deployed program and Git tags are preserved.

Interfaces and file ownership: `docs/EMBEDDED_CHECKOUT_INTERFACES.md`. Independent execution evidence: `docs/EMBEDDED_CHECKOUT_QA.md` (created by QA during acceptance).

## Implemented files and acceptance evidence

| Files added or changed in this phase | Purpose |
|---|---|
| `packages/pact-sdk/src/checkout.ts`, `src/adapter.ts`, `src/widget.ts` | Opt-in purchase client, Phantom adapter and inline widget |
| SDK `build.mjs`, `package.json`, `package-lock.json`, `README.md` | Pinned dependencies, additive exports, self-contained browser builds and API docs |
| SDK `tests/checkout-focused.test.mjs`, `checkout-qa.test.mjs`, `checkout-qa-fixtures.mjs` | Focused and independently executed checkout regressions |
| `examples/pact-checkout-vanilla/{index.html,app.js,style.css,config.js,server.mjs,README.md}` | Standalone locked palette workspace and checkout on 3006 with fallback |
| Example `tests/{widget.spec.ts,live.spec.ts,saturday.spec.ts,harness.html,server.mjs,playwright.config.ts,prism.config.ts,prism-server.mjs,build-saturday-consumer.mjs}` | Independent browser, original Saturday consumer and isolated Prism evidence |
| `docs/EMBEDDED_CHECKOUT*.md`, root `README.md`, `docs/{STATUS,HANDOFF,DECISIONS}.md` | Interfaces, operator runbook, QA evidence and coordination |
| Generated SDK `dist/` checkout/adapter/widget JavaScript/types and browser ESM/IIFE | Distributable outputs; original root source/declarations unchanged |

The prior uncommitted marketplace/wizard/Solana work is preserved; it is not reported as new checkout work.

| Executed check | Result |
|---|---|
| SDK root + focused + independently executed tests | 57/57 (27 + 5 + 25), no skipped SDK cases |
| Checkout desktop/mobile mock + actual public reads | 28/28 + 4/4 |
| Preserved Solana configured + setup + actual reads | 154/154 + 2/2 + 2/2 |
| Preserved Base configured + setup | 48/48 + 2/2 |
| Wizard mock + actual reads; generated Next.js/React compilation/runtime | 8/8 + 2/2; 44/44 |
| Isolated unchanged Prism mock + actual reads | 22/22 + 2/2 |
| Unchanged compiled Solana program; preserved Foundry contracts | 23/23; 23/23 including 256-run fuzz |
| SDK TypeScript/browser builds; final actual-config web TypeScript/build | PASS; five static pages |
| Fresh tarball Node/SSR/public exports/types + browser bundles | PASS |
| Port collision fallback and static-file restrictions | PASS |

The actual read-only quote showed the reference offer active at 0.001 test SOL for 180 seconds. No new payment or entitlement is claimed. The QA report identifies authoritative logs and explicitly invalidates earlier subprocess wrapper counts that did not execute test bodies. It also retains the harness failure history; final styled desktop/mobile examples were visually reviewed.

Restored previews: PACT `http://localhost:3003/` (PID 30520), new example `http://localhost:3006/` (PID 29552). Root, wizard, Base, Prism, Saturday Lights and checkout return HTTP 200; checkout starts locked, CSS is served as `text/css`, and served ESM/IIFE bytes match the independently tested bundles. Startup/request output contains no errors. Prism PID 9552 and Saturday Lights PID 33544 are unchanged.

Final preservation check at `2026-10-11T01:10:01.946Z`: all 90 protected PACT hashes and 2,241 Saturday Lights hashes match the starting baseline. Program artifact SHA256 remains `D13828B060327EF9F702B076B8681E4B9E1E8C04F961191D1DF17B2BABF52A62`; all four existing Git tags remain. SDK audit retains four moderate advisory entries and zero high/critical entries. No publication, push, deployment or live wallet/chain action occurred in this phase.

## Manual purchase stop gate

After automated acceptance, the operator must separately authorize one specific Devnet purchase before connecting/signing through the real wallet. Prepare exact seller metadata, a distinct buyer Phantom wallet on Devnet, and adequate test SOL for price, network fee and any license-account rent. Inspect the configured offer, seller, program and network before approving anything. Do not use the program upgrade authority as the browser demo wallet.

After separate authorization for a specific buyer/offer purchase:

1. Start the example with the commands above and open its printed URL in Chrome with Phantom. Confirm explicit program `EiiiWWsW2kkqP6nugHz6iBADvhnW5xnibAtZ82ZExVqy`, the intended offer PDA, Solana Devnet, seller, exact price and duration. The default offer is `7EdfowQEZyVyyp7bYdQyzmprZtVU9mVba8cysHm2Ardh`; verify current availability rather than creating another offer.
2. Use a buyer wallet distinct from the seller and upgrade authority. Select Devnet in Phantom and fund it separately with Devnet test SOL. For the reference 0.001 SOL offer, 0.01 test SOL is a practical allowance, not a guaranteed exact quote; inspect current rent and Phantom fees before approval.
3. Paste the seller's exact metadata JSON. Require the hash/price/duration match message and review the title/terms. Connect Phantom and verify the displayed buyer address. An already-active entitlement should unlock after a fresh read without another purchase.
4. For an unlicensed or expired buyer, approve the matching terms checkbox and click **Purchase license** once. Review Phantom's intended Devnet payment and fees, then approve only that authorized purchase. No marketplace redirect is needed.
5. Observe wallet-signed, RPC-accepted, confirmed and finalized states separately. Save the signature/Devnet Explorer link. If unknown or pending, stop additional payment attempts; use read-only recovery. Finalization alone does not justify access.
6. Require a fresh verified buyer entitlement and premium interface unlock. Independently check transaction execution, seller settlement and buyer-bound entitlement PDA/expiry on Devnet. Record this as real evidence only after successful reads and wallet behavior.
7. Disconnect and switch to the seller or an unlicensed wallet: premium actions must lock. Return to the buyer and verify fresh access if still valid. Wait for the on-chain expiration (reference duration 180 seconds) and confirm lock; hiding/offline/RPC failure must also close access.
8. Stop after recording the authorized purchase and read-only checks. No additional purchase, offer creation, transfer, deployment or upgrade is implicit.

Real Chrome permissions/rejections, sign-only compatibility, payment settlement, unlock and expiry remain unverified until this separately approved test succeeds. Automated synthetic transactions and public Devnet offer reads cannot substitute for that evidence.
