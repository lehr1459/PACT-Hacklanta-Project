# Independent protocol vectors

`protocol-v1.json` is a checked-in oracle for the existing Solana protocol. It contains public synthetic identities, never credentials. Ordinary tests load these constants without Python, Foundry, a validator, or network access.

## Independence and provenance

- PDA addresses and bumps: Rust Solana SDK bindings in pinned `solders==0.29.0`.
- Account and instruction layout: Python `struct` with explicit little-endian formats. Discriminators come from Python SHA-256 of the established `namespace:name` values.
- Exact UTF-8 metadata commitment: pinned Foundry `cast` 1.8.5 Keccak-256. The generator checks the published empty-message Keccak vector. SHA3-256 is a different algorithm and must not replace Keccak.
- Unsigned versioned messages: solders/Rust message compiler, explicit 200,000 compute units and zero priority fee, zero placeholder signatures. Nothing is signed or sent.

The generator does not import PACT, web3.js, viem, or Noble. Metadata is passed to `cast` as explicit hexadecimal stdin, preserving Unicode and avoiding command-line quoting/size limits. The JSON records tool versions and exact metadata bytes.

Rust and web3.js legitimately order static account keys differently. Tests retain the independent Rust transaction bytes and compare the complete resolved message: payer, header, blockhash, every instruction's program/data/account order/privileges, all static-key privileges, lookup tables and signatures. They do not require identical bytes for two equivalent valid compilations. Account/instruction payloads and metadata bytes are exact byte comparisons.

## Run and regenerate

After building the SDK:

```powershell
node --test packages/pact-sdk/tests/protocol-golden.test.mjs
```

To deliberately regenerate from the reviewed local tooling:

```powershell
solana/.tools/venv/Scripts/python.exe packages/pact-sdk/tests/golden/generate.py
```

On another platform, use a Python environment containing the hash-locked Solana requirements and pass the reviewed `cast` executable with `--cast /actual/path/to/cast`. `--output` supports comparison against a temporary file. Regeneration is a review action, not a pretest hook; a failing implementation must not silently rewrite its oracle.

## Coverage and boundaries

Three vectors cover ordinary, minimum, and maximum u64 nonce/price and supported duration, including Unicode/newline metadata. Fixed account snapshots cover active, equal-to-expiry, expired, missing, prefunded/uninitialized, and maximum i64 entitlement expiry. A compact recipe plus independent hash covers exact 64 KiB UTF-8 metadata.

The SDK suite checks public verification, checkout metadata/quote/preparation, server offer/purchase preparation, malformed owners/layouts/identities/booleans/bumps/integers, network mismatch, elapsed expiry, freshness and stalled-slot boundaries. It only permits the fixture's read/preparation RPC methods and refuses signing.

The SDK has no public deactivate builder; the fixed deactivate payload/account metas are available for the marketplace and program test lanes. `solana/wire-spec.json` is checked against the fixed instruction discriminators and account sizes. This suite complements, rather than replaces, actual local-program execution and checkout/recovery state-machine tests.
