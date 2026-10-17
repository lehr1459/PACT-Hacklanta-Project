# Full-development execution record

Starting commit: `8e259de1bc046d460a62bf6cc8102c6e64552d02`.
Branch: `codex/full-development`. Starting working tree: clean. No existing work was discarded.

## Toolchain observed

Windows PowerShell; Node 24.11.1; npm 11.6.2; Git 2.52.0.windows.1; pinned Solana Rust 1.95.0-dev (ae660768a); Python 3.13.5; pinned Forge 1.8.5. Record CI environments separately; these observations are not proof of Linux/hosted installation.

## Phase gates

| Phase | Acceptance | State |
| --- | --- | --- |
| 0 | Supported product matrix and precise licensing contract independently reviewed | PASS |
| 1 | Clean-checkout CI, isolated packaged consumers, dependency triage and independent protocol/recovery fixtures | PASS; committed clean Windows replay; hosted Linux execution remains external |
| 2 | Bounded concurrent reads, enforced supported auth topology, real resource authorization, independent abuse budgets and correct recovery | PASS |
| 3 | Reproducible program provenance, deployment verification tooling/governance and adversarial signed runtime tests | PASS WITH HUMAN ACTION REMAINING: authority custody / any authorized upgrade |
| 4 | Runtime-validated compatible API, versioned package artifact, portable docs and executable integration examples | Pending |
| 5 | Validated environments, deterministic release package, RPC resilience, observability, runbooks, accessibility and rollout gates | Pending |

## Authority and scope

Implementation, local builds/tests, disposable local fixtures and release preparation are authorized. Do not approve wallets, sign network transactions, broadcast, deploy/push, publish npm, change production secrets, switch networks or alter upgrade authority. Record exact external steps as `HUMAN ACTION REQUIRED` and continue unrelated engineering.

Single persistent same-origin customer Node enforcement is the initial supported topology; distributed hosting and a PACT-hosted metadata registry are explicitly deferred. Preserve Base Sepolia fallback, all SDK exports, exact metadata, buyer links, manual recovery and existing program semantics.

Each phase records implementation, actual validation, independent review, corrections and its commit. A failed check stays visible until corrected; human/external evidence is never represented as an automated pass.

## Baseline

Fresh baseline on the unchanged application at `8e259de`:

| Check | Result |
| --- | --- |
| SDK build/tests/typecheck | PASS, 80 tests |
| API/auth Node tests | PASS, 29 tests |
| Solana compiled runtime | PASS, 23 tests |
| Base Foundry | PASS, 23 tests, including four 256-run fuzz cases |
| Base and Solana artifact integrity | PASS |
| Web production build | PASS |
| Prism example browser/typecheck/build/start | PASS, 22 tests, two intentional live-mode skips |
| Platform example browser/typecheck/build/start | PASS, 14 tests |
| Solana marketplace browser | PASS, 200 tests, six intentional separate setup/live-mode skips |
| Base marketplace browser | PASS, 48 tests, two intentional separate setup-mode skips |

All recorded baseline checks passed. Full browser checks ran against baseline application code and production builds. Prior cleanup results are historical, not substituted for these runs.

## Phase 0 review

Independent QA checked the full master request against the release contract. Corrections incorporated: explicitly preserve Base Sepolia in the network matrix and label later-phase capabilities as implementation targets rather than current claims. Product matrix and licensing semantics meet the Phase 0 exit gate. Commit: `c0c85fa`. The remaining Base browser baseline completed successfully against unchanged application sources during Phase 1 tooling preparation; no competing web build ran.

## Phase 1 candidate review and validation

Implemented portable SDK-first CI orchestration, platform-specific chain lane, exact artifact-byte checkout rules, isolated packed and generated consumers, independent protocol/recovery vectors, dependency advisory triage and a graph-bound expiring-exception gate. Historical Saturday compatibility is explicitly optional with a caller-provided read-only checkout; no external repository was modified. Required setup/mock lanes and optional public reads remain distinct.

Observed before the committed-checkout replay: SDK build/tests **128 passed** (36 independent protocol and 12 independent recovery cases added); API/auth **29 passed**; dependency-policy **1 passed**; direct marketplace independent vectors **4 passed** and web typecheck passed; packed consumers **10 checks passed**; chain **23 Solana + 23 Base passed**, including compiled artifact/settings/hash checks; three app production builds/typechecks and three production route checks passed. Record clean-replay counts separately, including intentional skips.

Independent QA approved the candidate after correcting the Prism CLI instance, preserving compiler/settings/Keccak assertions, moving generated consumers outside the repository, making startup cleanup bounded and asserting forbidden RPC/sign attempts outside catchable SDK paths. SDK specialist independently reviewed the dependency gate: added graph and affected-install binding, valid ISO-date expiry, and unresolved-cycle rejection.

One temporary root-authored protocol test configuration accidentally used Playwright's default output directory, deleting ignored receipts and active generated-consumer traces. It was corrected to a dedicated directory; affected evidence was regenerated. The contaminated generated run had 39 passes and five infrastructure failures; it remains archived and is not accepted as a pass. A later OS-temp generator harness installation-order failure was corrected without changing application assertions. Final generated-consumer and clean committed-checkout replay remain gate requirements.

This candidate commit makes inputs available for reproducible replay; it does not declare Phase 1 complete. Hosted Linux/GitHub execution has not been performed and must not be inferred from the prepared workflow or local Windows results.

Fresh replay exposed and corrected the Python PATH assumption: exact Python 3.13.5 is discovered through `py -3.13` or `python`, revalidated and used by its actual executable path. Nested Base dependency line endings are explicitly reproduced in a subprocess. Neither fix changes machine-global configuration.

Fresh chain setup downloaded and verified tools normally, passed 23 Solana and 23 Base tests and exact Base artifact checks, but correctly failed the approved Solana binary comparison. Three embedded absolute Cargo source paths made binary bytes depend on checkout location. An isolated historical-prefix remap reproduced the entire previous `d13828…` binary exactly; no arbitrary instruction differences were ignored. The stable virtual-prefix build (`670859b`) then produced byte-identical 35,704-byte ELF in short and long checkout locations, including a third build with exact committed LF manifest bytes: SHA-256 `408580c1ffd3068da9d66c2f7c3e1db5814ea15e4146c6f864eb4c271842c5c5`.

Independent QA verified all candidate bytes, unchanged instruction/control-flow/arithmetic semantics and diagnostic/relocation equivalence, absence of host paths, exact source/manifest/lock/wire inputs, and independently passed all 23 compiled runtime tests. QA explicitly approved the local artifact replacement. `solana/artifacts/reproducibility.json` records six exact build-input hashes, source revision, matching output records, historical cause and local-only scope. The artifact gate now rejects build-input drift and invented Solana deployment fields; mutation tests pass. The newly reproducible local binary has not been deployed. Final committed clean-chain replay is still required.

## Phase 1 final gate

Clean committed `ff7ace7` checkout passed the complete `all-node --clean` lane: isolated installs, SDK/API tests, types, three production builds and route checks, marketplace mock/setup browser suites, generated consumers, checkout, Prism, platform and ten packed-consumer checks. App/SDK/example sources did not change between that revision and `bea32f3`; a fast-forward clean checkout separately passed the latest `node --clean` and `artifacts --clean` lanes at `bea32f3`. The fresh chain checkout at `bea32f3` passed `all-chain --clean`: 23 compiled Solana tests, 23 Base tests, and all exact artifact checks. Independent reviews approved protocol, dependency, CI and reproducible artifact changes. No deployment was performed.

Phase 1 engineering gate: **PASS**. Prepared GitHub/Linux lanes require an authorized push/run before claiming hosted CI success; local Windows execution does not establish that result. Optional external Saturday checkout and live RPC modes were intentionally excluded from the deterministic gate. Receipt logs are retained under ignored `web/test-results/full-development/phase1-clean/`. Phase commits: `6e3ed1d`, `ff7ace7`, `20afb23`, `670859b`, `bea32f3`.

### Phase 1 committed-checkout matrix

| Suite | Passed | Intentional skips |
| --- | ---: | ---: |
| SDK | 128 | 0 |
| API/auth | 29 | 0 |
| Dependency policy | 1 | 0 |
| Solana mock / setup | 208 / 10 | 6 / 204 |
| Base mock / setup | 48 / 2 | 2 / 48 |
| Integration wizard | 8 | 2 |
| Generated consumers | 44 | 0 |
| Checkout | 26 | 4 |
| Prism example | 22 | 2 |
| Platform example | 14 | 0 |
| Isolated packed consumers | 10 checks | 0 |
| Compiled Solana runtime | 23 | 0 |
| Base Foundry | 23 | 0 |

Setup/mock skip counts reflect mutually exclusive modes and intentional live-wallet tests. Four clean installs, SDK build/typecheck, three Next production builds/typechecks, three production routes, static-server safety and four advisory policies passed. Latest node-delta at `bea32f3` also passed the new artifact-policy mutation test (1) and dependency-policy test (1). No live RPC/browser wallet approval was performed by these deterministic lanes.

## Phase 2 candidate

Implemented a pure validated SDK snapshot engine and bounded server pools, shared endpoint slot/Clock history, five-second queue-inclusive cancellation and transport quarantine. Public exports and browser single-read behavior are preserved. API public/protected pools reserve separate capacity with shared history; public/auth/protected HTTP budgets are independent. Single-process auth now refuses detected serverless, workers and clustered execution. Server-owned resource policies perform pre-work and final entitlement/session-incarnation checks and bound/copy private results. The platform example now serves a real private asset and bounded server calculation through this guard.

Marketplace purchases now capture exact initialized/missing entitlement baselines inside the shared purchase lock and persist SDK-compatible primary journals with unchanged strict mirrors. Recovery requires finality/history/lifetime evidence and an unchanged finalized baseline at the status context watermark. Full incarnation checks preserve changed attempts; legacy attempts retain conservative expiry behavior. Independent review caught two sticky-confirmation races during partial clear/store; both were corrected with mutation regressions. No automatic retry, metadata registry or distributed auth infrastructure was added.

Targeted results: SDK build/typecheck and **211/211** tests; independent auth/resource **62/62** (included in SDK count); pool/core **21/21** (included); marketplace protocol/state/recovery helpers **34/34** and web TypeScript passed. Independent auth/resource/core source reviews found no remaining blocker; final recovery review and clean committed broader regression remain gate requirements. Root reviewed actual combined source/diff and strengthened typed/redacted RPC errors and per-class clock regression checks. No program/wire/dependency/lock changes.

### Phase 2 cold-start review correction

Root independently reproduced a consequential initial-history gap: a new server at current wall time accepted synthetic historical Clock=1000/expiry=1060 as active on its first authenticated request. Persistent progress detection alone could not reject that cold-start snapshot. The server engine now rejects Clock skew outside +/-60 seconds before committing history, and positive server checks also require expiry strictly later than the server Unix second. This wall check runs again immediately before protected delivery/commit. Browser verifier compatibility is preserved. Canonical within-skew observations still anchor highwater even when their positive interpretation is denied; malformed/outside-skew observations never do. Host clock synchronization is mandatory; conservative early denial is documented.

Actual corrected reproduction: HTTP503/STALE, authorized=false. Independent QA84/84 tests pass, including exact skew boundaries, within-skew already-expired licenses, poisoning/recovery and expiry during final response construction. Full SDK241/241 and platform API/auth29/29 pass; final typecheck/build, updated resource/auth84/84 and packed consumers10/10 pass. A packed negative-build assertion initially recognized only older Node imports; real client build correctly rejected the new node:cluster import. The harness now recognizes the exact new cluster/worker_threads diagnostics and also forbids those imports in real browser assets; the nonzero build assertion remains mandatory. The prior9/10 report is preserved. Resource content types now reject non-string values before commit.

Broader clean committed replay of `56a9282` completed with the native empty-POST integration defect described below. The final server-only safety delta and exact packed harness correction are recorded separately; do not infer that this delta ran in that earlier checkout. No wallet/network transaction signing, broadcast or deployment occurred. A separate public read sampled Clock skew of one second at slot511948115; that sample is not deployment/authority verification evidence.

### Phase 2 native HTTP integration correction

Inspection of the installed Next request adapter showed that a real empty POST can have a non-null body stream. Requiring `Request.body === null` incorrectly rejected a valid no-input server operation. The resource guard now accepts zero input bytes/EOF while rejecting nonempty data, positive or misleading Content-Length, stalled/cancelled streams and malformed zero-chunk streams. It authenticates before awaiting input. No caller data reaches policy. Independent transport regression passed1/1, resource/auth84/84 passed, SDK build passed, and the actual production Next private-asset/operation browser scenario passed2/2 across desktop/mobile. Real tests prove private content absent from public HTML/script bundles, authenticated delivery/operation, body injection rejection and immediate license-expiry denial. No assertions accepting nonempty input were relaxed.

### Phase 2 callback failure redaction

Independent reproduction found that customer callbacks throwing the exported PlatformError/PactError could reflect private exception messages through the adapter's outer typed-error handling. Preparation rejection and synchronous commit exceptions now become generic500 INTERNAL_ERROR; framework authentication/chain errors keep their typed behavior. Prepared body/type/commit are captured once inside the same safe boundary. Independent QA reran all six original typed/plain callback failures plus three prepared-field getter failures and confirmed no private marker in responses; the selected regression test passed1/1. Commit failure does not claim rollback of a host side effect already performed; the synchronous nonthrowing atomic host contract remains explicit.

## Phase 2 final gate

The broad clean committed `56a9282` replay passed SDK211, API/auth29, production builds/types/routes for all three apps and all earlier browser lanes. Its final platform lane passed14 and failed2 on the same newly introduced empty-POST defect; that failed receipt is preserved. Correction `e2b667b` passed clean install, node, build, packed10, dependency and artifact lanes. Final redaction revision `c4fb444` passed clean node (SDK241/API29/dependency-policy1/artifact-policy1) and the full actual production platform browser suite16/16, desktop8/mobile8. The copied installed SDK was independently hash-matched to seven current built modules; the checkout remained tracked-clean.

| Phase 2 suite | Passed | Intentional skips | Revision/evidence |
| --- | ---: | ---: | --- |
| SDK / API-auth | 241 / 29 | 0 | final clean `c4fb444` |
| Dependency / artifact policy | 1 / 1 | 0 | final clean `c4fb444` |
| Solana mock / setup | 248 / 10 | 6 / 244 | broad clean `56a9282`; no later marketplace change |
| Base mock / setup | 48 / 2 | 2 / 48 | broad clean `56a9282` |
| Integration wizard / generated consumers | 8 / 44 | 2 / 0 | broad clean `56a9282` |
| Checkout / Prism | 26 / 22 | 4 / 2 | broad clean `56a9282` |
| Platform production browser | 16 | 0 | final clean `c4fb444`, supersedes failed POST receipt |
| Isolated packed consumers | 10 checks | 0 | clean `e2b667b` |
| Marketplace independent protocol/state/recovery helpers | 34 | 0 | targeted review; not added to browser counts |

Four clean installs, three production builds/types/routes, SDK typecheck/build, four advisory policies and exact artifact gates passed in the recorded delta lanes. Program/wire/toolchain/locks were unchanged; Phase 1 chain results remain the applicable program baseline. Independent reviews approved reader/history/cancellation, auth/resource security, recovery races and integration corrections. Gate: **PASS**. Receipts retained under ignored `web/test-results/full-development/phase2-clean/`; broad and final-delta evidence are distinct, not combined into a fictional single all-node run. Phase commits: `56a9282`, `4e7d6a5`, `e2b667b`, `c4fb444`.

Security reconnaissance separately found published Node24 fixes newer than pinned24.11.1. Phase1 proves reproduction, not runtime security clearance. Phase4 must trial and pin a patched same-major runtime; the announced October21 security update remains a dated release follow-up. No security or deployment readiness claim is inferred from this phase gate.

## Phase 3 candidate

Added read-only deployment inspection for the fixed Devnet program, canonical ProgramData, explicit public expected authority, loader layouts/owners/executable flags, finalized slot and complete artifact bytes with zero-only allocation padding. Genesis is checked before and after the account snapshot. The tool never loads wallet configuration, signs or broadcasts. Localhost CLI regressions prove default-current verification fails against the historical binary and only explicit historical mode accepts it. The 32 deployment identity tests pass, independently repeated by QA; architecture also independently reviewed source and actual CLI mock checks with no blocker. Receipt metadata explicitly distinguishes inspection-tool revision/working-tree state from clean build provenance.

The new signature-enabled compiled SBF suite passes 20/20; full Python discovery passes 43/43, retaining the original 23 tests unchanged. Disposable in-memory signatures, blockhash checking and transaction history prove genuine create/buy/deactivate and cryptographic rejection separately from signer flags. Cases include altered signed messages, account aliases and privileges, prefunding, exact expiry/repurchase, arithmetic/owner/program/layout boundaries, payment rollback, deactivation invariants and replay/stale-hash rejection. Failed program execution can still charge the separate fee payer. Local fixture signatures do not constitute wallet approval or network signing. Independent signed-suite review and clean provenance/rebuild remain gate requirements.

Governance documents separate observed public authority from unverified custody, require independent source/artifact/compatibility review and explicitly authorized operator action, and describe emergency hosted closure without inventing a global chain pause. Historical migration documentation now links to the current release guide. No protocol or program source change is proposed.

## Phase 3 final gate

Clean committed `bdaee6ff0e5b396610afe35317d318d1386dadd7` passed default provenance inspection and `--rebuild`. The fresh ignored-target ELF exactly matched approved SHA-256 `408580c1ffd3068da9d66c2f7c3e1db5814ea15e4146c6f864eb4c271842c5c5`, 35,704 bytes. The receipt binds all six physical inputs to actual ancestor/current Git blobs, supporting committed scripts, four installed executable hashes/versions, ordered observed Cargo compiler flags and before/after source/config/tool/HEAD equality. Default inspection records `observed:false`; the fresh rebuild records `observed:true`. Neither claims deployment. Mutation tests reject fabricated source history, duplicate build records, input/tool drift, ambient configuration, dirty source and changed artifact bytes. An initial absolute-path `git check-ignore` comparison was corrected before the candidate commit; the committed E2E exercised the corrected path.

Clean node lane: SDK 241, API/auth 29, dependency policy 1, artifact policy 1, deployment identity 32 and provenance 5 passed, zero skips. Clean Python discovery: 43/43 passed (20 new signed and 23 preserved). Independent architecture and QA reviews inspected actual source, tests, governance and receipts. Windows CI fetches full history, runs the fresh provenance rebuild after chain tests and uploads only the receipt/build log. Hosted CI itself remains unexecuted.

Formal reviewed read-only Devnet verification from the clean candidate matched every historical `8e259de` deployed artifact byte at finalized slot 511956601, last-modified slot 509663811, expected public authority and canonical ProgramData. The default current-artifact check correctly failed. Dated public records are committed under `docs/development/evidence/`; clean local receipts/logs are retained under ignored `web/test-results/full-development/phase3-clean/`. Current local artifact was not deployed; network transactions: zero.

Engineering exit requirements pass. Gate: **PASS WITH HUMAN ACTION REMAINING** for independently establishing actual authority custody/approval roles before an upgrade, and for any separately authorized wallet/deployment/authority action. The validated historical binary remains the deployed Devnet implementation; replacing it is a separate operator decision. Continue Phase 4 without invoking those actions. Phase implementation commit: `bdaee6f`.

## Phase 4 candidate

The SDK0.2.0 candidate validates unknown HTTP responses before returning typed values: canonical identity/integers/PDA/nonce, all license-state relationships and freshness, sessions/logout/challenge, bounded status errors, exact metadata and complete unsigned v0 instruction/account/privilege semantics. Prepared offers include context/timing; blockhash preparation rejects backwards context. HTTP quote types require nonce while direct-RPC OfferInfo preserves optional nonce compatibility. OpenAPI is generated with matching fields and resource routes; no runtime export was removed. One checkout source file normalizes CRLF to LF for package determinism; its whitespace-ignored semantic diff is only two additive nonce declaration lines.

Initial final SDK runtime wave:536/536 passed on portable Node24.22.0. A subsequent type-only APIQuote correction passed typecheck/build and294/294 selected tests; independent API adversarial coverage286/286 and web API/auth29/29 passed. Review corrected untrusted metadata response classification and an incomplete old receiver-binding test fixture while preserving its receiver assertion. Unknown bounded TransactionError unit variants remain opaque failed details, consistent with Solana's non-exhaustive enum; they cannot produce successful status. Known structured integer bounds are checked.

Package preparation remains private and unpublished. It exports only committed SDK inputs into two independent temporary builds, isolates npm settings/cache, uses exact runtime policy, cleans a fixed guarded dist output, emits LF, checks package contents and compares full tarball SHA-256 and actual SHA-512 integrity. Release evidence can require the exact clean-revision packed-consumer report. Runtime/date and package-content/receipt/process-timeout mutation checks pass4/4; a real npm/build/grandchild timeout proves owned-tree cleanup on Windows. A parent that already exited is not targeted by reused PID; the bounded failure grace cannot guarantee cleanup of an already-orphaned background child. The trusted SDK build starts no detached background work.

Portable guides and three executable examples distinguish public lookup, wallet proof, server resource authorization, purchase/recovery and expiry. Preliminary example smoke passed3/3 against an older artifact and is explicitly not final0.2 evidence. Review reproduced and fixed npm --prefix pack selecting the wrong package; commands now name the package explicitly. The final packed lane additionally requires documentation examples against SDK0.2 and separate React18/19 consumers. Clean patched-runtime replay, repeated package artifact and final installed documentation evidence remain exit requirements.

Node24.22.0/npm11.19.1 replaces the older validation runtime with an isolated verified official distribution; the user's global installation remains unchanged. The announced October21 security update remains a release review obligation, not a cleared finding. SDK-only version/engine lock metadata changed; all third-party dependency nodes remain identical and exception expiry was not extended. Owner licensing/distribution approval and any npm trusted-publisher setup remain human actions. No license grant, publication or deployment is implied.

### Phase 4 clean-install correction

The first committed `b30c1ff` replay correctly failed at SDK npm ci before any build/test: npm11.19.1 requires missing optional WebSocket peer entries. An independent SDK-only source export failed identically. Targeted clean probes found the same omission in web and the platform example; Prism passed. Failed receipts remain preserved rather than relabeled.

The correction adds only published optional `bufferutil`4.1.0 (SDK/web/platform) and nested `utf-8-validate`6.0.6 (SDK/platform) records. Every existing dependency record/version remains unchanged. The SDK's corrected isolated actual npm ci passed62 packages; corrected web/platform dry-run validation passed. The corrected installed SDK audit remains four existing accepted moderate findings, zero high/critical and zero policy failures. Native bufferutil module initialization is reachable through Node web3/ws imports; first-party SDK sources do not construct WebSocket/Connection clients. The nested ws8 path prefers Node's built-in UTF-8 check. These observations are not a native-code security audit. Hash-locked published packages and existing node-gyp-build helper are retained; no security exception scope/expiry changes. Regular clean installs/native prebuild handling and the full patched-runtime gate remain required.
