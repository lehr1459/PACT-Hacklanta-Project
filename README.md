# PACT — Programmable Agreements, Contracts & Transfers

Hacklanta MVP: **digital licensing only**. A seller defines a license offer, a buyer pays in Base Sepolia test ETH, and the smart contract records a nontransferable time-limited entitlement. A participating demo app verifies entitlement before allowing access.

## Start here (Windows / VS Code)
1. Extract this ZIP to `C:\Hackathon\PACT` (a **separate project**, not over the existing Hacklanta agent project).
2. Open the `PACT` folder in VS Code. Your `.github/agents/*.agent.md` profiles are included here; existing Hacklanta agents are not overwritten.
3. Open Copilot Chat, select **Lead Architect** (if agent profiles are supported), and paste `prompts/START_HERE.md`. Or use Codex and ask it to read `AGENTS.md` plus that prompt.
4. Let the agent inspect your environment, then scaffold and implement **Phase 1**. This ZIP contains specifications, agent instructions, example data and a minimal runnable contract/test foundation; it is **not a deployed finished app**.
5. No wallet keys or seed phrases should be shared with an AI agent or committed to Git.

## Intended stack
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
cd C:\Hackathon\PACT\web
npm ci
npm run dev
```

Open http://localhost:3000. The app provides seller offer creation and withdrawals, buyer terms review and purchase, public wallet verification, and a chain-checked sample feature. Until an approved deployment address is configured in `web/.env.local`, it displays setup pending and disables chain actions. See `web/README.md` for configuration and the demo flow.

## Non-goals
No real payments, deeds, car titles, on-chain personal data, arbitration, universal legal-contract generation, or arbitrary AI-generated Solidity. No claim that an on-chain license proves copyright ownership.

## Transaction semantics
**Atomic buyer purchase:** buyer sends exact test ETH; contract creates an entitlement and credits seller's withdrawable balance in the same transaction. Seller withdraws in a separate safe call. Thus payment is economically allocated atomically, but **not instantly sent to seller's wallet**. The UI must be precise about this distinction.

## MVP acceptance
- A seller creates an offer with immutable price/duration/terms hash.
- A buyer purchases with exact test ETH; duplicate active purchases revert.
- `isLicenseValid(offerId, buyer)` is true until expiry and false afterward.
- Seller can withdraw credited proceeds; no other wallet can withdraw them.
- At least one testnet transaction can be verified with a public explorer link.
- A demo gated page reads validity from chain (not merely local UI state).

## Deadline
Prioritize an end-to-end demonstrable flow ahead of optional features. Reserve time for README, demo script, screenshots, public repo, and submission.
