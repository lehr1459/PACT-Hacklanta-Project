# Final architecture and chain review — October26, 2026

Reviewer: architecture/backend specialist operating under the root engineer. Inspected source baseline `31fd16023ccbed4f9f06f6d85aedc79ea7346728`; final acceptance additions were still uncommitted during the observations below. This review covers architectural boundaries and independently inspected evidence. It is not a claim that every line of the complete changeset received a human audit, nor a final merged-revision test receipt.

## Changeset and compatibility findings

`origin/main` was `7bad86992f996d9edbfff9d085483b8028e53f8a`; the validated foundation remained `57b425f148e65840c23283b4283ce1e22ccb45bd`. Reviewed the full changed-file inventory/statistics against main and inspected the hosted ADR/contracts/integration and operating documents, API control/connect/access boundaries, private client, shared consumer enforcement, Express/Next wrappers, native consumer tests, and chain identity/provenance tooling.

The feature combines the earlier foundation engineering with the new hosted platform. It is therefore inaccurate to call every SDK file unchanged relative to main: foundation SDK hardening and additional public server/REST entrypoints are part of this merge. Against the validated foundation, `packages/pact-sdk`, `solana` and `contracts` have no committed feature-branch differences. The original example application source is retained; two Next example manifests/locks changed from16.4.0 to reviewed16.4.1. Package formatting changes do not imply a new product capability.

Direct `git diff --exit-code origin/main...HEAD -- solana/src/lib.rs solana/wire-spec.json solana/Cargo.toml solana/Cargo.lock contracts/src contracts/abi contracts/artifacts` passed with no differences. Solana program logic, protocol/account layout inputs, Base contract source, ABI and reviewed contract artifacts are preserved. Solana compilation/setup/provenance tooling and the reproducibly path-remapped local ELF differ from main; Base setup/evidence scripts have portability changes. These are actual changes and must not be described as byte-identical tooling.

The hosted boundary remains browser → consumer-owned backend/session → PACT hosted REST → existing hardened Devnet reader. The customer-hosted SDK and original marketplace/checkout remain alternatives. Keys and grants remain on backend paths. PACT derives app/wallet/offer/resource authority server-side, seller ownership is not delegated, and successful sign-in does not authorize licensed operations. One persistent API process with a private durable clock and PostgreSQL is the hosted support model; the supplied consumers intentionally have process-local sessions and deny after restart. No serverless, replicas, public OAuth/OIDC compliance or refresh-token guarantee is inferred.

## Independent consumer acceptance

Existing Phase6 native tests already exercise actual Express and production Next consumer boundaries, PKCE exchange, native PostgreSQL and hardened synthetic RPC. The final request additionally needs a consumer installed independently of the source checkout and an explicit all-in-one registration lifecycle.

Added [the standalone developer demonstration](DEVELOPER_DEMO.md) and `scripts/hosted-qa/developer-demo.mjs`. It npm-packs the actual private client, shared engine and Express application into an OS-temp directory outside PACT and installs them with scripts disabled. Private manifest overrides replace repository-relative dependencies; the installed registry graph is constrained to exact reviewed Express lock entries. The consumer child imports its installed packages, not repository source. Its credential arrives through an anonymous stdin pipe, never an argument or persistent credential file. npm uses owned empty configuration files and child startup failure/timeout is cleaned up.

Observed **17/17 PASS** on Node24.22.1/npm11.19.1 with an independently initialized PostgreSQL18.6 cluster on loopback55444. Actual HTTP operations cover distinct D/S/B identities, admin wallet proofs, registration, D's forbidden S-offer bind, S ownership/resource binding, callback/key/activation, tenant read isolation, buyer state/PKCE/code exchange, backend-held grant, anonymous and missing-license protected GET/POST denial, synthetic entitlement allowance of real backend operations, cross-app grant rejection, callback replay, grant logout/revocation and key revocation. This is real HTTP and native SQL with synthetic chain accounts and disposable message signers: **zero blockchain purchases and zero network transactions**.

Receipt: `web/test-results/final-acceptance-20261026/developer-demo-architecture.json`. It binds the source HEAD and exact driver/package hashes and honestly records `trackedWorkingTreeClean:false` because the additions were not yet committed. The independently owned cluster was stopped successfully; owned consumer/API/proxy/RPC processes were cleaned. The root must rerun the integrated gate from the final clean committed revision before using it as pre-merge evidence. This specialist authored the new demo; its independent security review is separate from this implementation account.

## Current Devnet deployment identity

Inspected the existing narrow `deployment-identity.mjs` first, then executed it using reviewed Node24.22.1. It loads no wallet configuration and performs only `getGenesisHash` and `getMultipleAccounts`, checking genesis on both sides of a finalized snapshot, loader layout/ownership, canonical ProgramData, authority, complete artifact bytes and zero-only padding.

Observed at `2026-10-27T01:06:33.637Z` (October26 evening in America/New_York), finalized context slot **515521525**:

| Fact | Observed value |
| --- | --- |
| Program | `EiiiWWsW2kkqP6nugHz6iBADvhnW5xnibAtZ82ZExVqy` |
| Canonical ProgramData | `4oeQ43DP6oUXparT8cYT3niBgdJCaFitj61mVXQfy9cX` |
| Last modification slot | `509663811` |
| Public upgrade authority | `CVN3suQneZtAb1RMuHf3BVYYEtAuNqNdSoiDQagQ7xzh` |
| Deployed historical ELF | 35,784bytes; SHA256 `d13828b060327ef9f702b076b8681e4b9e1e8c04f961191d1df17b2babf52a62` |
| Current local ELF | 35,704bytes; SHA256 `408580c1ffd3068da9d66c2f7c3e1db5814ea15e4146c6f864eb4c271842c5c5` |
| Historical/current matches | `true` / `false` |
| Network transactions | `0` |

The exact historical command passed and wrote `web/test-results/final-acceptance-20261026/devnet-historical-architecture.json`. A separate `--artifact current` invocation correctly exited unsuccessfully with **`DEPLOYED_ARTIFACT_MISMATCH`**. The successful historical receipt must never be relabeled as current-binary deployment verification. Its inspection-tool revision is31fd160 and its dirty-working-tree flag reflects the acceptance additions.

This is the known reproducible diagnostic-source-path mismatch documented in [Solana release assurance](../../development/SOLANA_RELEASE.md), the execution record and `solana/artifacts/reproducibility.json`. Earlier evidence records exact historical-prefix reproduction, stable virtual-prefix full-byte reproduction, unchanged program instruction semantics and diagnostic/relocation comparison. This review verified unchanged protocol/source inputs and unchanged deployed historical bytes; it did not newly rebuild both historical variants or independently repeat every historical ELF relocation analysis. Current local compiled-program tests and clean rebuild provenance must still pass in the final matrix. No mismatch is suppressed and no deployment is authorized by reconciliation.

SDK compatibility with the historical deployed protocol is supported by the unchanged source/wire layout and the historical correspondence; current-host readiness alone cannot establish it. Actual owner-controlled Phantom messages, existing account flows and any separately authorized transaction remain the human acceptance gate. A public authority address does not prove signer custody or recovery. No upgrade, immutability action or speculative corrective transaction was performed.

## Acceptance disposition

| Requirement | Result | Remaining boundary |
| --- | --- | --- |
| Architectural hosted/SDK separation and server enforcement | PASS | Final combined source revision still requires complete root validation |
| Protocol and Base contract preservation | PASS | Tooling/build changes are explicitly retained and reviewed separately |
| Independent installed developer workflow | PASS, development receipt | Final clean-source rerun and independent security acceptance required |
| Historical Devnet deployment identity | PASS, dated read-only observation | Does not establish current local ELF deployment or authority custody |
| Current local ELF deployed | BLOCKED / not performed | Exact mismatch is intentional evidence; no redeployment authority |
| Local Phantom/device acceptance | BLOCKED | Named human message-only approval and actual prompts required |
| External staging/operator acceptance | BLOCKED | Provider/domain/TLS/database/backup and owner approval required |

No critical/high architectural defect was identified in this inspected scope. Source merge is conditional on final engineering/security gates and deployment-isolation verification owned by the root. A merge is not hosted release approval. The local Phantom variant now supplies exact loopback startup, issuer/callback configuration, D/S/B sequencing and an existing-offer path without requiring a new transaction. Missing real licensed-wallet evidence must remain BLOCKED, never replaced by the synthetic allowance result.
