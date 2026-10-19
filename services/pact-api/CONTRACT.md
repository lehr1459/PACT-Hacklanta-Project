# Hosted API runtime contract

Phase 1 contract, 2026-10-19. New `/v1` only; existing `/api/v1` and customer-hosted SDK are unchanged. This is a private custom wallet proof service, not OAuth/OIDC/SIWS conformance.

## Factory and topology

`createDatabase({connectionString,profile,localPath,maxPending})` and `migrate(database)` from `src/database.mjs`; `createService({database,origin,pepper,profile,now?,resolveTxt?,rateLimit?,activeLimit?})` from `src/service.mjs`. Returned `{server,close,authenticateKey,database}` includes a Fastify instance supporting `.listen()` and test-only `.inject()`. Close the service, then its database separately. Clock and DNS injection are trusted test harness interfaces, never public HTTP configuration.

Runtime is one persistent Node24 process, loopback private listener behind a fixed trusted same-origin gateway. `origin` is the **browser-visible issuer**, not the internal loopback address. Config rejects known worker/serverless/multiple-worker markers. Hosted mode requires PostgreSQL and HTTPS. The PostgreSQL URL must use `sslmode=verify-full`; only TLS-certificate query parameters are accepted, with no duplicate keys. No browser-key CORS. No automatic infrastructure/publication/transaction behavior.

PGlite is local/test-only real SQL execution with single-process semantics. Production PostgreSQL competing-client, actual HTTP, failure and restart tests are separate evidence. A database never establishes safe distributed reader history/admission topology.

## Common envelope and safety

Every JSON response has `{schemaVersion:1,requestId,...}` and `x-pact-request-id`; caller IDs are ignored. Errors are `{schemaVersion:1,requestId,error:{code,message}}` with fixed safe strings. No raw SQL/provider exceptions, URLs, wallet proofs or secret values are logged. All responses are `no-store`, `no-referrer`, frame denied and nosniff. Body16KiB; URL4096characters; headers use bounded native Node parser; application32active and database24pending operations by default. DB pool4, statement2.5s/query3s/connect1.5s bounds. Per-IP/route120requests/minute (durable budget) is a pilot default, not a distributed capacity promise. Operator ingress needs its own trusted-client/IP bounds.

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
- App shape `{id,name,description,framework,environment:'devnet',status:'draft'|'active'|'paused',createdAt,updatedAt}`. Cross-owner reads/writes return404.
- `PATCH /v1/developer/apps/:appId` is sensitive action`app.update`, payload accepts any nonempty subset`{name,description,framework,status}`.
- `GET .../:appId/events` → `{events:[{id,type,requestId,outcome,createdAt}]}` latest100, redacted, owner scoped. `GET .../:appId/usage` → `{buckets:[{bucket,requests,allowed,denied,errors}]}` bounded30days. Authorization usage begins when data plane is implemented; an empty list means no recorded usage.

## Exact signed action proof

`POST /v1/developer/actions/challenge {action,appId,payload}` requires session+CSRF, verifies owned app and the exact action payload schema, and returns `{challengeId,message,payloadHash,expiresAt}`. Sign exact message bytes. Execute the sensitive mutation with **exactly** `{payload,proof:{challengeId,signatureBase64}}`.

The challenge binds action, app, session incarnation, wallet, expiry and SHA256 of recursively sorted object-key JSON. Absent and null differ; ordered arrays remain ordered; only safe integer numbers are accepted. Same wallet in another session cannot use the proof. Mutation revalidates active session/account, locks app/current row, atomically consumes proof with the change and redacted audit record. Concurrent attempts succeed once. Validly identified invalid signatures consume the proof; a transaction failure rolls back a successful-proof consumption with its writes. Rejected payload mutation cannot repurpose the original proof.

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
- `GET .../:appId/credentials` → `{credentials:[...]}` latest50metadata, no secret.
- `POST .../:appId/credentials/:credentialId/rotate`, action`credential.rotate`, payload`{credentialId,expiresAt,overlapSeconds}`. Overlap0–86400seconds. New key inherits old scope/name; old key expiry becomes min(old expiry,now+overlap). Quota is serialized inside app lock. Returns new once-secret credential.
- `POST .../:appId/credentials/:credentialId/revoke`, action`credential.revoke`, payload`{credentialId}` → metadata only. Available on paused apps, history retained.
- `POST /v1/credentials/validate {}` with`Authorization: Bearer <secret>` →`{valid:true,appId,credentialId,environment,scopes}`. Requires`access:check`scope and active app/account; every Origin header is rejected. This proves backend key validity, never wallet control or entitlement. Last-use stored. Future backend routes reuse`authenticateKey` and additionally revalidate after RPC before ALLOW.

## Health, errors and remaining phases

`GET /v1/health/live` is cheap and DB-independent; readiness requires migrated database and currently explicitly reports`scope:'database-control-plane'`. It must expand to verified chain readiness when the reader is wired.400invalid input,401authentication/proof,403origin/CSRF/scope/app disabled,404unowned/missing object,409conflict/expired domain proof,429quota,503uncertainty/DB/clock/overload. No response from this phase asserts a license entitlement or actual wallet extension acceptance.

Resource policy, connect/code/grant and access checks are subsequent reviewed phases; no success stubs exist. Hosted DNS/TLS/provider/secret management, legal/privacy/account recovery/distribution decisions and operator capacities remain owner gates. No deployment, publication, wallet transaction or remote CI claim.
