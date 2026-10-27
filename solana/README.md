# PACT Solana Devnet local backend

Native Rust/Pinocchio implementation with fixed binary interface in `wire-spec.json`. This is a manual wire specification, not Anchor-generated IDL. No Solana CLI, Anchor build, validator, signing key or deployment required for the local path. Base contracts remain preserved.

From `solana/` in Windows PowerShell, with Python 3.13 available via `py`:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/setup.ps1
powershell -ExecutionPolicy Bypass -File scripts/build.ps1
powershell -ExecutionPolicy Bypass -File scripts/test.ps1
```

Setup downloads official Windows platform-tools v1.57, verifies release SHA256/executable pins, creates a project-local Python venv and installs pinned/hash-locked Windows wheels. Build calls bundled Cargo directly against `sbpf-solana-solana`, avoiding keypair-generating `cargo-build-sbf` postprocessing. Dependencies are pinned in `Cargo.toml`/`Cargo.lock`. Produced `artifacts/pact_licensing.so` is an actual SBF ELF, executed by LiteSVM through solders 0.29.0.

The original 23 tests use fixed public byte-array addresses, a separate synthetic fee payer, all-zero signatures and LiteSVM `with_sigverify(False)`. The additional signed runtime suite enables signature verification and transaction history, with random disposable in-memory local keypairs and a separate fee payer. Both suites execute the actual SBF and CPI/rollback behavior. Local fixture signing is not wallet acceptance or network transaction signing. No private key is persisted/read or printed and no RPC is used.

Runtime program ID is dynamic. The public fixture ID is only for local tests. Local artifact evidence deliberately has null deployment fields. The application uses a previously deployed Devnet program; historical deployment evidence refers to the earlier binary, not automatically to a new local build. Verify current genesis, ProgramData, authority and deployed bytes independently before release. Any deployment/signing needs explicit user authorization.

Builds use stable virtual source paths, pinned executable checks and encoded compiler arguments. Two checkout locations with fresh target directories produced the identical approved local artifact; see `artifacts/reproducibility.json` and the [current validation guide](../docs/development/VALIDATION.md). The historical binary remains recoverable at `8e259de`; source/lock/wire behavior did not change. No Devnet upgrade was performed to adopt this local artifact.

Price transfers directly from buyer to recorded seller atomically with entitlement creation; account rent and transaction fees are extra. There is no escrow or withdrawal. Offers are immutable except seller deactivation; buyer licenses expire using cluster Clock timestamps. Deactivation leaves existing entitlement data intact. No NFT, transfer, legal ownership or production security claim.

Detailed evidence: `docs/SOLANA_BACKEND.md`; artifact hashes: `artifacts/evidence.json`.

Use the current [Solana release assurance guide](../docs/development/SOLANA_RELEASE.md) for source/tool provenance, read-only deployed-byte verification and upgrade governance. Historical reports do not establish current authority or artifact correspondence.
