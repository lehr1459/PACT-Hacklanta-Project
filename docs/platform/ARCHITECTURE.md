# PACT Developer Platform v1

PACT means **Programmable Agreements, Contracts & Transfers**. This implementation extends the existing Next.js marketplace and `@pact/sdk`; it neither changes the deployed program nor introduces a database, signing service, registry, queue, or authentication provider.

## Baseline and boundaries

Development branch: `codex/developer-platform-v1`. Rollback checkpoint: `7f217d506245b02ae4818d3e0bf6d3ff9941edda`, including the pre-existing agent instructions and short seller Explorer link. The unrelated untracked Saturday NFL release document is preserved. Existing release tags are unchanged. Public production deployment `dpl_AeyVsH68MJ784e5YePwziDGvbbr3` remains untouched by this development run; the previous winning source is `b0dece31e841d3c203a6af920b4f58ba2ff61044`.

## Components

| Area | Reuse / change |
| --- | --- |
| Solana program | Unchanged Devnet program `EiiiWWsW2kkqP6nugHz6iBADvhnW5xnibAtZ82ZExVqy`; offers, direct SOL settlement and nontransferable buyer entitlements already exist. |
| Original SDK | Root `createPactClient`, verification freshness policy, Phantom adapter, `./checkout` and `./widget` remain compatible. |
| REST | New `/api/v1` Next.js Node route delegates to a reusable server handler. Public lookup and unsigned preparation are distinct from authentication. |
| SDK v1 | Additive `@pact/sdk/v1` typed HTTP client. `@pact/sdk/server` uses Node crypto; browser entrypoints never import it. |
| React checkout | `@pact/sdk/react` wraps the existing widget; no second purchase state machine. Mounting performs reads only. Signing and submission require explicit customer actions. |
| Authentication | Expiring, exact-message Ed25519 challenges with domain, network, program and browser binding; atomic single-use process-local challenge store and opaque HttpOnly sessions. |
| Backend enforcement | Protected route chooses its offer in server configuration, derives the wallet from the session and reads authoritative entitlement state for every protected request. Never trusts a client validity boolean. |
| Independent example | New `examples/pact-platform-app` on port 3008; marketplace preview on 3007. Existing Prism, vanilla checkout and Saturday Lights remain preserved. |
| Metadata | Exact bytes must match the on-chain commitment, price and duration. A hash cannot recover metadata. Unregistered metadata returns typed `METADATA_UNAVAILABLE`; One-Link Purchasing and manual recovery remain available. |

## Security invariants

Public license validity does **not** establish wallet control or authorize an operation. Authentication proves wallet control for a short-lived session; only a fresh backend entitlement check authorizes its configured operation. The network/program are fixed to the reviewed Devnet deployment. Preparation returns unsigned transactions; the API has no signing or broadcast endpoint. Browser checkout retains the existing simulation, transaction review, pending journal, no automatic retry and finalized entitlement verification.

Authentication deliberately supports an explicitly opted-in **single persistent Node process only**. It is disabled by default and refuses known serverless environments. Restarting loses sessions/challenges. Multi-worker/serverless release requires a shared atomic challenge/session store and shared rate limiting; adding that infrastructure is deferred. Do not deploy this process-local auth on Vercel or claim distributed replay protection.

Existing license freshness limits are 8 seconds from read start and 12 seconds without slot progress, with chain-clock expiry enforcement. Protected operations obtain a new bounded snapshot each time and fail closed on RPC failure, stale data, malformed accounts, missing licenses and expiry. Long-running operations must reauthorize at their commit boundary; streaming access needs periodic enforcement.

## Implementation milestones

- [x] Inspect actual SDK/program/workflows, preserve baseline and assign exclusive ownership.
- [x] REST and unsigned preparation, wallet authentication and backend enforcement.
- [x] SDK v1, React wrapper and independent example.
- [x] Developer guides and OpenAPI.
- [x] Independent negative/security tests, existing regressions and timed browser observation.
- [x] Local release assessment; final checkpoint recorded in Git and the completion report. No public release is authorized.

## References

Message signing is distinct from transaction authorization: [Phantom signing documentation](https://docs.phantom.com/solana/signing-a-message). Signature verification uses Node's native Ed25519 implementation with a null algorithm: [Node crypto documentation](https://nodejs.org/api/crypto.html#cryptoverifyalgorithm-data-key-signature-callback). This is an application-specific exact-message authentication protocol, not a claim of full SIWS interoperability.
