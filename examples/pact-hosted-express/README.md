# Express hosted REST consumer

An independent application with an actual server-enforced GET `/api/protected` and POST `/api/action`. Browser code calls its own backend and never receives an API key or wallet grant. This is the hosted REST path; the existing `pact-platform-app` customer-hosted SDK example is unchanged.

Versions: Node **24.22.1**, npm **11.19.1**, Express **5.3.0**, private `@pact/hosted-client` **0.1.0**. Run from the PACT repository root:

```text
npm --prefix packages/pact-hosted-client ci
npm --prefix examples/pact-hosted-express ci
```

Copy `examples/pact-hosted-express/.env.example` to its own `.env.local`. Set `PACT_API_BASE_URL` to your configured PACT browser/API origin; set public `PACT_APP_ID` and the registered `PACT_RESOURCE_KEY`. Store a real once-revealed `PACT_API_KEY` privately in this **server-only** file or approved server secret store. Never paste credentials in chat, command arguments, source code or browser settings. No actual credential is included in this example.

Register the exact callback **`http://127.0.0.1:4010/api/login/callback`**, with website origin `http://127.0.0.1:4010`, in `/integrate/developer`. Bind an active offer owned by your admin, create a key with `connect:write` and `access:check`, and activate the app. The resource in `.env.local` must match the registered key; the sample name `premium-features` is only a default. Start the local PACT service/gateway separately using its testing guide.

```text
npm --prefix examples/pact-hosted-express start
```

Open **`http://127.0.0.1:4010`**. Click **Continue with PACT**, deliberately connect/review/sign the message on the PACT origin, and return to this app. The backend validates its session-bound state, S256 PKCE, exact issuer/callback and one-use code, rotates its opaque HttpOnly/Lax session, then redirects to a clean root URL. Login alone does not permit premium content. **Read protected content** and **Perform protected action** call the real backend; absent/expired/uncertain licensing denies. Purchase links use existing checkout and require seller-exact metadata and human wallet approval. After finalized purchase, request a new decision. Log out clears local authority first and reports whether remote grant revocation was confirmed.

`server.mjs` exposes the reusable Express factory. `@pact/hosted-example-server` holds the shared session and enforcement logic. See [shared security/limits](../pact-hosted-common/README.md), [full integration guide](../../docs/platform/hosted/INTEGRATION_GUIDE.md) and [REST contract](../../services/pact-api/CONTRACT.md). The app deliberately has no request logger. Disable raw callback URL/query logs at any future proxy as well.

```text
npm --prefix examples/pact-hosted-common test
npm --prefix examples/pact-hosted-express test
```

The first suite tests session/callback/CSRF/races with synthetic server clients. The second runs actual HTTP through Express, including denied/allowed protection, rotation/logout and slow-body admission. They are not human Phantom or hosted-pilot acceptance. One bounded persistent local process is supported; restart denies local sessions. No deployment, publication, real wallet signature or transaction is performed by these commands.
