# Independent application example

`examples/pact-platform-app` (Canvas Lab) hosts its own Next.js page, optional React checkout, same-origin wallet proof and server resource handler. It imports public SDK exports, not marketplace components. The reusable [documentation examples](examples/lookup.mjs) are also tested against an independently installed tarball.

From your PACT checkout root:

```sh
npm --prefix packages/pact-sdk ci
npm --prefix packages/pact-sdk run build
npm --prefix examples/pact-platform-app ci
npm --prefix examples/pact-platform-app run build
npm --prefix examples/pact-platform-app run start
```

Open `http://localhost:3008` exactly. Changing the hostname/port requires changing the launch configuration and `PACT_APP_ORIGIN` together. Public offer, exact metadata and Devnet RPC are configuration; wallet secrets are not. No separate marketplace server is required. Repository source-copy installation serves development; use the tarball workflow for your own app.

The default public TEST offer is mutable external demo state, not deployment discovery or proof of an entitlement. Its exact default metadata is:

```json
{"schema":"pact-solana-license-v1","title":"TEST","terms":"TEST","priceLamports":"1000000","durationSeconds":"180"}
```

The application checks it against the live offer. For another offer, replace both configuration and original exact metadata. An unavailable or deactivated offer must not be converted into a successful demonstration.

Manual browser walkthrough, only with separately authorized wallet actions:

1. Select Devnet and connect the intended wallet. Review the actual offer and exact matching terms.
2. Click Authenticate wallet and review the challenge origin/wallet/purpose. Message signing proves control; it neither purchases nor proves entitlement.
3. Without a current license, protected asset/action requests must fail on the server.
4. Separately approve a purchase if desired. Accept terms, request the transaction once and approve it in your wallet. Keep its signature; recover unknown status rather than blindly retrying.
5. With wallet proof and a fresh active entitlement, request the private asset or protected calculation. The server checks both authorization boundaries.
6. Change accounts, disconnect, hide/go offline, log out or wait for expiry. The UI closes access and subsequent protected requests must deny. Account changes clear/abort local work and log out; the server cannot directly observe an extension event.

The route serves a server-only sample asset and an in-memory bounded calculation. It does not promise durable writes, DRM or legal ownership. Authentication requires one persistent Node process and same-origin cookies; restarts invalidate sessions. Do not deploy this model across workers/replicas/serverless. Existing public deployments and the Base fallback remain separate.
