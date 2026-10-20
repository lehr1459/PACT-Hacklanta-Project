# Hosted API runtime contract

Phases 1–6 contract, 2026-10-19. New `/v1` only; existing `/api/v1` and customer-hosted SDK are unchanged. This is a private custom wallet proof service, not OAuth/OIDC/SIWS conformance.

## Runtime schemas and downloadable OpenAPI

`src/contract.mjs` exports immutable `schemas`, `actionSchemas` and the exact 35-operation registry. Existing semantic checks retain canonical address/URL, relative expiry, owner, signature, replay and lock behavior. Full request schemas compile through Fastify's existing JSON Schema compiler at explicit pre-effect checkpoints, after those checks where their error categories or one-use signature consumption matter. Invalid own signature attempts still consume the challenge and return 401; generic early schema validation must not turn these into reusable 400 failures. No coercion, default insertion or unknown-property removal is enabled.

The shared route wrapper checks every terminal supported JSON success/decision against the same response schemas; errors are also schema checked. No response serializer silently strips unexpected fields. Access performs a final synchronous check after response validation, using its original read-start and authority deadlines; validation never refreshes the lease, and a rejected result is never counted as ALLOW. Unknown response fields/schema versions are not consumer permission.

`npm run openapi` generates `services/pact-api/openapi.json` and `web/public/developer/openapi.json` from this registry and its request/response/action schemas. `npm run openapi:check` and the service contract tests detect byte drift, missing route registrations, unresolved references and mutation of the frozen schemas. The static web download is `/developer/openapi.json`; it is not a new API gateway endpoint. The OpenAPI server domain is an explicitly invalid documentation placeholder, not a deployment. Cookie security includes the HTTPS names and the documented local HTTP variants; mutations additionally require the exact Origin and CSRF header. Credentials/scopes, status/error unions, TTLs and original chain-freshness units are documented without changing existing SDK exports.

## Factory and topology

`createDatabase({connectionString,profile,localPath,maxPending})` and `migrate(database)` from `src/database.mjs`; `createService({database,origin,pepper,profile,now?,resolveTxt?,rateLimit?,activeLimit?,readerOptions?,reader?})` from `src/service.mjs`. Returned `{server,close,authenticateKey,database,reader}` includes a Fastify instance supporting `.listen()` and test-only `.inject()`. Close the service, then its database separately. Clock, DNS and reader injection are trusted test harness interfaces, never public HTTP configuration. The default reader is one lifetime public `@pact/sdk/server` reader. `readerOptions` accepts server-only reviewed SDK RPC options; hosted startup requires explicit `SOLANA_RPC_URL` and supports one optional `SOLANA_RPC_FALLBACK_URL`.

Runtime is one persistent Node24 process, loopback private listener behind a fixed trusted same-origin gateway. `origin` is the **browser-visible issuer**, not the internal loopback address. Config rejects known worker/serverless/multiple-worker markers. Hosted mode requires PostgreSQL and HTTPS. The PostgreSQL URL must use `sslmode=verify-full`; only TLS-certificate query parameters are accepted, with no duplicate keys. No browser-key CORS. No automatic infrastructure/publication/transaction behavior.

PGlite is local/test-only real SQL execution with single-process semantics. Production PostgreSQL competing-client, actual HTTP, failure and restart tests are separate evidence. A database never establishes safe distributed reader history/admission topology.

## Common envelope and safety

Every JSON response has `{schemaVersion:1,requestId,...}` and `x-pact-request-id`; caller IDs are ignored. Errors are `{schemaVersion:1,requestId,error:{code,message}}` with fixed safe strings. No raw SQL/provider exceptions, URLs, wallet proofs or secret values are logged. All responses are `no-store`, `no-referrer`, frame denied and nosniff. Body limit is 16 KiB; URL limit is 4,096 characters; headers use the bounded native Node parser. PostgreSQL statements have 2.5-second execution, 3-second query and 1.5-second connection-acquisition bounds. These pilot limits do not establish distributed availability or an SLA. Operator ingress needs its own trusted-client/IP bounds.

| Admission layer | Default reservation and behavior |
| --- | --- |
| HTTP | 16 access, 8 authentication and 8 control requests; global 32. Cheap liveness bypasses those lanes. Aborted bodies release admission exactly once. Already-running handler work retains its lease until settlement; aborted requests cannot reenter a handler after release. |
| Access principals | At most 4 in-flight access handlers per app and key. Durable limits are 60 access requests/key/minute and 120/app/minute, plus the existing 120/IP/route/minute ingress budget. No unbounded waiting queue. |
| Native PostgreSQL | Two physical control connections and two physical protected connections, with at most 12 pending operations per lane. Access authentication, budgets and final revalidation use the protected lane. Total connection capacity remains 4. A failed rollback destroys the uncertain connection. |
| Chain | One lifetime SDK reader/history. Host admission permits at most 2 non-access and 6 access chain operations, with at most 2 access reads/app. New non-access reads are rejected while the SDK reports quarantined transport work, preventing repeated timed-out control reads from consuming the reserved protected capacity. |
| Telemetry | At most 8 asynchronous jobs, using the control database lane. Errors/drops are counted in private diagnostics. Collection is never awaited before returning an authorization result. |

PGlite provides logical admission lanes over one local SQL engine; it does not establish physical PostgreSQL reservation or distributed replay behavior. An uncooperative protected RPC provider can still reduce shared capacity until transport settlement; access fails closed. No positive stale fallback is permitted.

Bodies reject missing/unknown fields and inappropriate types; queries are not accepted. IDs are opaque strings. Times in this control-plane contract are integer Unix **milliseconds**, except future on-chain decimal-string seconds. Input text is trimmed and control-free. Framework enum: `rest`, `express`, `nextjs`, `react-backend`. Scope enum: `access:check`, `connect:write`.

## Browser authentication and CSRF

1. `GET /v1/developer/auth/session` bootstraps a host-only HttpOnly SameSiteStrict binding cookie and returns `{authenticated:false,csrfToken}`. Existing sessions return `{authenticated:true,account:{id,walletAddress},expiresAt,csrfToken}`. Cookie values are opaque; session secret is never returned in JSON. Cookies Secure on HTTPS, path`/v1`.
2. Every POST/PATCH browser route requires exact configured `Origin`, binding cookie and `x-pact-csrf` equal to returned `csrfToken`. GET rejects an explicitly different Origin. No credentials are made available through CORS.
3. `POST /v1/developer/auth/challenge {walletAddress}` returns `{challengeId,message,expiresAt}`. Wallet signs exact UTF8 bytes. Message includes issuer/origin, purpose, nonce, binding, Devnet/genesis/program and lifetime.
4. `POST /v1/developer/auth/verify {challengeId,signatureBase64}` consumes one challenge and verifies native Ed25519. On success sets a new opaque session cookie and returns `{authenticated:true,account:{id,walletAddress},expiresAt}`. Invalid attempts consume a challenge when its ID/browser binding match; another browser cannot burn it. Challenge2min/session15min. Logging in replaces the previous session in that browser.
5. `POST /v1/developer/auth/logout {}` revokes server session and clears cookie. Another active session for the same wallet is a distinct incarnation.

## Owned application registry

- `POST /v1/developer/apps {name,framework,description?}` → `{app}`. Creates a draft. Twenty apps/account. No caller owner/network/program.
- `GET /v1/developer/apps` → `{apps:[...]}`; `GET /v1/developer/apps/:appId` → `{app}`.
- App shape `{id,name,description,framework,environment:'devnet',status:'draft'|'active'|'paused',policyEpoch,createdAt,updatedAt}`. Cross-owner reads/writes return404.
- `PATCH /v1/developer/apps/:appId` is sensitive action`app.update`, payload accepts any nonempty subset`{name,description,framework,status}`.
- `GET .../:appId/events` → `{events:[{id,type,requestId,outcome,createdAt}]}` latest100, redacted, owner scoped. `GET .../:appId/usage` → `{buckets:[{bucket,requests,allowed,denied,errors}]}` bounded30days. Authorization usage begins when data plane is implemented; an empty list means no recorded usage.

## Exact signed action proof

`POST /v1/developer/actions/challenge {action,appId,payload}` requires session+CSRF, verifies owned app and the exact action payload schema, and returns `{challengeId,message,payloadHash,expiresAt}`. Sign exact message bytes. Execute the sensitive mutation with **exactly** `{payload,proof:{challengeId,signatureBase64}}`.

The challenge binds action, app, session incarnation, wallet, expiry and SHA256 of recursively sorted object-key JSON. Absent and null differ; ordered arrays remain ordered; only safe integer numbers are accepted. Same wallet in another session cannot use the proof. Mutation revalidates active session/account, locks app/current row, atomically consumes proof with the change and redacted audit record. After awaited writes and audit, it synchronously checks both the locked session and action expiry before transaction completion. Draft creation also locks/revalidates the current active session/account and its final lease; admin login checks its consumed proof and new session lifetime after insertion. Crossing those bounds rolls back the transaction and returns401. Concurrent attempts succeed once. Validly identified invalid signatures consume the proof; a transaction failure rolls back a successful-proof consumption with its writes. Rejected payload mutation cannot repurpose the original proof.

## Callback lifecycle

- `GET .../:appId/callback-uris` → `{callbacks:[...]}`.
- `POST .../:appId/callback-uris`, action`callback.create`, payload`{uri,websiteOrigin}`. Callback must be canonical exact HTTPS URL with no credentials/query/fragment/wildcards/percent or ambiguous path normalization. Website origin must equal callback origin. Loopback HTTP only for local/test profiles. Ten registrations/app, preserving history.
- Returns`{callback,dnsToken?,verificationExpiresAt?}`. Callback`{id,uri,websiteOrigin,status:'pending'|'verified'|'revoked',local,verifiedUntil,dnsRecord}`. Only local callbacks start verified.
- For a nonlocal hostname, create DNS TXT at returned`_pact.<hostname>` with once-revealed`pact-domain-verification=<random>`. Stored proof is keyed hash, not original token. Proof challenge24h and verified validity24h. No HTTP/metadata fetch. DNS resolves only the fixed TXT label, with2 bounded tasks, cancel1.5s and capacity retained until task settlement if cancellation is ignored.
- `POST .../:appId/callback-uris/verify`, action`callback.verify`, payload`{callbackId}` verifies current DNS proof after verifying admin signature; no open DB transaction waits for DNS. Signature/proof/ownership/state rechecked in the final mutation transaction.
- `POST .../:appId/callback-uris/:callbackId/revoke`, action`callback.revoke`, payload`{callbackId}` immediately marks revoked and clears proof state.
- `POST .../:appId/callback-uris/:callbackId/renew-proof`, action`callback.renew`, payload`{callbackId}` issues a new one-time DNS token and returns to pending; old DNS token cannot verify. Explicit local renewal re-enables the loopback fixture. A revoked/expired remote callback requires renewed proof and verification. Later login/code paths must recheck status/validity so a revoked callback never receives a code.

## Credentials

- `POST .../:appId/credentials`, action`credential.create`, payload`{name,scopes,expiresAt}`. Expiry1minute–90days from request. One to2 unique allowlisted scopes. Ten active keys/app.
- Returns`{credential,secret}` exactly once. Credential shape`{id,appId,name,prefix,scopes,createdAt,expiresAt,lastUsedAt,revokedAt,rotatedFrom}`. Secret has nonsecret key identifier plus32random bytes. Database stores HMAC-SHA256 with externally supplied secret pepper; lists/events never contain raw secret. No examples/browser bundles receive real secrets.
- `GET .../:appId/credentials` → `{credentials:[...]}` at most50 metadata records, no secret. All active/unexpired credentials appear first (at most10), followed by recent expired/revoked history, so an older still-valid key remains discoverable for revocation.
- `POST .../:appId/credentials/:credentialId/rotate`, action`credential.rotate`, payload`{credentialId,expiresAt,overlapSeconds}`. Overlap0–86400seconds. New key inherits old scope/name; old key expiry becomes min(old expiry,now+overlap). Quota is serialized inside app lock. Returns new once-secret credential.
- `POST .../:appId/credentials/:credentialId/revoke`, action`credential.revoke`, payload`{credentialId}` → metadata only. Available on paused apps, history retained.
- `POST /v1/credentials/validate {}` with`Authorization: Bearer <secret>` →`{valid:true,appId,credentialId,environment,scopes}`. Requires`access:check`scope and active app/account; every Origin header is rejected. This proves backend key validity, never wallet control or entitlement. Last-use stored. Future backend routes reuse`authenticateKey` and additionally revalidate after RPC before ALLOW.

## Server-owned resources and seller control

`GET /v1/developer/apps/:appId/resources` returns `{resources:[...]}`. Each resource is `{resourceKey,offerAddress,version,enabled,createdAt,updatedAt,verifiedAt,contextSlot}`. Resource keys match `[a-z][a-z0-9-]{0,63}` and are immutable; each app may retain at most 50. `GET .../resources/:resourceKey` returns `{resource,versions}` with latest 100 version records containing version, offerAddress, enabled, verifiedAt, contextSlot, actorWallet and createdAt.

`POST .../:appId/resources`, signed action `resource.bind`, accepts payload `{resourceKey,offerAddress}`. A lifetime hardened SDK reader obtains a fresh verified Devnet offer outside an open database transaction. The offer must be active and its seller must equal the proven admin wallet. The service rechecks program/address/seller/active status and snapshot age immediately after acquiring owner/session/app locks and again after recording history and audit. Missing/invalid chain state, wrong seller, wrong network/program/account/Clock, outage and stale results deny; no policy is created. Verification context is retained without storing agreement text.

`PATCH .../resources/:resourceKey`, signed action `resource.update`, accepts `{resourceKey,expectedVersion,offerAddress?,enabled?}` with at least one optional field present. The route key must equal the signed key. An intervening update causes `409 RESOURCE_VERSION_CONFLICT`, preserving the newer policy. A changed offer or enabling a resource requires a new fresh active seller-owned offer check. Existing continuously enabled policies remain in place when their on-chain offer is deactivated; deactivation does not itself revoke existing unexpired entitlements.

`DELETE .../resources/:resourceKey` is a soft disable, using the same signed `resource.update` payload `{resourceKey,expectedVersion,enabled:false}`. A disable-only update performs no RPC call so incident containment remains possible during an RPC outage. Neither delete nor update erases history. Each successful bind/update/disable appends a version and increments the app's `policyEpoch`; future grants must bind that epoch, making prior grants unusable following a policy change. Denied operations change neither policy nor epoch.

Version records retain verified actor, context slot, consumed opaque action ID and signature hash as application verification provenance. The expiring action challenge has no foreign key from durable policy history, so privacy/TTL cleanup cannot be blocked. These records do not claim legal rights or standalone nonrepudiation proof. The Solana protocol and Base fallback are unchanged.

## Limited backend-mediated wallet login

All backend routes reject **every** Origin header and require an app key with `connect:write`. An API key proves the backend app, never wallet control. The callback must already be registered and verified. No wildcard redirect or caller-selected app/program/network is accepted.

1. `POST /v1/connect/transactions {redirectUri,state,codeChallenge,codeChallengeMethod:'S256',purpose}` returns `{transactionId,loginUrl,expiresAt,issuer}`. State and challenge are canonical 43-character base64url encodings of 32 bytes. Purpose is 1–200 trimmed control-free characters. The customer backend generates random state and PKCE verifier, keeps them in its own initiating session, and stores the expected issuer. The login URL contains only the public transaction handle. Transaction lifetime is five minutes; at most 100 pending transactions per app. Nonlocal callback DNS TXT is checked live using bounded DNS admission before creation; status, verification expiry and current proof are rechecked in the transaction.
2. `GET /v1/connect/transactions/:transactionId` from the configured PACT origin returns `{transaction:{id,app:{id,name},websiteOrigin,purpose,expiresAt,issuer},csrfToken}` and a **distinct** HttpOnly buyer binding cookie. It atomically claims the transaction to the first browser binding. Another browser cannot claim it. The response omits state, PKCE and callback path; the verified requesting website origin is displayed and used to bound navigation. The dynamic `/connect` page uses explicit connect/review/sign controls; real-extension acceptance remains a separate human gate.
3. Buyer mutations require that cookie, exact PACT Origin and `x-pact-csrf`. `POST /v1/connect/challenge {transactionId,walletAddress}` returns `{challengeId,message,expiresAt}`. The exact native Ed25519 message is distinct from admin proof, binds app/purpose, issuer/origin, transaction ID, browser, network/genesis/program and a digest of callback/revision/state/PKCE/policy context. Challenge lifetime is two minutes, never beyond transaction expiry. A new challenge supersedes all older challenges for that transaction, including older verification already in flight; changing wallets requires the new wallet's exact proof.
4. `POST /v1/connect/verify {transactionId,challengeId,signatureBase64}` consumes one browser-bound challenge, verifies exact signature, and atomically issues one code for that transaction. Returns `{callbackUrl}` containing only `code`, original `state`, and `iss` at the exact stored callback. Code lifetime is one minute and cannot exceed transaction expiry. A refusal/cancel produces no code; no transaction purchase occurs. A lost code response requires a fresh backend-initiated login, not reusing the consumed proof.
5. The customer backend first checks callback state against its own initiating session and exact expected issuer. It calls `POST /v1/connect/token {code,redirectUri,state,codeVerifier,issuer}` using its key. Verifier must have 43–128 RFC7636 unreserved ASCII characters; only SHA256/S256 is supported. Callback, state, issuer, challenge, app, original issuing key, redeeming key, active account/app, callback incarnation/expiry and policy epoch are checked. Code consumption and grant insertion occur in **one** database transaction. Two independent clients can redeem successfully only once. Failed state/verifier/client attempts issue no grant and do not consume a legitimate code.
6. Successful exchange returns `{walletGrant,walletAddress,appId,environment:'devnet',expiresAt,issuer}`. The opaque `pact_grant_...` contains 32 random bytes. Only its keyed verifier is stored, with app/environment/wallet/policy epoch, hard 15-minute expiry and login provenance. The grant stays in the customer backend's own session; its browser receives only its own HttpOnly app cookie. No refresh token or public identity token is issued.
7. `POST /v1/connect/revoke {walletGrant}` with the owning app's still-valid key returns `{revoked:true}`. It is idempotent for a known own grant and available while an app is paused. Foreign grants fail. Customer logout/wallet switch clears its own session, revokes its grant and starts new authentication. PACT cannot detect off-site wallet disconnect events.

Codes/grants never persist in plaintext or enter logs; only the one-use code appears in the exact front-channel callback. Wallet identity is independent from licensing: no login response asserts a current entitlement. `service.authenticateGrant(walletGrant,appOrCredential,tx?)` is a server helper checking own app, Devnet environment, current policy epoch, active owner/app, hard expiry and revocation. It returns an internal SQL identity row, not a positive licensing decision.

Callback lifecycle changes increment its revision. Pending logins bind the revision, so revoke→renew→verify never resurrects an older transaction/code. Resource changes increment policy epoch and deny all older pending logins/grants. Context transactions lock account/app/credentials/callback and recheck the earliest locked credential/callback expiry immediately before completion. Database failures deny; restarted instances retain atomic code/grant state. Shared SQL tests do not authorize multi-process production RPC or admission topology.

All keyed verifiers are additionally namespaced by the exact canonical PACT issuer origin. Restarting with the same database and pepper under a different origin invalidates prior keys, sessions, browser bindings, proofs, codes, grants and DNS tokens. Application/account records remain, but the new origin requires fresh wallet authentication, new credentials and renewed nonlocal domain proofs. Changing origin is an explicit authentication migration, never an automatic reuse of old authorization. Same-origin restarts retain durable state.

The `/connect` HTML uses a fresh per-request nonce with strict-dynamic CSP, no-store/no-referrer and frame denial. Production does not permit inline/eval scripts. Existing PACT font families are hosted locally with upstream licenses; hosted branding avoids injected image style attributes. Development alone permits eval for Next debugging. Browser and actual Phantom/device acceptance are separate evidence.

## Fresh server-to-server access decisions

`POST /v1/access/check` requires an API key with `access:check`, rejects every Origin header, and accepts **exactly** `{walletGrant,resourceKey}`. Caller wallet, app, offer, program and network overrides are invalid input. The key selects the app, the opaque grant selects its proven wallet and current policy epoch, and the registered resource selects the required offer. Every enabled check reads a new bounded hardened SDK snapshot; no positive entitlement cache exists.

After RPC, a protected database transaction locks and revalidates active owner/app, key scope/revocation/expiry, grant app/environment/wallet/revocation/expiry/epoch, and exact current resource version/binding/enabled state. After commit, the service synchronously rechecks the original snapshot freshness, chain and wall-clock license expiry, and earliest key/grant expiry. No awaited telemetry or other work follows that authority/freshness check before the result is returned. The remote decision cannot make the customer's own database transaction atomic; recheck at durable commit boundaries and enforce every access path.

An HTTP 200 success includes the common `schemaVersion` and `requestId`, plus:

```json
{
  "decision": "ALLOW",
  "reason": "ACTIVE_LICENSE",
  "appId": "app_example",
  "resourceKey": "premium",
  "resourceVersion": 1,
  "policyEpoch": "1",
  "offerAddress": "canonical registered offer",
  "walletAddress": "wallet proven by the app grant",
  "network": "solana-devnet",
  "programId": "EiiiWWsW2kkqP6nugHz6iBADvhnW5xnibAtZ82ZExVqy",
  "expiresAt": "decimal Unix seconds",
  "verifiedAt": "ISO decision timestamp",
  "contextSlot": 123,
  "chainTimestamp": "decimal chain Unix seconds",
  "freshness": {
    "readStartedAtMs": 1000,
    "receivedAtMs": 1100,
    "lastProgressAtMs": 1100,
    "verifiedAtMs": 1200,
    "maxAgeMs": 8000,
    "maxProgressAgeMs": 12000,
    "validUntilMs": 9000
  }
}
```

These example timestamp values illustrate field units, not a real authorization receipt. `validUntilMs` is bounded by original read start plus 8 seconds, endpoint progress plus 12 seconds, chain/wall license expiry, and key/grant expiry. `verifiedAt` does **not** reset the read budget. Consumers must validate the complete supported schema, expected app/resource/network/program, original freshness budget and remaining deadline, deny unknown or delayed responses, and obtain a new decision per protected action. This metadata does not authorize broad positive caching.

Expected license/policy denials use HTTP 403 and `decision:'DENY'` with reason `LICENSE_REQUIRED`, `EXPIRED` or `RESOURCE_DISABLED`, retaining the same app/resource/wallet/program binding. A verified missing license has null `expiresAt` but retains verified snapshot context/freshness; unavailable chain snapshots have null context/freshness. Other known snapshots include decimal expiry. For a missing or expired license, `purchase` is `{url:'<configured issuer>/?offer=<canonical registered offer>',metadata:'SELLER_EXACT_BYTES_REQUIRED'}`. It points to the existing marketplace; the seller's exact buyer link/manual JSON is still required. A commitment cannot reconstruct legal terms, and a submitted checkout transaction never becomes access approval.

Known-principal chain failures use HTTP 503 `decision:'DENY'` with reason `CHAIN_UNAVAILABLE`, `STALE_CHAIN` or `OVERLOADED`, and null unverified chain metadata. Unauthenticated/invalid keys or grants use HTTP 401 with the common **error envelope**, rather than a decision body. Other precondition failures also use the common error envelope: malformed override/input 400; disabled app or changed policy 403; unknown resource 404; quota 429; database/clock uncertainty 503. Consumers must deny both envelope categories and all unsupported statuses or fields. Offer deactivation preserves an already-issued unexpired entitlement; existing enabled resource checks do not reinterpret deactivation as revocation.

Authorization observations are queued after the terminal outcome is known. Owner-scoped `/usage` now returns bounded `buckets` with requests/allowed/denied/errors plus `latencyTotalMs` and `latencyMaxMs`, and `reasons:[{bucket,reason,requests}]`. Redacted `/events` includes fixed `access.allow`, `access.deny` and `access.error` types with a safe reason and request ID; it omits wallet, grants, keys, signatures and raw RPC details. Observations may lag or be dropped during collector failure. `service.flushTelemetry()` is a bounded test/operator helper, not a public API or an authorization prerequisite.

## Health, errors and remaining phases

`GET /v1/health/live` is cheap and DB-independent. `GET /v1/health/ready` checks every applied migration name/checksum against the service's exact checked-in schema and obtains fresh SDK Devnet genesis/Clock/executable-program readiness evidence. A success reports `{ready:true,scope:'database-and-chain',network:'solana-devnet',programId,contextSlot}`; SQL drift, outages, wrong chain/program and stale readiness deny. Readiness establishes neither an individual entitlement nor deployed program-byte/upgrade-authority custody. General errors use 400 invalid input, 401 authentication/proof, 403 origin/CSRF/scope/app disabled, 404 unowned/missing object, 409 conflict/expired domain proof, 429 quota, and 503 uncertainty/DB/clock/overload.

Full developer-console integration is the next reviewed phase. Hosted DNS/TLS/provider/secret management, legal/privacy/account recovery/distribution decisions and operator capacities remain owner gates. Durable clock rollback protection across service restarts remains an explicit Phase 7 requirement; the current process rejects observed time regression. No deployment, publication, wallet transaction or remote CI claim.
