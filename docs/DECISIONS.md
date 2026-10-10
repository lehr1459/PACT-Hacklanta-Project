# Decisions

- 2026-10-10: Operator approved Phase 2 local implementation only. Stop before broadcast/deployment and signing requests.
- 2026-10-10: Entitlement trust is bounded: same-block reads, 4-second polling, 5-second request timeout, 8-second freshness, 12-second block-progress limit; hidden/offline/error/identity changes close access. Metadata limit is shared 64 KiB UTF-8.
- 2026-10-10: Planned encrypted keystore is operator-controlled outside the repo; local browser tests use explicitly synthetic RPC/wallet fixtures, with actual testnet wallet evidence remaining a later gate.

- 2026-10-10: New PACT workspace separate from Hacklanta agent project.
- 2026-10-10: Digital licensing only; fixed license contract; native Base Sepolia test ETH.
- 2026-10-10: Seller proceeds use withdrawal pattern; no immediate external seller call in purchase.
- 2026-10-10: Senior Dev excluded from default delegation.
- 2026-10-10: Contract validity checks; no NFT ownership claims.
- 2026-10-10: Phase 1 proceeds with the bundled contract as the fixed design baseline. Dependency versions and actual local test results must be recorded before frontend integration; no testnet deployment without explicit user approval.
- 2026-10-10: Use project-local Foundry v1.8.5, Solidity 0.8.24, OpenZeppelin v5.4.0, and forge-std v1.9.7; verify release checksum and dependency commits via reproducible setup. Compiled ABI lives at `contracts/abi/PactLicensing.json`.
- 2026-10-10: Frontend requires exact off-chain metadata hash, matching price/duration, and buyer approval before purchase. It verifies RPC chain ID 84532 and contract code, simulates writes, and claims success only after a successful receipt. Missing deployment address stays an explicit setup state.
