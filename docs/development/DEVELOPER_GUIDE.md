# Integrating PACT

PACT provides Solana Devnet entitlement lookup, wallet-controlled checkout and customer-hosted resource authorization. The preserved Base Sepolia implementation is an isolated fallback; these SDK examples target Solana Devnet.

## Obtain and install the SDK

The release candidate is `@pact/sdk@0.2.0`. It is distributed as a locally built tarball, not an npm registry publication. Obtain the reviewed `pact-sdk-0.2.0.tgz` and its SHA-256 manifest from the release owner through an approved channel. No repository license has been supplied; external sharing still requires the owner's licensing approval.

In your own application directory:

```sh
npm install /absolute/path/to/pact-sdk-0.2.0.tgz
```

The path is to your copy of the artifact. Retain the tarball hash and your resulting lockfile; use `npm ci` for subsequent installs. A consumer needs the tarball, not the PACT checkout or its development dependencies. Do not use a source junction or copy PACT's `node_modules`.

To prepare a local tarball from an authorized checkout:

```sh
npm --prefix packages/pact-sdk ci
npm --prefix packages/pact-sdk run build
npm pack ./packages/pact-sdk --pack-destination .
```

Packing builds the package; it does not publish it. Review package contents and the release evidence before sharing.

Validation targets Node **24.22.0**, npm **11.19.1**, Next.js **16.4.0**, and the Chromium supplied by locked Playwright **1.64.0**. React is an optional peer with range `>=18 <20`; the release consumer matrix checks React 18 and 19 separately. Non-React consumers do not install React. Treat the completed [execution record](EXECUTION.md) as the evidence for exact tested combinations. Recheck Node's announced October 21, 2026 security release before a later release; a pin is not security clearance.

## Choose the boundary

| Need | Public SDK entrypoint | What it establishes |
| --- | --- | --- |
| Inspect an offer/wallet entitlement | `@pact/sdk` | Fresh public chain state; no identity or authorization |
| Call the REST API | `@pact/sdk/v1` | Typed HTTP results; public lookup remains unauthenticated |
| Buy or recover a purchase | `@pact/sdk/checkout` | Explicit wallet-owned transaction flow and signature recovery |
| Embed checkout | `@pact/sdk/react` or `@pact/sdk/widget` | Browser UI; callbacks do not protect a server resource |
| Serve licensed assets/actions | `@pact/sdk/server` | Same-origin wallet proof plus fresh server-owned policy checks |

The direct [lookup example](../platform/examples/lookup.mjs), [purchase/recovery actions](../platform/examples/purchase-recovery.mjs) and [resource handler](../platform/examples/authorize.mjs) import public exports only. Importing them performs no network operation or wallet request. Your application supplies public offer/RPC configuration and calls actions deliberately.

## Lookup, authenticate, authorize

A supplied public wallet address is an input to lookup, not proof that the caller controls it. Connecting a wallet also reveals an address without authenticating a request. For protected resources, host one API handler on your own HTTPS origin, ask the intended wallet to sign the exact short-lived challenge from a deliberate Authenticate control, and let the handler use its opaque HttpOnly session.

Configure each resource's required offer on the server. The handler checks entitlement before preparation and again before delivery or synchronous commit. A client-selected wallet, offer, `valid:true` or checkout callback cannot select that policy. See [backend enforcement](../platform/backend-enforcement.md) for the complete handler contract and [wallet authentication](../platform/wallet-authentication.md) for browser integration.

The supported deployment is **one persistent Node process, one origin, one handler instance**. Explicitly set `authMode:'single-process'`. The operator must guarantee no replicas/workers; environment detection cannot prove topology. Restart invalidates sessions. Serverless, multi-process sessions, shared replay storage, SSO and a hosted metadata registry are outside this release.

## Purchase and recovery

Preserve the seller's exact public metadata JSON bytes. Do not parse and reserialize, pretty-print or trim them before purchase. The SDK checks the commitment, price and duration and requires `termsAccepted:true`. An offer hash cannot reconstruct its metadata or prove a seller's legal rights. Keep agreements and personal information off-chain.

Mounting a widget or creating a client does not connect a wallet, approve terms or sign. A separate user action connects, reviews matching terms and requests purchase approval. Wallet owners approve their own prompts. A finalized transaction and current authorized access are separate facts.

Keep unresolved purchase protection and the original signature. Use `getPendingPurchase`/`recoverPurchase` or Check pending transaction; recovery reads the existing signature and never automatically signs or resends. A timeout or `not-found` status does not permit a retry. Expiration release requires finalized history/lifetime evidence and an unchanged recorded entitlement baseline. Changed or ambiguous state stays protected. Legacy records without a baseline cannot infer expiration safety. After a proven expiration, a new purchase remains a separate manual decision.

Entitlement expires according to chain Clock. At exact expiry, access closes and a separately approved repurchase may be possible. Deactivation blocks future sales while preserving an existing unexpired license. Expiry cannot retract bytes already delivered or create DRM.

## Validate your integration

The release's isolated packed-consumer harness installs the tarball outside PACT and calls `runDocumentationExamples({consumerDirectory,outputDirectory})` from `scripts/validation/documentation.mjs`. It copies and executes the examples against the installed package with synthetic RPC, a rejecting transaction adapter and disposable local message proofs. Assertions cover lookup versus authorization, explicit purchase rejection, read-only expired recovery, protected denial/delivery, logout and expiry. No real chain transaction is sent.

Run the [independent application](../platform/example.md) for browser integration. Review [security limits](../platform/security.md), [typed errors](../platform/errors.md), [authorization constraints](AUTHORIZATION.md) and [Solana release assurance](SOLANA_RELEASE.md) before releasing. Local tests do not establish wallet UX, current RPC honesty, legal rights or a production security audit.

See [Wallet and accessibility acceptance](WALLET_ACCEPTANCE.md) for the dated human-run Phantom checklist and the limits of synthetic/browser evidence. No actual wallet prompt approval is implied.
