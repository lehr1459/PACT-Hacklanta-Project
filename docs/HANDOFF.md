# Agent handoff

## Critical offer refresh stability

- Lead owns rollback branch, isolated packaging/builds, release safety and final reconciliation. Frontend owns only `use-snapshot.ts` and initial-only loading presentation in `solana-app.tsx`; Backend reviews security/integration read-only; QA owns MutationObserver regression and 60/30-second observations; Reviewer gates final local readiness. No agent may deploy, push, modify Saturday or initiate wallet/chain actions.
- Existing One-Link preview3009 remains the unchanged before candidate. Separate `.deployment-candidates/offer-stability` candidates use physical dependency copies; final preview http://localhost:3016/ runs PID38932, root session50092. Original previews3003-3009 remain protected. Before evidence: `web/test-results/flicker/before.json`; after evidence: `after.json` and matching PNGs. Fresh435 acceptance +46local-chain pass, focused16 supplemental pass, actual-config build/TypeScript pass. Six60s exact TEST offer cases have zero removals/replacements and retain focus; four30s home cases pass. Frontend visual PASS, Backend protected-code PASS, QA executed PASS and Reviewer final local READY reconcile without discrepancies. No real Phantom approval or transaction was attempted. No deployment/push is authorized by this local verdict; see `docs/OFFER_REFRESH_STABILITY.md` and independent QA report.

## One-link purchasing ownership

- Lead: rollback branch/checkpoint, exact-byte link helper, isolated packaging, final preview, documentation and reviewed commit. Frontend: seller sharing and buyer review UI. Backend: independent metadata/protected-integration review. QA: fresh isolated baseline/final regressions and new feature/browser tests. Reviewer reconciles security and results before local readiness.
- Baseline `.deployment-candidates/one-link/baseline` exports immutable `26fc35e` public inputs with physical dependency copies; final is separately packaged at `.deployment-candidates/one-link/final`. Fresh baseline387+46 and final419+46 pass; final SDK/web TypeScript and actual-config production build pass. QA released shared build ownership after serialized suites. Root preview http://localhost:3009/ (PID37544, tool session64859) passes routes/assets and supplemental successful exact link copying at 390/1440px; existing 3003-3008 PIDs remain unchanged. Final Reviewer approves local readiness, no local blocker. No production, Saturday source, SDK or program changes; no live wallet or blockchain actions. Lead alone records the reviewed feature checkpoint.

## Local input-feedback follow-up

- Frontend owns five presentation files (Solana app, Base page, wizard, global CSS, integration CSS). Reviewer independently confirms all 68 control bindings and non-JSX logic match deployed `3953f3b`. Lead owns isolated packaging/build; QA owns targeted browser evidence under `web/test-results/ui-feedback-fix`.
- Current local candidate is `.deployment-candidates/ui-feedback-fix-20261010-234843/pact`, served at http://localhost:3008/. Existing production, Saturday Lights, and previews 3003-3007 remain unchanged. No deployment or transaction is authorized by this local feedback fix.

## Enterprise UI production release handoff

- Operator expressly approved PACT-only candidate `3953f3b` production deployment in personal scope `lehr98-9390`. Lead alone packaged/built/deployed once; all other agents stayed read-only. Production `dpl_6SXVEhtU4CHLp2UAq5Mj1NbbyUZh` READY, canonical https://pact-hacklanta-demo.vercel.app/.
- Fresh upload source in `.deployment-candidates/ui-production-20261010-232407/pact`: only three previously reviewed optional lock entries differ; original source locks, SDK/runtime/providers/programs/Saturday remain unchanged. SDK-first clean local/hosted build gates and independent five-width public checks passed. See `docs/UI_PRODUCTION_RELEASE.md` for provenance/evidence/manual limits.
- Retain prior READY deployment `dpl_7j8igjsYx9SjsrrKZsXBx79FJcQF` and source `4123cc12` for rollback. No further deployment, wallet request, signature or blockchain purchase is implicit. Existing demos and Saturday publications are protected; only relevant release documentation was updated after publication.

## Enterprise UI redesign ownership

- Lead: checkpoint/branch, protected manifest, isolated lint, final preview/report and commit. Baseline `4123cc12f64f48def857f0d60c8d54d671daabd5` on `ui/enterprise-redesign`.
- Frontend: existing CSS and JSX presentation for marketplace, wallet, wizard and Base. No logic/provider/SDK/configuration edits.
- Backend: independent runtime/control-binding/source comparison, owns `qa/ui-redesign/preservation.mjs`. QA owns remaining new QA harness files and `docs/UI_REDESIGN_QA.md`.
- QA: immutable baseline extraction, serialized isolated full acceptance, five-width before/after screenshots, keyboard/contrast/reduced-motion/zoom and actual Devnet read-only checks. Preserve initial failures and assertions.
- Keep previews 3003–3006 and public sites intact. QA owns 3007 until generated consumers finish; Lead starts final actual-config preview there only after release. No deploy/push/wallet/chain mutations.
- QA released all build/server ownership after full baseline/final 387 + 46 PASS and 71 paired screenshots each. Final color/focus corrections are frozen; only two product CSS files changed. Preserved runtime/SDK/program/configuration hashes pass; isolated lint diagnostics are identical. Final independent Reviewer reconciled all reports and passed the local gate before the Lead's reviewed branch checkpoint.
- Lead preview now owns 3007/PID 26472/session 25424; original 3003–3006 retain 11388/9552/33544/29552. Runbook and evidence: `docs/UI_REDESIGN.md`, `docs/UI_REDESIGN_QA.md`. Preserve serving outputs; any future local build uses the isolated helper. Separate operator approval is required for deployment or live wallet/transaction testing.

## Current Hacklanta release ownership

- Lead owns `deployment/**`, `web/vercel.json`, clean `.deployment-candidates/**`, release runbook and coordination. No product UI/SDK/program implementation is changed. Saturday original source/serving dist/public deployment must remain unchanged; all release hardening is isolated to the candidate.
- QA owns fresh builds/tests/security evidence and restoring actual-config PACT 3003 after shared `.next` builds. Do not stop or rebuild Prism 3004, Saturday 3005 or checkout 3006. Use copied/junctioned QA dependencies only in isolated build candidates; no concurrent shared web builds.
- Researcher verified official hosting/Phantom guidance and pinned future Vercel CLI 63.1.2 through read-only npm metadata. Backend independently verified current public offer/expiry/artifact/funding quotes. Security/Reviewer reconciles final package/runbook and QA findings read-only.
- Final candidate is `C:\Hackathon\PACT\.deployment-candidates\20261010-213948-8755f031`, public source allowlists + original ABI/wire spec, candidate-only HTTPS link and no registered Saturday ID. It is deliberately not publishable until new target approval/registration and verified PACT URL. Recreate with helper after target approval; never reuse original Saturday project ID.
- Preserve marketplace purchase link; use one separately authorized existing-offer purchase for a timed 180-second demonstration. Metadata bytes must match the original on-chain hash. No project creation, credential retrieval, push, save, deploy, wallet request, signing, broadcast or purchase during preparation.
- Final QA/build ownership released: 387 acceptance + Lead 46 contract checks PASS; independent source/evidence reconciliation PASS. Actual-config PACT production preview restored on 3003 (session 70826/PID 11388), protected original Prism 3004/PID 9552, Saturday 3005/PID 33544 and checkout 3006/PID 29552 unchanged. Temporary QA listeners stopped; do not rebuild serving `.next`.
- Root final independent preservation checks: all 90 PACT / 2,241 Saturday protected SHA256 values match, four tags intact, contract/program Git diffs empty and whitespace check passes; six local preview pages HTTP 200. Local preparation READY, public release BLOCKED at the explicitly requested target-approval checkpoint. Runbook has exact post-approval commands/native Sites sequence, manual single-purchase checklist, local/historical Explorer fallback and 90-second script. No public release or new transaction performed.

## Current embedded checkout ownership

- Backend owns new SDK checkout/adapter/internal modules, manifest/lock/build and SDK README/unit tests. Frontend owns SDK widget module and `examples/pact-checkout-vanilla`. Interfaces fixed before parallel work in `docs/EMBEDDED_CHECKOUT_INTERFACES.md`.
- QA owns independent checkout/browser/portability/compatibility tests and report; sole owner of web builds after Lead stops verified 3003 preview. Never rebuild serving production directories. Existing Prism 3004 and Saturday Lights 3005 must remain untouched.
- Lead owns runbook/coordination/protected-file baselines and restored local previews; Security/Reviewer read-only source/evidence gate. No Senior Dev required unless a serious integration blocker arises.
- Same marketplace purchase lock identity, honor unresolved legacy records without schema overwrite, explicit Devnet deployment configuration, exact metadata/terms consent, one reviewed signed-wire send and finalized/fresh entitlement. No real chain or wallet actions during implementation.
- Final independent QA and Security reconciliation PASS; local embedded checkout READY. Genuine SDK 57, checkout 28 mocked/4 public reads, full preserved application regressions, compilation/TypeScript/browser/tarball gates pass. Earlier nonexecuting child-wrapper counts are explicitly withdrawn; final runner verifies one selected child TAP pass. Evidence: `docs/EMBEDDED_CHECKOUT_QA.md`; operator workflow/API/files: `docs/EMBEDDED_CHECKOUT.md`.
- QA released all build/server ownership. Lead restored PACT 3003 PID 30520 (tool session 74204) and checkout 3006 PID 29552 (session 13495); startup/request output has no errors and ten HTTP/config/assets checks pass. Prism/Saturday original processes remain unchanged. All 90/2,241 protected hashes, artifact and tags match. Preserve these previews; stop the verified PACT process before any future `.next` production build.
- Stop before any new real wallet request, simulation, signature, broadcast, transfer or deployment. The operator must separately authorize a specific buyer/offer purchase; exact metadata and test SOL are required. Manual Chrome sign-only/rejection/settlement/unlock/expiry and production authentication remain unverified for this new path. Four moderate dependency advisory entries remain, with no high/critical entries.

## Current integration wizard ownership

- Backend: new `web/lib/integration/generator.ts` and supporting generator files, plus the web-only `@pact/sdk` local dependency. Generated code consumes public SDK exports; no SDK/program modifications.
- Frontend: new `/integrate` route, wizard component/scoped styles, minimal marketplace navigation and explicit seller-studio URL handoff. No existing transaction logic changes.
- QA: `web/tests/integration/**`, generated consumer fixtures and independent acceptance report; sole owner of web production builds during acceptance. Lead stops/restores 3003 preview around builds; existing Prism 3004 remains untouched.
- Researcher: read-only official/local Next/React/Phantom/install review completed. Security/Reviewer: independent generated-code/claim review and final evidence reconciliation after implementation.
- Fixed deployed Devnet program/RPC, validated offer before generation, truthful unpublished local/tarball SDK install, labelled simulated preview, wallet-bound fresh verification and explicit client/server security limits. No wallet signatures, transaction simulations/broadcasts, transfers, deployments, credentials, database or authentication service.
- QA final PASS: SDK 27, generated runtime 44 plus genuine emitted-code production compilation, wizard eight synthetic/two actual reads, legacy Solana 154/setup two/live two, final actual-config TypeScript/build. QA released all test servers; Lead restored PACT 3003 PID 11020 and verified root/wizard/Base HTTP 200, correct public configuration and empty stderr. Prism 3004 PID 9552 remains unchanged.
- All 61 protected file hashes and four Git tags match. Full workflow/install/example/security limits are in `docs/INTEGRATION_WIZARD.md`; independent commands, screenshots and preserved harness/locator failure history are in `docs/INTEGRATION_WIZARD_QA.md`. Real Phantom and authenticated production resource enforcement remain outside this local gate.
- Final Security/Reviewer source and evidence reconciliation PASS. Local wizard READY; no further test server or build ownership remains assigned. Preserve the running 3003/3004 previews and require separate authorization for any live transaction or publication.

## Current developer SDK ownership

- Backend: standalone `@pact/sdk` source, compiled public exports, types, package README; no existing marketplace/program edits.
- Frontend: independent `examples/pact-demo-app`, Phantom connection-only identity, distinct UI, package import and public deployment preparation. SDK-first local install/build; separate build directory and ports from PACT.
- QA: independent SDK/package portability and browser cases, actual Devnet reads, serial new-app acceptance and `docs/SDK_QA.md`. Fixture RPC must never escape; actual-network tests permit reads only. Root does not run builds concurrently with QA.
- Lead: `docs/SDK_DEMO.md`, protected-source baselines, startup/handoff evidence and final acceptance audit. Reviewer: read-only ownership/expiry/freshness/authentication/RPC-trust review. No Senior Dev by default.
- No real connection request, signature, simulation, broadcast, transfer, upgrade/deployment or credential access. Operator-controlled manual wallet/purchase evidence is explicitly pending. Preserve all existing uncommitted work and checkpoints.
- Final acceptance PASS: 27 SDK tests, 22 synthetic browser checks, two actual Devnet read checks, package portability, TypeScript/builds and independent Security/Reviewer. Actual buyer expired/seller missing state is corroborated; initial missing-buyer test failures are retained. No product change was required for that state update.
- Lead started independent production preview on `http://localhost:3004/`, HTTP 200/actual offer/locked SSR/empty stderr; existing PACT 3003 HTTP 200 and unchanged. Protected 18 source fingerprints, artifact and Git tags preserved. Exact startup/Vercel settings, integration API, 60-90 second script and security/manual gates are in `docs/SDK_DEMO.md` and `docs/SDK_QA.md`.

## Current purchase handling ownership

- Frontend: transaction/app helper changes and README; preserve UI, program, Base, dependencies and Devnet configuration. No real wallet/chain actions.
- Backend: read-only expiry/RPC/signature contract audit and integration advice. Security/Reviewer: independent read-only implementation review and QA evidence reconciliation.
- QA: independent helper/browser regressions, serial TypeScript/build, public read-only Devnet checks and `docs/SOLANA_QA.md`; sole owner of `.next` acceptance builds. Lead: coordination documents, report, verified preview shutdown/restoration.
- Public-only durable unresolved-attempt records must retain signature/validity and prevent duplicate purchases; never persist signed wire or credentials. Preserve full-message equality and exact captured-wire submission; never automatically resign/resend.
- Final QA and Security/Reviewer gate PASS: 154 configured regressions, two setup and two actual Devnet read-only checks, production build and TypeScript. Final original-purchase status/transaction remains null, license absent, balances unchanged at slot `509691060`. Initial failure history and exact logs are in `docs/SOLANA_QA.md`.
- Lead restored actual preview on 3003 and verified root/Base HTTP 200, actual ID, no fixture and empty stderr; actual desktop/mobile screenshots reviewed. Source/artifact, Base and dependencies preserved. READY only for one separately authorized manual purchase of the existing offer; exact prerequisites/steps and limits are in `docs/SOLANA_PURCHASE_HANDLING_FIX.md`. No live signing, simulation or transaction occurred.

## Current Phantom mismatch ownership

- Backend completed read-only serialization/adapter forensics and synthetic priority-fee reproduction; actual compiled SBF budgeted execution succeeded locally without signature verification or live transactions.
- Frontend owns scoped transaction helper/app signing changes. QA owns adapter-accurate synthetic regressions, strict malicious-modification checks, serial production build/TypeScript, and public read-only chain forensics.
- Reviewer independently validates exact message/wire integrity, Devnet and wallet/offer checks. Lead coordinates evidence/report and restores local preview after QA builds.
- No wallet approval, signing, broadcast, transfer, deployment or upgrade is authorized. Existing program/UI/Base behavior is preserved; one operator retry remains a separate gate.
- Final QA and Reviewer gate PASS: 96 configured + two setup + two actual read-only Devnet executions; build and typecheck exit 0. Preview restored and verified on 3003. Final chain sample slot `509680157` has no offers/licenses and only deployment history. Full evidence/limitations and exact separately authorized retry steps are in `docs/PHANTOM_TRANSACTION_FIX.md` and `docs/SOLANA_QA.md`.

## Current live frontend integration ownership

- Lead: coordination, `docs/SOLANA_LIVE_DEMO.md`, current status/handoff/decisions, final evidence reconciliation and configured local preview.
- Backend: completed read-only wire/runtime compatibility audit against the finalized Devnet deployment.
- Frontend: public local configuration and scoped wallet/transaction/account-read integration fixes; visual design and Base fallback unchanged.
- QA: owns regression tests, serial TypeScript/production/browser checks, actual Devnet read-only browser smoke, and independent evidence.
- Reviewer: read-only integration/security review and final reconciliation. No Senior Dev required.
- Program `EiiiWWsW2kkqP6nugHz6iBADvhnW5xnibAtZ82ZExVqy` is already deployed. This task permits no signing request, live offer/purchase, transfer, upgrade or redeployment. A separate operator authorization is required for the runbook's live transaction steps.
- Final frontend gate PASS: configured synthetic 46/46, setup 2/2, actual read-only Devnet browser 2/2, production build and TypeScript exit 0. Hydration bug fixed and verified with page-error assertions; root and Base smoke clean. QA fixtures remain isolated, final actual build restored, and local configured preview is serving `http://localhost:3003/`.
- Remaining operator gate: distinct funded Chrome seller/buyer wallets, manual Phantom checks, separate authorization for the exact create-offer/purchase demo, and independently reviewed live settlement/entitlement/unlock/expiry evidence. Do not issue any transaction while waiting.

Historical ownership/stop-gate records below remain as phase evidence; current scope above supersedes their pre-deployment status.

## Active Solana migration ownership

- Lead: account/interface decisions, shared docs, checkpoint, operator-only Devnet package.
- Researcher: read-only official tooling/dependency check, then explicitly transitions to Frontend ownership after findings.
- Backend: new `solana/**` excluding independent QA tests, `docs/SOLANA_BACKEND.md`; preserve all `contracts/**`.
- Frontend: Solana UI/adapter modules and isolated Base route preserving existing source; coordinate package changes with QA.
- QA: new `web/tests/solana/**`, independent `solana/tests/qa/**`, `docs/SOLANA_QA.md`; existing Base suites remain intact.
- No Senior Dev unless critical unresolved issue. No deployment/signing/key generation/credential access by any agent.

### Solana local handoff

- Native SBF artifact, hash manifest, manual wire specification and local setup/build/test scripts are in `solana/`. Runtime program address is dynamic; production configuration stays empty until an approved deployment.
- Actual program gate: 23 local LiteSVM tests, including 14 independent QA; preserved Solidity unchanged. Phantom/Solflare frontend is client-only with Devnet genesis checks and coherent, bounded entitlement snapshots. Existing Base UI is isolated at `/base`.
- QA owns final browser/build evidence in `docs/SOLANA_QA.md`. Lead visually reviewed desktop/mobile screenshots and independently checked artifact SHA256.
- Frozen candidate: `solana-local-ready`. Operator package: `docs/SOLANA_DEPLOYMENT_PACKAGE.md`. All wallet permission/signing/deployment/broadcast and live Devnet proof remain pending authorization/operator execution.
- npm audit has 24 transitive advisories; no production audit claim. This limitation and real Chrome checks are documented in the web README and QA evidence.

## Phase 2 ownership

- Lead: checkpoint, integration decisions, shared status/handoff, deployment package.
- Backend: `contracts/**` except independent QA fixtures; `docs/BACKEND_PHASE2.md`.
- Frontend: `web/app/**`, `web/lib/**`, frontend README/config; existing Researcher worker explicitly reassigned to Frontend after completed read-only research.
- QA: `web/tests/**`, Playwright config, coordinated package test dependencies/scripts, `docs/QA.md`; independently validates final Backend and Frontend results.
- Senior Dev not assigned. No on-chain broadcast or deployment authorized.

### Phase 2 local result and stop gate

- Backend: 23 passing tests, unchanged contract source, verified tools/dependencies, explicit Cancun, ABI and runtime hashes independently reproduced.
- Frontend: same-block bounded snapshots, monotonic bigint expiry, shared 64 KiB metadata, sender-safe transaction state and unknown confirmations; visual identity retained with tested metadata wrapping fix.
- QA: 48 fixture/helper executions and 2 missing-address browser executions passed; independent TypeScript/build/default HTTP passed. Playwright results are synthetic local evidence only. See current verdict in `docs/QA.md`.
- Lead visually reviewed representative desktop/mobile screenshots. Default build restored with setup pending; QA server stopped.
- Frozen local candidate tag: `phase2-local-ready` (resolve after checkpoint). Deployment package: `docs/DEPLOYMENT_PACKAGE.md`.
- Stop before deployment/broadcast/signing. Operator next follows private wallet preparation/funding steps; public address/balance/nonce and signer-specific preflight stay pending until supplied. Separate explicit deployment approval is required.

Lead Architect assigns tasks and records owners. Each agent posts: scope, files, interface contracts, commands/tests, risks, and next action. QA must validate contract before deployment. Frontend should use the ABI exported from compiled contract, not handwrite an incompatible ABI.

## Active assignments — 2026-10-10

- Researcher: read-only environment, feasibility, and official dependency verification; no file ownership.
- Backend: `contracts/**`; validate the bundled fixed design, establish reproducible Foundry tests, add deployment and generated ABI workflow. No deployment.
- Lead Architect: shared coordination documents and integration decisions.
- QA: independent contract validation; owns `contracts/test/qa/**` and `docs/QA.md`, coordinating tool readiness with Backend.
- Frontend: owns `web/**`, implementing seller/buyer/verifier/gated app after passing contract tests. The completed Researcher worker was explicitly reassigned to Frontend; research remains complete and read-only.
- Senior Dev: not assigned.

## Local Phase 1 result

- Backend: fixed contract behavior preserved; project-local tooling, pinned dependencies, generated ABI, and deployment simulation ready. Combined tests: 19 passed, 0 failed, 0 skipped.
- Frontend: seller, buyer, verification and gated sample flows implemented under `web/`; build and TypeScript pass. Uses `NEXT_PUBLIC_PACT_CONTRACT_ADDRESS` and `NEXT_PUBLIC_RPC_URL` in `web/.env.local`.
- QA: independently passed contract tests, frontend source review, TypeScript, production build, and HTTP checks. Evidence and explicit limitations are in `docs/QA.md`.
- Preview: `http://localhost:3000` (production server, setup pending because no deployed address).
- Next action: review local UI, then obtain explicit approval before Base Sepolia deployment. Configure approved address, rebuild/restart, and run real seller/buyer wallet E2E with explorer evidence. No signing secrets enter agent workflows.
- Browser interaction was not executed because no browser was available; no testnet transaction or deployment claimed.
