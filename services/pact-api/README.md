# PACT hosted API service

Private local implementation using persistent Node 24.22.0/npm 11.19.1, PostgreSQL for hosting, and PGlite for local tests. Existing public PACT deployment and SDK remain untouched. Read the [runtime contract](CONTRACT.md) and [architecture ADR](../../docs/platform/hosted/ADR.md).

```powershell
npm --prefix services/pact-api ci
npm --prefix services/pact-api test
npm --prefix services/pact-api run dev
```

Local dev listens only on `127.0.0.1:4100`, uses browser issuer `http://localhost:3000`, and creates an ignored persistent disposable pepper/database under `.local-db`. It never prints the pepper or loads an active `.env` file. Changing the pepper invalidates existing sessions/API verifiers. The browser console requires the same-origin Next gateway; port 4100 is an internal API. No hosted service is provisioned by these commands.

For PostgreSQL, explicitly supply the external process environment described in [.env.example](.env.example), then run `npm run migrate` and `npm start` in this directory. Hosted profile requires an HTTPS public issuer, PostgreSQL with `sslmode=verify-full`, an independently supplied 32-byte base64url pepper, and one persistent process. Never place a server key or pepper in `NEXT_PUBLIC_*`, logs, browser storage, code samples or URLs. Never use local fixtures for a hosted pilot.

Tests use disposable native Ed25519 message keypairs and synthetic local state. They do not sign/broadcast blockchain transactions. Real PostgreSQL HTTP/security tests are maintained independently under `scripts/hosted-qa`; owner-approved real Phantom/staging acceptance remains separate. Review the October 21 Node security release and November 15 dependency exceptions before external hosting. npm audit of this new service dependency graph initially returned zero findings on 2026-10-19; it is not security certification.
