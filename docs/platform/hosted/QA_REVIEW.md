# API-first platform independent QA

Reviewed 2026-10-19. This record separates verified evidence from acceptance requirements. It is not a production security certification.

## Verified foundation

- Independently queried `git rev-parse HEAD`, branch, status and diff: `codex/full-development` at `57b425f148e65840c23283b4283ce1e22ccb45bd` before feature work.
- The only initial tracked working change was `web/next-env.d.ts`, replacing `.next/types` imports with `.next/dev/types` imports. Preserve this user state when checkpointing; generated build changes are not permission to discard it.
- `gh run view 39017755163 --json headSha,conclusion,status,jobs,url` returned completed/success at the same full SHA. Required `node-and-browser` job `117353367904` and `pinned-chain` job `117353368042` both succeeded on October 17. Optional public reads were skipped. [Run receipt](https://github.com/lehr1459/PACT-Hacklanta-Project/actions/runs/39017755163).
- Read the entire UTF-8 master plan, repository `AGENTS.md`, validation workflow/runner, release contract, environment guidance, backend enforcement, architecture, dependency policy and technical-debt register.
- Existing validation covers SDK/API/auth, production builds, generated consumers, wallet/browser fixtures, packaged consumers, compiled Solana/Base tests, dependency/artifact policies. Shared Next build directories require serialized browser/build lanes.

## Environment constraints observed

The workstation PATH selects Node `24.11.1` and npm `11.6.2`; required engineering pins are Node `24.22.0` and npm `11.19.1`. An isolated verified runtime is required for release evidence. Existing SDK and web dependency directories and Playwright CLI are present. GitHub CLI is authenticated sufficiently to read the baseline run. Python and Solana are on PATH; repository-pinned Solana and Foundry tool directories exist. Docker, `psql`, Cargo, Anchor and RTK were not found on PATH in the initial inventory. This is not proof that no other installation exists.

No new tests or builds were represented as passed by this initial audit. No database service, container runtime, external domain, host or owner authority is assumed. New remote CI receipts require owner-authorized push/run; an updated workflow alone is not CI validation.

## Phase 0 review and baseline checks

**PASS — design review only.** Independently read `ADR.md` after creation, plus architecture/security reviews. The ADR separates hosted Node/PostgreSQL from the supported customer-hosted SDK, pins Devnet/protocol compatibility, explicitly limits custom authentication without OAuth/SIWS claims, specifies tenant/action-proof/callback/key/grant boundaries, and defines failure, migration/restore, retention and owner gates. No consequential design defect was identified. Concrete runtime wire schemas and signed message bytes must be frozen before their implementation; PGlite checks must not substitute for the mandatory real-PostgreSQL competing-client CI lane. Implementation/security signoff remains pending.

Located the existing isolated runtime at `C:/Users/Lehr/AppData/Local/Temp/pact-node-v24.22.0/node-v24.22.0-win-x64/node.exe`. Independently compared executable SHA-256 `ba93f9a70bd86fce3ebbb39ec758501458453467aa92a34a0a3602d1e3fc2b9c` to committed `runtime.json`; version is `24.22.0`, sibling npm CLI reports `11.19.1`. No global runtime modification.

Executed with that pinned Node on the checkpointed feature branch:

- `scripts/validation/run.mjs environment`: PASS, receipt `web/test-results/validation/environment/results.json`.
- `packages/pact-sdk/node_modules/typescript/bin/tsc -p packages/pact-sdk/tsconfig.json --noEmit`: PASS.
- `node --test` with every SDK `tests/*.test.mjs`: **625 passed, 0 failed, 0 skipped**, 18.0 seconds. Existing built SDK output was used; this was not a fresh build or clean-release claim.

SDK logs: ignored `web/test-results/hosted-qa-baseline/sdk-typecheck.log` and `sdk-tests.log`. No shared web build or dependency install was performed by QA.

## Phase acceptance matrix

| Phase | Independent evidence required before PASS |
| --- | --- |
| 0 | Old/new trust diagram; fixed Devnet program/protocol; durable storage and migration/recovery contract; explicit custom-pilot versus standards-library auth decision; endpoint/type contract; failure matrix; human hosting/legal/operations gates. |
| 1 | Two disposable admin wallets cannot read or mutate each other's apps/callbacks/credentials; fresh purpose-bound proofs; tampered/expired/replayed signatures deny; once-only secrets and hashed persistence; rotation overlap and immediate revocation; restart persistence; strict callback registration; DB unavailable denies. |
| 2 | Seller mismatch, inactive/missing/wrong-program/wrong-network offers deny binding; fresh signed sensitive change; immutable resource key and audited policy versions; foreign tenant/resource substitutions deny. Existing unexpired licenses survive offer deactivation. |
| 3 | Exact callback and app binding, state/PKCE, issuer/purpose binding, one-use challenge/code, strict TTL; stolen code/wrong verifier/cross-app token deny; two independent DB clients redeem exactly once; restart/revoke/logout/expiry/wallet-switch behavior; no grant or key in browser URL/storage. Explicitly label any limited custom protocol. |
| 4 | Registered policy plus app key plus app-bound proven wallet grant produces fresh decision; key alone/wallet string alone/public lookup never authorize; missing/expired/revoked/wrong owner/program/genesis/resource deny; RPC/DB outage/stale/backward/frozen state deny; request and concurrency budgets; bounded metadata and safe buyer link. |
| 5 | Actual browser onboarding, ownership proof, resource, key reveal/list/rotate/revoke, integration code and test flow call working APIs; errors/loading/zero states; fresh browser plus keyboard/narrow viewport checks; original generator remains usable. No simulated case presented as live verification. |
| 6 | Independent clean consumer protects a real backend route, demonstrates deny and allow with fixture evidence; REST/Express/Next examples and snippets execute; React delegates to backend; strict unknown-response denial; original SDK exports unchanged; runtime and OpenAPI agree. |
| 7 | Adversarial security review and remediation; bounded IP/app/key/route/DB/RPC work; secret-redaction probes; retention/delete/restore/incident/rollback drills; new dependency audit; October 21 Node and November 15 exception gates retained. |
| 8 | Whole preserved matrix plus DB/API/browser journey and cross-tenant/two-wallet/two-worker/restart/outage/race fixtures; schema/migration and container smoke; clean artifact receipts; exact new remote Linux/browser and Windows/chain CI SHAs. Missing authorization/tooling is BLOCKED, never silently PASS. |
| 9–10 preparation | Ready-to-run staging, human wallet/device acceptance and pilot/operator checklists. Execution requires owner approval. Synthetic wallets do not establish real Phantom acceptance. No Saturday Lights changes, pushes, deployments, publications or broadcasts. |

## Evidence categories

Track each result as implemented locally, locally verified, remotely CI verified, staging accepted, human action required, not deployed, or not supported. Attach exact command, revision, result and retained report paths. Passing one category does not imply another. Any discovered consequential defect blocks its phase until fixed and reverified; stop dependent work rather than weakening the invariant.
