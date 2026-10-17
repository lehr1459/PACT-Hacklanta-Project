# Backend resource enforcement

Host one handler instance for the lifetime of one persistent Node process on your application's own HTTPS origin. Keep the private asset and this module on the server.

```ts
import 'server-only';
import {createPactApiHandler} from '@pact/sdk/server';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const handler = createPactApiHandler({
  prefix: '/api/pact',
  origin: 'https://your-app.example',
  rpcUrl: process.env.SOLANA_RPC_URL,
  authMode: 'single-process',
  resources: {
    asset: {
      offer: process.env.PACT_PROTECTED_OFFER!,
      prepare: async ({walletAddress, offerAddress, signal}) => ({
        body: await loadPrivateAsset({walletAddress, offerAddress, signal}),
        contentType: 'application/octet-stream',
      }),
    },
  },
});
export const GET = handler;
export const POST = handler;
```

Mount this Next route at `app/api/pact/[...path]/route.ts`. `loadPrivateAsset` is your server function; the [executable module](examples/authorize.mjs) accepts it explicitly. A plain Node adapter must preserve Request/Response, headers and cookies. The `/protected` compatibility demo does not protect your unrelated routes.

The session selects the proven wallet; a server-owned resource policy selects the required offer. `GET /api/pact/resources/asset` checks fresh entitlement before preparation and again before returning bytes. Resource requests reject query parameters and input bytes. A POST resource requires the exact configured Origin and an empty body:

```js
const response = await fetch('/api/pact/resources/operation', {
  method: 'POST', credentials: 'include',
});
if (!response.ok) throw new Error('Protected operation denied');
```

Only configure that operation if it has a server policy. Keep private files out of static directories, caches, alternate routes and client bundles. Every access path needs enforcement.

`prepare(context)` must be bounded, side-effect-free and honor `context.signal`. Return at most 1 MiB of string/Uint8Array data. An optional `commit: () => undefined` runs synchronously after final checks; it must be atomic, nonthrowing and perform no deferred work. PACT cannot roll back arbitrary host side effects or make an external database/network write atomic. Use an application-specific transaction design for durable writes.

Serverless, replicas, workers, shared sessions and distributed replay/rate state are unsupported. Known runtime markers disable authentication, but the operator must still guarantee topology. Restarts invalidate sessions. Deactivation preserves an unexpired entitlement; expiry or uncertainty denies later access. Already returned bytes remain copyable.

See the complete [authorization contract](../development/AUTHORIZATION.md), [wallet proof](wallet-authentication.md) and [security model](security.md). No server wallet or signing secret is required.
