# PACT hosted API service

Private local implementation using persistent Node 24.22.0/npm 11.19.1, PostgreSQL for hosting, and PGlite for local tests. Existing public PACT deployment and SDK remain untouched. Read the [runtime contract](CONTRACT.md) and [architecture ADR](../../docs/platform/hosted/ADR.md).

```powershell
npm --prefix packages/pact-sdk ci
npm --prefix packages/pact-sdk run build
npm --prefix services/pact-api ci
npm --prefix services/pact-api test
npm --prefix services/pact-api run openapi:check
npm --prefix services/pact-api run dev
```

Local dev listens only on `127.0.0.1:4100`, uses browser issuer `http://localhost:3000`, and creates an ignored persistent disposable pepper/database under `.local-db`. It never prints the pepper or loads an active `.env` file. Changing the pepper invalidates existing sessions/API verifiers. The browser console requires the same-origin Next gateway; port 4100 is an internal API. No hosted service is provisioned by these commands.

The complete private REST contract is [OpenAPI 3.1](openapi.json), generated from the service's immutable runtime request/response schemas and 35-route registry. `npm --prefix services/pact-api run openapi` updates both the service artifact and the web static download at `/developer/openapi.json`; include the generated files with any intentional contract change. The generator creates no API endpoint, performs no network request and publishes nothing. See [contract validation](CONTRACT.md#runtime-schemas-and-downloadable-openapi) for signature-consumption ordering and strict response behavior.

For PostgreSQL, explicitly supply the external process environment described in [.env.example](.env.example), then run `npm run migrate` and `npm start` in this directory. Hosted profile requires an HTTPS public issuer, PostgreSQL with `sslmode=verify-full`, an independently supplied 32-byte base64url pepper, an explicit private `SOLANA_RPC_URL`, and one persistent process. Optional `SOLANA_RPC_FALLBACK_URL` must be distinct and is passed to the existing bounded reader. Never place a server key, private RPC or pepper in `NEXT_PUBLIC_*`, logs, browser storage, code samples or URLs. Never use local fixtures for a hosted pilot. The service consumes the local private SDK; REST customers do not need its source or a published npm package.

Tests use disposable native Ed25519 message keypairs and synthetic local state. They do not sign/broadcast blockchain transactions. Real PostgreSQL HTTP/security tests are maintained independently under `scripts/hosted-qa`; owner-approved real Phantom/staging acceptance remains separate. Review the October 21 Node security release and November 15 dependency exceptions before external hosting. The new service's own installed dependency graph initially returned zero audit findings on 2026-10-19, but its local SDK link has a separately audited graph with four existing moderate findings and no high findings, under the bounded exceptions expiring November 15. See the [dependency assessment](../../docs/security/dependencies.md) and [hosted security review](../../docs/platform/hosted/SECURITY_REVIEW.md); a linked-package audit result does not clear that inherited graph or certify security.
