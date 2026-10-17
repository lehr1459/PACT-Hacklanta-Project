# Full-development execution record

Starting commit: `8e259de1bc046d460a62bf6cc8102c6e64552d02`.
Branch: `codex/full-development`. Starting working tree: clean. No existing work was discarded.

## Toolchain observed

Windows PowerShell; Node 24.11.1; npm 11.6.2; Git 2.52.0.windows.1; pinned Solana Rust 1.95.0-dev (ae660768a); Python 3.13.5; pinned Forge 1.8.5. Record CI environments separately; these observations are not proof of Linux/hosted installation.

## Phase gates

| Phase | Acceptance | State |
| --- | --- | --- |
| 0 | Supported product matrix and precise licensing contract independently reviewed | PASS |
| 1 | Clean-checkout CI, isolated packaged consumers, dependency triage and independent protocol/recovery fixtures | In progress; reviewed candidate awaiting committed-checkout replay |
| 2 | Bounded concurrent reads, enforced supported auth topology, real resource authorization, independent abuse budgets and correct recovery | Pending |
| 3 | Reproducible program provenance, deployment verification tooling/governance and adversarial signed runtime tests | Pending |
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
