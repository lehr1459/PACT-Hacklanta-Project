# Customer-owned resource authorization

PACT's initial enforcement model is one persistent Node 24 process on the customer's HTTPS origin. Mount one `createPactApiHandler` instance for the lifetime of that process. Use `authMode: 'single-process'` only when the operator guarantees exactly one process and no replicas. Known serverless/cluster/worker markers disable authentication; their absence cannot prove that a deployment has only one instance. Public lookup remains available with authentication disabled. Restart invalidates every challenge and session. No database or migration is required for this supported topology.

Wallet authentication, license lookup and authorization are separate. The session proves wallet control. A server-owned resource policy selects the required offer. Fresh independently validated chain state decides whether that session may access the resource. A caller cannot choose the policy wallet/offer or provide a positive authorization result.

```ts
import {createPactApiHandler} from '@pact/sdk/server';
const handler = createPactApiHandler({
  origin: 'https://your-app.example',
  rpcUrl: process.env.SOLANA_RPC_URL,
  authMode: 'single-process',
  resources: {
    report: {
      offer: process.env.PACT_PROTECTED_OFFER!,
      method: 'GET',
      prepare: async ({walletAddress, offerAddress, signal}) => ({
        body: await loadCustomerReport({walletAddress, offerAddress, signal}),
        contentType: 'application/pdf',
      }),
    },
  },
});
// Next.js Node route: export const GET = handler; export const POST = handler;
```

The executable [platform example](../../examples/pact-platform-app/app/api/pact/[...path]/route.ts) serves `/api/pact/resources/licensed-asset` and performs a bounded server calculation at `POST /api/pact/resources/render-receipt`. Its asset is server-only and absent from public HTML/client bundles. `/protected` remains a compatibility demonstration; it does not protect unrelated application routes. Mount the policy for every actual resource/action that needs enforcement. Restrict alternate file paths, static hosting, origin bypasses and proxy caching in the host application.

Resource requests accept no body or query parameters. `POST` requires an exact same-origin `Origin`; authentication has no cross-origin CORS support. Challenge and session cookies are HttpOnly, SameSite Strict and Secure on HTTPS. Session revocation is immediate within this process. The original opaque session token is checked again after asynchronous work; logging out and signing in as the same wallet does not revive an old request. Account changes must clear pending UI results, abort client work and log out; the server cannot observe wallet-extension changes before the client tells it.

The adapter checks entitlement before running `prepare`, then checks it again after preparation and immediately before returning bytes or calling `commit`. Deactivated offers still honor an existing unexpired entitlement. No cached positive result substitutes for a fresh chain read. Network, account, progress, clock and RPC uncertainty deny access.

`prepare` is trusted customer code: it must be side-effect-free, honor `signal`, and return at most 1 MiB of string/Uint8Array data. Bytes are copied before the final check. An optional `commit: () => undefined` executes synchronously with no await after the final authorization check. It must be nonthrowing and perform one atomic host operation; async commits are rejected. PACT cannot roll back arbitrary customer side effects or make an external database/network transaction atomic. For a durable application write, implement the final policy/session/entitlement condition within an application-specific transaction boundary; do not perform writes during preparation or schedule work after commit returns. Delivered data can be retained by the recipient after license expiry.

Public/auth/protected classes each have independent per-process request and active-work budgets. Defaults: 180 requests/minute each, active requests 32/16/4 respectively. Configure `requestBudgets: {public: {perMinute, maxConcurrent}, auth: {...}, protected: {...}}` within validated bounds. Public and protected reads each reserve four active chain slots plus eight queued requests, sharing the same endpoint progress history. A public flood cannot consume protected chain slots. Authentication uses no RPC. Standalone readers permit eight active operations and sixteen queued operations. Deadlines are five seconds including queue/body/preparation; cancellation denies the caller promptly. A transport or preparation that ignores abort retains its capacity slot until it actually settles, preventing hidden unbounded work.

Request bodies are bounded to 128 KiB, decoded as fatal UTF-8, and subject to the same deadline. Cookies are bounded to 8 KiB and duplicate cookies are rejected. Rate limits return 429, active/queue overload 503 and cancelled/timed-out HTTP work 408. These are process budgets, not a distributed abuse-control promise. Put deployment-specific perimeter controls in front of the process where required. API keys never replace wallet proof or entitlement.

Exact metadata remains seller/customer-retained. Buyer links and manual exact JSON recovery are supported; a hosted agreement registry, acceptance registry, distributed session store and centralized SSO remain outside this release scope.

Server clocks must be synchronized. Server snapshots reject chain Clock values outside a 60-second skew bound, including on the first request after restart. Positive server access also requires expiry strictly later than the server Unix second, as well as the chain-relative freshness check; the skew window is not an allowance to grant already expired access. A host clock ahead of chain time may conservatively deny access early. Stop authenticated service and correct clock/RPC health rather than widening this bound or using a stale positive result. The browser verifier retains its existing public interface and is never the server authorization boundary.
