# REST API reference

Base prefix: `/api/v1`. The example uses the same reusable handler at `/api/pact`. [OpenAPI](openapi.json) provides request/response schemas. Success responses are direct JSON objects; failures are `{ "error": { "code": "...", "message": "..." } }`. Every response is `Cache-Control: no-store`.

| Method and path | Behavior |
| --- | --- |
| `GET /offers/{address}` | Fresh validated public `OfferInfo`: seller, price, duration, hash, active flag, program and snapshot context |
| `POST /offers/prepare` | `{network:'devnet', sellerWallet, nonce, metadataJson, programId?}` → unsigned v0 transaction, derived offer PDA, hash and blockhash lifetime |
| `GET /offers/{address}/metadata` | Verifies offer first; returns typed `METADATA_UNAVAILABLE` (404) because no public registry is installed |
| `POST /checkout/prepare` | `{network:'devnet', offerAddress, walletAddress, metadataJson, programId?}` → verified quote and unsigned v0 purchase; rejects active existing license, deactivated offer and metadata mismatch |
| `POST /licenses/verify` | `{offerAddress,walletAddress,network?}` → coherent entitlement/offer/Clock/program snapshot and structured public validity |
| `GET /licenses/{offer}/{wallet}` | Same public result, without proving wallet control |
| `GET /transactions/{signature}` | Genesis-checked RPC `getSignatureStatuses` with history search; processed/confirmed/finalized/failed/not-found |
| `POST /auth/challenge` | `{walletAddress}` → exact message, challenge ID and expiry; sets browser-binding HttpOnly cookie |
| `POST /auth/verify` | `{challengeId,signatureBase64}` → verified wallet session; sets opaque HttpOnly cookie |
| `GET /auth/session` | Current authenticated wallet/session expiry, or `authenticated:false` |
| `POST /auth/logout` | `{}` invalidates the session and clears authentication cookies |
| `GET /protected` | Example operation: identity comes from session; server-configured offer must have a fresh active entitlement |

Public routes support credential-free CORS. Auth/protected routes have no cross-origin permission; private URLs must match the configured canonical origin and POSTs must carry that exact `Origin`. Cookie paths follow the handler prefix. HTTPS cookies include Secure; all use HttpOnly and SameSite=Strict. Authentication defaults to disabled in the library and PACT app; the explicitly local single-process example opts in.

Public validity returns `valid`, `state`, `reason`, `expiration`, `verifiedAt`, `freshness`, raw `status`, and identity/network/program fields. It always returns `walletControlProven:false` and `authorized:false`. Missing/expired entitlements are successful invalid results. RPC, stale and malformed-account failures are typed non-success errors; they never grant access.

Request bodies are capped at 128 KiB, exact metadata at 64 KiB, body/RPC operations at five seconds. Public, authentication and protected requests each have an independent default budget of 180 requests per minute, bounded active work and bounded challenge/session maps. Public and protected chain capacity is reserved separately, with shared endpoint progress checks. This is basic local abuse resistance, not distributed rate limiting. Unsupported fields, noncanonical public addresses, wrong network/program and malformed metadata fail validation. No request accepts wallet secrets, client validity booleans or signed transactions.

Preparation includes a 200,000 compute-unit limit and zero priority fee. Rent/transaction fees are additional to price. The chain remains authoritative at execution; a prepared unsigned transaction does not reserve an offer, balance or blockhash. Seller must choose a fresh u64 nonce and approve/sign through their own wallet. There is no server signing, broadcast or indexing endpoint.

`not-found` transaction status does not prove it was never submitted or is safe to retry. It represents only the selected RPC's current answer, with no fabricated history. Preserve the existing signature/journal and use read-only recovery before a separate manually authorized attempt.

Server-owned `/resources/:id` GET/POST policies are described in [resource authorization](../development/AUTHORIZATION.md). Requests accept no body or policy query; fresh entitlement and the original session are rechecked after preparation.
