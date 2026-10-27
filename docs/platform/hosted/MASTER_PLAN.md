# PACT — API-First “Integrate Your App”
## Full product, architecture, implementation, security, testing and rollout plan

**Status:** Proposed implementation plan for Codex. **Scope:** Solana Devnet developer-platform pilot; code and local/test engineering, not automatic deployment or commercial approval. **Repository:** `lehr1459/PACT-Hacklanta-Project`; inspect the latest `codex/full-development` head, including CI fixes through `57b425f`, before branching. Do not assume `main` or the public PACT site contains these changes.

## 1. Product vision and definition of done

PACT should let an outside developer connect licensing to an existing application **without uploading its proprietary source code, deploying Solana contracts, or learning blockchain internals**. The developer creates an integration, binds it to a PACT offer they are authorized to administer, obtains server-side credentials, selects protected features, and follows a working framework-specific guide. The end user signs in using a wallet and can purchase a license through the existing PACT checkout. The **developer's backend** requests a fresh server-side entitlement decision from PACT and enforces it. PACT records/returns the evidence; it does not itself prevent the developer from bypassing its own enforcement or retract data already delivered.

**Completion for the controlled pilot** means a new developer can, from a clean machine, register an application, prove they control the offer, securely create/rotate credentials, configure one protected action, add the provided integration to an independent example app, log in with a real wallet in the authorized Devnet acceptance environment, obtain/expire a Devnet license, and demonstrate allow/deny from its own backend. PACT must survive restarts, prevent cross-tenant access and replay, document known limitations, pass CI and independent security review, and run in a deliberately approved hosted configuration. Simulated tests alone do not count as real-wallet acceptance.

### Explicit constraints
- Preserve the working marketplace, existing `/integrate` flow until replaced, `@pact/sdk` public exports, buyer links/manual metadata, checkout recovery, Base Sepolia fallback, program IDs, PDA/account layouts and on-chain economic semantics.
- Initial network: **Solana Devnet only**; no Mainnet, USDC, NFTs, transfers, on-chain renewals, revocation, refunds or new payment protocol.
- Initial commercial model: **free, rate-limited controlled pilots**, no promises of SLA or monetization. No automatic npm publication, platform release, PACT code upload, on-chain transaction signing, or live deployment.
- The SDK tarball remains private until the owner approves distribution; REST access must not depend on publishing SDK source.
- PACT's existing `@pact/sdk/server` single-origin, single-process authentication remains a **supported customer-hosted alternative**. A centrally hosted service is an **additional product model** with a separately specified trust boundary. Do not quietly repurpose its cookie/session flow for cross-origin authentication.
- Treat outstanding dated Node/dependency exception reviews, deployment/authority evidence, real Phantom acceptance and CI as live gates. Reassess advisories if new backend/database/auth dependencies are added.

## 2. User journeys and MVP scope

### Developer journey — end to end
1. Visit **Integrate Your App**. Choose **Hosted API (recommended)** or **Self-hosted SDK (advanced/existing)**. Read the security/responsibility summary before generating credentials.
2. Click **Create integration**; authenticate the *developer account* with a PACT-domain wallet proof (separate from a license buyer's proof). Display which wallet administers the account. Add a contact method for incident notices through a separately validated channel if approved; no implicit trust in an unverified email.
3. Enter app name, description (optional), allowed callback URI(s), allowed website origin(s), and framework; pick **Devnet** (fixed). Register the exact URLs. Do not permit wildcard redirect URIs, arbitrary domains, embedded credentials or open redirects. Require domain-control proof for non-local hosted domains before enabling wallet callback; constrain loopback callbacks to local development.
4. Select an existing on-chain offer or create one using the existing seller flow. Verify its program/network, active status, and **seller ownership/administration with a fresh wallet signature**; a valid-looking offer address is not sufficient. Bind the offer server-side to the application. If seller is not the administrator, deny until an explicit future delegation model is designed (not part of the first pilot).
5. Create a named resource/policy mapping (`premium-features`, `create-slip`, etc.) to the verified offer. Store on the server. The caller must not substitute arbitrary offer IDs to change enforcement.
6. Generate a scoped API credential, **show its secret once**, and present storage instructions. Public application ID and environment ID are not secrets. Permit multiple keys, rotation overlap, key disable/revoke, last-used time, and full revocation. Production secrets are never rendered in frontend bundles, AI-generated prompts, URLs or logs.
7. Choose integration type: generic REST, Next.js, Express/Node, and React + backend. Generate environment templates, server middleware/handler, browser wallet-auth redirect helper, failure handling and integration tests. For pure React/SPA, explicitly require a trusted backend/BFF for secret storage and enforcement.
8. Run **Test integration**: readiness, key validity, registered offer, auth flow, missing license denial, valid test entitlement, expired entitlement, RPC outage and rejection path. Clearly identify synthetic versus actual Devnet evidence; never automatically authorize a wallet prompt or purchase.
9. View status, credential age/rotation, usage, denied reasons, scoped audit events, configuration, integration version and documentation; pause/revoke an integration without deleting historical evidence.
10. Follow a deliberate **Go Live on Devnet** checklist for approved pilots. Mainnet and commercial production are outside this plan.

### End-user journey — end to end
1. Visit a participating app's protected feature, e.g., Saturday Lights “Approve slip & track.”
2. If unauthenticated, select **Continue with PACT**. The app begins an app-scoped, stateful authorization flow from its backend and navigates the browser to the verified PACT-hosted login origin.
3. PACT shows the requesting app and access purpose, then offers Phantom wallet sign-in. The user signs a clearly scoped, non-transaction message; wallet refusal leaves access denied without errors or charges.
4. PACT verifies the exact challenge/message/signature, registered app, origin, expiry, nonce and one-time-use state. It returns a **single-use, short-lived authorization code** to the exact registered callback, never an API secret or license-positive browser boolean. An authorized backend exchanges it with appropriate client authentication and PKCE/state controls to establish an **app-scoped, expiring wallet identity grant**.
5. The app backend stores the wallet grant only in its server-controlled session. The browser receives only its own app's HttpOnly session cookie, not the PACT developer API key or PACT grant. On logout/wallet switch the app clears its session, revokes the grant where supported and requires fresh authentication. PACT cannot observe disconnect events occurring only in third-party browser contexts; do not claim instant off-site revocation.
6. When a protected request arrives, the app backend calls PACT's authorization endpoint with its secret, app-scoped identity grant, and a **registered server-selected resource key**. PACT checks the registered resource/offer binding and **fresh chain state** (expiry, owner, network, program, freshness/Clock) before answering. The app backend enforces deny/allow; it rechecks before durable commits or long-running operations.
7. If missing or expired, return a typed `LICENSE_REQUIRED` / `EXPIRED` result and a safe buyer link or “Purchase license” action using the **existing** checkout/metadata requirements. The user signs and pays directly through its wallet; PACT's API never holds a seller/buyer private key and does not turn an unsigned preparation into authorization.
8. Following finalized settlement, the app does a new entitlement check; a submitted transaction or optimistic client callback is not sufficient. On RPC outage or uncertain state, access **fails closed** with an actionable retry/error message, and uncertain purchases use existing **read-only** recovery—never blind re-submission.

## 3. Recommended technical architecture

```
Developer browser   ----> PACT Developer Console (control plane)
                                  | admin wallet authentication
                                  v
                         App / offer / resource / API-key registry
                                  | durable PostgreSQL + migrations
Developer's user --> PACT hosted wallet-auth origin (login plane)
                                  | single-use code + PKCE to registered callback
                                  v
Developer backend ---> PACT Hosted REST API (data plane)
  [app key + wallet grant + resource key]   | verify app/tenant/policy
                                           | existing PACT Solana reader/SDK
                                           v
                                 Devnet RPC: fresh entitlement state
                                           |
                          ALLOW / DENY + bounded verification metadata
                                           v
                          Developer backend enforces its own feature
```

**Separation of concerns:**
- **Control plane:** developer account and app ownership, offer binding, registered URLs, credentials, policy/usage/operations. No trust in an untrusted `appId` supplied with a valid key for another app.
- **Login plane:** wallet proof from a top-level PACT HTTPS origin and exact registered callback using one-use codes with PKCE/state. Use existing Ed25519 verification primitives where appropriate but **separate PACT-hosted browser origin trust from customer-hosted same-origin cookie auth**.
- **Data plane:** key-scoped, server-to-server resource authorization with wallet grant; public offer/entitlement lookup remains clearly **informational**, not authenticated permission. No CORS-enabled browser access to secret-bearing endpoints.
- **Chain verification engine:** reuse the tested PACT SDK reading, RPC bounded concurrency, provenance, freshness, fail-closed and expiry behavior. Shared core must not weaken existing history/slot-progress or recovery invariants.
- **Persistence:** provider-neutral relational schema, prefer **PostgreSQL** (managed Postgres/Supabase if approved, but no service connection should be assumed). SQL migrations in Git, backup/restore/runbooks; transactional one-use code/challenge consumption. Authentication grant/token hashes and key hashes persist without plaintext secret material. Store the minimum needed identity data with documented retention and deletion behavior.
- **Hosting:** an approved **persistent Node service** for initial hosted Devnet pilot; TLS gateway, explicit trusted-proxy rules, server-only RPC, explicit egress and rate limits, health/readiness and durable backing database. PACT's existing customer-hosted process-local auth remains unchanged. New hosted auth must not depend on process-local-only state for single-use guarantees. Future replicas require tested shared admission/rate/replay state and correct RPC history semantics; a DB alone does not automatically make scaling safe.

**Technology choice gate:** Codex must audit the current packages and choose the smallest safe modular implementation. Reuse Next.js for the developer console if suitable; avoid embedding API-key authorization and long-lived cross-origin session state in an unsupported Vercel/serverless route. Prefer a separate Node API service/package if existing Next hosting cannot satisfy the topology. Choose a **mature audited authorization-code/OAuth library** if OAuth compatibility is claimed; do not invent or market a home-grown OAuth 2.1/OIDC provider. If the team cannot confidently deliver the standards-compliant redirect/code flow, support an explicitly limited **backend-mediated signed challenge and one-time grant** for the private pilot, clearly document it as custom, and defer broad public SSO claims pending independent security review. Make this an explicit Architecture Decision Record (ADR) before Phase 3 code.

## 4. Security model and non-negotiable invariants

**Different principals must never be conflated:**
- Developer **admin wallet/account** controls its app configuration, not an end user's license.
- **API key** authenticates a developer backend and scopes it to one app/environment; it does **not** establish that an end user controls any supplied wallet.
- **Wallet proof** authenticates a buyer/user for a specific app and expiry; it does **not** establish an active entitlement.
- **Fresh on-chain entitlement**, combined with authenticated app-scoped wallet identity and server-owned policy, determines protected access.
- **Browser lookup results**, checkout callbacks, public wallet strings, JWT bodies not cryptographically validated, and client-provided offers/resources never authorize anything.

**Required safeguards:**
- Account/admin wallet signature challenge: domain, origin, app/purpose, network/genesis/program, wallet, nonce, issued/expiry and one-time binding; use SIWS/WALLET Standard when available, otherwise a well-specified signMessage fallback. Avoid reusing signatures between admin and buyer contexts.
- Register exact HTTPS callback URIs with verified domain control (except tightly controlled local loopback). Authorization-code flow must include short TTL, exact `redirect_uri`, `state`/CSRF, PKCE S256, single-use atomic redemption, anti-mix-up/issuer binding where applicable, anti-clickjacking and no open redirects. Confirm whether an OAuth/OIDC standard is *actually* fully implemented before using its label.
- App key: cryptographically random with identifiable non-secret prefix; once-only display; store keyed hash or appropriately hardened verifier, with strict comparison and no plaintext. Never put the key in a SPA, mobile binary, code generator output, query string, cookie accessible to JS, analytics or logs. Track environment/scopes, creator, creation/last-use, expiration and revocation. Test concurrent rotation/revocation and compromised key response.
- Wallet identity grants: opaque, audience/app/environment/wallet bound, short-lived and independently revocable; one-time auth codes; grant never treated as evidence that a license stays valid. Avoid cross-app grants and access tokens readable via front-channel or third-party cookies. Developer app must bind callback `state` to *its own* initiating login session.
- Offer ownership: on-chain seller/admin identity proven and matched at registration and sensitive changes; no taking over offers by guessing addresses. Require deliberate signed reauthorization for changing offer binding, allowed callbacks, credential privileges and destructive actions; consider re-authentication for key generation and revocation.
- Object-level/tenant authorization on **every** apps, credentials, policies, metrics, grants and admin route. Prefer tenant ID derived from proven principal and key, not accepted from client. Prevent cross-env mixing.
- PACT check responses: no-store; server-only; explicit `allow/deny`, stable reason, bound app, resource/offer, verified wallet identity, network/program, timestamp/context slot, license expiry and request ID. No broad positive authorization caching; preserve SDK age/progress constraints. Never present read-only lookup as access approval.
- Bound ingress, DB, RPC and per-app/request budgets; protect public/auth/authorized traffic separately. Deny on DB/RPC/auth outage; don't let logging or analytics override an authorization result. Implement secret-safe structured telemetry with retention and abuse alerts.
- No arbitrary URL fetching for developer callbacks/metadata; mitigate SSRF even if webhook support is added later. Keep callback codes/referrers out of logs. Security headers, CSRF, CORS allowlisting, HTTPS, cookie settings, strict content security policy and proxy forwarding validation are required.
- **Privacy:** collect only necessary app records, public addresses and redacted events; no uploaded customer application source code; keep exact legal agreement bytes with the seller unless a separate hosted-terms contract is approved. Define deletion, backup/restore, user disclosure and retention policy before public distribution.

Use current guidance from [RFC 9700](https://www.rfc-editor.org/rfc/rfc9700.html), [OWASP API Security Top 10](https://api-security.owasp.org/editions/2023/en/0x11-t10/), [Solana message/auth guidance](https://solana.com/docs/frontend/messages-and-auth), and the existing PACT security and release documents; don't assume implementing a checklist constitutes third-party security certification.

## 5. Data model (minimum; implementation names may differ)

| Entity | Required fields / constraints |
| --- | --- |
| `developer_accounts` | Stable ID, proven admin wallet, state, created/updated, optional verified contact; wallet identity uniqueness policy and recovery policy documented. |
| `developer_applications` | Owner ID, opaque app ID, name, status, network/program, environment, created/updated, disabled timestamp; owner-scoped retrieval. |
| `app_callback_uris` | App ID, exact approved callback, verified domain/status, type (HTTPS or limited loopback), created/verified/revoked. |
| `app_resources` | App ID, immutable resource key, canonical offer address, approved binding proof/history, enabled status; unique `(app,resource)` and no client-selected offer substitution. |
| `api_credentials` | Opaque credential ID/prefix, app/env, secret verifier (not secret), scoped permissions, status, creator, expiry, last used, rotated/revoked timestamps. |
| `login_transactions` | App, redirect URI, PKCE S256 challenge, state/nonce binding, TTL, hash of one-use code, proven wallet after signature, atomic redeemed timestamp. |
| `wallet_grants` | Opaque token hash, app/env/wallet identity, issued/expires/revoked, login provenance and scope; no transferable global account token. |
| `security_audit_events` | Bounded, redacted type, owner/app ID, actor kind, request ID, timestamp, action, safe outcome; no API secrets, proofs, raw auth URLs or sensitive agreement terms. |
| `usage_aggregates` | App/env, time bucket, request/allow/deny/error counts, latency and RPC/DB failure class; retention/budget policy. |

Prefer migrations that enforce referential integrity, uniqueness, TTL/expiry indexes and ownership conditions. Test atomic compare-and-consume in competing transactions and audit backup restoration before relying on persisted state. Do not introduce a payment, webhook, subscription, billing or general metadata table without a scoped need.

## 6. Proposed external API contracts (design, **not current endpoints**)

**Versioning:** `https://api.<approved-pact-domain>/v1/…` is illustrative only. Use an owner-approved DNS/TLS origin when deployed. Keep existing `/api/v1` public/compatibility behavior stable or version explicitly; do not silently repurpose routes.

### Control plane — developer dashboard, admin auth required
- `POST /v1/developer/apps` — create draft app.
- `GET /v1/developer/apps`, `GET/PATCH /v1/developer/apps/{appId}` — list/detail/edit/status with owner checks.
- `POST /v1/developer/apps/{appId}/callback-uris` and verification endpoints — register/verify callbacks.
- `POST /v1/developer/apps/{appId}/resources`, `PATCH/DELETE .../{resourceKey}` — seller-verified server policy binding; safe staged updates.
- `POST /v1/developer/apps/{appId}/credentials`, `GET .../credentials`, `POST .../{credentialId}/rotate`, `POST .../{credentialId}/revoke` — one-time secret, metadata-only listing, safe overlap and emergency revocation.
- `GET /v1/developer/apps/{appId}/usage`, `GET .../events` — access-scoped redacted counters/events.

### Hosted end-user wallet login — PACT-origin browser + backend exchange
- `GET /v1/connect/authorize` (or library-backed equivalent) — known app ID, registered redirect URI, PKCE challenge, state, requested audience/scopes; initial browser navigation only.
- `POST /v1/connect/challenge` / `POST /v1/connect/verify` — challenge verified on the PACT origin, no purchase/signing; exact wallet binding.
- `POST /v1/connect/token` — backend-only one-use code exchange with registered client authentication and PKCE; returns app-scoped **server-side** grant/identity, not the developer API key.
- `POST /v1/connect/revoke` — revoke an app grant; stable denial after logout.

### Authorization data plane — app backend only
- `POST /v1/access/check` — **backend key + app-scoped wallet grant + registered resource key**. Server derives app/offer and wallet; refuses caller-supplied wallet overrides or unregistered offers. Returns fresh `ALLOW`/`DENY` with stable error/reason codes.
- `GET /v1/offers/{offerAddress}` and/or existing lookup — explicitly **public informational** lookup, not wallet authentication/authorization.
- `GET /v1/health/live`, `GET /v1/health/ready` — expose only appropriate non-sensitive operational information; separate operator metrics access.

**Illustrative request** (server-to-server):

```http
POST /v1/access/check
Authorization: Bearer pact_sk_dev_EXAMPLE_SERVER_ONLY
Content-Type: application/json

{"walletGrant":"pg_EXAMPLE_OPAQUE","resourceKey":"create-slip"}
```

**Illustrative successful decision** (exact schema to be finalized and documented in OpenAPI):

```json
{
  "decision": "ALLOW",
  "reason": "ACTIVE_LICENSE",
  "appId": "app_example",
  "resourceKey": "create-slip",
  "walletAddress": "<verified-wallet>",
  "offerAddress": "<registered-offer>",
  "network": "solana-devnet",
  "programId": "<reviewed-program>",
  "expiresAt": "<on-chain-expiry>",
  "verifiedAt": "<server-verification-time>",
  "contextSlot": 123456,
  "requestId": "<server-generated-request-id>"
}
```

Use a strict, versioned typed denial/error envelope, not a 200 `valid:false` from an unauthenticated lookup pretending to grant access. Clarify HTTP policy for expected license denials (e.g., 403), auth (401), rate limit (429), RPC/database unavailable (503), and schema errors (400). Clients must fail closed on unknown/invalid response fields. No secrets in examples except clearly fake placeholders.

**Backend integration example must actually deny:** `requirePactAccess('create-slip')` loads its own authenticated end-user app session, retrieves the server-owned wallet grant, sends a server-to-server request with secret, denies on any non-ALLOW/uncertainty, then performs the protected action only after policy approval. For durable state writes and long operations, document recheck/transaction boundaries and that remote calls alone are not atomic with the customer's DB.

## 7. UX / information architecture

Preserve `/integrate` and current styling; progressively upgrade rather than deleting the working generator.

1. **Integrate landing:** Hosted REST API / Self-hosted SDK paths, architecture overview, no-code-upload reassurance, limitations, supported Devnet and example demo.
2. **Developer dashboard:** My apps, onboarding completion, environment status, open security alerts, last usage, link to SDK docs.
3. **App wizard:** App details → verify callback/domain → choose offer & prove seller control → register resource(s) → credentials → framework → test → review. Autosave drafts; error states accessible.
4. **App detail:** Overview, Resources & Licenses, Credentials, Integration, Test Console, Usage, Audit, Settings. Read-only security/usage data first; no admin keys in client components.
5. **Generated integration:** copyable commands, `.env.example`, backend middleware, wallet-auth redirect/callback, purchase link, tests, exact framework version assumptions; highlight never to paste the secret into React/browser bundles.
6. **Test console:** synthetic cases and clearly marked live Devnet read-only checks; actual wallet prompt only after explicit human click; separate success badges for key setup, login, entitlement, protected deny/allow.
7. **User-facing PACT connect:** explicit application identity, reason for signing, displayed wallet/network, cancel, reject, stale/expired code, unsupported wallet and callback error handling. Do not disguise sign-in as a transaction.
8. **Mobile/a11y:** tested responsive console, keyboard focus, screen reader, contrast, wallet rejection/missing extension and mobile wallet deep-link support only when verified; don't claim untested mobile support.

## 8. Implementation phases: Codex execution sequence

For every phase: dedicated focused commits, targeted tests, independent QA/security review, updated docs, explicit PASS / BLOCKED gates. Keep phase work isolated where possible. **Do not proceed past a failing invariant just to claim all phases are completed.** Parallelize independent UX/docs/tests once contracts are frozen.

### Phase 0 — Audit and architecture decision record (no behavior changes)
- Confirm actual Git HEAD and CI `node-and-browser` + `pinned-chain` success on the selected baseline; preserve uncommitted files.
- Inventory existing `/integrate` wizard/generator, `@pact/sdk/v1`, `@pact/sdk/server`, auth/recovery/reader, Next route, examples, OpenAPI, environment profiles, telemetry and current `RELEASE_CONTRACT.md`.
- Draw exact old/new trust boundaries, map which code can be reused unchanged, identify nonportable cookie/origin coupling, pin protocol compatibility.
- Decide persistent hosted Node arrangement, PostgreSQL/storage provider choice, auth code/PCKE protocol/library, tenancy and approved Devnet-only scopes. Add ADRs and updated threat model; clearly mark Phase 0's new optional hosted model versus unchanged customer-hosted model.
- Identify human decisions: approved DNS/hosting account, operating owner, developer terms/privacy/license distribution, callback domain verification policy, secret storage, quotas. Use local placeholder config but never invent actual domains/secrets.
**Exit:** reviewed architecture, trust diagram, data/endpoint contracts, migration plan, failure matrix and test plan.

### Phase 1 — Durable platform persistence and developer-account control plane
- Add DB migration mechanism/fixtures, relational ownership schema, transactional one-time operations, optional managed service adapters. No private credentials committed.
- Implement developer wallet-admin authentication with scoped sessions, explicit re-authentication for sensitive actions, authenticated account/app CRUD.
- Implement exact callback URL registration + domain-control verification for nonlocal URLs, and app/environment state; enforce row/tenant ownership on reads and writes.
- Add key mint/list/rotate/revoke with once-only display, hashed storage, redacted logs and safe key validation middleware; gateway budgets.
**Exit:** two unrelated admins can create apps but cannot inspect/modify each other's apps, keys or policies; refresh/restart/rotation/replay tests pass.

### Phase 2 — Offer ownership and server-owned license resource binding
- Reuse existing verified Devnet offer reader. Prove seller controls offer before binding (signed account proof/authorization); handle deactivated/missing/changed chain state.
- Create per-app resource keys bound to an immutable verified offer policy until an authenticated, audited change is made; preserve version history and clearly define the effect on existing grants.
- Enforce no arbitrary `offerAddress`, wallet or program override on the authorize endpoint.
**Exit:** seller spoofing and cross-tenant/cross-resource attacks fail. Base fallback unchanged; existing offers still work.

### Phase 3 — Secure hosted end-user wallet login and app grant
- Build the top-level PACT-origin wallet connect page with explicit app purpose and supported Phantom sign-in; use SIWS where supported, secure signing fallback where needed.
- Implement one-time nonce/challenge, short-lived auth code, state/PKCE S256, exact registered callbacks, backend code exchange, app/environment-scoped short-lived wallet grants and revocation/logout. Prefer a mature standards library and do not assert full OAuth/OIDC conformity without compliance coverage.
- Cross-origin design must not depend on third-party cookies or expose secrets/grants in browser URLs. Authenticate grant redemption to developer app backend; require its local session to bind to initiated state.
- Test independent competing instances against database atomicity even if initial hosting uses one Node process.
**Exit:** real/synthetic sign-in and adversarial replay, redirect, code theft, token cross-app, wallet switch/logout, expiry, race and invalid signature checks pass.

### Phase 4 — Hosted REST authorization decision engine
- Implement backend-key authenticated `/v1/access/check` with server-derived app/resource/offer/wallet from key, grant and registered policy.
- Reuse PACT SDK server reader with fresh bounded chain verification, network/program/owner/Clock/expiry checks, historical RPC freshness, fair per-app quotas and shared overload policy; no stale-positive cache.
- Type/version responses and stable errors; optional public lookup explicitly informational. Preserve read-only uncertain purchase recovery and existing checkout, with safe purchase-link redirect guidance.
- Document customer-backend enforcement, including commit-boundary/long-lived operation limitations. No direct protection of customer apps by PACT without integration code.
**Exit:** licensed wallet allow; unlicensed/expired/deactivated-before-purchase/wrong app/wrong offer/wrong wallet/unknown policy/RPC outage/revoked grant/invalid key all deny appropriately, with bounded concurrency and no leakage.

### Phase 5 — Replace static generator with a functional integration console
- Evolve `/integrate` into onboarding/dashboard without breaking existing public generator route until replacement passes regressions. Use existing PACT visual identity; no broad redesign.
- Implement app wizard, offer selector, ownership proof UX, resource editor, key reveal/rotation, framework selection, integration code, test console and credential/usage/audit pages.
- Validate real backend APIs for every button; no fake success status. Clear zero-state/errors/loading and end-user purchase/sign-in entry points.
**Exit:** developer can complete registration-to-test journey from a fresh browser; desktop/mobile and a11y checks pass.

### Phase 6 — Docs, examples, SDK convenience adapter, contract freezing
- Keep REST as primary. Generate OpenAPI and compile against runtime schemas; typed client/SDK convenience package only after backwards-compatible contract is stable.
- Provide working Node/Express, Next.js App Router and REST/cURL integrations; React frontend must call a backend, no browser API key. Clean-machine packaged examples use fake/test credentials and local DB fixtures.
- Show direct checkout/buyer links, recovering ambiguous purchases, error codes, license expiry, app logout and actual verification. Clearly describe which steps require seller/buyer wallet approval.
- Preserve existing SDK exports; don't publish or assign public license without authorization. Provide migration guide from original static `/integrate` and same-origin SDK.
**Exit:** independent developer, with only published/approved docs and API access, protects one actual backend route; all snippets run in CI.

### Phase 7 — Reliability, abuse prevention, privacy, observability and security review
- Rate/concurrency limits per key, app, route and IP; DB quotas, RPC timeouts, circuit-breaking only when it fails closed; request size/time ceilings and secret-safe metrics.
- Threat-model admin takeover, key theft, tenant crossing, malicious callback, replay, stale entitlement, API flood, forged RPC, domain hijack, cross-origin mistakes and leaked grant; remediation verified by regression tests.
- Add request IDs, fixed diagnostic classes, separate admin/audit logs, monitoring, retention/delete procedures, backup restore, incident response, rollback, access logs/secret redaction.
- Perform independent security review, OWASP API category checklist and dependency assessment for all *new* exposed libraries. Recheck dated Node/dependency gates, require no unaccepted consequential findings.
**Exit:** incident drills and fail-closed tests pass; security/ops reviewer signs off with documented residual risks.

### Phase 8 — End-to-end validation and remote CI gates
- Add deterministic integration tests and Playwright: admin registration → seller proof → key mint → login challenge → callback/code exchange → access deny → license finalized fixture → allow → expiry → deny → logout/revoke → deny.
- Exercise two developer accounts, two buyer wallets, two apps, identical offer shared intentionally only with correct control, key scopes, callback races, 2-worker code consumption, wrong genesis/program, full DB outages, expired grants, requests crossing process restarts, RPC failover and malicious/malformed payloads.
- Run entire **existing** PACT CI matrix on Linux/Windows, compiled Solana tests, Base fallback, marketplace, buyer links, SDK compatibility, wallet fixture browsers, package reproducibility and new SQL/API/web/browser lanes. Require both remote jobs green; no masking tests/loosening security policies.
- Add deterministic database fixtures, schema drift/checks, no secret leakage, migration forward/backward or well-defined roll-forward recovery, container artifact smoke and load-test evidence under approved capacity.
**Exit:** complete test matrix green, independent QA review, security signoff, reproducible build/artifact receipts, rollback verified.

### Phase 9 — Approved staging and human wallet/device acceptance
- Provision/stage only after explicit approval of hostname, TLS, provider, DB, secret manager, RPC, ingress, backups and operating owner. No automatic deployment to existing PACT production site.
- Run real, owner-approved Phantom wallet flows using distinct Devnet seller/buyer identities; test rejection, account switch, callback, signature display, entitlement, expiry, purchase recovery and unauthorized app denial. Approvals/signatures/transactions belong to human wallet owners, not Codex.
- Verify service startup across restarts, session/grant behavior, DB restore, optional replica behavior only if supported, real read metrics, accessibility with actual screen reader/zoom and supported devices.
**Exit:** human-signed acceptance receipts, operational runbooks, rollback drill, measured pilot targets, documented discrepancies resolved.

### Phase 10 — Controlled Devnet developer pilot and handoff
- Start with an **independent PACT demo consumer**; optionally use Saturday Lights as a later opt-in integration only after its owner accepts the change. Do not silently edit its separate site/repo.
- Invite 1–3 approved developers, give each a bounded quota and explicit feature limitations; measure onboarding success, deny/allow correctness, RPC availability, response latency and support burden. Rotate/revoke trial secrets after a pilot.
- Reconcile documentation/UX/operations; set staged support owner, incident contact, ongoing dependency deadlines, key lifecycle and an explicit versioning/deprecation policy.
- Only after owner approval: consider wider Devnet publication, npm SDK distribution, distributed auth, pricing/billing, webhooks or Mainnet as **new scoped projects**.
**Exit:** pilot go/no-go documented; not called production-ready or Mainnet-ready solely because Devnet tests passed.

## 9. Explicit test/acceptance checklist

- **Security:** wrong developer cannot edit other app; leaked app key cannot authenticate wallet; forged wallet address cannot authorize; wrong grant cannot cross app/tenant/environment; duplicate/replayed signed nonce or auth code fails; expired/revoked credentials/grants fail; callback URI attack fails; stored input cannot change registered policy; raw credentials never appear in logs/artifacts/frontend; SSRF/open redirects denied.
- **Chain:** signed buyer identity correctly bound; missing license denied; active fresh license allowed; exact expiry denied; deactivation semantics unchanged (blocks new sales, does not revoke existing unexpired entitlements); wrong owner/program/genesis/offer fails; RPC stale/backwards/frozen/errors deny; no blind duplicate purchase.
- **Reliability:** 2 simultaneous code redeemers yield exactly one success; DB restart/outage denies but recovers; bounded concurrency; high public lookup load cannot starve protected access; no unbounded queue; customer backend caches no positive status beyond reviewed freshness; safe recheck before irreversible writes.
- **Developer UX:** registration, domain verification, app listing, offer ownership, secret reveal/rotation, integration copy, docs and test all succeed; no backend-only secret enters React, generated app or analytics; unrelated app cannot view usage/audit.
- **Compatibility:** existing `/integrate` generator, marketplace/checkout, SDK public consumers, Solana/Base compiled tests and remote CI remain passing. No unapproved chain upgrade/deploy.
- **Evidence:** clean committed checkout, migration receipts, independent reviewer, hosted/staging topology proof, real-wallet/device acceptance and operator acceptance each clearly labeled; no simulated tests relabeled live.

## 10. Human decisions and operations

**Before an external hosted pilot:** owner must approve domain/hostname, hosting and database/provider scope, encrypted secret store, network/RPC costs, operator roles/on-call, incident contact, privacy/terms posture, developer-account recovery and SDK/distribution terms (if sharing the tarball). Existing CI is green on `codex/full-development` but the application requires fresh validation on every new implementation commit. No public API credential or domain is invented by Codex.

**Before real transactions:** human seller and buyer approve Devnet wallet prompts; no agent signing/broadcast. **Before Mainnet/commercial claims:** separate authority-custody, program audit, legal, SLA, billing and chain-release plan.

**Known tradeoffs:** centralized PACT outages can lock customer apps; customer-hosted SDK is an optional resilience/control alternative. On-chain wallet addresses are public but don't authenticate an HTTP user. License expiry cannot reclaim previously downloaded bytes. The original PACT SDK same-origin session is not a ready-made cross-site identity service.

## 11. Deliverables and final report required from Codex

- Approved ADRs, diagrams, threat model and explicit supported matrix.
- Source code, migrations, environment samples, hosted API and console UI, generated examples and OpenAPI schema.
- Reviewed API auth/identity/offer/authorization contracts; key rotation, abuse, telemetry and recovery logic.
- CI workflows with Linux/Windows/browser/chain/DB/API security gates and exact receipts.
- Clean-room consumer test and at least one independently protected app with working denial and allowed access.
- Release/staging/rollback/incident runbooks, operator checklist, scope/licensing/privacy decisions and human action checklist.
- Per-phase commits, changed files, test outcomes, independent reviews, remaining risks, and explicit categories: **implemented locally**, **CI verified**, **staging accepted**, **human action required**, **not deployed**, **not supported**.

## 12. Codex master execution instructions

> Treat this document as the scope of the API-first Integrate Your App project. Work from the **latest verified** `codex/full-development` branch, not the older public site or a copied recovery snapshot. Check `git status` and protect existing changes; create a separate `codex/api-first-integrations` branch. Inspect actual repository implementations before editing. Begin with Phase 0 architecture/threat/contract audit; record necessary ADR decisions using conservative defaults. Do not create a second blockchain licensing protocol, silently break the old wizard, or rewrite the Solana program. Implement Phases 1–8 in order with focused commits, secure fixtures, tests and independent subagent review at each gate; parallelize docs/UX/tests only after shared contracts are stable. Fix discovered defects and re-run the required suites; never weaken tests. Phase 9 and Phase 10 external actions are **preparation only** until the owner explicitly approves domains, managed services, hosting, wallet actions and rollout. Do not push, deploy, publish packages, sign/broadcast transactions, reveal secrets or modify Saturday Lights without separate authorization. Produce a phase-by-phase final report with exact evidence, unresolved gates and a ready-to-run pilot checklist. If the chosen standards-based login cannot be implemented securely with trusted tools, mark that capability blocked instead of shipping an insecure home-grown approximation.

---

### Source references reviewed

PACT repository (`codex/full-development`): `docs/product/RELEASE_CONTRACT.md`, `docs/development/DEVELOPER_GUIDE.md`, `docs/platform/ARCHITECTURE.md`, `docs/platform/backend-enforcement.md`, `docs/operations/ENVIRONMENTS.md`, `docs/TECHNICAL_DEBT.md`, `packages/pact-sdk/src/server.ts`, `server-auth.ts`, `server-chain.ts`, `platform-types.ts`, `web/app/integrate/page.tsx`, and `web/components/integration-wizard.tsx`.

External design references: [RFC 9700](https://www.rfc-editor.org/rfc/rfc9700.html), [OWASP API Security Top 10:2023](https://api-security.owasp.org/editions/2023/en/0x11-t10/), [Solana messages/auth/SIWS](https://solana.com/docs/frontend/messages-and-auth), and [Phantom sign-in-with-Solana](https://github.com/phantom/sign-in-with-solana).

All endpoint names, domains, example keys and proposed implementation details in this plan are **design proposals**, not claims about already shipped PACT behavior. Owner-controlled deployment and distribution remain separately authorized.
