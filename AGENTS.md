# PACT Hacklanta Project agent operating rules

## Mission
Current operator priority (2026-10-10): migrate the MVP to **Solana Devnet** while preserving Base Sepolia as an isolated validated fallback. The operator explicitly authorizes local Rust/Solana tool setup, implementation and automated tests. No live deployment, signing, wallet approvals, broadcasts, or credential access is authorized. This supersedes Base-only stack instructions below for the migration; all other guardrails remain.

Ship a credible digital-license purchase/verification MVP for Hacklanta. Focus on working tests, one complete transaction and polished demo. This is a **new separate PACT Hacklanta Project repository**; do not modify `C:\Hackathon\hacklanta-agent-project` or `C:\Hackathon\project`.

## Authority / orchestration
Lead Architect owns the plan, interfaces, integration and final decisions. Researcher is read-only. Frontend owns UI; Backend owns Solidity/chain integration; QA owns independent validation. **Senior Dev is intentionally NOT in default delegation**; invoke only if user requests or a serious integration issue requires it.

## Non-negotiable security
- Never request, read, echo, commit, or generate real wallet seed phrases/private keys.
- Only Solana Devnet, preserved Base Sepolia, and local test environments; test currencies have no monetary value.
- Do not deploy without explicit user approval.
- No real-money payment flow or production security claims.
- Do not write arbitrary Solidity from model-generated contract text.
- Do not store legal agreements, names, email addresses, or licensee personal information on chain.
- Fixed vetted contract design; use OpenZeppelin ReentrancyGuard where applicable; checks-effects-interactions.
- AI may propose structured license terms; human must approve; deterministic validation controls contract parameters.
- Do not claim legal ownership or copyright transfer from entitlement issuance.

## Execution order
1. Researcher checks local tools, reference availability and current repo (no edits).
2. Backend implements/tests minimal Foundry contract and deployment scripts locally.
3. QA independently tests edge cases; Lead Architect gates testnet deployment.
4. Frontend implements wallet connect, create offer, buy, verify, demo gated app.
5. Optional AI agent drafts license metadata; never blocks core path.
6. QA performs end-to-end testnet demo and writes reproducible evidence.

## Collaboration
Use `docs/DECISIONS.md`, `docs/STATUS.md`, and `docs/HANDOFF.md` to coordinate. No agent should silently alter another agent's owned files. Report actual test output, not assumed success. If external references are missing, continue with documented defaults rather than claiming they were inspected.
