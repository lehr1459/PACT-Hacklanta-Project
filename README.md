# PACT Hacklanta Project

PACT — Programmable Agreements, Contracts & Transfers.

## GitHub project

Source repository: [lehr1459/PACT-Hacklanta-Project](https://github.com/lehr1459/PACT-Hacklanta-Project) (private; sign in with repository access). The existing public demo is [PACT Hacklanta](https://pact-hacklanta-demo.vercel.app/). This source publication preserves the release history and tags; it does not deploy the app or authorize blockchain transactions. See [GitHub setup and source-validation limits](docs/GITHUB_PUBLICATION.md).

Hacklanta MVP: **digital licensing only**, now targeting **Solana Devnet**. A seller defines an offer, a buyer pays test SOL, and the program atomically settles payment and records a buyer-bound, time-limited entitlement. PACT Studio unlocks only after a fresh chain-validated read. The previous Base Sepolia implementation remains preserved at `/base` and in `contracts/`.

The canonical local checkout is `C:\Hackathon\PACT Hacklanta Project`. The old `C:\Hackathon\PACT` path remains a compatibility view for existing processes and archived evidence. Repository naming does not change PACT branding, package identities, the Vercel project or public URLs. See [rename details](docs/REPOSITORY_RENAME.md).

## Developer integration

Open [Integrate your app](http://localhost:3003/integrate) for the Next.js/React setup wizard. It validates a public Devnet offer through the SDK and generates a local-package install command, configuration, Phantom-connected license gate and AI coding prompt. Its previews are labelled synthetic; generating instructions does not register or protect an app automatically. See the [wizard runbook](docs/INTEGRATION_WIZARD.md) and [independent acceptance evidence](docs/INTEGRATION_WIZARD_QA.md).

The root `@pact/sdk` entrypoint remains the compatible read-only TypeScript verification API. `examples/pact-demo-app` is a separate Phantom-connected premium-feature demo that consumes it without copying marketplace verification code. New opt-in `@pact/sdk/checkout` and `@pact/sdk/widget` entrypoints support an explicitly approved embedded Devnet purchase; a signature alone never unlocks access.

The vanilla JavaScript checkout example is independent of the marketplace and requires no React or Next.js. Build the SDK, then run `node examples/pact-checkout-vanilla/server.mjs` from the repository root. It uses port 3006 with available-port fallback, preserving Saturday Lights on 3005. See the [embedded checkout runbook](docs/EMBEDDED_CHECKOUT.md) for configuration, browser bundles, security limits and the separately authorized real-wallet test.

```powershell
Set-Location 'C:\Hackathon\PACT Hacklanta Project'
npm --prefix packages/pact-sdk ci
npm --prefix packages/pact-sdk run build
npm --prefix examples/pact-demo-app ci
npm --prefix examples/pact-demo-app run dev
```

The example is at `http://localhost:3004/`; PACT stays at `http://localhost:3003/`. Start PACT in a separate terminal with `npm --prefix web run dev -- --hostname 127.0.0.1 --port 3003` if it is not already running. Existing public Devnet configuration remains unchanged.

See the [SDK API and React/Next.js/Node examples](packages/pact-sdk/README.md), [independent application](examples/pact-demo-app/README.md), [integration/security/demo runbook](docs/SDK_DEMO.md) and [independent QA evidence](docs/SDK_QA.md). A connected public wallet identity and a client-side gate do not authenticate a protected backend request. Public Vercel deployment and real license transactions require separate authorization.

## Solana local candidate

The native Rust program lives in `solana/`; its versioned manual binary interface is `solana/wire-spec.json`. Build and execute the compiled SBF locally without signing credentials:

```powershell
cd 'C:\Hackathon\PACT Hacklanta Project\solana'
powershell -ExecutionPolicy Bypass -File scripts/setup.ps1
powershell -ExecutionPolicy Bypass -File scripts/build.ps1
powershell -ExecutionPolicy Bypass -File scripts/test.ps1
```

The frontend uses Phantom/Solana Wallet Adapter with client-only providers. Connect, disconnect, account changes and Devnet RPC validation retain the existing visual design. Production configuration leaves the program address empty until an explicitly authorized deployment. Local program tests execute actual compiled bytecode; browser tests use synthetic wallet/RPC fixtures. Neither is evidence of live Devnet purchases or real Phantom permission dialogs.

See [independent QA](docs/SOLANA_QA.md), [web setup and manual Chrome checks](web/README.md), and the [operator-only deployment package](docs/SOLANA_DEPLOYMENT_PACKAGE.md). Deployer/program addresses, funding and live wallet evidence remain pending. No agent deploys, accesses credentials, requests wallet approval or broadcasts.

## Start here (Windows / VS Code)
1. Extract this ZIP to `C:\Hackathon\PACT Hacklanta Project` (a **separate project**, not over the existing Hacklanta agent project).
2. Open the `PACT Hacklanta Project` folder in VS Code. Your `.github/agents/*.agent.md` profiles are included here; existing Hacklanta agents are not overwritten.
3. Open Copilot Chat, select **Lead Architect** (if agent profiles are supported), and paste `prompts/START_HERE.md`. Or use Codex and ask it to read `AGENTS.md` plus that prompt.
4. Let the agent inspect your environment, then scaffold and implement **Phase 1**. This ZIP contains specifications, agent instructions, example data and a minimal runnable contract/test foundation; it is **not a deployed finished app**.
5. No wallet keys or seed phrases should be shared with an AI agent or committed to Git.

## Preserved Base stack
- Solidity + Foundry + OpenZeppelin (contract; native test ETH only)
- Base Sepolia (testnet)
- Next.js + TypeScript + Tailwind/shadcn/ui (web app)
- wagmi + viem (wallet interaction)
- Vercel (deployment)
- AI-assisted licensing-policy drafting is optional and strictly off the critical path.

## Phase 1 local contract workflow

Foundry and dependencies are pinned and installed inside `contracts/`; no global PATH changes are required. From PowerShell:

```powershell
cd contracts
powershell -ExecutionPolicy Bypass -File scripts/setup.ps1
./.tools/foundry-v1.8.5/forge.exe test -vv
powershell -ExecutionPolicy Bypass -File scripts/export-abi.ps1
./.tools/foundry-v1.8.5/forge.exe script script/Deploy.s.sol:Deploy
```

The last command simulates locally without broadcasting. The local contract gate passed 19 tests, including independent QA; see `docs/QA.md` and `contracts/SETUP.md`. No deployed contract address exists yet. Testnet deployment requires explicit user approval.

## Run the web app

```powershell
cd 'C:\Hackathon\PACT Hacklanta Project\web'
npm ci
npm run dev
```

Open http://localhost:3000 for Solana, or `/base` for the preserved Base fallback. Until an approved deployment address is configured in `web/.env.local`, the app displays setup pending and disables chain actions. Solana settles directly to the seller; Base retains its withdrawal flow. See `web/README.md` for configuration and demo details.

## Phase 2 local validation

Phase 1 is preserved by Git tag `phase1-local-baseline`. Phase 2 bounds entitlement freshness, reads licenses at one block, uses chain-based expiry, and preserves transaction sender attribution. The fixed contract behavior is unchanged.

Independent browser tests use synthetic local RPC/wallet fixtures, not real signatures or mined transactions. They build a fixture target on port 3001; do not run concurrent builds. See `docs/QA.md` for the final commands/results. `docs/DEPLOYMENT_PACKAGE.md` contains the artifact hashes, proposed operator-only deployment commands, and encrypted wallet/funding guide. No broadcast or deployment is authorized; signer-specific prerequisites remain pending.

## Non-goals
No real payments, deeds, car titles, on-chain personal data, arbitration, universal legal-contract generation, or arbitrary AI-generated Solidity. No claim that an on-chain license proves copyright ownership.

## Preserved Base transaction semantics
**Atomic buyer purchase:** buyer sends exact test ETH; contract creates an entitlement and credits seller's withdrawable balance in the same transaction. Seller withdraws in a separate safe call. Thus payment is economically allocated atomically, but **not instantly sent to seller's wallet**. The UI must be precise about this distinction.

## Preserved Base MVP acceptance
- A seller creates an offer with immutable price/duration/terms hash.
- A buyer purchases with exact test ETH; duplicate active purchases revert.
- `isLicenseValid(offerId, buyer)` is true until expiry and false afterward.
- Seller can withdraw credited proceeds; no other wallet can withdraw them.
- At least one testnet transaction can be verified with a public explorer link.
- A demo gated page reads validity from chain (not merely local UI state).

## Deadline
Prioritize an end-to-end demonstrable flow ahead of optional features. Reserve time for README, demo script, screenshots, public repo, and submission.
