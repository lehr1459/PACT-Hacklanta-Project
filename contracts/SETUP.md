# Local contract workflow

Run from `contracts/` in Windows PowerShell. No PATH changes or wallet secrets required.

```powershell
powershell -ExecutionPolicy Bypass -File scripts/setup.ps1
./.tools/foundry-v1.8.5/forge.exe test -vv
powershell -ExecutionPolicy Bypass -File scripts/export-abi.ps1
./.tools/foundry-v1.8.5/forge.exe script script/Deploy.s.sol:Deploy
```

The final command only simulates in a local EVM (31337), without broadcasting. No deployment performed in Phase 1. Any broadcast requires explicit user approval; QA review must precede testnet deployment. Script allows only 31337 and Base Sepolia 84532; it never reads a private key. Keep signing outside AI workflows.

`dependencies.json` pins Foundry v1.8.5, forge-std v1.9.7 and OpenZeppelin v5.4.0. Setup verifies official Windows ZIP SHA256 before extraction and dependency commits. This is checksum verification, not an independent signature audit. Compiler is pinned to Solidity 0.8.24; Forge downloads it on first build. Tools, libraries, cache, build output and broadcast artifacts are ignored.

Official sources: [Foundry installation](https://getfoundry.sh/introduction/installation), [Foundry release](https://github.com/foundry-rs/foundry/releases/tag/v1.8.5), [forge-std](https://github.com/foundry-rs/forge-std/tree/v1.9.7), [OpenZeppelin](https://github.com/OpenZeppelin/openzeppelin-contracts/tree/v5.4.0).

Generated `abi/PactLicensing.json` is the frontend integration artifact. Re-export after contract changes. Require a configured deployed address; no testnet address exists yet. The simulation address printed by Forge must never be treated as a deployed address.

Bundled fixed offer/expiry/pull-payment design unchanged. Backend tests cover invalid offers/IDs, exact payment, duplicate purchases, exact expiry and repurchase, deactivation, independent buyers, seller-only proceeds, payout rejection rollback/retry, reentrancy and 256-run accounting fuzz. QA tests are independent under `test/qa/`.

Forge build emits heuristic warnings for timestamps (specified expiry clock), events (purchase already emits LicensePurchased), and payout call/event ordering (CEI with OpenZeppelin nonReentrant; malicious receiver tests pass). These are documented findings, not an audit or production security claim.
