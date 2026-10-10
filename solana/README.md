# PACT Solana Devnet local backend

Native Rust/Pinocchio implementation with fixed binary interface in `wire-spec.json`. This is a manual wire specification, not Anchor-generated IDL. No Solana CLI, Anchor build, validator, signing key or deployment required for the local path. Base contracts remain preserved.

From `solana/` in Windows PowerShell, with Python 3.13 available via `py`:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/setup.ps1
powershell -ExecutionPolicy Bypass -File scripts/build.ps1
powershell -ExecutionPolicy Bypass -File scripts/test.ps1
```

Setup downloads official Windows platform-tools v1.57, verifies release SHA256/executable pins, creates a project-local Python venv and installs pinned/hash-locked Windows wheels. Build calls bundled Cargo directly against `sbpf-solana-solana`, avoiding keypair-generating `cargo-build-sbf` postprocessing. Dependencies are pinned in `Cargo.toml`/`Cargo.lock`. Produced `artifacts/pact_licensing.so` is an actual SBF ELF, executed by LiteSVM through solders 0.29.0.

Tests use fixed public byte-array addresses, separate synthetic fee payer, all-zero signatures, and LiteSVM `with_sigverify(False)`. They exercise real program instructions, CPI and runtime rollback but **do not test cryptographic wallet signing**. No keypair is generated/read and no RPC is used.

Runtime program ID is dynamic. The public local fixture ID is only for local tests; deployed program ID and signature remain PENDING. Never put the local fixture into deployed-address configuration or claim it was deployed. Any future CLI deployment/signing is outside this local implementation scope and needs explicit user approval.

Price transfers directly from buyer to recorded seller atomically with entitlement creation; account rent and transaction fees are extra. There is no escrow or withdrawal. Offers are immutable except seller deactivation; buyer licenses expire using cluster Clock timestamps. Deactivation leaves existing entitlement data intact. No NFT, transfer, legal ownership or production security claim.

Detailed evidence: `docs/SOLANA_BACKEND.md`; artifact hashes: `artifacts/evidence.json`.
