# PACT initial release contract

Engineering scope, approved for implementation by the full-development request on 2026-10-16. Baseline: `8e259de`. This document describes software behavior; it does not execute an agreement, certify seller rights, or make a commercial/legal representation for the operator.

The matrix is the target contract for Phases 1–5. New resource enforcement, concurrency and operational capabilities become supported only after their implementation, tests and independent phase review; this document alone does not claim they already exist.

## Supported product matrix

| Capability | Initial supported model | Explicit boundary |
| --- | --- | --- |
| Network | Solana Devnet, expected genesis and reviewed program pinned in the SDK; existing Base Sepolia fallback remains isolated and preserved | No Mainnet, real-value payments, new networks, expansion of the Base fallback or automatic network generalization |
| Public reads | SDK direct RPC or public REST lookup/unsigned preparation | A public wallet address or validity response does not authenticate anyone |
| Customer enforcement | Customer mounts the Node server adapter on the same HTTPS origin as its application | PACT does not centrally secure customer resources; cross-origin authentication/SSO is excluded |
| Authentication | Explicit `single-process` opt-in on exactly one persistent Node process; bounded in-memory one-use challenges and opaque sessions | No serverless, clustered workers, replicas or distributed replay/session guarantee. Restart invalidates all challenges/sessions. Default remains disabled |
| Authorization | Authenticated session wallet, server-owned resource/offer policy and fresh chain state for every protected access; commit-boundary recheck for protected writes | Browser gates/callbacks, caller-supplied wallets/offers and API keys are never authority |
| Protected examples | Server-only licensed asset retrieval and a bounded server operation, using the reusable enforcement interface | Public demo UI and previously downloaded data cannot be made confidential or recalled at expiry |
| Wallet | Phantom is the initial purchase/authentication acceptance target; existing marketplace Solflare adapter and Base injected-wallet fallback are preserved | No claim of verified native mobile wallet, hardware-wallet or account-abstraction compatibility |
| Browser/runtime | Secure-context desktop Chromium with Web Locks for checkout; responsive mobile layout; Node 24 server/SDK tooling | Supported runtime matrix is tested with packaged artifacts; actual extension approval needs the operator |
| Metadata | Seller retains exact UTF-8 JSON; complete public buyer links within their size limit or explicit manual JSON | No hosted agreement registry, arbitrary URL fetcher, public asset registry or reconstruction of terms from a hash |
| Deployment | Public read-only web may use stateless hosting with auth disabled; authenticated examples require one persistent process | A Vercel public preview is not evidence of supported distributed authentication |
| Availability | Bounded concurrency and request budgets; dependency failures deny access; monitored controlled pilots | No contractual uptime guarantee. Devnet/RPC can be unavailable or reset; no stale-positive fallback |

Initial capacity is an engineering target to measure, not a service promise: eight active chain operations with a bounded queue and five-second operation deadline; separate public/auth/protected request budgets. All limits must be configurable within validated bounds and tested under overload. Do not claim a target was met without its test evidence.

## Exact licensing semantics

- **Asset identity:** the on-chain offer is identified by network, program and canonical offer PDA. Existing v1 metadata has title, terms, price and duration. Any description/content identifier belongs in the seller-approved exact terms; PACT does not currently verify content ownership or operate an asset registry.
- **Seller representations:** title/terms and rights assertions are seller-supplied. Wallet control proves the signer controls that wallet, not that the signer owns copyright or can legally grant the described rights. No new platform warranty is introduced.
- **Terms:** the client verifies exact UTF-8 metadata against the offer's nonzero 32-byte commitment and stored price/duration. Do not canonicalize, reserialize or alter accepted historical JSON. Public buyer-link terms must contain no sensitive data; a link fragment is not private storage.
- **Acceptance evidence:** the UI requires explicit matching-term approval before purchase. The wallet signs a transaction referencing the offer. On-chain settlement/entitlement and the retained off-chain JSON can establish the facts each records; there is no current durable platform acceptance registry or assertion of legal enforceability.
- **Price:** immutable positive integer lamports, native Devnet SOL. Buyer rent and transaction fees are additional. System Program settlement goes directly to the recorded seller, atomically with entitlement issuance; no PACT escrow/withdrawal step exists on Solana.
- **Duration and expiry:** immutable positive duration up to 31,536,000 seconds. Program Clock determines expiry; validity is strictly `chain time < expiresAt`. Repurchase is allowed only once the previous entitlement has expired. Active renewal is excluded.
- **Entitlement:** nontransferable buyer/offer-bound on-chain state; access requires fresh correctly owned/bound state and authenticated identity at the resource server. It is not an NFT or copyright transfer. Every protected response/action must apply its own server-owned policy.
- **Deactivation:** seller-authorized deactivation blocks future sales and preserves already-issued entitlements until their existing expiry. It is not revocation.
- **Disputes/refunds:** the protocol provides no refund, arbitration or dispute operation. Seller/operator commercial and legal processes require separate human policy; PACT must not advertise automatic remedies it does not implement.
- **On-chain facts:** seller/public wallet identity, nonce, price, duration, commitment, offer availability and buyer-bound expiry. No names, emails, agreement text or other personal licensing information belongs on-chain.
- **Off-chain facts:** exact metadata, asset description/content, application policy, customer resources and any separately agreed retention/acceptance evidence. Seller/customer retain and back up their own terms under the initial model.

## Security and release constraints

Preserve fixed program IDs, PDA seeds, account/instruction layouts and transaction semantics. Unsigned API preparation does not reserve price, blockhash or entitlement and never authorizes signing. A signature or RPC acknowledgment does not establish finalization. Unknown submissions require read-only recovery, never blind resubmission.

Browser pending storage and Web Locks protect cooperative clients on the same origin; they are not a global cross-website transaction lock. Maintain current web/SDK journal compatibility, sticky confirmation and exact finalized-baseline checks before releasing retry protection.

Upgrade authority remains operator-controlled. Local artifact evidence, public deployment attestation and independent program review are separate evidence. No authority transfer/revocation, immutable program setting, deployment or npm publication is authorized by this document.

## Human release decisions

`HUMAN ACTION REQUIRED`: actual wallet permissions/message/transaction approvals; external publication/deployment authorization; commercial/legal representations; any real-value network decision. These do not prevent completing local engineering, synthetic/runtime tests, packaging and operational preparation.

## Phase 0 acceptance

The supported topology, identity/authorization boundaries, network/wallet assumptions, metadata ownership, exact entitlement semantics, availability limits and exclusions above are the implementation contract for Phases 1–5. Changes require an explicit architecture decision and matching validation, not an implicit widening of promises.
