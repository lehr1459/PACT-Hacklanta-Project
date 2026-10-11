# PACT embedded checkout — independent vanilla app

Palette Lab is a static HTML/CSS/JavaScript consumer of PACT's self-contained browser SDK. It mounts inline Shadow DOM checkout in `#checkout`; it has no React, Next.js, external runtime imports, remote metadata fetch or synthetic production mode. The premium sample is gated by the widget's current fresh entitlement state, independently of payment confirmation.

## Local startup

From `C:\Hackathon\PACT` in PowerShell:

```powershell
Push-Location packages/pact-sdk
npm ci
npm run build
Pop-Location
node examples/pact-checkout-vanilla/server.mjs
```

Open the **exact URL printed by the server**. It tries port **3006**, then 3007 through 3016 if occupied, binds only `127.0.0.1`, and never stops another listener. To select a starting port within that range, set `$env:PORT = '3009'` before starting. PACT 3003, Prism 3004 and Saturday Lights 3005 remain separate.

`config.js` explicitly supplies the reviewed Devnet program, RPC and actual existing demo offer. No wallet or offer is inferred by the SDK. The example requires the seller's exact metadata JSON: paste it in the widget, or add its exact string as `metadataJson` in host configuration. Never recreate or invent missing title/terms bytes; mismatched metadata disables purchase. Local server routes are a fixed public file allowlist; signer/config directories are not served.

## Consumer integration

```js
import {mountCheckout} from './pact-checkout.mjs';

const controller = mountCheckout({
  element: '#checkout',
  offer: 'YOUR_EXISTING_OFFER_PDA',
  programId: 'EiiiWWsW2kkqP6nugHz6iBADvhnW5xnibAtZ82ZExVqy',
  rpcUrl: 'https://api.devnet.solana.com',
  metadataJson: exactSellerMetadata,
  onState(state) {
    premiumFeature.hidden = state.access !== 'active';
  },
});

premiumAction.addEventListener('click', () => {
  // Recheck at action time; never trust a previously active callback.
  if (controller.getState().access !== 'active') return;
  performLocalPremiumDemoAction();
});
```

For a plain script tag, load `pact-checkout.js` and call `PACT.mountCheckout(...)`. Both bundles are self-contained. The package also exposes `@pact/sdk/widget` for module consumers. `mountCheckout` never automatically connects, requests signatures, simulates or submits. Only an explicit purchase action after matching terms approval invokes the SDK purchase workflow.

Host theming uses CSS custom properties `--pact-ink`, `--pact-background`, `--pact-muted`, `--pact-border`, `--pact-accent`, `--pact-radius`, `--pact-font` and Shadow DOM parts: `root`, `header`, `brand`, `title`, `wallet`, `quote`, `terms`, `metadata`, `consent`, `button`, `connect`, `disconnect`, `refresh`, `purchase`, `status`, `message`, `transaction`. Host CSS never needs to enter widget internals.

## Operator review (no live action performed by agents)

1. Inspect the full program and offer addresses, seller, exact price, duration and terms hash displayed by the widget. Confirm Devnet in Phantom manually.
2. Obtain the seller's exact saved JSON. Paste it without changing whitespace. Review the displayed hash-matched title and terms, then approve the terms checkbox.
3. Click **Connect Phantom** only when authorized to approve a wallet connection. Confirm the connected public address. Missing extension and rejection remain locked.
4. **Purchase license** is a live transaction action. Do not click it or approve a signature until the operator separately authorizes this checkout purchase. Connecting alone never purchases.
5. After an authorized purchase, transaction acceptance/confirmation/finalization are reported separately from fresh license access. Finalized-but-unverified payment stays locked; **Check pending transaction** only reconciles public history and license state, never signs or resends.
6. Account switching, disconnection, expiration, stale/frozen RPC, read failures, hidden tabs and offline state close premium access. An already-active entitlement requires no new payment.

The example's default existing license may already be expired. Real purchase/unlock evidence requires an operator-approved transaction and matching metadata. Synthetic tests live only under the independent QA harness and cannot substitute for real Devnet evidence.

## Security boundaries

Client-side gating alone is not production-grade security. Do not return confidential APIs/files before wallet authentication and fresh server-side authorization. `onLicenseActive` is an informational fresh status callback; consumers must still process closed `onState` events and recheck `getState` before each action. Public journal recovery protects same-origin duplicate attempts; cross-origin exactly-once is not claimed. Never place private keys, seed phrases or recovery phrases in configuration, storage or prompts. Entitlements do not establish copyright ownership or legal enforceability.
