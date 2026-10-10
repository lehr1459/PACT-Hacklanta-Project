# Decisions

- 2026-10-10: New PACT workspace separate from Hacklanta agent project.
- 2026-10-10: Digital licensing only; fixed license contract; native Base Sepolia test ETH.
- 2026-10-10: Seller proceeds use withdrawal pattern; no immediate external seller call in purchase.
- 2026-10-10: Senior Dev excluded from default delegation.
- 2026-10-10: Contract validity checks; no NFT ownership claims.
- 2026-10-10: Phase 1 proceeds with the bundled contract as the fixed design baseline. Dependency versions and actual local test results must be recorded before frontend integration; no testnet deployment without explicit user approval.
- 2026-10-10: Use project-local Foundry v1.8.5, Solidity 0.8.24, OpenZeppelin v5.4.0, and forge-std v1.9.7; verify release checksum and dependency commits via reproducible setup. Compiled ABI lives at `contracts/abi/PactLicensing.json`.
- 2026-10-10: Frontend requires exact off-chain metadata hash, matching price/duration, and buyer approval before purchase. It verifies RPC chain ID 84532 and contract code, simulates writes, and claims success only after a successful receipt. Missing deployment address stays an explicit setup state.
