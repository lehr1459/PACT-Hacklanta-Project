# Next.js App Router / React hosted consumer

The React frontend calls its own BFF routes. `lib/consumer.ts` is marked `server-only`; the private key, app-scoped grant, state and PKCE verifier stay in that Node process. Actual GET `/api/protected` and POST `/api/action` enforce fresh PACT decisions. This is the React-with-backend example, not a browser-key SDK.

Versions: Node **24.22.0**, npm **11.19.1**, Next.js **16.4.0**, React/React DOM **19.3.0**, private `@pact/hosted-client` **0.1.0**. From the repository root:

```text
npm --prefix packages/pact-hosted-client ci
npm --prefix examples/pact-hosted-next ci
```

Copy only this example's `.env.example` to `examples/pact-hosted-next/.env.local`. Configure `PACT_API_BASE_URL`, public `PACT_APP_ID`, server-selected `PACT_RESOURCE_KEY` and privately set `PACT_API_KEY`. Never use `NEXT_PUBLIC_`, React props, browser storage or command arguments for the credential. Register exact callback **`http://127.0.0.1:4011/api/login/callback`** and origin `http://127.0.0.1:4011`; bind an active seller-owned offer, mint a two-scope key and activate the app in the PACT console. The configured resource must match your actual registration; `premium-features` is only the sample default.

```text
npm --prefix examples/pact-hosted-next run dev
```

Open **`http://127.0.0.1:4011`**. Start/review/sign wallet login deliberately on PACT; return here to test **Read protected content**, **Perform protected action** and logout. Successful wallet login alone is not a license. Missing/expired licensing and API/chain/DB uncertainty deny. Existing checkout needs the seller's exact metadata and human wallet approval; no transaction is signed or broadcast by this backend.

For a production-mode local check:

```text
npm --prefix examples/pact-hosted-next run typecheck
npm --prefix examples/pact-hosted-next test
npm --prefix examples/pact-hosted-next run build
npm --prefix examples/pact-hosted-next start
```

Configuration is first read on a backend request, not embedded in a frontend bundle. Do not copy another project's `.env.local` into an isolated checkout. `next.config.mjs` disables incoming request logging, browser forwarding and server-function arguments, so callback codes do not appear in Next development access logs. Keep raw callback query URLs out of any future TLS proxy and diagnostics.

The framework adapter requires the incoming **Host** to equal the configured consumer origin's exact host/port, then constructs only that configured origin plus the framework path/query. Next 16.4 normalizes loopback URL hostnames to `localhost`; that internal URL authority is not used as authentication evidence. All forwarded/original-host/protocol headers are discarded before the shared engine, while the caller's exact `Origin`, CSRF, cookie and body remain unchanged. Do not enable broad proxy trust to bypass a Host failure; a future approved gateway must preserve the configured Host. The adapter tests cover the loopback behavior, forged/absent Host, forwarding-header injection and unchanged cross-origin denial.

The [shared backend](../pact-hosted-common/README.md) uses bounded process-local sessions with HttpOnly/Lax opaque cookies, rotation, strict Origin/CSRF, state/PKCE/issuer binding and CAS after awaited work. It rejects known serverless/worker/cluster environments. **One persistent Node process only**; restart invalidates local sessions. Next replicas/serverless and a distributed session platform are not supported by this sample. A remote API is not atomic with your DB: recheck before durable commits and long operations. The demonstration action is an in-memory counter.

See [integration guide](../../docs/platform/hosted/INTEGRATION_GUIDE.md), [REST contract](../../services/pact-api/CONTRACT.md), and the Express actual-HTTP/session test suites. Existing PACT marketplace, checkout and customer-hosted examples are unchanged. Builds/tests are local engineering evidence; real Phantom/device acceptance, external hosting, publication and a pilot require separate owner authorization.
