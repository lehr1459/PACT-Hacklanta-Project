# Embedded checkout

PACT's React component is backed by the existing SDK widget and transaction protections. It does not duplicate license verification or redirect to the marketplace. The package is local and unpublished.

```tsx
'use client';
import {PactCheckout} from '@pact/sdk/react';
import {PACT_PROGRAM_ID} from '@pact/sdk';

export function LicenseCheckout({offerAddress, metadataJson}: {
  offerAddress: string; metadataJson: string;
}) {
  return <PactCheckout
    offer={offerAddress}
    programId={PACT_PROGRAM_ID}
    rpcUrl="https://api.devnet.solana.com"
    metadataJson={metadataJson}
    onState={state => console.info(state.access)}
  />;
}
```

Supply the seller's exact public metadata JSON. Formatting changes can change the commitment. Missing metadata can be recovered with the existing manual JSON editor; it cannot be recovered from the terms hash. Quote, terms and consent are verified again before signing.

Mounting renders a deterministic empty host during SSR and reads the public offer after hydration. It never connects, signs or submits automatically. The user must explicitly connect Phantom, review matching terms, accept them and press Purchase license. The wallet controls approval; applications must never approve a wallet prompt on behalf of the user.

The component displays initial lookup, verified offer/price/duration, wallet state, terms, pending/confirmed/finalized/rejected/failed/expired/unknown transaction states, and current license verification. Unknown confirmation does not authorize automatic retry. Use Check pending transaction for read-only recovery of the existing signature.

`onState` receives the immutable widget state; `onLicenseActive` is an optional notification. These callbacks are client UI signals, not backend authorization. Callback identity changes do not remount the checkout. Configuration changes intentionally destroy the old checkout and discard stale local access. Unmounting stops listeners and timers. Optional `onReady` exposes the existing controller. For synthetic tests, `walletAdapterFactory` must return a fresh adapter per mount: the checkout owns and destroys it. Do not reuse an adapter across StrictMode remounts.

Style the host with documented widget CSS variables (`--pact-ink`, `--pact-accent`, `--pact-background`, `--pact-border`, `--pact-radius`, `--pact-font`) or Shadow DOM parts. Checkout stays isolated from host CSS. A callback-driven host render does not replace its DOM or reset consent. Successful background refresh keeps already displayed offer details visible.

Use `@pact/sdk/widget` for vanilla JavaScript and preserve the existing `mountCheckout` interface. Existing checkout and root exports remain supported. React is an optional peer for `@pact/sdk/react`; non-React consumers should import the original root, checkout, widget or v1 entrypoints.

Client gating alone cannot protect confidential files or premium APIs. Implement the signed wallet challenge and fresh server authorization described in the wallet-authentication and backend-enforcement guides. A transaction finalized on-chain and an application's current authenticated access decision are separate facts.

Only Solana Devnet and the reviewed program are supported. Browser tests use synthetic providers and RPC fixtures; actual Phantom permissions, message and transaction approval remain manual checks. No SDK publication or blockchain transaction is required for installation/build tests.
