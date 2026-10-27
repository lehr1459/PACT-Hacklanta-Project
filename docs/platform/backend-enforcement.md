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

## Operations and diagnostics

`createPactApiHandler` remains callable as a Request/Response handler and adds `handler.metrics()` for a frozen in-process snapshot. Optionally supply `diagnostics: {onEvent(event) { /* enqueue in your bounded collector */ }}`. Each terminal response has a new server-generated UUIDv4 in `x-pact-request-id`; caller IDs are ignored. The event contains only schema version, request ID, fixed operation name, normalized method, HTTP status, monotonic duration and a fixed failure class. Raw paths, wallets, offers, proofs, cookies, metadata, private RPC URLs and exception messages are excluded.

Failure classes distinguish expired/invalid licenses, authentication, RPC outage, invalid chain state, timeout, overload, unavailable metadata, configuration, caller input, not-found and application failure. A public negative entitlement result can correctly have HTTP200 with a license failure class. Successful RPC fallback remains a successful operation; per-provider attempt/failover counters are not exported. Fixed aggregate counters and exclusive latency buckets saturate at the safe integer limit. Gauges show responding/held HTTP work, queued/inflight/quarantined RPC work and auth-map occupancy. Stored expired entries may remain until the normal auth sweep. Snapshots reset on process restart and are not a durable audit log. Do not expose them publicly without a separate operator access policy.

Hooks must be trusted, fast and nonblocking, returning `undefined` or an ordinary native Promise. Hooks are never awaited; at most four unsettled promises are observed, after which events are dropped and counted. Throws and normal rejected promises increment diagnostic failure counters without changing authorization. Unsupported thenables are not executed. Arbitrary host JavaScript cannot be sandboxed or synchronously preempted; malicious promise constructors/species and side effects are outside this cooperative callback contract. Collector outages must not throw through another application layer or trigger a resource retry.

`GET /health/live` is a cheap handler signal independent of RPC and admission saturation. Bound connections, URI size and ingress traffic at the proxy. `GET /health/ready` uses the public reader budget for a fresh Devnet genesis/Clock/executable-program check plus configured auth availability. It does not inspect the deployed program bytes or prove an entitlement. Use the separate deployment-identity tool for ELF and upgrade-authority evidence. The routes are under your configured API prefix.

For server-side failover, supply `rpcUrls: [primary, fallback]` instead of `rpcUrl` (maximum two distinct endpoints). A whole read/preparation restarts on the next endpoint only after a retryable transport attempt fully settles; the original deadline, slot/Clock history and capacity limits remain in force. Invalid network/account/provider data fails closed rather than trying to find an endpoint that grants access. A transport ignoring cancellation retains its worker until settlement. Never use this mechanism to resubmit a blockchain transaction.

See [environment profiles](../operations/ENVIRONMENTS.md), [release preparation](../operations/RELEASE.md), [incident procedures](../operations/RUNBOOKS.md) and [rollout gates](../operations/ROLLOUT.md).
