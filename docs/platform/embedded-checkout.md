# Embedded checkout

React consumers install their own React 18 or 19 alongside the reviewed SDK tarball. Non-React consumers use `@pact/sdk/widget`; React is optional.

```tsx
'use client';
import {PactCheckout} from '@pact/sdk/react';
import {PACT_PROGRAM_ID} from '@pact/sdk';

export function LicenseCheckout({offerAddress, metadataJson}: {
  offerAddress: string; metadataJson: string;
}) {
  return <PactCheckout offer={offerAddress}
    programId={PACT_PROGRAM_ID}
    rpcUrl="https://api.devnet.solana.com"
    metadataJson={metadataJson}
    onState={state => console.info(state.access)} />;
}
```

Pass the seller's exact public metadata string. Whitespace, formatting and encoding can alter its commitment. Missing metadata needs the original buyer link/download or manual exact JSON entry; an offer address or hash cannot reconstruct it. Price, duration, commitment and explicit consent are checked before signing.

SSR renders an empty host. Hydration can read public offer state, but mounting never automatically connects, approves terms, signs or submits. The user connects, reviews matching terms, accepts them and presses Purchase license. Wallet owners approve prompts themselves.

The component wraps the existing widget and checkout protections. Its pending control recovers the original signature read-only; unknown confirmation does not authorize another approval or send. A finalized transaction still needs fresh entitlement verification. Expiry closes current UI access; it cannot retract delivered content.

`onState` and `onLicenseActive` are UI notifications, never backend authorization. Callback changes do not remount checkout; configuration changes destroy the old controller. Unmount stops listeners/timers. For tests, `walletAdapterFactory` must return a fresh owned adapter per mount, including StrictMode remounts. Optional `onReady` exposes the controller.

Use widget CSS variables (`--pact-ink`, `--pact-accent`, `--pact-background`, `--pact-border`, `--pact-radius`, `--pact-font`) or Shadow DOM parts. For vanilla JavaScript, use public `mountCheckout` from `@pact/sdk/widget` or the package's ESM/IIFE browser assets. The [purchase/recovery module](examples/purchase-recovery.mjs) demonstrates client actions without marketplace imports.

Protect confidential assets and actions with [same-origin wallet proof](wallet-authentication.md) and [server policies](backend-enforcement.md). Only Solana Devnet and the reviewed program are supported by these examples. Automated adapters are synthetic; real Phantom UX remains a separate manual check.
