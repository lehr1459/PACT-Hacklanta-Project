# Hacklanta final MVP independent QA

## Final executed evidence - 2026-10-10 local / 2026-10-11 UTC

All logs are in `web/test-results/hacklanta-final/command-logs/`. Counts below exclude skipped mode-specific tests and repeated intermediate runs.

| Fresh acceptance | Passed | Duration | Log |
|---|---:|---|---|
| Isolated compiled SDK exports, genuine child TAP guard |57|15.31s|sdk.log|
| Solana configured / setup / actual read-only |154 / 2 / 2|3.3m / 12.3s / 14.7s|solana*.log|
| Base fallback configured / setup |48 / 2|1.9m / 12.9s|base*.log|
| Wizard configured / actual read-only |8 / 2|17.9s / 13.5s|wizard*.log|
| Actual generated Next.js/React consumers |44|4.2m|generated.log|
| Isolated Prism configured / actual read-only |22 / 2|1.8m / 9.7s|prism*.log|
| Checkout configured / actual read-only |28 / 4|16.3s / 4.4s|checkout*.log|
| Staged Saturday race + workflow / full football slip UI |10 / 2|6.6s / 6.4s|saturday-candidate-workflow.log / saturday-slip.log|

The actual-network browser cases use only public Devnet reads, strictly restrict RPC methods and distinguish synthetic public identities from real Phantom ownership. Synthetic transaction fixtures use dummy signature bytes; no real signing, simulation, submission or wallet approval occurred. Saturday full UI uses deterministic synthetic QA Falcons/Bears game data and fabricated entitlement: unlicensed team selection stays blocked; explicit normal connect event/promise permits fresh licensed selection, review and approval of one slip; expiry or another wallet blocks new slip creation while preserving the approved slip. This is not a live on-chain purchase claim.

Lead independently ran local compiled-SBF LiteSVM23/23 (0.090s) and Foundry23/23 including256-run fuzz. Lead baseline comparison found zero mismatches across90 protected PACT and2241 original Saturday files and four tags. Lead also read original Saturday live scores endpoint HTTP200 with58 events and partial:false; QA did not POST reactions.

### Candidate, packaging and build proof

Exact candidate: `.deployment-candidates/20261010-213948-8755f031`. Candidate-only purchase link is `https://pact-hacklanta-demo.vercel.app/?offer=7EdfowQEZyVyyp7bYdQyzmprZtVU9mVba8cysHm2Ardh`; availability/ownership is unverified. Preparation explicitly retains `publicUrlVerified:false`, `deploymentAuthorized:false` and empty Saturday project ID. Original Sites project ID is absent; public D1 binding remains a deployment prerequisite.

Candidate SDK-first build, Next production build/typecheck, Saturday build/validate all PASS. Nine unsafe URL/original Sites ID inputs were rejected before creating any candidate. Public candidate input inspection found no `.env`, signer or keypair files. Contract ABI and Solana wire-spec are included unchanged. Candidate root/base/integrate HTTP200; Solana pages contain actual program ID and no synthetic program ID.

The first candidate Next build failed because dependency junctions escaped Turbopack's hermetic workspace. `candidate-next-build.log` preserves this failure. QA copied already-installed public dependencies physically inside the isolated candidate, without installation, source/config changes or widening the build root. Corrected build/typecheck PASS (`candidate-next-build-physical.log`, `candidate-next-typecheck.log`). Staged SDK compiled export and candidate installed export have identical SHA256 `bacd1f9eefca584259b00d54070cee6f3acbea4b629a3b0769d8451c4bab9de5`. This proves clean source packaging/build with existing pinned dependencies, not a fresh network `npm ci`.

Original SDK root source SHA256 remains `aa09c4a453c02f7bcb82d3e268883add4478723e803c5be2ff6e04e5193e84fd`; packaged program remains `d13828b060327ef9f702b076b8681e4b9e1e8c04f961191d1df17b2babf52a62`. Original Saturday gate remains `74783d886524efb2f091d444aa5ecfce720d7447724066168a9c42715645d147`. Staged fixed gate is `2ab19a50cc588e50fb2a643e533e138fa9fa95e8ecc31cd5d3af11dde621b106`; Lead verified staged Worker SHA256 `cf43ccbbbba76db4d65be0d99ede6bb7ea3d85422922c58a5038a9ff72dadf50`.

### Failures retained and limits

Original Saturday late connect promise after disconnect/accountChanged reopened canceled identity: all four independent cases failed, preserved in `saturday-race.log` and original race traces. Lead fixed only staged candidate. Reviewer then found the late connect EVENT variant; final staged acceptance covers both late-event and late-promise paths, normal connect sequencing and actual application behavior. Original serving Saturday still has the historical defect; no claim that its source was repaired.

Initial actual Worker workflow harness called `newSlip()` through window, where the named DOM element shadowed the module function. Two harness failures are preserved in `saturday-candidate-workflow-initial-failure.log`; correction clicks the actual button, preserving behavior assertions. Final new cases pass. No product change was made for the harness.

Fresh `npm audit --omit=dev --json`: web24 (13high,11moderate,0critical), SDK4moderate, Saturday4moderate (0high/critical). JSON logs are `audit-web.json`, `audit-pact-sdk.json`, `audit-saturday-lights.json`. Nonzero audit status is expected; no audit fix/upgrades applied. Web high advisories concern transitive mobile/React Native/Metro packages; SDK/Saturday advisories include web3/jayson/stream-json/uuid. Counts and dependency paths are not evidence that browser runtime is unaffected or production secure.

### Final outputs and ownership release

Final original web actual-Devnet production build and typecheck PASS (`final-web-build.log`, `final-web-typecheck.log`). QA stopped all temporary listeners3002/3007/3008/3009/3010/3011/3012. Original Prism3004/PID9552, Saturday3005/PID33544 and checkout3006/PID29552 remained unchanged. QA restored PACT3003 via foreground tool session70826, PID11388; root/base/integrate return HTTP200, actual program on Solana pages, no synthetic program ID. All `.next` acceptance/build ownership is released; do not rebuild while this preview is serving.

Screenshots: `web/test-results/hacklanta-final/saturday-desktop.png`, `saturday-mobile.png`, `saturday-approved-desktop.png`, `saturday-approved-mobile.png`. Lead visually reviewed normal and approved views, preserving Saturday design; approved views are explicitly synthetic. The remaining public hosting/Sites configuration, real Phantom permission/signing flow and client-gating security limits require operator review and separate authorization.

Current gate: local MVP acceptance PASS. Fresh acceptance passed 387 checks (57 SDK and 330 browser/helper executions), plus Lead-run 23 Solana SVM and 23 Foundry checks. Candidate deployment preparation/build is validated locally; public deployment, Sites registration, real Phantom flow and production security are not validated or authorized.

## Authorized scope

Existing local acceptance, build/security/configuration review and public read-only Devnet checks only. No deployment, publication, Git push, credentials, wallet approval/signature, real simulation, transaction, transfer or program change. QA owns this report and isolated acceptance harness only. Original Saturday source remains read-only. Only the isolated release candidate contains Lead's minimal connection cancellation fix. Existing purchase-marketplace link must remain functional.

Read `AGENTS.md`, `web/AGENTS.md`, current STATUS/HANDOFF and public source/build scripts. Saturday has no project or parent AGENTS file. Actual read-only inventory confirms PACT3003/PID30520, checkout3006/PID29552, Prism3004/PID9552 and Saturday3005/PID33544 with expected command lines. Never rebuild a serving `.next`; Saturday's build recursively replaces `dist`, so never build the serving original.

## Initial actual evidence

- Current Saturday `npm run validate` PASS: artifact fresh, Devnet gate/public Worker routes and default.fetch export present. This is read-only validation, not a rebuild or deployment.
- HTTP200 current PACT root/wizard/Base, Prism, Saturday and checkout. Saturday includes the actual PACT program and preserves the `http://localhost:3003/` marketplace purchase link.
- Saturday local GET `/api/reactions` returns200 `{counts:{},selected:{},unavailable:true}` without a DB binding. Reactions are unavailable locally; no POST was performed. The503 path is a DB operation failure, not this initial no-binding response.
- Existing final embedded gate is documented in `EMBEDDED_CHECKOUT_QA.md`: genuine SDK57, checkout28 mocked/4 public reads, Solana154/setup2/live2, Base48/setup2, wizard8/live2/generated44, Prism22/live2, actual-config builds/typechecks and Lead chain23+23. These remain prior evidence until this final readiness execution is recorded.

## Configuration and claim boundaries

1. Hosted Saturday requires an actual approved HTTPS `PACT_PURCHASE_URL`; localhost3003 default is local-only. Build and validation hashes bind this environment value and must use the same value.
2. Existing purchase URL validation allows HTTPS/local HTTP but inserts the raw configured string via JSON.stringify into an inline script. A configured value containing an HTML closing-script sequence can break generated HTML. Reported to Lead for minimal configuration validation/encoding review before freeze; QA will not alter owner source.
3. Saturday's gate and PACT example UI are client-side demonstrations. No claim of server-side ownership/authentication or protected API authorization. Worker reaction DB binding and host setup remain deployment configuration prerequisites.
4. Devnet reads rely on RPC correctness and network availability. Synthetic providers do not demonstrate real Phantom ownership, dialogs or settlement. Real purchase/unlock/expiry remains a separately authorized operator check, and exact seller metadata is required before a purchase.
5. SDK is unpublished; consumers use local/vendored/tarball installation. Existing advisory limitations are retained; no production security claim.

## Acceptance commands and safe ownership plan

Run only after Lead confirms configuration/source freeze and shared build ownership. All commands below are local; `live` test modes permit reads only.

From PACT root:

```powershell
node web/tests/final-readiness/isolated-sdk.mjs
node examples/pact-checkout-vanilla/tests/build-saturday-consumer.mjs
node web/node_modules/@playwright/test/cli.js test --config examples/pact-checkout-vanilla/tests/playwright.config.ts
$env:PACT_CHECKOUT_QA_MODE='live'
node web/node_modules/@playwright/test/cli.js test --config examples/pact-checkout-vanilla/tests/playwright.config.ts
Remove-Item Env:PACT_CHECKOUT_QA_MODE
node examples/pact-demo-app/node_modules/@playwright/test/cli.js test --config examples/pact-checkout-vanilla/tests/prism.config.ts
$env:PACT_SDK_QA_MODE='live'
node examples/pact-demo-app/node_modules/@playwright/test/cli.js test --config examples/pact-checkout-vanilla/tests/prism.config.ts
Remove-Item Env:PACT_SDK_QA_MODE
```

The isolated SDK harness copies public source/tests/configuration into ignored `web/test-results/hacklanta-final/`, links existing dependencies, builds/tests the same public package exports and verifies original serving browser bundle hashes remain unchanged. Genuine selected-child TAP count guard is preserved. Prism harness uses its own copied source/output on3009, leaving original3004 untouched. Checkout harness uses3008 and no `.next`. Existing standalone checkout3006 remains served from original frozen artifacts.

Historical execution plan (completed; wizard used the QA-only3010 override to preserve checkout3006):

```powershell
node node_modules/@playwright/test/cli.js test --config tests/solana/playwright.config.ts
$env:PACT_SOLANA_QA_MODE='setup'
node node_modules/@playwright/test/cli.js test --config tests/solana/playwright.config.ts
$env:PACT_SOLANA_QA_MODE='live'
node node_modules/@playwright/test/cli.js test --config tests/solana/playwright.config.ts
Remove-Item Env:PACT_SOLANA_QA_MODE
node node_modules/@playwright/test/cli.js test --config playwright.config.ts
$env:PACT_QA_MODE='setup'
node node_modules/@playwright/test/cli.js test --config playwright.config.ts
Remove-Item Env:PACT_QA_MODE
node node_modules/@playwright/test/cli.js test --config tests/integration/playwright.config.ts
$env:PACT_INTEGRATION_QA_MODE='live'
node node_modules/@playwright/test/cli.js test --config tests/integration/playwright.config.ts
Remove-Item Env:PACT_INTEGRATION_QA_MODE
node node_modules/@playwright/test/cli.js test --config tests/integration/generated.config.ts
npm run build
npm run typecheck
```

Generated consumers have separate copied outputs3007 and may run independently; all web `.next` builds remain serial. Final production build must use actual public configuration; restore no synthetic override. Final actual-config build/typecheck completed and QA restored3003 below. The serving original Saturday remains untouched.
