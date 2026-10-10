# Agent handoff

## Active Solana migration ownership

- Lead: account/interface decisions, shared docs, checkpoint, operator-only Devnet package.
- Researcher: read-only official tooling/dependency check, then explicitly transitions to Frontend ownership after findings.
- Backend: new `solana/**` excluding independent QA tests, `docs/SOLANA_BACKEND.md`; preserve all `contracts/**`.
- Frontend: Solana UI/adapter modules and isolated Base route preserving existing source; coordinate package changes with QA.
- QA: new `web/tests/solana/**`, independent `solana/tests/qa/**`, `docs/SOLANA_QA.md`; existing Base suites remain intact.
- No Senior Dev unless critical unresolved issue. No deployment/signing/key generation/credential access by any agent.

### Solana local handoff

- Native SBF artifact, hash manifest, manual wire specification and local setup/build/test scripts are in `solana/`. Runtime program address is dynamic; production configuration stays empty until an approved deployment.
- Actual program gate: 23 local LiteSVM tests, including 14 independent QA; preserved Solidity unchanged. Phantom/Solflare frontend is client-only with Devnet genesis checks and coherent, bounded entitlement snapshots. Existing Base UI is isolated at `/base`.
- QA owns final browser/build evidence in `docs/SOLANA_QA.md`. Lead visually reviewed desktop/mobile screenshots and independently checked artifact SHA256.
- Frozen candidate: `solana-local-ready`. Operator package: `docs/SOLANA_DEPLOYMENT_PACKAGE.md`. All wallet permission/signing/deployment/broadcast and live Devnet proof remain pending authorization/operator execution.
- npm audit has 24 transitive advisories; no production audit claim. This limitation and real Chrome checks are documented in the web README and QA evidence.

## Phase 2 ownership

- Lead: checkpoint, integration decisions, shared status/handoff, deployment package.
- Backend: `contracts/**` except independent QA fixtures; `docs/BACKEND_PHASE2.md`.
- Frontend: `web/app/**`, `web/lib/**`, frontend README/config; existing Researcher worker explicitly reassigned to Frontend after completed read-only research.
- QA: `web/tests/**`, Playwright config, coordinated package test dependencies/scripts, `docs/QA.md`; independently validates final Backend and Frontend results.
- Senior Dev not assigned. No on-chain broadcast or deployment authorized.

### Phase 2 local result and stop gate

- Backend: 23 passing tests, unchanged contract source, verified tools/dependencies, explicit Cancun, ABI and runtime hashes independently reproduced.
- Frontend: same-block bounded snapshots, monotonic bigint expiry, shared 64 KiB metadata, sender-safe transaction state and unknown confirmations; visual identity retained with tested metadata wrapping fix.
- QA: 48 fixture/helper executions and 2 missing-address browser executions passed; independent TypeScript/build/default HTTP passed. Playwright results are synthetic local evidence only. See current verdict in `docs/QA.md`.
- Lead visually reviewed representative desktop/mobile screenshots. Default build restored with setup pending; QA server stopped.
- Frozen local candidate tag: `phase2-local-ready` (resolve after checkpoint). Deployment package: `docs/DEPLOYMENT_PACKAGE.md`.
- Stop before deployment/broadcast/signing. Operator next follows private wallet preparation/funding steps; public address/balance/nonce and signer-specific preflight stay pending until supplied. Separate explicit deployment approval is required.

Lead Architect assigns tasks and records owners. Each agent posts: scope, files, interface contracts, commands/tests, risks, and next action. QA must validate contract before deployment. Frontend should use the ABI exported from compiled contract, not handwrite an incompatible ABI.

## Active assignments — 2026-10-10

- Researcher: read-only environment, feasibility, and official dependency verification; no file ownership.
- Backend: `contracts/**`; validate the bundled fixed design, establish reproducible Foundry tests, add deployment and generated ABI workflow. No deployment.
- Lead Architect: shared coordination documents and integration decisions.
- QA: independent contract validation; owns `contracts/test/qa/**` and `docs/QA.md`, coordinating tool readiness with Backend.
- Frontend: owns `web/**`, implementing seller/buyer/verifier/gated app after passing contract tests. The completed Researcher worker was explicitly reassigned to Frontend; research remains complete and read-only.
- Senior Dev: not assigned.

## Local Phase 1 result

- Backend: fixed contract behavior preserved; project-local tooling, pinned dependencies, generated ABI, and deployment simulation ready. Combined tests: 19 passed, 0 failed, 0 skipped.
- Frontend: seller, buyer, verification and gated sample flows implemented under `web/`; build and TypeScript pass. Uses `NEXT_PUBLIC_PACT_CONTRACT_ADDRESS` and `NEXT_PUBLIC_RPC_URL` in `web/.env.local`.
- QA: independently passed contract tests, frontend source review, TypeScript, production build, and HTTP checks. Evidence and explicit limitations are in `docs/QA.md`.
- Preview: `http://localhost:3000` (production server, setup pending because no deployed address).
- Next action: review local UI, then obtain explicit approval before Base Sepolia deployment. Configure approved address, rebuild/restart, and run real seller/buyer wallet E2E with explorer evidence. No signing secrets enter agent workflows.
- Browser interaction was not executed because no browser was available; no testnet transaction or deployment claimed.
