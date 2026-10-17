# Solana release assurance

The supported chain is Solana Devnet. The Base Sepolia implementation remains isolated. This procedure verifies identity; it grants no authority to deploy, sign, upgrade, revoke authority or make a program immutable.

## Source, tools and local artifact

`solana/wire-spec.json` is the native protocol contract. `solana/artifacts/evidence.json` binds the approved local ELF to source, lock and wire hashes. `reproducibility.json` additionally binds six build inputs at their recorded source revision, stable virtual source paths and independent checkout build records. These are local build evidence, not deployment receipts.

The approved local artifact has SHA-256 `408580c1ffd3068da9d66c2f7c3e1db5814ea15e4146c6f864eb4c271842c5c5` (35,704 bytes). The preserved historical `8e259de` artifact has SHA-256 `d13828b060327ef9f702b076b8681e4b9e1e8c04f961191d1df17b2babf52a62` (35,784 bytes). The difference comes from remapped diagnostic source paths and corresponding relocations; reviewed program semantics and wire layout are unchanged. The current local artifact has not been deployed by this work.

Run pinned setup, local build and runtime tests using the [validation guide](VALIDATION.md). Do not replace the compiler with an arbitrary installed Cargo/Anchor/Solana CLI. A release requires a clean committed checkout, approved tool hashes/versions, exact build inputs and an independently reproduced artifact. A program source, dependency, build flag or compiler change requires a fresh reviewed provenance record and adversarial runtime checks; changing a JSON hash alone is insufficient.

From a clean committed Windows checkout with the pinned tools installed:

```sh
node scripts/solana/provenance.mjs
node scripts/solana/provenance.mjs --rebuild
```

The first command inspects source/tool/artifact integrity and explicitly records no observed rebuild. The second compiles into a fresh ignored `solana/target/provenance-*` directory without overwriting the approved artifact, compares the complete ELF, and verifies the actual Cargo fingerprint's ordered compiler flags. Both reject dirty/untracked source, ancestor/current Git-blob or physical-input mismatch, executable drift, inherited compiler overrides and applicable ambient Cargo configuration (existence only; contents are not inspected). Before/after inspection detects inputs changing during compilation. Supporting-script Git blobs and physical hashes are recorded separately, accounting for declared checkout line endings. Keep the resulting `provenance.json` and build log with release evidence; it remains local build evidence even when a separate deployment receipt exists.

## Independent deployment inspection

After SDK dependencies are installed, run this from the repository root. The authority below is an observed public address, never a private key:

```sh
node scripts/solana/deployment-identity.mjs --authority CVN3suQneZtAb1RMuHf3BVYYEtAuNqNdSoiDQagQ7xzh --artifact historical --output web/test-results/solana-release/devnet-historical.json
```

`PACT_DEPLOYMENT_RPC_URL` optionally selects a private HTTPS RPC. Its URL, query parameters and provider errors are never included in the receipt. The tool only calls `getGenesisHash` and `getMultipleAccounts`; no wallet configuration is loaded. It checks Devnet genesis before and after one finalized account snapshot, the canonical ProgramData PDA, loader ownership/executable flags and exact binary layouts, deployment slot, explicitly expected public upgrade authority, and every artifact byte. Only zero loader allocation padding is permitted. Existing output receipts are never overwritten. Store receipts alongside the release, with timestamp and inspection-tool revision/working-tree status; stale receipts do not establish current authority or availability. Inspection does not replace the separate clean-source provenance release check.

Use `--artifact current` (the default) to verify the new local artifact after a separately authorized deployment. A historical match does not satisfy that current-artifact check. There is no silent fallback. `--authority none` only verifies an explicitly expected immutable program; it does not change authority and must never be used to normalize an unexpected authority disappearance.

### Observed Devnet identity

The reviewed tool at clean commit `bdaee6ff0e5b396610afe35317d318d1386dadd7` sampled finalized slot `511956601` at `2026-10-17T04:44:26.776Z`. The [public historical-artifact receipt](evidence/devnet-historical-2026-10-17.json) records the complete deployed 35,784-byte historical ELF, zero allocation padding, last-modified slot `509663811`, and the expected public authority. Its `artifactMatches.current` is false. A separate [current-artifact command outcome](evidence/devnet-current-mismatch-2026-10-17.json) correctly failed with `DEPLOYED_ARTIFACT_MISMATCH`; it is a harness summary of expected failure, not a successful deployment identity receipt. These dated observations establish historical correspondence only, without modifying chain state. Repeat inspection before release; no current-artifact deployment or signer custody is established.

The loader layout and canonical ProgramData derivation follow the pinned official Anza SDK [state implementation](https://github.com/anza-xyz/solana-sdk/blob/1f665ea0e85fbc26b52b68c6bce9939f8d9a9cbc/loader-v3-interface/src/state.rs) and [address derivation](https://github.com/anza-xyz/solana-sdk/blob/1f665ea0e85fbc26b52b68c6bce9939f8d9a9cbc/loader-v3-interface/src/lib.rs). Program metadata is 36 bytes; ProgramData reserves 45 bytes before the ELF, including when its authority option is absent.

## Governance and compatibility

The observed program is `EiiiWWsW2kkqP6nugHz6iBADvhnW5xnibAtZ82ZExVqy`; its canonical ProgramData is `4oeQ43DP6oUXparT8cYT3niBgdJCaFitj61mVXQfy9cX`. The observed public authority is `CVN3suQneZtAb1RMuHf3BVYYEtAuNqNdSoiDQagQ7xzh`. This repository cannot prove who controls that signer, custody quality, backup recovery or a multisig policy. No multisig is claimed. Before any authorized upgrade, the responsible operator must independently establish custody and the approval record without disclosing secrets.

The release engineer prepares source/artifact/test/deployment evidence. An independent security reviewer assesses program, instruction construction and compatibility. The product owner accepts release scope; the authorized chain operator separately reviews and approves any wallet action. Document approvals in the release record. A person may hold multiple roles in a small pilot, but self-approval must be explicit and cannot be called independent review.

Preserve existing offer/license accounts, PDA seeds, discriminators, byte sizes, integer encodings, fixed-price payment and expiry/deactivation semantics. Protocol changes require a separately reviewed compatibility/migration plan. No migration is introduced here. Entitlement is buyer-bound and does not assert copyright ownership. Legal terms and personal information stay off-chain.

For a suspected mismatch or authority change: stop hosted protected operations and new checkout entry points, preserve redacted evidence, independently repeat public inspection through a trusted endpoint, and escalate to the security owner and authorized chain operator. Existing on-chain entitlements are not erased. The program has no global pause instruction; do not claim otherwise. Never broadcast a speculative corrective transaction.

Rollback the web/SDK to a verified prior release and compatible environment configuration. A program rollback is another authorized upgrade, contingent on custody, wire/account compatibility and repeat artifact inspection; it is not a source checkout command. Authority revocation, immutability, Mainnet or commercial release remain separate human decisions.

## Evidence limits

Offline LiteSVM tests load the actual approved ELF. Signature-enabled tests use disposable in-memory local fixtures; they do not approve wallets or sign/broadcast network transactions. Local runtime success is evidence for those cases, not a complete Solana validator or production audit. Browser wallet mocks are distinct from manual Phantom acceptance. No deployment or authority action is performed by validation.
