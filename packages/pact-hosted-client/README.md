# Private hosted REST client

Node24.22-only convenience adapter, version0.1.0. No runtime dependencies, SDK export changes, publication or distribution license granted. REST remains primary. Install locally with `npm install ../../packages/pact-hosted-client` from a consumer example. Type declarations ship beside the source; no build is required.

```js
import {createPactClient} from '@pact/hosted-client';
const pact=createPactClient({origin:process.env.PACT_API_BASE_URL,
  apiKey:process.env.PACT_API_KEY,appId:process.env.PACT_APP_ID});
// Only your authenticated server session supplies grant and expected wallet.
const receipt=await pact.checkAccess({walletGrant:session.grant,
  walletAddress:session.walletAddress,resourceKey:'premium'});
receipt.assertFresh();
// Perform this immediate protected operation. Deny every exception.
```

Use the complete [integration guide](../../docs/platform/hosted/INTEGRATION_GUIDE.md) and working examples for login, cookies, logout and enforcement. Never put the key/grant in browser props, bundles, localStorage, logs or URLs. Browser/unknown conditional exports throw. The adapter never retries mutations or follows redirects; responses are size/deadline bounded and unsupported schemas/bindings deny. Only fully validated ALLOW returns a deeply frozen receipt.

The client requires synchronized trusted wall clocks. An observed rollback, future service proof, expired license, original read/progress deadline or expired conservative monotonic receipt denies. The monotonic budget starts before the outbound request and includes its whole round trip; receiving a response cannot reset its freshness. The API additionally caps the receipt at key/grant expiry. The consumer independently checks its own session/grant expiry and incarnation after awaited work.

`assertFresh()` checks only the captured temporal lease. It cannot detect a subsequent key/grant/policy revocation. Obtain a new decision before long operations or durable writes, recheck your local session after every await, and design your own transaction/idempotency boundary: a remote PACT response is not atomic with your database. No positive receipt cache or refresh token is provided. Losing a code response requires a fresh login.
