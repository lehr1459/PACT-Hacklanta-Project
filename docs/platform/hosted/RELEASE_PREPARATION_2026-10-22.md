# API-first release validation preparation — October 22, 2026

Scope: validate the completed implementation at `d3a350a`, correct release/security configuration defects and prepare owner-controlled staging. No new product features. Working branch remains `codex/api-first-integrations`; `codex/full-development` remains the validated 57b425f foundation. The prior [implementation report](IMPLEMENTATION_REPORT.md) keeps its actual historical runtime/source receipts.

## Changes and current execution state

Commit `1ee25fe` updates the overdue Node 24.22.0 pin to the official security release **24.22.1**, retaining npm 11.19.1. Verified official archive/executable checksums and the Docker registry index/amd64 digest are in [the runtime review](../../security/RUNTIME_REVIEW_2026-10-22.md). Runtime expiry validation remains unchanged; next internal review is **November 5**, earlier on a new advisory or before hosting. Dependency exceptions remain **November 15**. Package engine compatibility ranges do not approve older vulnerable runtimes for release; use the exact reviewed runtime policy.

All five checkout steps now use `persist-credentials:false`. Workflow structure/action pins are independently reviewed, and actionlint 1.7.12 passes with shellcheck/pyflakes unavailable/disabled. Runtime/artifact-policy tests pass 6/6; the independent container reviewer executes artifact-policy 5/5. These initial targeted checks are not the full release result. Fresh isolated checkouts and a new PostgreSQL 18.4 cluster provide the new-runtime receipts below.

Commit `17099db` adds an explicit Windows native-exit guard between the runtime and artifact preflights. An actual PowerShell 5.1 probe substituting harmless native exit 17 then exit 0 reproduces the old masked success; the checked-in guarded block exits17 and never enters the later step. Subsequent `all-chain` also checks runtime, so the old defect affected immediate step reporting rather than proving an entirely green job on an invalid runtime. Actionlint still passes.

The initial new-runtime replay at 1ee25fe then passes 74 API and 721 original Node cases but fails the live hosted Next audit on two critical and one high Next.js 16.4.0 advisory. That failure is retained. Commit `d616a5d` patches all four existing Next applications and the generated test consumer to exact 16.4.1, after independent security/registry/lock review. Only Next, @next/env and eight SWC version nodes change per app; accurate npm peer metadata is retained. Four graph hashes are rebound without changing exceptions, source fingerprints or November 15 expiry. [The Next review](../../security/NEXT_REVIEW_2026-10-22.md) records upstream ranges and React/sharp boundaries. The full hosted and original matrix is rerun at the patched commit; no passing historical audit is substituted.

The final close commit changes documentation only, including the served integration guide's version header and repository testing reference. Executable, dependency, workflow and container inputs remain identical to `d616a5d`. The clean replay receipts are bound to that candidate; they are not relabeled as a new run of the documentation close commit. The two guide copies remain byte-identical, and their repository reference does not create a broken relative link in the downloaded guide.

## GitHub workflow review

| Property | Verified result |
| --- | --- |
| Events | `push` covers branches and tags, and `pull_request` has no branch filter; dispatch has a boolean public-read input defaulting to false. Owner steps push only the feature branch. No `pull_request_target`, schedule, deployment or reusable-secret event. |
| Branch binding | Push validates that pushed commit; PR validates GitHub's checked-out merge revision. Match receipts to the actual run SHA, not merely a branch name. Four mandatory jobs run independently; per-ref concurrency cancels superseded runs. |
| Permissions | Top-level `contents:read`; no job elevates permissions, OIDC, package publishing or deployment authority. Five checkouts disable stored Git credentials. |
| Secret requirements | No live repository/environment secret is referenced. PostgreSQL credentials are disposable fixture-only values; wallets/API credentials/peppers are generated synthetic local fixtures. Do not add production credentials to this validation workflow. |
| Required jobs | `node-and-browser`, `pinned-chain`, `hosted-api-and-browser`, `hosted-portable-windows`. Linux hosted job includes PostgreSQL plus actual Docker build/smoke; Windows portable is not database/container acceptance. |
| Optional reads | `optional-public-reads` runs only for explicit dispatch with `live_read_only:true`; RPC allowlists reject transaction methods. It is not required synthetic acceptance or wallet authorization. |
| Actions | Every action is pinned to a full upstream commit SHA; authentic identities independently checked in the table below. |
| Hosted artifacts | Audit both suites, reconstruct same-source/run/build summaries, then upload only matrix/console/connect JSON. No raw proofs/logs/rasters/backups/clock files. The foundation jobs retain their existing synthetic report policy separately. |
| Live repository settings | Public repository, default `main`. Read-only GitHub metadata reports remote main and codex/full-development `protected:false`, and repository rulesets are empty. Detailed protection request returns 403 for this integration. No rule was changed; owner must configure/verify required checks and review restrictions. |

| Action | Reviewed commit | Upstream identity |
| --- | --- | --- |
| checkout | `11d5960a326750d5838078e36cf38b85af677262` | Current upstream v4 tag at inspection; not relabeled v4.3.1 |
| setup-node | `49933ea5288caeca8642d1e84afbd3f7d6820020` | v4.4.0 |
| setup-python | `a26af69be951a213d495a4c3e4e4022e16d87065` | v5.6.0 |
| upload-artifact | `ea165f8d65b6e75b540449e92b4886f43607fa02` | v4.6.2 |

The actions' embedded JavaScript runtime is runner-managed, distinct from PACT's setup-node pin. These action versions declare Node 20; [GitHub's runner migration](https://github.blog/changelog/2026-09-23-node-20-is-no-longer-available-in-github-actions/) says hosted runners now execute JavaScript actions with Node 24 and removed the insecure-version opt-out. No opt-out is configured. Upstream authenticity is not an exhaustive bundled-dependency audit; actual Linux/Windows execution remains required. Least privilege and immutable action references follow [GitHub guidance](https://docs.github.com/en/actions/reference/security/secure-use).

Read-only remote contents checks find no `.github/workflows` directory or validation YAML on default `main`. Further read-only REST inspection confirms workflow ID 387452219 is already active at `.github/workflows/validation.yml`; historical successful run 39017755163 uses it. [The event reference](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#workflow_dispatch) says an already-run workflow may be dispatched against a branch/tag by API/CLI, while the syntax/manual guides also describe a default-branch prerequisite. Therefore the initial inference that dispatch was categorically unavailable is corrected: capability is **not execution-verified**, not proven impossible. Use an explicitly authorized feature-only push for required CI, then inspect registration and separately authorize any optional public-read dispatch. No push/POST/dispatch/default-branch change was performed. No default-branch change or YAML copy is established as necessary; copying only YAML would omit its supporting scripts.

## Docker inspection and limits

Actual local probes find no usable Docker/Podman CLI, daemon/service/pipe or installed WSL distribution. Residual Docker directories do not establish an engine. No engine was installed/launched, no image was pushed and no container run is claimed.

Static review accepts the exact default-deny context, two-stage immutable Node image, matching artifact-driver digest, production-only dependency installation, nonroot execution and prepared read-only root/capability restrictions. On the Linux runner, `--network host` lets the loopback listener reach fixture PostgreSQL/RPC. The host UID/GID owns the private 0700 clock bind. Cleanup targets uniquely generated owned container/image/database names and preserves the database if process termination cannot be confirmed. The smoke uses a local profile; it proves container mechanics only when executed, not hosted TLS/roles/secrets/provider durability. [Docker host networking](https://docs.docker.com/engine/network/drivers/host/) and [bind mounts](https://docs.docker.com/engine/storage/bind-mounts/) inform that review.

## Read-only public-deployment inspection

Vercel connector inspection in the accessible account returns the existing `pact-hacklanta-demo` project, `prj_mwDbCMt3esLN5tmnzUKoQlv5HEjk`. Project listing reports `link:null`; project detail has no Git-link field. Filtering accessible projects by this PACT repository URL returns none. Its Node setting is `24.x`, which does not establish the provider's actual patch version. The latest listed production deployment is READY, `dpl_AeyVsH68MJ784e5YePwziDGvbbr3`, carrying historical commit `7bad86992f996d9edbfff9d085483b8028e53f8a` on `fix/offer-refresh-stability`. It is not the new API-first branch. No settings, deployments, aliases, domains or infrastructure were changed.

This is visible-scope metadata, not proof that inaccessible teams, other providers, webhooks or external automation cannot deploy. [Vercel Git integration](https://vercel.com/docs/project-configuration/git-configuration) can automatically deploy a connected repository when pushed. No source deployment-disable rule was added, because changing the old deployment's policy requires owner approval. The owner must recheck connections, production branch, preview rules and domains immediately before authorizing any push; GitHub check settings alone do not prove deployment isolation.

## Required owner sequence

Follow [the staging checklist](STAGING_AND_PILOT.md), especially its pre-push isolation record and executable operator sequence. First authorize only the exact reviewed push/CI operation after verifying public deployment isolation. Require all four job results at the exact source SHA, including actual Linux Docker, then configure reviewed required checks/protection. Staging host/provider/DNS/TLS, secret manager, database roles/backups, private RPC/costs, persistent clock storage/time and on-call/privacy/legal choices require their own approval. Do not reuse the old public project.

A single persistent API owner is supported, with a fixed HTTPS PACT-origin gateway and private loopback listener. A co-located supervised Next/gateway plus API is a concrete staging candidate; only the API owns its clock. A separate remote gateway would require owner-approved HTTPS reverse proxy/private perimeter and reachability evidence. Current fixtures do not validate a separately hosted Vercel gateway or authorize replicas.

Only human owners inspect and approve wallet message/transaction prompts. Distinct seller/buyer identities, callback/session binding, deny→finalized entitlement→fresh allow→expiry/logout/revoke→deny, rejection/account switch/recovery, device/accessibility and rollback need sanitized owner-approved acceptance records. Retain operator attestations and fixed outcomes, not raw wallet signatures/proofs. Never infer human acceptance from synthetic proofs. Saturday Lights remains out of scope; use the independent PACT consumer first.

## Final local results

The patched hosted matrix is **PASS at `d616a5d028158bff2dcc46e138db76ce63a8c41f`**, run UUID `f7095fd6-a29c-43f1-b9ec-23bb9c1e3e6b`. It is a fresh clean-checkout replay with the reviewed Node 24.22.1/npm 11.19.1 and Next.js 16.4.1 dependencies. Root and independent security inspect the actual receipts; security distinguishes that inspection from personally rerunning every test. QA executes the actual commands.

| Check | Verified new-runtime result |
| --- | --- |
| Hosted required command inventory | 20/20 passed; exact source/run/build binding |
| API service | 74/74 passed, zero skips/failures |
| Native PostgreSQL/HTTP/hardened SDK, consumers, auth, tenant/credential/deadline/recovery/load | 85/85 passed, zero skips/failures; 59.4 seconds |
| Hosted production browsers | Console 16/16 and connect 12/12, zero skips/runner errors; desktop and 320px |
| Hosted policy/package checks | Reporting 17, dependency-policy 6, client 10, common 9, Express 1, Next adapter 4, REST 1; zero skips/failures |
| Hosted live dependency policy | Seven graphs passed; Next and new graphs zero reported findings; only unchanged four SDK moderate exceptions, November 15 expiry |
| Artifact scans/export | Both scans passed, six files per suite with 38 + 2 known proof hashes; exactly three reconstructed source/run/build-bound summaries exported |
| Fresh private production install | 67 files, `sourceDirty:false`, actual HTTP/native PostgreSQL readiness, signed key mint/validation, restart/session/key persistence and revoke denial; container explicitly not executed |
| Original Node/source compatibility | 721 cases (SDK 625, platform 29, policy 67) and SDK typecheck passed at d616a5d |
| Original browser regression | 438 active cases passed: Solana mock 252/setup 10, Base mock 50/setup 2, wizard 10, generated 44, checkout 32, Prism 22, platform 16; 314 expected mode/public-read skips, zero failures |
| Original aggregate/package/artifact gates | `all-node --clean` passed, 40/40 spawned commands, 42 passed rows plus one unconfigured external-Saturday skip; packed consumer 12/12, four dependency graphs and all three committed-artifact/provenance groups passed; static HTTP safety passed |
| Four Next applications | All four route/typecheck/production builds passed; main production-route smoke passed |
| Actual Docker / new remote CI / staging / human wallets | Not executed/accepted by this pass |

The original four-graph audit is not vulnerability-free: npm reports SDK 4 moderate package findings, web 11 moderate/13 high, platform 5 moderate and Prism zero; every graph has zero critical findings and zero policy failures. These package-level totals include dependency-chain attribution and are not counts of unique advisories. The unchanged, narrowly scoped [dependency exceptions](../../security/dependencies.md) expire November 15; no new exception or deadline extension was used to obtain this pass.

The native cases independently exercise authenticated exact-message actions, scoped keys and rotation/revoke, cross-tenant/resource/grant denial, code races, fresh licensing decisions, DB/RPC/clock faults, final-write expiry, bounded work and offline restore/quarantine/rekey. A deliberately unsafe same-secret snapshot still demonstrates the documented rollback counterexample; recovery must use the prepared new namespace, not waive it. Finite load has 24 fresh decisions plus outage/recovery with settled admission; it is not a provider SLA.

The packed-consumer receipt truthfully records a non-clean working tree at its start: preceding route generation changed only `web/next-env.d.ts`. QA validates that exact generated-reference difference and restores only that file; SDK/package inputs remain unchanged. This is not relabeled as a clean packed start. The separate fresh production install has its own `sourceDirty:false` receipt.

Evidence root: ignored `web/test-results/release-validation-20261022`. The first `checkout` at 1ee25fe retains the failed Next audit and 721/API 74 passes. `patched-checkout` is the clean d616a5d candidate. Its `web/test-results/hosted-ci/results.json`, production-build/browser markers, `hosted-export/{matrix,console,connect}.json` and `hosted-artifact/96ac74399aad450a/results.json` carry the actual source/binding. `final-independent-reconciliation.json` reconciles actual suite footers, source bindings, exceptions and cleanup. Outer logs are `patched-hosted-all.log`, `patched-production-artifact.log` and `patched-original-all-node.log`. Do not export raw logs, proofs, clock state, SQL or private historical evidence.

The full original aggregate is **PASS** at the same candidate: `patched-checkout/web/test-results/validation/all-node/results.json`. Its 314 browser skips are deliberate complementary modes and optional public reads, not hidden failures. Saturday Lights is an explicit unconfigured external-repository skip and was not inspected or modified. QA verifies the isolated checkout is clean after validating and restoring only its generated `web/next-env.d.ts` references. The exact owned PostgreSQL master is stopped; no owned Node/esbuild/PostgreSQL process or known test listener remains. `cleanup-receipt.json` records this disposition; previous PostgreSQL data and the root environment/build are untouched, and private fixtures/failed receipts remain retained. Independent architecture, backend, security and QA reviews identify no unresolved local blocker. Root final checks confirm 160 local documentation links, byte-identical guide copies, a clean fixture, unchanged SDK/program trees and `git diff --check`; the private `root-final-checks.json` retains that reconciliation.

Historical local passes at `ead5ba0`/`ac1949e` and foundation remote run 39017755163 remain useful historical evidence, not replacements for this patched replay or new remote CI. No push, deployment, publication, real-wallet prompt approval, real-wallet transaction signing/broadcast or external data mutation has been performed. Synthetic local message proofs and read-only external metadata inspection are explicitly part of the authorized validation.
