# Human Phantom acceptance for local PACT and isolated staging

Prepared October23, 2026. Every step is **pending human/owner execution**. Automated tests use disposable signers and do not establish Phantom extension/device, message-prompt or transaction acceptance. No agent may approve a wallet prompt, sign/broadcast a transaction, receive a seed/private key, invite testers or change wallet settings on a person's behalf. Use Solana Devnet only. The old public PACT deployment and Saturday Lights remain unchanged.

## Local message-only acceptance variant

Added October26, 2026. This variant requires no purchased domain, external host, deployment, new offer or purchase. **Human wallet acceptance is pending.** Before requesting any Phantom message, the owner must authorize the named human operator and exact local origins for message-only acceptance. The human reviews and approves or rejects each prompt personally. This document and automated testing do not grant permission to sign, approve or broadcast a blockchain transaction. If a transaction prompt appears during this variant, reject it and stop.

Use a clean checkout of the approved source revision with the reviewed Node/npm versions from `scripts/validation/runtime.json`, installed dependencies, and no copied workstation environment files. Follow [LOCAL_TESTING](LOCAL_TESTING.md) to install/build the SDK, install the API/web dependencies and start these owned local processes. Do not stop an unrelated listener to free a port.

Terminal one, from the checkout root:

```text
npm --prefix services/pact-api run dev
```

Terminal two, PowerShell, from the same checkout root:

```powershell
$env:PACT_HOSTED_API_INTERNAL_URL = 'http://127.0.0.1:4100'
$env:PACT_APP_ORIGIN = 'http://localhost:3000'
$env:NEXT_PUBLIC_PACT_SOLANA_PROGRAM_ID = 'EiiiWWsW2kkqP6nugHz6iBADvhnW5xnibAtZ82ZExVqy'
npm --prefix web run dev -- --hostname localhost --port 3000
```

The local-only API uses ignored PGlite SQL/pepper/clock data and reads real Devnet RPC. This is interactive acceptance, not native PostgreSQL hosting acceptance; deterministic native PostgreSQL coverage is separate. Preserve API SQL, pepper and clock together for normal restarts; do not delete clock files to bypass a failure. Confirm `http://localhost:3000/v1/health/live` and `/v1/health/ready` succeed before continuing. Readiness is not an entitlement or deployed-binary attestation.

1. Record the approved source SHA, desktop browser/Phantom versions and public D/S/B identities under the evidence policy. Use three distinct human-controlled accounts and separate browser profiles, or explicitly log out before each account switch. Select Solana Devnet in Phantom personally. The PACT issuer is exactly **`http://localhost:3000`**; `127.0.0.1:3000` is a different issuer. Loopback HTTP is the explicit local exception; external operation requires HTTPS.
2. The owner supplies an **existing active Devnet offer controlled by S**, its public address and seller-exact metadata/buyer link. Verify the selected seller and offer in the actual PACT interface. If the owner cannot supply a controllable existing offer, stop the resource-binding case as BLOCKED; do not create an offer automatically or substitute a synthetic account into human evidence. Existing binary provenance is reviewed separately in [Solana release assurance](../../development/SOLANA_RELEASE.md).
3. Open `http://localhost:3000/integrate/developer`. As D, reject an initial admin-login message and confirm no session appears. Obtain a fresh challenge, inspect the exact origin, account, purpose and expiry, and approve the message manually if authorized. Register app D. Attempt the signed bind of S's offer to a resource in D's app: expect403 `OFFER_OWNERSHIP_REQUIRED`. Verify no resource was created. This denial is required; there is no delegated seller authority.
4. Log D out. Switch to S, obtain a fresh admin proof and register app S. Bind S's own offer to resource **`premium-features`**. Inspect/sign the exact payload; a new resource is enabled at version1. Register callback **`http://127.0.0.1:4010/api/login/callback`** and website **`http://127.0.0.1:4010`**. Loopback registration is allowed locally without external DNS provisioning. Mint a short-lived backend key with `connect:write` and `access:check`, then activate app S through the signed action.
5. Install the existing independent consumer with `npm --prefix packages/pact-hosted-client ci` and `npm --prefix examples/pact-hosted-express ci`. Copy only its committed `.env.example` to its own private `.env.local`. Set `PACT_CONSUMER_ORIGIN=http://127.0.0.1:4010`, **`PACT_API_BASE_URL=http://localhost:3000`**, app S's public ID and `PACT_RESOURCE_KEY=premium-features`. Enter the once-revealed key privately in that server-only file, never in chat, command arguments, screenshots or browser settings. Keep the API base equal to the configured localhost issuer; do not substitute127.0.0.1. Dismiss the console secret reveal.
6. In terminal three run `npm --prefix examples/pact-hosted-express start`, then open **`http://127.0.0.1:4010`** in the buyer profile. Protected content/action must deny before login. Select B and choose Continue with PACT. Inspect the actual localhost PACT page, app S, callback website, Devnet identity and exact message. Reject once and confirm the consumer remains unauthenticated; start a fresh flow and approve manually only under the message authorization. Return to a clean consumer root URL. No grant or API secret may appear in browser storage or response bodies.
7. For B without a qualifying license, both Read protected content and Perform protected action must still deny after successful login. The marketplace link is informational; do not purchase during this variant. If the owner already controls a buyer identity with an existing unexpired entitlement for this exact offer, a separately recorded message-only login may test fresh protected allowance with that identity. Otherwise mark **real-chain licensed allowance BLOCKED**, retaining the deterministic synthetic allowance receipt separately. Do not edit SQL/chain fixtures or claim a purchase to fill this gap.
8. Verify consumer logout denies a subsequent protected request, account switch requires fresh login, callback replay cannot create authority, key rotation/revocation denies superseded credentials, and consumer restart loses its process-local session. API graceful restart with its preserved local state has different persistence semantics. Record each case's actual outcome. Stop only the three owned local processes when finished. Do not include secrets, signed messages, cookies, grants or callback query strings in evidence.

Wallet control is the supported account identity. Lost-wallet recovery, delegated organizations, refresh tokens and distributed consumer sessions are unsupported. Purchases are explicit fixed-price, time-limited, non-recurring entitlements; no subscription billing or automatic renewal is implemented. Offer deactivation stops new sales while preserving existing unexpired entitlements. A wallet login is not a license; an entitlement is not copyright ownership. Actual Phantom mobile/hardware-device behavior remains unverified unless independently exercised.

## Staging prerequisites

For the staging sections below, complete [owner setup](STAGING_OWNER_SETUP.md), approve the exact staging/artifact revision and establish separate HTTPS PACT and consumer origins. Record approved desktop/browser/Phantom versions and any separately approved mobile device. Synthetic320px browser coverage is not mobile Phantom handoff acceptance. Use a private acceptance record without keys, grants, callback query strings, signed messages, cookies, private RPC URLs or screenshots of proof material.

## 1. Assign three distinct identities and decide the successful seller path

| Identity | Purpose | Human control |
| --- | --- | --- |
| Developer D | Registers application D and demonstrates tenant/seller boundaries | Owner-controlled Phantom account D |
| Seller S | Owns an existing approved active Devnet offer and signs for a seller-controlled integration | A different owner-controlled account S |
| Buyer B | Signs in to the independent consumer and, only if separately authorized, buys the license | A third account B, distinct from D and S |

Only record public addresses under the accepted privacy policy. Use separate browser profiles or explicitly log out of PACT and the consumer before switching accounts; wallet switching alone must not silently change server authority. Human operators inspect the actual public account on every prompt. Devnet assets are test assets, with no claimed monetary value.

**PACT currently requires the authenticated application admin to be the offer seller.** An app administered by D cannot bind S's offer merely because both people consent or use the same organization. There is no delegated seller/organization authority. For a successful integration, choose one of these existing supported paths:

- S authenticates as a developer/admin and registers a separate application S, then binds S's own offer.
- D creates a separate offer as seller D through an explicitly approved human Devnet offer workflow, then binds that D-owned offer to application D.

The second option is not a transfer of S's offer. Do not edit chain state, bypass seller comparison, change app owner rows, reuse S's signature on D's session or weaken ownership to complete this checklist. Keep the D-versus-S denial test in either path.

## 2. Authorize message tests separately from transactions

The owner records permission for the named people to connect accounts and approve **messages only** on the exact staging origin. Wallet connection itself proves no control. A login/action signature is not purchase approval. New offers, purchase/checkout and any other transaction require a second explicit Devnet transaction authorization naming seller/buyer, offer, exact metadata and intended operation. A rejection is an expected result and must remain safe.

Inspect extension origin, wallet/public address, purpose, app/resource, payload/version and expiry before approving. If the prompt differs from the page or the expected operation, reject and stop. Never paste wallet recovery material into PACT, the terminal, chat or an environment file. Agents may explain a prompt but never approve it.

## 3. Verify developer D and the D-versus-S boundary

1. Open the approved PACT `/integrate/developer` page. With Phantom unavailable/disconnected, confirm a clear connect/sign-in path and no authenticated app access. Reject the first login prompt; confirm no authenticated session appears.
2. Select account D, request a fresh login challenge, inspect the exact admin-login message and approve it manually. Confirm the console shows D, not the wallet used by a different browser profile. Expired/replayed/wrong-account proofs must fail; never retry an old signature as a fresh login.
3. Register application D. Verify list/detail state, exact environment Devnet and signed Settings update/activation. Reject one signed mutation and confirm it does not take effect. A console session lasts15minutes; test expiry and fresh login.
4. Register the independent consumer's exact approved HTTPS callback. Confirm pending status until the domain owner installs the displayed `_pact.<callback-host>` TXT proof and manually verifies it. No wildcard, query, fragment, percent-encoded alternative or unverified domain may work. Keep the DNS token out of screenshots/logs. Verification lasts24hours; exercise renewal/revoke deliberately.
5. While authenticated as D, attempt to bind a resource key to S's active offer. D reviews and signs the exact attempted bind. Expect HTTP403 `OFFER_OWNERSHIP_REQUIRED`, no resource creation, no resource-history/version increment and no hidden successful retry. This is expected security behavior. If it succeeds, stop acceptance and report the defect.
6. Create a second application's distinct ownership context only through its real wallet login; prove D cannot read/mutate S's app by knowing its ID. Do not replace the wallet without establishing a new PACT session.

## 4. Complete an authorized seller-controlled integration

1. Choose the successful seller path from section1. Prefer S registering application S for the existing S offer, avoiding a new offer transaction. Log out D, switch Phantom to S, obtain/inspect a fresh admin message and authenticate S. Create the app and exact callback in S's own account; no D app/session is repurposed.
2. Verify the selected active offer really names the authenticated seller. Retain the seller's **exact accepted metadata text/buyer link**; an on-chain hash cannot reconstruct terms. Bind the immutable resource key and inspect/sign the exact offer payload. A new resource is already enabled at version1; confirm that state and history. Enable through its current version only if deliberately disabled. A stale expected version must conflict rather than overwrite.
3. Mint a short-lived key with `connect:write` and `access:check` through a fresh signed admin action. The once-revealed secret goes directly to the approved consumer backend secret store. Dismiss it; subsequent lists must show metadata only. Never put it in browser storage, public environment variables, callback URLs or the acceptance record.
4. Activate the app through the signed action. Configure the separate consumer backend with exact PACT issuer, app ID, immutable resource key, server credential and consumer origin. Its callback must match registration exactly. The supplied example session store is one-process and loses local sessions on restart; the owner explicitly accepts this limited pilot scope or supplies a separately reviewed durable consumer design.
5. Exercise rotation with an approved bounded overlap, configure the replacement in the consumer, then revoke the superseded credential and verify it denies. Keep the replacement active for the following buyer tests; revoke it during final cleanup. A timeout/lost acknowledgement requires inspecting current metadata before a new action proof; do not blindly repeat mutations.

## 5. Verify buyer B without a license

1. Use a clean buyer browser profile/account B on the independent consumer. Call its actual protected content/action before login; expect denial. Modifying a browser wallet address, local state or rendered status must not grant content.
2. Click the consumer's PACT login action. Verify navigation to the exact PACT origin, correct app, verified callback website, purpose and wallet B. Reject a message and confirm the consumer remains unauthenticated. Retry with a **new** transaction/challenge.
3. Approve B's exact fresh message. The consumer backend must validate state, issuer and S256 PKCE and exchange the one-use code server-side; its clean final URL must not retain the code. A successful login is not a license. With no qualifying entitlement, the protected backend content/action still denies and may offer the exact marketplace purchase link.
4. Exercise wrong-account switch, old callback replay, stale challenge, expired code and callback cancellation. Do not capture raw callback URLs/proofs. Log out during a pending read/login and confirm late results cannot restore authority. A wallet disconnect on another website is not automatically observable: consumer logout/switch must revoke/invalidate its own session.

## 6. Optional, separately approved Devnet purchase

Skip this section unless the owner has explicitly authorized the named human transaction workflow. Message-test permission is insufficient.

1. B reviews the exact seller, offer, accepted metadata, price/units/expiry and network in the existing PACT checkout. Confirm the public offer matches the server-bound resource. Inspect each Phantom transaction prompt and approve/reject personally.
2. If purchase status becomes uncertain, preserve the original public transaction identifier privately under the evidence policy and use the existing read-only recovery flow. Never blindly submit another purchase. Confirm actual finalized chain evidence; a wallet prompt or submitted identifier alone is not success.
3. After finalized entitlement, request a **new** backend access decision. Expect content/action only after fresh verified `ALLOW`; no stale positive browser boolean or purchase callback can authorize it. Confirm exact app/resource/wallet/offer/network/program bindings.
4. Verify expiry with an approved test entitlement and trusted real time; do not change host clocks or SQL timestamps to simulate a human expiry. After expiry, the next protected operation denies. Offer deactivation must block new sales while preserving an already-issued unexpired entitlement; do not claim deactivation revokes all purchased rights.

## 7. Verify revocation, failure and restart

1. Log B out, then replay an old consumer request/cookie: protected operations deny. Switch to a different wallet only through fresh login. Buyer grants last15minutes; no refresh-token flow is implemented.
2. With operator-controlled ingress and approved disposable staging data, revoke a grant/key, pause the app or disable the resource and confirm a fresh backend operation denies. Re-enabling/metadata changes may require a fresh login because policy epochs change.
3. The operator rehearses RPC/DB outage, clock failure and recovery separately. Buyer-facing uncertainty must deny; never substitute a cached positive response. Use sanitized request IDs/error classes for support.
4. Verify API graceful restart preserves unexpired hosted SQL authority and consumed/revoked state with the same epoch. Restarting the supplied consumer example must instead lose its local sessions and require login. Crash/restore drills follow the owner runbook with ingress closed, not a human browser workaround.
5. Complete the isolated backup/quarantine/new-pepper/new-clock drill. Old keys, cookies, codes, proofs and grants must deny. Human owners reauthenticate, reprove callback control and reissue/regrant before deliberate reopening.

## 8. Record the human outcome

Record approved source/application artifact identity, date, browser/device/Phantom versions, test case, expected/actual fixed status, sanitized request ID where appropriate and named human approver. Public transaction evidence can still be correlatable personal data; use the approved disclosure/retention policy. Do not attach wallet prompts, raw callback URLs, signatures, secrets, cookies, traces or automatic screenshots.

Mark each case PASS, FAIL, SKIPPED (with reason) or OWNER ACTION PENDING. A failed boundary, unexpected transaction or mismatched prompt blocks opening the pilot. Note unsupported lost-wallet recovery, delegation, distributed sessions, Mainnet and mobile handoff that was not actually exercised. Owner go/no-go, a1–3 developer pilot, invitations and wider rollout remain separate decisions; no message or invitation is sent by this checklist.
