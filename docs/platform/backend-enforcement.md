# Backend license enforcement

Put the server module in a Node route, never a browser component:

```ts
import {createPactApiHandler} from '@pact/sdk/server';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const handler = createPactApiHandler({
  prefix:'/api/pact',
  origin:'http://localhost:3008',
  rpcUrl:'https://api.devnet.solana.com',
  authMode:'single-process', // only one persistent Node process
  protectedOffer:'7EdfowQEZyVyyp7bYdQyzmprZtVU9mVba8cysHm2Ardh',
});
export const GET = handler;
export const POST = handler;
```

Mount at `app/api/pact/[...path]/route.ts`. GET `/api/pact/protected` reads the authenticated wallet from the opaque session, reads the configured offer and entitlement using the SDK, enforces current expiry/freshness and checks the session again after RPC completion. A license for any other wallet/offer cannot authorize that operation. A failed/unverifiable read returns an error, never a cached positive result. Every protected request obtains a new authoritative snapshot.

The current protected GET returns read-only demonstration content. State-changing operations must use a separate POST route with same-origin and CSRF enforcement; do not put writes in this GET. Keep policy (offer/program/network) in server configuration; do not accept the client's chosen offer or `licenseValid` boolean as policy. Before a long-running operation commits a protected change, recheck the entitlement and identity. Streaming/subscription access needs periodic backend enforcement. Bytes already returned can be copied and cannot be retracted at expiry.

`createPlatformReader` is a server-safe public reader/preparer for custom integrations; `createWalletAuth` exposes the same scoped challenge/session mechanism. These utilities do not automatically secure arbitrary routes. Do not expose their internal binding/session IDs in JSON; use HttpOnly cookies through the handler.

For PACT's own local route, set public/nonsecret policy before starting:

```powershell
$env:PACT_APP_ORIGIN = 'http://localhost:3007'
$env:PACT_AUTH_MODE = 'single-process'
$env:PACT_PROTECTED_OFFER = '7EdfowQEZyVyyp7bYdQyzmprZtVU9mVba8cysHm2Ardh'
```

No signing secrets are needed. Authentication remains disabled on Vercel/detected serverless runtimes. This local implementation must not be represented as a production distributed access service.
