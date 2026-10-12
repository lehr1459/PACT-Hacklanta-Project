# SDK installation and interfaces

The package remains `@pact/sdk@0.1.0` with additive versioned exports; nothing has been published to npm. Build it and install its local package into your application:

```powershell
Set-Location 'C:\Hackathon\PACT Hacklanta Project'
npm --prefix packages/pact-sdk ci
npm --prefix packages/pact-sdk run build
Set-Location 'C:\path\to\your-app'
npm install 'C:\Hackathon\PACT Hacklanta Project\packages\pact-sdk' --install-links
```

React consumers supply React themselves. `--install-links` installs a package copy rather than a junction into SDK development dependencies, avoiding duplicate React instances. Rebuild and reinstall after SDK changes. For a portable local artifact, run `npm pack` inside the SDK after building; install the resulting `.tgz`. Do not publish it without approval.

| Export | Environment / purpose |
| --- | --- |
| `@pact/sdk` | Existing browser/server public verification; unchanged `createPactClient`, `isLicenseStatusFresh`, constants and types |
| `@pact/sdk/checkout` | Existing client-owned wallet purchase, pending journal, read-only recovery |
| `@pact/sdk/widget` | Existing vanilla browser checkout |
| `@pact/sdk/v1` | New typed HTTP `PactClient`, `PactApiError` and shared result types; no Node crypto |
| `@pact/sdk/react` | Optional React peer; SSR-safe `PactCheckout` backed by the existing widget |
| `@pact/sdk/server` | Node-only reader, authentication and REST handler; never import into a client component |

```ts
import {PactClient} from '@pact/sdk/v1';
const pact = new PactClient({network:'devnet',apiUrl:'http://localhost:3007'});
await pact.offers.get(offerAddress);
await pact.offers.metadata(offerAddress); // available:false when unregistered
await pact.offers.prepare({sellerWallet,nonce:'1',metadataJson});
await pact.checkout.prepare({offerAddress,walletAddress,metadataJson});
await pact.licenses.verify({offerAddress,walletAddress});
await pact.licenses.get(offerAddress,walletAddress);
await pact.transactions.get(signature);
await pact.auth.challenge(walletAddress);
await pact.auth.verify({challengeId,signatureBase64});
await pact.auth.session();
await pact.auth.logout();
await pact.protected.get();
```

`apiUrl` accepts an absolute origin (uses `/api/v1`) or an explicit prefix such as `https://your-app.example/api/pact`. Browser clients may use `/api/pact`; Node clients need an absolute URL. HTTPS or loopback HTTP only; credentials, query and fragments are rejected. Devnet and the reviewed program ID are mandatory. Optional `fetch` and `timeoutMs` support deterministic tests and bounded transport; defaults are 10 seconds and a 1 MiB response limit.

For actual purchases use `pact.checkout.createClient({walletAdapter,onState})` or the React/vanilla widget. Their existing workflow builds, validates, simulates and reviews transactions before an explicit wallet signature, then submits only to a genesis-checked Devnet RPC. REST preparation returns unsigned bytes only. Do not deserialize an arbitrary remote transaction and blindly sign it: retain the SDK's independent instruction/message validation and current quote/consent checks.

The method inventory above uses developer-supplied public addresses, exact metadata and challenge/signature results. Follow the embedded-checkout and wallet-authentication guides for complete interactive components. The client rechecks positive license/protected snapshots on HTTP receipt; transport delay does not extend the eight-second freshness window. Keep client/server clocks synchronized; clock discrepancies fail closed.

All prices, durations and chain expirations use decimal strings. Preserve exact public metadata bytes. A duration defines license lifetime after purchase, not an offer expiration date. Deactivation prevents future sales and does not revoke existing licenses.
