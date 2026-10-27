# PACT hosted REST integration — private Devnet pilot

Contract 1, hosted client 0.1.0, Node 24.22.1/npm 11.19.1, Express 5.3.0, Next.js 16.4.1/React 19.3.0. No external host is provisioned by these instructions. For local testing, first see `docs/platform/hosted/LOCAL_TESTING.md` in the repository. The existing `/api/v1`, `@pact/sdk`0.2.0 exports, marketplace, buyer checkout, Solana Devnet program and isolated Base Sepolia implementation remain available.

## Choose your boundary

Hosted REST is the primary integration: browser → **your backend/session** → PACT `/v1` → verified Devnet reader. PACT does not receive your source code or directly protect your app. Your backend decides when to perform an operation after a fresh authorization result. A browser wallet address, connected wallet icon, API key validation or successful sign-in alone never proves a license.

The alternative is the existing customer-hosted `@pact/sdk/server` reader/authorization integration. It gives you your own RPC, availability and server/session responsibilities. See `docs/platform/backend-enforcement.md` and the original `examples/pact-platform-app`. The old `/integrate` generator remains under **Self-hosted SDK**. Old browser-only examples are informational UI; never migrate them into server authorization by trusting an `active` flag from the browser.

The hosted login is a limited custom private-pilot protocol. It is not public OAuth/OIDC/SIWS compliance, a refresh-token service or general SSO. Human Phantom signature approval is explicit on the PACT origin; no example signs, broadcasts or purchases automatically.

## Migrate an existing generator / SDK integration

Keep the existing protected route and self-hosted option until the replacement passes parity checks. Register a hosted app, exact callback and seller-proven resource; mint its private credential. Add your own backend session, state/PKCE callback exchange and logout lifecycle using the example engine. Replace the server's reader/authorization call with the hosted client at the same protected operation boundary, retaining fail-closed behavior. **Never forward an old same-origin SDK cookie as a hosted wallet grant**: initiate fresh hosted wallet proof and bind the returned grant to your own server session. Browser display state cannot migrate authentication. Test missing-license denial, licensed allowance, exact expiry, API outage, session switch/logout and revoked keys before switching traffic. Preserve the customer-hosted SDK route as an explicit alternative; do not run both paths with a fallback that converts hosted uncertainty into approval.

## Configure an application

1. Open `/integrate/developer`, connect your developer wallet, review the exact admin message and explicitly sign it. Register a draft application.
2. Register an exact callback, including scheme, hostname, port and path. Local/test allows loopback HTTP; an external callback requires HTTPS and current DNS TXT control. No wildcard/query/fragment, percent encoding, arbitrary redirect or unverified domain.
3. Bind a resource such as `premium` to an active Devnet offer controlled by your proven developer wallet. PACT reads the chain and checks the seller; the caller cannot assert seller ownership. App resource keys are immutable. Updates require the displayed version and an exact signed payload; updates invalidate earlier pending logins and grants through the policy epoch.
4. Mint a short-lived credential with `connect:write` and `access:check`, save its once-revealed secret in your backend secret store, then dismiss it. Lists contain metadata only. Activate the app through the signed Settings action.
5. Set backend-only `PACT_API_BASE_URL`, `PACT_API_KEY`, `PACT_APP_ID`, a server-selected `PACT_RESOURCE_KEY` and `PACT_CONSUMER_ORIGIN`. Follow the selected example's `.env.example` exactly; its callback is `/api/login/callback` at that consumer origin. Never use `NEXT_PUBLIC_`, `VITE_`, React props, browser storage, query strings or analytics for a key or grant. No real key belongs in a committed `.env.example`.

## Run the reviewed examples

From the repository root, install the private convenience package and example dependencies locally. Nothing is published:

```text
npm --prefix packages/pact-hosted-client ci
npm --prefix examples/pact-hosted-express ci
npm --prefix examples/pact-hosted-next ci
```

Use `examples/pact-hosted-express/README.md` for port4010 and `examples/pact-hosted-next/README.md` for port4011; register each example's exact documented callback before login. Populate only that example's local private environment, following its README. Start just the desired consumer. The Next example is also the React example: its browser calls its own BFF, never a PACT credential endpoint. Do not copy workstation environment files into clean validation checkouts.

The shared example engine has a bounded **process-local** opaque HttpOnly SameSiteLax session store. It demonstrates one persistent local/pilot process; restart invalidates sessions. It is not a distributed production session platform. Do not deploy multiple workers or substitute client-stored grants. A durable customer-session store, hosting and account recovery require owner-reviewed work before a broader rollout.

## Login and logout

Your backend generates cryptographic random state and a PKCE verifier, stores them against the initiating local session incarnation and submits `POST /v1/connect/transactions` with the exact callback, S256 challenge and displayed purpose. Navigate the top-level browser to the returned issuer-bound `/connect` URL. The PACT page displays application identity, verified website, purpose, wallet/network and exact message before the user signs.

The callback contains a one-use code, state and `iss`. Your backend rejects duplicates/unknown parameters, verifies state and exact expected issuer against its initiating session, then exchanges the code once through `/v1/connect/token`. The key, verifier and returned grant stay server-side. Rotate the local opaque session and immediately redirect to a clean URL. Disable request URL/query logging at both application and proxy; callback codes must not enter access logs or artifacts. Failed/lost exchanges require fresh login, never mutation retries. The examples suppress raw callback URLs and native provider errors.

For logout or wallet switch, invalidate local authority first, attempt app-owned `/v1/connect/revoke`, clear the cookie and start fresh authentication. A failed network revoke cannot restore the local session. Capture and recheck the local session incarnation after **every** awaited body/API operation; an in-flight callback or access result must not revive logged-out authority. PACT cannot detect wallet disconnects on another website.

## Protect an actual backend operation

```js
import {createPactClient} from '@pact/hosted-client';
const pact = createPactClient({origin:process.env.PACT_API_BASE_URL,
  apiKey:process.env.PACT_API_KEY, appId:process.env.PACT_APP_ID});
// session is loaded from your server-owned authenticated cookie store.
// Capture session incarnation and validate its grant expiry before this await.
const receipt = await pact.checkAccess({walletGrant:session.grant,
  walletAddress:session.walletAddress, resourceKey:'premium'});
// Recheck the same live session incarnation and expiry after the await.
receipt.assertFresh();
// Perform the immediate protected operation here; deny every exception.
```

The complete example engine implements these checks and real protected GET/POST routes; the fragment above is explanatory. A React component calls those routes with its own session/CSRF token. It cannot submit a wallet or offer selector to bypass policy. A successful key-validation request proves only a scoped application credential.

`POST /v1/access/check` accepts exactly `{walletGrant,resourceKey}` with the backend Bearer key and **no Origin header**. App, wallet, offer, network and program are derived server-side. Only HTTP200 + schemaVersion1 + `ALLOW`/`ACTIVE_LICENSE`, correct app/resource/wallet/network/program, validated policy/version, original fresh chain evidence and unexpired temporal bounds permit an operation. Typed DENY, error envelopes, unknown fields/status/schema, wrong bindings, RPC/DB uncertainty, overload, timeout and clock rollback all deny.

The client verifies original 8-second read and 12-second progress budgets, chain/wall expiry, API-capped key/grant deadline and its entire outbound round trip. Receipt fields are deeply frozen. Trusted synchronized host clocks are required; future server proof or observed rollback denies. Never turn receipt arrival into a fresh eight-second cache. `assertFresh()` checks only that captured temporal lease; it cannot discover a later revocation or policy change. Obtain another decision before a long operation/durable commit and recheck your own session. Remote PACT calls are not atomic with your database; design transaction/idempotency and compensation boundaries yourself. Expiry cannot reclaim delivered bytes.

## Checkout, expiry and recovery

Only a validated missing/expired denial may carry an informational marketplace link `/?offer=<registered canonical offer>`. Obtain the seller's exact buyer link or exact metadata JSON: an on-chain commitment cannot reconstruct legal terms. The existing checkout requires human wallet approval; an observed/submitted transaction is not a license decision. If purchase status is ambiguous, use the existing read-only recovery flow, wait for final evidence and check access again. Never blindly resubmit a purchase. Offer deactivation blocks new sales while preserving already-issued unexpired entitlements. PACT entitlements do not by themselves transfer copyright.

## Stable failures and operator evidence

See `services/pact-api/CONTRACT.md` and generated OpenAPI for all35 operations, exact schemas and status unions. Important classes:400 malformed input;401 key/grant/proof/session failure;403 Origin/CSRF/scope/disabled policy or known licensing denial;404 unknown/unowned resource;409 policy/version/callback conflict;429 bounded quota;503 chain/DB/clock/overload uncertainty. Never parse raw exception text or grant an exception to uncertainty. Use safe `requestId` for support; do not log secret bodies or callback URLs.

Read-only readiness proves current database schema plus Devnet reader readiness, not a buyer entitlement or program custody audit. Usage/audit are owner-scoped, bounded and asynchronous; they can lag/drop observations and are not billing or a complete access ledger. Key rotation can allow a bounded overlap; revoke incident credentials and grants, pause apps or disable resources through reviewed controls.

Usage responses include newest records within96KiB and may omit older retained rows. The hosted service requires a private persistent local clock authority and trusted synchronized host time; filesystem faults, rollback, freeze or accumulated negative clock slew fail closed. One persistent process is supported. Restore requires offline quarantine and a new authentication epoch, followed by fresh login and key issue. See the repository's `CLOCK_ADR.md` and `OPERATIONS.md` for capacity, retention, deletion and recovery limits. These requirements apply to the hosted operator; they do not change the existing customer-hosted SDK.

## Contracts, REST diagnostics and validation

Generated runtime-backed schema: `services/pact-api/openapi.json`, served as static `/developer/openapi.json`. Rebuild with `npm --prefix services/pact-api run openapi`; check byte/source/schema drift with `npm --prefix services/pact-api run openapi:check`. Large documentation artifacts bypass the bounded `/v1` gateway.

`examples/pact-hosted-rest` uses actual cURL with credentials/config on stdin, bounded response/time, no redirects/curlrc/proxies and redacted output. It is a diagnostic, **not route authorization**. Use the complete reviewed client/BFF for enforcement. Commands/tests are in its README; never put actual secrets in command arguments or terminal captures.

Local checks:

```text
npm --prefix packages/pact-hosted-client test
npm --prefix examples/pact-hosted-common test
npm --prefix examples/pact-hosted-express test
npm --prefix examples/pact-hosted-rest test
node --test scripts/hosted-qa/phase6-client.test.mjs
```

The native integration test uses the disposable local `pact_hosted_qa` database and read-only synthetic RPC/Ed25519 fixtures. It is not a real-wallet receipt. CI runs must be tied to the exact feature commit; foundation CI success does not validate new changes. See the implementation report for actual executed counts, pending gates and owner-only staging acceptance.

Before external sharing: owner approval for domain/TLS, persistent host/PostgreSQL, private RPC, secret manager, ingress limits, backup/retention/privacy/terms, operators and distribution rights. The October21 Node review was completed October22 with Node24.22.1; reassess by **2026-11-05 00:00UTC**, earlier on a new advisory or before hosting. Dependency exceptions expire **2026-11-15 00:00UTC**. No push, deployment, package publication, real-wallet transaction, Mainnet support or Saturday Lights change is authorized by this guide.
