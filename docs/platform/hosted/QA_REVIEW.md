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

## Local real-PostgreSQL tooling

Prepared PostgreSQL **18.4** native Windows binaries in ignored `web/test-results/hosted-tools/postgres18/package/native/bin`, using the [embedded-postgres project](https://github.com/leinelissen/embedded-postgres) package `@embedded-postgres/windows-x64@18.4.0-beta.17`. Downloaded without lifecycle scripts and independently compared archive SHA-512 to registry integrity: `AwRerliA4IGWyW5jWBvHt5vidVUSB0QQW9Tt2y7ScnmifnCb/awfxZr4BkBSTv+gNt8Djcddqs+xSF5Z6/CkTg==`. Integrity establishes package identity, not a binary security audit.

Initialized a disposable SCRAM-authenticated cluster with test-only credentials, listening only on `127.0.0.1:55439` with 30 connections and 32MB shared buffers. No machine service, firewall, global installation or external account changed. `pg_ctl` readiness/status and SQL version query passed. Created an empty `pact_hosted_test` database for platform tests and separate `pact_qa` for tooling probes. Root owns subsequent service lifecycle; stop using `pg_ctl -D web/test-results/hosted-tools/pg-data -m fast -w stop`.

Independent native-PostgreSQL probes passed:

- Two separate `pg` connections raced an atomic conditional consumption: exactly one success.
- Clean shutdown/restart retained the consumed marker and denied replay.
- A physical cold copy taken only after clean shutdown started on `127.0.0.1:55440`, retained the marker and denied replay; this restore clone was then stopped.

Ignored reproducible scripts: `hosted-tools/probe-postgres.mjs` and `verify-postgres-restart-restore.mjs`; native logs are beside them. These verify SQL tooling, not yet the platform's schema, authenticated flow, migration or post-restore revocation epoch. Those acceptance tests remain required. This binary package omits `psql`/`pg_dump`; use the Node `pg` harness and clean-shutdown physical backup for local fixtures.

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

## Phase 1 independent implementation review

**PASS — local Phase 1 control-plane acceptance**, pending separate security review and later full compatibility/CI gates. Inspected actual `database.mjs`, `security.mjs`, `service.mjs`, configuration and initial SQL migration, then authored an independent native-PostgreSQL/real-loopback-HTTP harness under `scripts/hosted-qa/`. Disposable wallet signatures/base58 are produced independently; no production signing/canonicalization helper is imported.

Executed pinned Node `--test scripts/hosted-qa/phase1.test.mjs`: **11 passed, 0 failed, 0 skipped**, 2.20 seconds in the final targeted run including lifecycle extensions. Log: ignored `web/test-results/hosted-qa-baseline/phase1-native-pg.log`.

Verified two distinct admins and application isolation across detail/credentials/callbacks/usage/events; missing/wrong Origin and CSRF denial; session/browser binding; signed exact payload, different account and same-wallet different-session denial; proof replay and competing redemption; invalid callback schemes/credentials/fragments/queries/wildcards/ambiguous paths/private hosts/origin mismatch; loopback verification exception versus pending nonlocal callback; once-only key reveal, metadata/audit secrecy and persisted verifier; overlap rotation, scope checks, revocation, pause and logout; preserved sessions/app state/revocation after service and database-pool restart; unavailable DB returning 503 while liveness remains available; concurrent registration respecting 20-app quota and overlap rotation respecting 10-key quota.

Final lifecycle extensions exercise actual backend-only `POST /v1/credentials/validate`: valid key, invalid key, browser Origin, unknown wallet override, overlapping rotation, revoked key, paused app, disabled owner and process restart. Additional verifier scope checks remain server-side. Concurrent signed partial updates preserve both name and paused status. At the ten-key limit overlap rotation denies while immediate zero-overlap rotation succeeds. Signed callback renewal issues a new DNS token and returns pending; the prior token denies, the new token verifies, and signed revocation clears verification and prevents old proof reuse.

The restart test restarts service/listener/pool without stopping the shared cluster; separate tooling probes above establish native cluster restart/restore. Injected deterministic DNS TXT responses establish local wrong-token denial and correct-token verification, not live external domain control. DNS expiry and hosted-profile callback behavior require additional fixture tests; later browser UX and remote CI are not implied. One test initially expected 403 for a disabled-owner key; the implemented contract intentionally hides disabled owners behind 401 `API_KEY_INVALID`, and the assertion was corrected. No authorization succeeded in that negative case. No consequential defect remained in the exercised current code.

## Phase 2 independent implementation review

**PASS — local Phase 2 binding acceptance**, with actual grant invalidation reserved for Phase 3 when grants exist. Inspected `resources.mjs`, its service registration and migration `002_resources.sql`. Added independently authored raw-account HTTP RPC fixture: reviewed account bytes are encoded directly, with standard web3 PDA derivation for disposable public wallets; no PACT account serializer, offer builder or mocked reader is used. The service instantiates its actual hardened SDK reader against that loopback RPC.

Final pinned command: `node --test --test-concurrency=1 scripts/hosted-qa/phase1.test.mjs scripts/hosted-qa/phase2.test.mjs`: **18 passed, 0 failed, 0 skipped**, 3.99 seconds. Phase 2 contributes one parent plus six passing subtests. Log: ignored `web/test-results/hosted-qa-baseline/phase2-native-pg.log`.

Verified signed seller matches proven admin; foreign seller, absent/inactive offer, wrong genesis/account owner/executable program, stale Clock and RPC outage deny; caller wallet/network/program overrides and malformed/renamed resource keys deny; cross-tenant reads/writes deny; duplicate registration and stale version conflict; signed policy replacement preserves actor/version history; emergency disable succeeds during RPC outage; inactive re-enable denies. Two competing signed updates at one expected version produce exactly one success and one 409. Application policy epoch increments exactly once per successful change and remains unchanged on rejected changes, establishing the future grant-invalidation binding.

The initially applied draft migration was finalized during implementation to remove a history foreign key to expirable proof records. Rebuilt **only** QA's disposable `pact_hosted_qa` database after confirming zero active connections, then applied the final migrations cleanly. No service/user database or cluster lifecycle was changed. Migration checksum enforcement was preserved. Original Phase 1 tests passed after extracting the shared independent browser helper.

No consequential defect remained in exercised Phase 2 behavior. Existing-license deactivation semantics remain the unchanged SDK boundary; actual hosted authorization and grant invalidation require their later-phase tests. Fixtures issue only read methods and never sign or submit a chain transaction. Remote CI and live wallet/domain acceptance remain unexecuted.

## Phase 3 independent API and gateway review

**PASS — local Phase 3 API/gateway/connect UI acceptance**, with external real-wallet/device/operator and remote CI gates separate. Inspected `connect.mjs`, final migrations `003_connect.sql` and `004_callback_incarnation.sql`, service registration, fixed gateway implementation and Next route wiring. Migrations were applied after the backend writer explicitly froze them. No fixture schema reset was needed.

Final pinned command: `node --test --test-concurrency=1 scripts/hosted-qa/gateway.test.mjs scripts/hosted-qa/gateway-integration.test.mjs scripts/hosted-qa/phase1.test.mjs scripts/hosted-qa/phase2.test.mjs scripts/hosted-qa/phase3.test.mjs`: **36 passed, 0 failed, 0 skipped**, 5.09 seconds. Receipt: ignored `web/test-results/hosted-qa-baseline/phase3-native-pg-combined.log`. This includes six root-owned gateway unit checks, one independent actual-gateway check and eleven Phase 3 checks including its parent.

Verified confidential backend launch, exact callback/S256/state, buyer-specific cookie/CSRF, exact app/wallet/purpose/network signature binding, stolen browser binding denial, invalid signature consumption and explicit wallet switch superseding the prior challenge. Wrong app, verifier, state, issuer or callback cannot redeem a code. Two independent service instances with distinct PostgreSQL pools simultaneously exchange one code: exactly HTTP 200 and 401. The instances deliberately share the required test pepper and database, with no shared process-local replay store relied upon.

Verified callback revoke and policy epoch changes invalidate pending issuance; already-issued grants deny after policy change in both service instances. Grants are stored as keyed verifiers, remain app scoped and deny on revocation/strict expiry. Challenges, codes, valid grants and redeemed/revoked state survive multiple service/listener/pool restarts. A closed DB denies with 503; recovery restores ordinary operation. Strict challenge/code/transaction/grant TTL boundaries deny. Post-issuance grant checks exercise the service's actual SQL verifier; Phase 4 must additionally exercise fresh licensing decisions through its HTTP endpoint.

Independent gateway integration runs a real HTTP proxy through `proxyHostedRequest` into the real native-PostgreSQL service. Admin login/configuration, distinct buyer cookies, code return, backend exchange and grant revocation all pass through the gateway. Additional tests prove callback revoke/renew cannot revive an old code, and a third service using the same database/pepper under a different issuer cannot authenticate the original admin cookie, key or grant. Synthetic Ed25519 wallets are explicit. No consequential defect remained in exercised API/gateway behavior.

### Production browser evidence

Root prepared an isolated source snapshot `7b71af9d112e3b61e9f2417f156c9da9e9ac7600` at ignored `web/test-results/hosted-web/phase3`, installed locked SDK/web/example/service dependencies and produced the production build. QA did not build or start the user's root web tree, inspect active environment contents, or modify production source. QA corrected test-only harness startup/public environment parity, standalone signer import compatibility and application-alert locator scope after initial failures; product build inputs remained unchanged. Candidate TypeScript passed again after those harness edits.

Executed pinned Playwright against the actual prebuilt Next server, actual `/v1` gateway, native PostgreSQL service and independent local consumer backend: **12 passed**, 9.7 seconds, six scenarios on desktop and 320px narrow layout. The consumer backend alone stores key, PKCE verifier/state and wallet grant; its callback checks exact state/issuer and exchanges the one-use code before setting a server session. Disposable synthetic Phantom signing runs in Node through test bindings, with no agent wallet approval or transaction.

Verified no automatic wallet connection/signature; keyboard connection and explicit exact-message review/signing; correct callback/backend exchange; no key/grant in browser API requests/responses or storage; signature refusal, connection refusal, cancellation, missing wallet, account switch, expired request and expired challenge stay denied without a consumer grant/exchange. Fresh nonces differ between requests, every framework script carries the document nonce, CSP contains neither unsafe-inline nor unsafe-eval, frame denial/no-referrer headers hold, and success flows produce **zero browser console errors, page exceptions or CSP violations**. Desktop and narrow screenshots were visually inspected; no page-level horizontal overflow, clipping or focus failure was observed. Textarea scrolling is intentional for exact message bytes. This is keyboard/reflow/browser evidence, not an actual screen-reader or mobile-wallet attestation.

Receipts: root ignored `web/test-results/hosted-qa-baseline/phase3-browser.log`, `phase3-browser-typecheck.log`, `phase3-browser-initial-findings.md`; candidate `web/test-results/hosted-connect/results.json` and per-project `connect-review.png`. Earlier failing traces were replaced by Playwright's rerun output directory; the separate findings report states exactly what was observed without claiming those traces persist. Owned Next/consumer listeners were confirmed closed after tests; the shared disposable PostgreSQL cluster remains root-owned. No unresolved consequential Phase 3 defect was found in tested behavior. New remote CI, real Phantom/device acceptance and external staging remain unexecuted.

## Phase 4 independent authorization review

**PASS — local Phase 4 acceptance.** Inspected actual `access.mjs`, telemetry, admission, protected SQL lane, readiness and migration `005_access_observability.sql`. Extended the independent raw HTTP RPC fixture with manually encoded buyer-bound license accounts, held responses, explicit slot/Clock changes and account corruption. Every licensing check exercises the existing real hardened SDK reader; no mocked entitlement result is used.

Final pinned command: `node --test --test-concurrency=1 scripts/hosted-qa/gateway.test.mjs scripts/hosted-qa/gateway-integration.test.mjs scripts/hosted-qa/phase1.test.mjs scripts/hosted-qa/phase2.test.mjs scripts/hosted-qa/phase3.test.mjs scripts/hosted-qa/phase4.test.mjs`: **55 passed, 0 failed, 0 skipped**, 19.0 seconds. Phase 4 adds 19 checks. Receipt: ignored `web/test-results/hosted-qa-baseline/phase4-native-pg-combined.log`. Readiness's temporary checksum-corruption test ran serially in the QA-owned database and restored the original value in `finally`; security/root were notified around that exclusive probe.

Verified missing license denies, fresh active license allows, exact chain expiry denies and deactivation preserves existing unexpired entitlement. Response bindings and original read/progress timestamps, strict freshness bounds, expiry, fixed program/network and safe offer-only buyer link preserve seller-retained metadata requirements. Repeated successful checks make new RPC reads. A single seller may intentionally bind the same offer to two apps for the same buyer; each app's own key/grant allows, exchanged keys/grants deny, and an unrelated seller cannot bind that offer.

Wrong key/grant, browser Origin, caller wallet/offer/program/network/app overrides, unknown/disabled resource, wrong account owner/embedded offer/buyer, wrong genesis/executable program, inconsistent context/Clock, backwards/frozen history, RPC outage and actual five-second timeout deny. Signed key revoke, grant revoke, app pause, policy rebind and operator account disable while an actual RPC read awaits all prevent a late ALLOW. Real post-read PostgreSQL transaction overhead with a controlled eight-second clock advance denies without resetting the original freshness budget. Positive deadlines are capped by key/grant lease expiry; exact auth expiry denies.

Independently verified two held reads from one app cannot starve another app; excess app work never enters RPC. Eight incomplete control bodies and eight incomplete auth bodies do not starve protected access or liveness. Two occupied native control SQL connections do not delay protected responses; bounded telemetry persists redacted usage/reason/audit records afterward. Separate key/app quotas deny without chain work. Readiness verifies the entire migration checksum set plus actual SDK chain readiness.

QA found a consequential admission leak during initial testing: destroying incomplete request bodies left HTTP lane capacity occupied because normal response cleanup did not run. Reported it to the root/backend/security owners, who implemented idempotent abort/close/response cleanup while retaining executing work until settlement and passing the abort signal to SDK reads. The original failing targeted receipt is `phase4-http-reservation.log`; the final combined run explicitly verifies release and subsequent successful authorization. A first saturation fixture also exceeded the database's deliberate pending cap when all 16 headers arrived simultaneously; the fixture now fills each independent HTTP lane sequentially before asserting reservation, preserving the original admission expectations.

No unresolved consequential Phase 4 defect remained in exercised behavior. No UI changes, browser rebuild, chain protocol edits, external CI, hosting, wallet approvals or transactions were performed by this phase's QA. The next console phase must treat deliberate once-only admin secret reveal separately from forbidden secret persistence: disable traces/HAR/screenshots for sensitive cases and retain only redacted receipts.
