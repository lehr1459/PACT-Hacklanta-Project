# Prism Studio — independent PACT integration

A separate, read-only Next.js application that imports the public `@pact/sdk` package. Prism opens its palette workspace only for the connected Phantom wallet's fresh PACT license. It does not import marketplace code, construct transactions, request signatures, or accept a typed wallet address.

## Run locally

From your actual PACT checkout root in PowerShell:

```powershell
Push-Location packages/pact-sdk
npm ci
npm run build
Pop-Location
Push-Location examples/pact-demo-app
npm ci
npm run typecheck
npm run build
npm start
```

Open **http://localhost:3004/**. `npm run dev` also uses port 3004. The existing PACT marketplace stays on port 3003. QA browser tests use port 3005: `npm run test:browser` after a production build. The tests use synthetic read-only account fixtures and a synthetic Phantom connect API; they do not demonstrate real wallet ownership or purchases.

Copy `.env.example` to `.env.local` only if changing public settings, then rebuild. Defaults target Solana Devnet, the deployed SDK program `EiiiWWsW2kkqP6nugHz6iBADvhnW5xnibAtZ82ZExVqy`, and offer `7EdfowQEZyVyyp7bYdQyzmprZtVU9mVba8cysHm2Ardh`. `NEXT_PUBLIC_PACT_MARKETPLACE_URL` is a normal HTTP(S) purchase link; `NEXT_PUBLIC_PACT_OFFER` selects an offer, never an authenticated wallet. No credentials are needed by this app.

## Integration

```ts
import { createPactClient, isLicenseStatusFresh } from '@pact/sdk';

// A new client per connected-wallet / offer / visibility session.
const client = createPactClient({ now: () => performance.now() });
const status = await client.getLicenseStatus({
  offer: selectedOffer,
  wallet: connectedPhantomPublicKey.toBase58(),
});
const canOpen = status.active && isLicenseStatusFresh(status, performance.now());
```

The app performs sequential checks every four seconds and freshness checks every 250 ms using a monotonic clock. Account changes, disconnection, offer changes, hidden tabs, offline events and read errors discard previous verification. Late responses cannot restore a previous wallet's access. The SDK owns network, program, account identity, expiration and advancing-slot checks; the app contains no custom protocol decoding or verification RPC implementation.

## Operator demo (about 90 seconds)

1. Start Prism and the marketplace. Use Chrome with Phantom installed and select Devnet manually. The page initially stays locked and does not connect automatically.
2. Click **Connect Phantom** and approve only the connection prompt. A wallet without a valid license remains locked. The public address is displayed; it cannot be typed or substituted.
3. For a previously purchased, unexpired entitlement, connect its buyer wallet and select its offer. A fresh Devnet read opens the palette workspace. Click **Remix palette** to demonstrate its premium control.
4. Switch to another wallet in Phantom: access locks immediately, then checks the new wallet. Switch back to the licensed buyer and wait for fresh verification.
5. Disconnect, hide the tab, go offline, or wait for chain expiration to show access locking. Reopening the page or coming online requires a new check.
6. The **PACT marketplace** link opens the independent purchase app. Creating or purchasing a license remains a separate operator-authorized transaction; this demo performs no purchase.

An expired existing license cannot produce a real unlocked demonstration. A new purchase or renewal requires separate operator authorization. Real extension rejection, connection approval, account-change events, and live licensed-wallet access require manual Chrome verification; mocked tests cannot replace these.

## Vercel preparation (no deployment performed)

Use project Root Directory `examples/pact-demo-app` and enable **Include source files outside of the Root Directory in the Build Step**. Select Node.js **24.x**, matching the local Node 24.11.1 toolchain and [Vercel's supported Node.js versions](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions). Configure:

```text
Install Command: npm --prefix ../../packages/pact-sdk ci && npm --prefix ../../packages/pact-sdk run build && npm ci
Build Command: npm run build
Framework Preset: Next.js
```

Set `NEXT_PUBLIC_PACT_MARKETPLACE_URL` to the marketplace's actual public URL before building. Optional public offer and RPC settings are listed in `.env.example`; the SDK still rejects any network other than Devnet. The normal `file:` dependency resolves SDK package exports; there is no alias into `web/` or copied marketplace implementation. The SDK must be built before installing/building this app.

## Security limits

This is a client-side Devnet demonstration, not production protection for valuable content. Connecting Phantom supplies an identity for UI gating; it does not cryptographically authenticate a backend session. For protected server resources, separately prove wallet control and enforce PACT authorization on the server. RPC results rely on the configured Devnet endpoint, and Devnet can reset or become unavailable. No legal ownership or copyright transfer is claimed.
