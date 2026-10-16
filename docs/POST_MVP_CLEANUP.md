# Post-MVP cleanup and hardening

Audit date: 2026-10-16. Branch: `codex/post-mvp-cleanup`.

## Baseline and boundaries

Starting branch: `codex/developer-platform-v1`; starting HEAD: `91a8ca0bce864e3b49962cecfdd4e4931e7c4e99`. Existing SDK checkout/widget/React changes, branding/UI changes, release note and logo were preserved in baseline commit `b05f89b40bb62315587da70d8bc1fab33916bdfa`. Compare cleanup against that commit, not its parent, to exclude user work.

Acceptance criteria: remove only defensibly dead implementation; preserve all SDK interfaces, marketplace flows, chain identifiers/wire/transaction behavior and Base fallback; run available local verification; explicitly report blocked coverage. No deployment, push, wallet approval or real blockchain transaction is authorized or performed by this pass. User-local environment files are not edited.

The initial baseline was not fully green: SDK compilation lacked installed React/Node type dependencies; web typecheck consequently could not resolve the server SDK export. `npm ci --ignore-scripts --no-audit --no-fund` in the SDK restored committed versions without lockfile changes. The web production build and Solana browser server then failed because `contracts/` is a Windows junction to the historical checkout outside Turbopack's configured root. A narrowly scoped conditional additional root repairs that existing build failure; regular clones need no additional root. The installed Next 16.4 configuration documentation was inspected before this change.

## Architecture and authoritative implementations

| Area | Current source / entrypoint |
| --- | --- |
| Web application | Next App Router `web/app/page.tsx`, `layout.tsx`; `/` uses `SolanaProviders` and `SolanaApp` |
| Seller and buyer | `web/components/solana-app.tsx`: configuration, metadata review, creation, buyer import/purchase, deactivation and Studio gate |
| Wallet / Phantom | `solana-providers.tsx`, `solana-wallet.tsx`; official Phantom and Solflare adapters with explicit connection |
| Program and wire format | `solana/src/lib.rs`, `wire-spec.json`; compiled `artifacts/pact_licensing.so` executed by LiteSVM tests |
| Solana reads | `web/lib/solana/protocol.ts`, `rpc.ts`; owner/layout/PDA/program/Devnet/same-slot validation |
| License status | `use-snapshot.ts`; fresh identity-bound snapshots, expiry, slot progress and fail-closed state; SDK root offers independent consumer verification |
| Transactions | `transaction.ts`, `transaction-state.ts`; reviewed messages, sender attribution, simulation, finalization and unresolved-attempt journal |
| Metadata / buyer links | `protocol.ts`, `purchase-link.ts`, `purchase-link-share.tsx`; exact-byte off-chain metadata commitment and automatic buyer import |
| Studio integration | `/integrate`, `integration-wizard.tsx`, `web/lib/integration/{generator,template}.ts` |
| SDK | `packages/pact-sdk/src`: root verifier, checkout/widget/browser bundles, v1/server/react; build script produces declarations and browser assets |
| API/server | `/api/v1/[...path]`, `web/lib/platform/api.ts`, SDK server/auth/chain modules |
| Base fallback | `/base`, `app/providers.tsx`, `lib/{chain,license,use-license}.ts`; `contracts/` Solidity, Foundry and exported ABI |
| Independent consumers | Read-only Next gate, vanilla checkout and platform React/backend example under `examples/` |
| Tests | SDK Node tests; web Node API/auth; Base/Solana/integration Playwright; example browser tests; Python LiteSVM; Foundry |
| Deployment | `web/vercel.json` builds SDK first; `deployment/` operator candidate tools retained |
| Environment | `web/.env.example` is active web public configuration; root template is historical Base; examples have separate templates |
| Generated inputs | Solana `.so`/evidence and Base ABI/evidence are checked-in test/build inputs; caches, logs, reports and candidate trees are ignored |

## Classification and preservation evidence

| Class | Decision |
| --- | --- |
| A: current foundation | Keep routes, SDK exports, all three consumer examples, program/spec/toolchains, Base fallback, meaningful tests and deployment configuration. |
| B: current, imperfect | Keep duplicated web/SDK protocol validation, metadata parsing, transaction handling and dense source. Equivalent behavior across independent trust boundaries has not been proven sufficiently for safe consolidation. |
| C: temporary, used | Keep process-local authentication with its runtime guards, demo offers, local package workflow and external-consumer harnesses. Document future architecture separately. |
| D/E: superseded/dead | Delete the five applied platform QA repair scripts below; replace obsolete active MVP onboarding. |
| F: uncertain | Keep cross-coupled historical QA tools, historical reports, environment templates and operator scripts whose continuing use cannot be ruled out. |

Removed files:

- `qa/platform-v1/after-fetch-fix.mjs`
- `qa/platform-v1/fix-example-origin.mjs`
- `qa/platform-v1/fix-monotonic-fixture.mjs`
- `qa/platform-v1/fix-prism-isolation.mjs`
- `qa/platform-v1/fix-test-allowlist.mjs`

These copied past failure logs/candidate dependencies or reapplied already-landed source repairs. No package script, route, build or reusable test runner invokes them. Their names in `docs/platform/CHANGED_FILES.md` remain a historical inventory, explicitly labeled as such by the documentation index. Corrected source and assertions remain intact. Git history preserves the scripts.

Base/EVM audit: no executable Base code is removed. The standing preservation requirement remains in force and `/base` actively imports the contract ABI, wagmi, viem and React Query. `viem` also supplies hashing to current Solana protocol code. Contract source, tests, pinned tooling, simulation/deployment scripts and ABI/evidence are required fallback assets.

SDK audit: keep all public root, checkout, widget, browser bundle, v1, server and React exports. Docs, examples, downstream web code and tests exercise these independently; web imports alone are not an unused-API test. Preserve legacy pending-attempt compatibility because it interoperates with the active marketplace journal and prevents duplicate signing. No public API removal or deprecation is introduced.

Dependencies: every runtime/dev dependency in all four npm manifests has direct import, framework, CLI, type-generation, browser-test or bundling evidence. Both Rust dependencies and pinned Foundry/OpenZeppelin/forge-std tooling remain required. Zero dependencies removed or upgraded; lockfiles stay unchanged. No broad consolidation is justified by this evidence.

| Manifest | Retention evidence |
| --- | --- |
| SDK | `@noble/hashes` metadata/server hashing; `@solana/web3.js` accounts/transactions; `buffer` serialization; `esbuild` browser bundles; TypeScript and Node/React types compile exports; React supports the optional React entrypoint. |
| Web | SDK for API/wizard; wallet-adapter base/react/Phantom/Solflare for providers/UI; web3.js/buffer for Solana; viem for Base and Solana hashing; wagmi/React Query for active wallet/read flows; Next/React/React DOM and their types for framework/build; Playwright for unit/browser suites. |
| Both Next examples | SDK and Next/React/React DOM are directly consumed; Playwright, TypeScript and Node/React/React DOM types support standalone builds and browser acceptance. |
| Native/test tooling | `pinocchio` and `pinocchio-system` implement the program; Python `solders` supplies LiteSVM/account primitives, with pinned `jsonalias`/`typing_extensions` dependencies; Foundry/forge-std/OpenZeppelin remain fallback build/test/security tooling. |

Repository hygiene: replace ZIP/scaffold/deadline and Base-first instructions with current onboarding; add a documentation index and separate debt register; ignore Playwright `blob-report/` and local SDK `*.tgz` packages. Preserve the logo and all user work. No screenshots, generated reports, cached dependencies, environment files or local databases were deleted speculatively.

## Validation

Each web browser command owns the same build directory and must run sequentially. Restore `npm --prefix web run build` after fixture suites. Example apps own separate build directories. Default browser modes use synthetic RPC/wallet fixtures; live modes are opt-in public reads and are reported separately.

| Check | Command / working directory |
| --- | --- |
| SDK | `npm test` and `npm run typecheck` in `packages/pact-sdk` |
| API/auth | `node --test web/tests/platform/api.test.mjs web/tests/platform/auth.test.mjs` from root |
| Web | `npm run typecheck`, `npm run build` in `web` |
| Base browser | `node node_modules/@playwright/test/cli.js test` in `web`; repeat with `PACT_QA_MODE=setup` |
| Solana browser | Same CLI with `--config tests/solana/playwright.config.ts`; repeat with `PACT_SOLANA_QA_MODE=setup` |
| Integration | Same CLI with `--config tests/integration/playwright.config.ts` and `--config tests/integration/generated.config.ts` |
| Vanilla browser | `node web/node_modules/@playwright/test/cli.js test --config examples/pact-checkout-vanilla/tests/playwright.config.ts` from root |
| Vanilla server | `node examples/pact-checkout-vanilla/tests/server-qa.mjs` from root |
| Isolated SDK example | Use `node examples/pact-demo-app/node_modules/@playwright/test/cli.js test --config examples/pact-checkout-vanilla/tests/prism.config.ts` from root; use that CLI to match the config's Playwright instance. |
| Next examples | `npm run typecheck`, `npm run test:browser`, `npm run build` in each example; platform script explicitly selects `tests/playwright.config.ts` |
| Local Solana | `powershell -ExecutionPolicy Bypass -File scripts/test.ps1` in `solana` (pinned toolchain installed) |
| Base contract | `.tools/foundry-v1.8.5/forge.exe test` in `contracts` |
| Base integrity | `node tests/artifact-check.mjs` in `web`, after Foundry build |
| OpenAPI | `node qa/platform-v1/audit-openapi.mjs` from root (create ignored `web/test-results/platform-v1` first) |

`PACT_SOLANA_QA_MODE=live`, `PACT_INTEGRATION_QA_MODE=live`, `PACT_SDK_QA_MODE=live`, and `PACT_CHECKOUT_QA_MODE=live` select separately documented public-read suites. They depend on external Devnet state and are not transaction tests. Historical Saturday compatibility coverage additionally requires an external checkout/candidate; it must not be silently counted as passing if unavailable. No lint script/configuration is present; no lint pass is claimed.

### Results

The initial full baseline could not pass in the supplied local environment: the missing SDK installation and linked-ABI build failure above blocked it. They are recorded as failures rather than a claimed green baseline. After pinned SDK installation, baseline SDK tests (80), API/auth tests (29), local Solana tests (23), Base tests (23) and artifact integrity passed. The read-only example's baseline browser suite passed 22 checks. Remaining browser results below are post-repair/post-cleanup validation, not retroactively attributed to the untouched baseline.

| Check | Post-cleanup result |
| --- | --- |
| SDK build / Node tests / typecheck | PASS, 80 tests; independent repeat after cleanup also passed |
| API/auth Node tests | PASS, 29; repeated against rebuilt SDK |
| Solana local compiled-bytecode tests | PASS, 23; baseline and final |
| Base Foundry tests | PASS, 23; baseline and final, including four 256-run fuzz cases |
| Base ABI/source/bytecode/compiler integrity | PASS, baseline and final |
| Solana artifact integrity | PASS, compiled bytecode/source/Cargo lock/wire-spec SHA-256 and artifact size match committed evidence |
| SDK packaging/SSR | PASS, prepack dry run, 24 files, eight export paths, six public module imports without DOM globals; browser bundles exclude Node server code |
| Web TypeScript | PASS after SDK installation and source changes |
| Solana synthetic Playwright | PASS, 200; six mode-specific skips; desktop and mobile |
| Solana setup mode | PASS, two; 204 mode-specific skips |
| Base synthetic Playwright | PASS, 48; two setup-mode skips |
| Base setup mode | PASS, two; 48 fixture-mode skips |
| Integration wizard | PASS, eight; two live-mode skips, including exact portable install command and mobile overflow checks |
| Generated integration consumers | PASS, 44 across actual generated Next.js/React output, desktop and mobile |
| Solana live public reads | PASS, four; 202 synthetic/setup-mode skips |
| Wizard live public reads | PASS, two; eight synthetic-mode skips |
| Read-only Next example | PASS, 22; two live-mode skips |
| Platform Next example | PASS, 14 through corrected `npm run test:browser`; production fixture build/start and typecheck pass |
| Vanilla checkout | PASS, 28; four live-mode skips; external Saturday worker bundled read-only and compatibility tests passed |
| Isolated SDK example consumer | PASS, 22; two live-mode skips |
| Vanilla live public reads | PASS, four; 28 synthetic-mode skips |
| Isolated example live public reads | PASS, two after the exact-state oracle repair below; 22 synthetic-mode skips |
| SDK live offer quote | PASS, only `getGenesisHash` / `getMultipleAccounts`; no transaction |
| Vanilla server routes/port fallback | PASS; occupied port preserved, page/bundle HTTP 200, POST/traversal/unknown paths rejected |
| OpenAPI references | PASS, 12 paths, 16 schemas, 111 valid references |
| Next config filesystem portability | PASS, four independent temp fixture imports: ordinary clone, external contracts junction, repository junction, actual checkout |

Live test hardening: two initial Prism browser checks failed because the public seller identity now has an expired entitlement, whereas the old test assumed no license. The repaired test requires an independent SDK snapshot for the exact seller/offer, explicitly rejects active/error results, and requires the exact matching status, heading, locked/expired state and absent premium content. Buyer-expiry, no-signing, read-only method allowlist, identity, page-error, slot and viewport assertions remain. Initial failure traces/report are preserved under ignored `web/test-results/checkout-prism-live-initial-failure/`. A mismatched Playwright-CLI invocation was also corrected to the example's own CLI; no assertion was relaxed to bypass it.

Independent QA reviewed the complete cleanup diff, deleted-file references, SDK/chain preservation, configuration portability, local documentation links and the live-test repair. No blocking defect remained. The reviewer suggested canonicalizing the repository root before classifying junctions; that improvement was applied and the four layout cases passed. No meaningful test was deleted or weakened.

Browser coverage includes seller metadata/configuration and creation fixtures, complete and offer-only buyer links, manual JSON, copy/share behavior, malformed/missing metadata, rejected connection, disconnect, wallet switching, offer/ownership verification, expiry/staleness/offline boundaries, uncertain purchase recovery, backend authentication and desktop/mobile layouts. Fixtures do not establish actual Phantom dialogs or real transaction success.

Historical candidate-only acceptance wrappers were inspected rather than replayed against old copied sources. The live external Saturday checkout was consumed read-only by the current compatibility test; old archived candidate releases were not rebuilt. No lint tool is configured, no real-wallet approval or blockchain transaction was performed, and no production vulnerability/security audit is claimed.

Final normal-configuration web TypeScript and production build both passed after the fixture suites. Application startup passed: `/`, `/base`, and `/integrate` returned HTTP 200, with no synthetic program ID in served HTML and empty server stderr. Build output includes the versioned API route. Browser/command logs are preserved under ignored `web/test-results/post-mvp-cleanup/`; reports and oracle attachments remain in the corresponding ignored suite directories.

## Completion ledger

| Requested item | Outcome |
| --- | --- |
| 1. Cleanup branch | `codex/post-mvp-cleanup` |
| 2. Baseline commit | `b05f89b40bb62315587da70d8bc1fab33916bdfa`, including all pre-existing user work |
| 3. Baseline test/build results | Initial SDK installation/typecheck and web build failures recorded above; repaired baseline core checks passed. No untouched full-green baseline is claimed. |
| 4. Files deleted | Five applied QA repair scripts, listed above |
| 5. Dependencies removed | Zero; all declared dependencies have retention evidence, no upgrades or lockfile changes |
| 6. Dead code removed | Uncalled historical source-patch/log-copy/candidate-rerun helpers |
| 7. MVP scaffolding removed | Active ZIP/scaffold/Base-first/deadline onboarding; obsolete workstation path in generated integration instructions; hackathon web package description |
| 8. Base/EVM legacy removed | None: active fallback and its tooling/artifacts remain required |
| 9. Duplicates consolidated | None: protocol/transaction equivalence is not sufficiently proven for low-risk consolidation |
| 10. Hygiene improvements | Current architecture/documentation index, historical-state labels, corrected example test startup, explicit SDK-first workflow and independent technical debt register |
| 11. Ignore improvements | Playwright `blob-report/` and SDK package `*.tgz` archives |
| 12. Investigated but retained | All SDK interfaces/examples, chain source/artifacts, wallet adapters, Base dependencies, pending-attempt compatibility, historical QA/evidence, demo configuration and operator tools |
| 13. SDK compatibility | Public exports preserved; package dry-run, six module imports, browser bundles, declarations and 80 tests pass |
| 14. Technical debt | Separate [prioritized register](TECHNICAL_DEBT.md); distributed authentication, protocol parity and dependency security triage are high priority |
| 15. Post-cleanup tests | All final executed suites pass; detailed counts and mode-specific skips above |
| 16. Production build | PASS; normal web configuration restored after all fixture builds; web, SDK and both Next example builds verified |
| 17. Browser regression | PASS across seller/buyer/verification/wallet/error/expiry/mobile/desktop, generated consumers, examples and public-read modes; live transaction/manual wallet dialogs not exercised |
| 18. Independent review | No blocking defects; root canonicalization and precise report wording incorporated; no test weakening |
| 19. Approximate size | 26 files changed; five files deleted (7,418 bytes of minified repair scripts). About 115 lines removed overall, including rewritten onboarding; net source-tree size grows with the requested audit/debt documentation. |
| 20. Deployment confirmation | No deployment, push, package publication, real-wallet approval or real-chain transaction broadcast occurred. External chain interaction was public read-only. |

Known limits: no configured lint tool, no fresh vulnerability audit, no real Phantom approval/transaction test, and no replay of archived candidate-only releases. These are reported explicitly; they are not represented as passing checks or fixed by removing meaningful tests.
