# SDK installation and interfaces

Install the reviewed local `@pact/sdk@0.2.0` tarball as described in the [developer guide](../development/DEVELOPER_GUIDE.md). The package is unpublished. A clean consumer uses its own lockfile and dependencies; no sibling checkout, junction or PACT development dependency is required.

| Export | Environment and purpose |
| --- | --- |
| `@pact/sdk` | Public chain lookup: `createPactClient`, `isLicenseStatusFresh`, constants and types |
| `@pact/sdk/checkout` | Browser wallet purchase, pending protection and read-only recovery |
| `@pact/sdk/widget` | Vanilla browser `mountCheckout` |
| `@pact/sdk/react` | Optional React 18/19 peer, SSR-safe `PactCheckout` |
| `@pact/sdk/v1` | Typed HTTP `PactClient` and `PactApiError` |
| `@pact/sdk/server` | Node-only reader, wallet authentication and resource/API handler |

Never import the server entrypoint into a client component. Non-React consumers can omit React. Host applications provide React themselves; the consumer matrix tests the optional peer separately.

```js
import {PactClient} from '@pact/sdk/v1';
const pact = new PactClient({network: 'devnet', apiUrl: '/api/pact'});
const result = await pact.licenses.verify({offerAddress, walletAddress});
// result.walletControlProven === false; result.authorized === false
```

Browser clients may use a same-origin API path. Node clients require an absolute HTTPS or loopback URL. A bare origin selects `/api/v1`; an explicit path such as `/api/pact` selects that prefix. Credentials, query strings and fragments are rejected. Defaults are a ten-second HTTP deadline and 1 MiB response limit. Positive license responses must remain fresh when received; transport delay consumes their original freshness budget.

Use `offers.get`/`offers.metadata` for public information, `offers.prepare`/`checkout.prepare` for unsigned preparation and `transactions.get` for status. Metadata lookup returns `available:false` when unavailable; a hash cannot reconstruct exact metadata. REST preparation does not sign or submit and must not be treated as an instruction to blindly sign remote bytes. Use the checkout client/widget for its independent transaction validation and deliberate consent flow.

All prices, durations and chain expirations use decimal strings. A duration is the license lifetime after purchase, not an offer expiry. See [API contracts](api-reference.md), [executable purchase/recovery actions](examples/purchase-recovery.mjs) and [safe errors](errors.md).
