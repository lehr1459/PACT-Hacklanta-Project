# Solana backend implementation and local evidence

Report date: October 10, 2026 (America/New_York). New `solana/` backend only; existing `contracts/` files preserved. No wallet/private-key generation, reading, storage, logging or signing; no RPC deployment, local validator, broadcast or wallet approval.

## Toolchain decision

Windows environment had no Rust/Cargo, Anchor/Solana CLI, MSVC compiler, Docker or WSL. Official Anza platform-tools v1.57 provides native Windows Rust/Cargo/LLVM and Solana SBF standard libraries. The Windows archive was downloaded from the official release and its SHA256 matched the GitHub release digest: `792bc821f006e2b56aee31640110b449d5dc89f1305f16f24037465ab8cd7d5a`.

Bundled compiler: `rustc 1.95.0-dev (ae660768a 2026-08-17)`. Native minimal Rust/Pinocchio was selected over Anchor to avoid host proc-macro/MSVC setup and Anchor build postprocessing. Official `cargo-build-sbf` postprocessing may generate a program keypair automatically, so it is deliberately bypassed. Build uses bundled Cargo directly with `--release --locked --target sbpf-solana-solana`. Pinocchio 0.9.2/system 0.3.0 are pinned with checksummed transitive crates in Cargo.lock. A minimal explicit panic handler resolves an older Pinocchio macro incompatibility with the bundled recent Rust; failure aborts execution rather than introducing recoverable state.

Python 3.13.5 exists via `py`. Project-local venv uses official Windows solders 0.29.0 wheel (SHA256 `f36db7b43088866081b5d37ff62668551e30dd136b9ee58a5fb524fcd828082d`) providing actual LiteSVM. npm LiteSVM's published optional binaries omit Windows. Python dependencies are pinned and hash-locked in `solana/requirements-lock.txt`; no system install or reboot required.

Sources: [Anza platform-tools release](https://github.com/anza-xyz/platform-tools/releases/tag/v1.57), [cargo-build-sbf postprocessing](https://github.com/anza-xyz/cargo-build-sbf/blob/master/src/post_processing.rs), [solders LiteSVM API](https://kevinheavey.github.io/solders/api_reference/litesvm.html), [LiteSVM](https://github.com/LiteSVM/litesvm).

## Fixed protocol and security checks

`solana/wire-spec.json` is the frozen **manual native Rust wire specification**, not a generated Anchor IDL. It lists exact instruction/account discriminators, argument layouts, account metas, sizes, offsets, PDA seeds and custom errors. Frontend and QA received it directly. Instructions use Anchor-compatible discriminator hashes; this does not imply Anchor implementation.

- Offer PDA: `['offer', seller32, nonceU64LE]`, 98 bytes; immutable seller, nonce, price, duration, terms hash; active flag and bump.
- License PDA: `['license', offer32, buyer32]`, 81 bytes; bound offer and buyer, signed i64 expiry and bump.
- Create requires system-owned empty seller wallet signer, positive price, duration 1..31536000 seconds and nonzero opaque 32-byte terms hash.
- Buy requires buyer signer and system-owned empty payer; canonical offer/license PDAs and saved bumps; program ownership/discriminator/size; active offer; recipient exactly recorded seller. System Program is fixed and executable.
- Program transfers **exact stored price** through System Program CPI, with no submitted arbitrary payment amount. Entitlement initialization and settlement share Solana transaction atomicity. Buyer pays extra rent for first entitlement; fee payer pays transaction fees. Repurchase after exact expiry reuses entitlement account, requiring no new account rent.
- Pre-funded empty system-owned PDAs are supported through rent top-up, PDA-signed allocate and assign, preventing lamport-donation initialization denial of service.
- Checked i64 expiry addition and conservative maximum duration prevent overflow. Cluster Clock sysvar syscall supplies time; caller cannot submit expiry/time.
- Deactivate requires recorded seller signer and canonical program-owned offer; existing licenses remain unchanged. No transfer, revoke, NFT, escrow withdrawal or legal ownership semantics.

Runtime program ID comes from Solana entrypoint and is not embedded in binary. Local fixture `US517G5965aydkZ46HS38QLi7UQiSojurfbQfKCELFx` is a **fixed public byte-array address** (`[7;32]`), not generated key material or deployment evidence. Real program ID/operator wallet/signature/funding remain **PENDING**.

## Actual build and tests

Commands from `solana/`:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/setup.ps1
powershell -ExecutionPolicy Bypass -File scripts/build.ps1
powershell -ExecutionPolicy Bypass -File scripts/test.ps1
```

Setup verified four executable SHA256 pins and Python dependency lock; build exited 0. `llvm-readelf` confirms ELF64/little-endian/DYN/**Solana Bytecode Format**. Actual artifact is `solana/artifacts/pact_licensing.so`, **35784 bytes**, SHA256 `d13828b060327ef9f702b076b8681e4b9e1e8c04f961191d1df17b2babf52a62`. A second build into a fresh separate `.tools/repro-target` compiled all seven crates and produced the identical SHA256. `solana/artifacts/evidence.json` records artifact/source/lock/spec hashes and null deployment fields.

Backend LiteSVM result: **9 tests passed, 0 failures**, using actual compiled artifact. Tests cover exact price/seller balance and buyer rent accounting, duplicate rejection/state preservation, exact-expiry repurchase, seller-only deactivation/existing entitlement preservation, invalid terms, insufficient payment causing account initialization/transfer rollback, buyer signer and PDA/recipient bindings, pre-funded PDA initialization, immutable reinitialization rejection and expiry overflow rollback. Independent QA added 14 tests under `solana/tests/qa/` (without importing Backend's harness), independently confirmed the packaged artifact SHA256, and reported **23 combined tests passing** via the same discovery command. QA checks additional owner/discriminator/bump/mutability/System Program rejection cases, extra-payment argument rejection and nonpersisting simulation.

The local harness constructs unsigned transactions with zero signature buffers and synthetic signer flags, with signature verification disabled. It verifies program access checks/CPI/atomicity, **not cryptographic authorization or external wallet integration**. No Keypair imports or seed/private-key operations exist in the backend/test workflow. No live-chain read or transaction was needed.

## Pending integration and limits

Frontend must configure only Devnet, require a confirmed deployed program ID, validate account ownership/canonical PDA/discriminator/length/binding on reads, and calculate validity using cluster Clock rather than local browser time. Metadata remains offchain; terms hash is opaque onchain and frontend may use keccak256 of approved canonical metadata. Personal information or full agreements must never be stored in program accounts.

No deployment approval is implied by local build/test authorization. Before any later operator deployment: independent QA/security gate, privately managed operator program identity and signer, Devnet faucet funds, explicit approval, confirmation of onchain executable artifact and owner, real seller/buyer wallet transaction/expiry/gate evidence. No source-verification, live Devnet transaction or production-audit claim exists yet.
