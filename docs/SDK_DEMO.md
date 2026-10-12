# Developer SDK and independent integration demo

## Scope and integration contract

This extension adds a reusable read-only TypeScript package in `packages/pact-sdk` and a separate Next.js application in `examples/pact-demo-app`. The marketplace purchase flow, on-chain protocol, deployed program and existing Git tags are preserved.

The public package import is `@pact/sdk`. A client created with `createPactClient()` supplies `verifyLicense({ offer, wallet })`, `getLicenseStatus({ offer, wallet })`, and `requireLicense({ offer, wallet })`. These are client methods rather than stateless named exports: a reused client retains slot/time progression and single-flight policy across polling. Client construction supplies shared RPC/freshness policy; individual calls preserve the requested argument shape. Documentation and exact exported types live in the package README.

The SDK fixes the deployed Devnet program to `EiiiWWsW2kkqP6nugHz6iBADvhnW5xnibAtZ82ZExVqy` and checks genesis `EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG`. Public account verification reads offer, buyer-bound entitlement, Clock and executable program together. It validates PDA derivation, owners, layout, linkage, expiry, context, freshness and slot progression. There are no wallet, signing or transaction APIs.

The independent app connects Phantom without requesting signatures. Its premium feature uses the connected public key, never a typed wallet address, and imports the SDK through public package exports. The marketplace purchase link is navigation only. Access requires fresh verification and closes on identity changes, disconnect, expiry, malformed/stale reads, wrong network, hidden/offline state or RPC errors.

Research references: [Solana coherent account reads](https://solana.com/docs/rpc/http/getmultipleaccounts), [genesis validation](https://solana.com/docs/rpc/http/getgenesishash), [Phantom connection](https://docs.phantom.com/solana/establishing-a-connection), [npm package conventions](https://docs.npmjs.com/cli/v11/configuring-npm/package-json/), and [Vercel monorepos](https://vercel.com/docs/monorepos/monorepo-faq).

## Acceptance gate

**READY for local developer integration and operator review.** Backend implemented the standalone SDK, Frontend implemented the separate app, and independent QA plus Security/Reviewer reconciliation passed. No external deployment or blockchain transaction was performed.

| Acceptance | Executed evidence |
| --- | --- |
| SDK TypeScript, compiled package and regressions | Build/typecheck passed; 27 independent Node tests passed through public `@pact/sdk` exports, 15.272 seconds. |
| Portable developer installation | Final 6,676-byte tarball installed in a fresh consumer outside PACT; public Node import/API and strict NodeNext TypeScript checks passed. Four package files: compiled JS, declarations, package manifest and README. SHA1 `53a6c1be1014482b6b8c56953ede4802a4eb9516`. This is a local tarball, not a registry publication. |
| Example synthetic production-browser acceptance | 22 passed across desktop/mobile: 20 cases in two minutes, plus two edited-offer response-race checks in 10.9 seconds. Signing stubs fail if called; RPC methods are restricted to the two read methods. |
| Actual Devnet production-browser reads | Two passed in 9.9 seconds. Public buyer/seller identities are synthetically supplied; network/account reads are real. These are not real Phantom ownership or approval evidence. |
| Final example TypeScript/production build | Passed in 7.614 seconds total, three static pages. Restored actual default Devnet RPC and offer rather than fixture configuration. |
| Independent Security/Reviewer | PASS after source, package, tests, preserved failures and current Devnet-state reconciliation. Public-wallet authentication, RPC honesty and client-side enforcement limits remain explicit. |
| Preservation and runtime | All 18 task-start frontend/program source fingerprints unchanged; artifact remains `d13828b060327ef9f702b076b8681e4b9e1e8c04f961191d1df17b2babf52a62`, and existing Phase 1/2/Solana tags remain. PACT on 3003 and Prism production preview on 3004 both return HTTP 200; Prism uses the actual offer, starts locked and has empty server stderr. Lead visually reviewed desktop/mobile synthetic-unlocked and actual-network locked screenshots. |

The existing offer is `7EdfowQEZyVyyp7bYdQyzmprZtVU9mVba8cysHm2Ardh` (0.001 SOL, 180 seconds). At the earlier investigation sample its buyer had no entitlement; the current state changed independently. Final compiled SDK read at `2026-10-10T22:59:17.293Z` verifies buyer `GNqRCZsgYUAJtetw5PJZvgpkz663XoiQTfNajDxyJ2kS` has the canonical entitlement `4Fy2xybQjZisNkkwrupvAkmBABmNPrcJxAhNmE4Sj4a6`, **expired**, at context `509698769`: expiry `1791672052`, same-context chain time `1791673157`. The seller's entitlement is **missing** at context `509698771`. Both remain locked in actual Devnet desktop/mobile checks. Security independently reproduced this state. These reads prove current account association/expiry; they do not establish a purchase signature or any transaction performed by these agents.

Initial actual tests failed two outdated buyer-missing expectations while the app correctly displayed expired. QA preserved the reports/traces and updated assertions to precisely expired buyer/missing seller; the final two tests passed without product-code changes. Also retained: an npm invocation from the wrong directory returned ENOENT before any test ran. Full commands, failure history, screenshots and evidence paths are in `docs/SDK_QA.md`.

Real Phantom dialogs and a currently active entitlement unlocking this app remain manual gates. Active unlock and timed expiry transitions are independently tested with labeled synthetic account fixtures; real on-chain expired-account detection is verified. Demonstrating a new active license requires a separately authorized operator purchase; this task performs none.

## Files created or modified

- Created `packages/pact-sdk`: `src/index.ts`, compiled `dist/index.js` and `dist/index.d.ts`, package manifest/lock, TypeScript config, `.gitignore`, README and independent `tests/fixtures.mjs` / `tests/sdk.test.mjs`.
- Created `examples/pact-demo-app`: app layout/page/Prism component/styles, package manifest/lock, Next/TypeScript configuration and generated types, `.env.example`, `.gitignore`, README, Playwright configuration and synthetic/actual read-only browser tests/runner.
- Created `docs/SDK_DEMO.md` and `docs/SDK_QA.md`; updated root README, `docs/STATUS.md`, `docs/HANDOFF.md` and `docs/DECISIONS.md`.
- Existing marketplace frontend/purchase code, Solidity, Solana source/artifact, deployment authorities and Git checkpoints were preserved. Prior uncommitted work is untouched; no Git push or external deployment occurred. Test evidence/caches are ignored but retained locally.

## Security limits

Public addresses and on-chain entitlement verification establish account association, not authentication of a person or a protected server request. A hostile browser can forge an injected provider or modify client-side UI. This is a client-side integration demonstration, not production content enforcement.

For a protected backend resource, authenticate the wallet using a server-issued, one-use challenge with an expiry, audience/domain and replay protection, then verify fresh entitlement server-side for that authenticated identity before each protected action. The Node SDK does not provide that authentication flow and a caller-supplied wallet string is not sufficient. This task requests no message signatures and implements no authentication service.

Devnet genesis and account validation detect mistakes and inconsistent responses, but do not prove an RPC provider is honest. A malicious RPC can fabricate coherent data; use a trusted RPC and appropriate server-side policy. The upgradeable program's authority can change deployed behavior. No production security, copyright ownership or legal transfer claim is made.

Independent read-only `npm audit --omit=dev` found four moderate advisory entries in the SDK dependency tree (web3.js/jayson/stream-json/uuid), zero high/critical. The app's separate audit reported zero, but its linked local SDK dependency does not establish that tree is clear. Verification uses PublicKey derivation and its own read-only fetch implementation, without invoking those cited RPC/stream/UUID paths; this does not establish that dependencies are harmless in every integration. No audit fix or unrelated upgrade was performed.

## Exact local startup commands

First install/build the SDK and example from the repository root (local development dependencies only):

```powershell
Set-Location 'C:\Hackathon\PACT Hacklanta Project'
npm --prefix packages/pact-sdk ci
npm --prefix packages/pact-sdk run build
npm --prefix examples/pact-demo-app ci
npm --prefix examples/pact-demo-app run build
```

Use separate terminals for the two applications. Do not start a second listener if that application is already running:

```powershell
# PACT marketplace, existing public Devnet configuration
Set-Location 'C:\Hackathon\PACT Hacklanta Project'
npm --prefix web run dev -- --hostname 127.0.0.1 --port 3003
```

```powershell
# Independent Prism Studio production preview
Set-Location 'C:\Hackathon\PACT Hacklanta Project'
npm --prefix examples/pact-demo-app start
```

URLs: PACT `http://localhost:3003/`; Prism `http://localhost:3004/`. For Prism development instead of production, use `npm --prefix examples/pact-demo-app run dev` (also port 3004). Avoid concurrent builds and dev processes within the same application; the two applications have separate `.next` directories.

## Operator-only 60-90 second demonstration

1. **0-15 seconds — independent integration:** show the separate app, its Devnet label and marketplace link. Show `@pact/sdk` in the source/package dependency. Connect the unlicensed operator wallet: premium content stays locked.
2. **15-35 seconds — licensed state:** open PACT's existing offer in another tab. Only if separately authorized, complete one buyer purchase with the exact original seller metadata. Explain that this transaction belongs to the marketplace; the independent application only reads entitlement state. Do not create a replacement offer.
3. **35-60 seconds — unlocked state:** return to the independent app using the same licensed buyer. A fresh coherent verification unlocks the premium feature. Switch to a distinct unlicensed wallet or disconnect: it locks immediately. Return to the buyer and require fresh verification again.
4. **60-90 seconds — expired state:** for the 180-second offer, show an elapsed-time cut with the actual expiry visible, or present a clearly labeled synthetic local test replay. Do not imply a 180-second expiry occurred within 90 seconds. After real expiry the app locks without any additional transaction.

Real Phantom dialogs, the authorized purchase, settlement and live entitlement/expiry remain manual gates. Synthetic QA demonstrates transitions with intercepted RPC and dummy public identities; it is not blockchain purchase evidence.

## Vercel preparation, no external deployment

Prepare the independent app as a separate Vercel project rooted at `examples/pact-demo-app`. Enable inclusion of files outside the Root Directory so the local SDK package is available. Install and build the SDK before building the app; exact commands are finalized in the app README. Use public Devnet RPC, offer PDA and the actual public marketplace URL for the purchase link. No keys or signer credentials are required.

Choose Node.js `24.x` to match the locally tested major; Vercel currently supports it. See [supported Node.js versions](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions). Configure:

```text
Root Directory: examples/pact-demo-app
Framework Preset: Next.js
Install Command: npm --prefix ../../packages/pact-sdk ci && npm --prefix ../../packages/pact-sdk run build && npm ci
Build Command: npm run build
Output Directory: .next (framework default)
```

The marketplace remains a separate project rooted at `web`; do not move its source or change its purchase flow for this example. No Vercel CLI login, project creation, Git push or deployment is authorized by this preparation.

Before public deployment, the operator must review final QA/security evidence, supply the public marketplace URL, authorize the Git push/project deployment separately, and perform real Chrome wallet connect/disconnect checks. A real licensed demo additionally requires its own transaction authorization.
