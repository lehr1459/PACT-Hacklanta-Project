# Offer refresh stability independent QA

Current verdict: PASS for the frozen local candidate. Fresh automated acceptance passed 435 checks plus 46 local program checks. The separate focused 16 and ten long after-observations passed. No deployment or real wallet transaction occurred.

## Before and after proof

Before product edits, QA observed the production-built OneLink preview on localhost:3009 for 60 seconds in three cases: manual disconnected desktop, synthetic-connected manual mobile and exact TEST complete-link desktop. Each recorded 15 offer-panel removals/reinsertions, about every four seconds, with a new DOM node on reappearance. Absence lasted 0.6-194 ms. No page errors or recurring navigations accompanied the polling flicker. Two same-URL frame events happened during startup; document navigation entries remained one.

The frozen production candidate on localhost:3016 passed six 60-second after-observations: manual address actually pasted, disconnected and synthetic-connected, plus complete-link synthetic-connected, each on desktop 1440/mobile 390. No offer node disappeared or was replaced after readiness. Manual metadata focus remained intact. Four additional no-offer home cases (disconnected/connected, both widths) passed 30 seconds. All ten had zero page errors, console errors, overflow and post-ready navigations. Initial frame events are excluded explicitly rather than claimed absent.

Evidence: `web/test-results/flicker/before.json`, `before-original.mjs`, `public-fixture.json`, `after.mjs`, `after.json`, `public-fixture-after.json` and `before/after-*-start/end.png`. Representative final images are `after-manual-connected-desktop-end.png`, `after-manual-connected-mobile-end.png`, `after-complete-connected-desktop-end.png` and `after-complete-connected-mobile-end.png`.

Public Devnet getGenesisHash/getMultipleAccounts supplied real offer/program/Clock bytes for `7EdfowQEZyVyyp7bYdQyzmprZtVU9mVba8cysHm2Ardh`. Subsequent responses and wallet identity were synthetic with coherent advancing context/Clock slots and no entitlement. Exact TEST metadata retained its original 115 bytes. This proves local rendering using actual public account bytes; it is not real Phantom ownership or live purchase evidence. Signing throws and only the two read methods are allowed.

## Regression and safety result

The source render gap was independent progress bookkeeping and monotonic-clock state lagging a newly returned query snapshot, temporarily returning no fresh snapshot and removing the panel. The reviewed atomic bookkeeping fix preserves the freshness, slot progress, identity and access predicates. It adds no display cache authorizing access. Initial-only loading notices no longer recur for healthy background reads.

New `web/tests/solana/offer-stability.spec.ts` passed eight cases on desktop/mobile (16 executions), both separately as focused preflight and within the full suite. Mutation observation plus 10-ms sampling continuously asserts original node identity, Studio gate state, seller link value and enabled state. Healthy buyer flows observe 60 seconds; seller/public verification/active and expired Studio observe 30 seconds. RPC error/hang recovery, frozen/backward slots, expiry, hidden/offline closure and wallet changes all retain fail-closed behavior. Existing transaction, metadata and pending-journal tests also passed. Focused fixtures use a synthetic long-lived entitlement; the separate actual TEST after-observations use no entitlement.

## Fresh complete acceptance

The isolated candidate is `.deployment-candidates/offer-stability/final`. Commands were `node qa/offer-stability/run.mjs prepare-tests`, then `node qa/offer-stability/run.mjs acceptance sdk`, followed by independent web/other/chain groups. SDK completed before consumers used its output. Every final child code is zero in `web/test-results/offer-stability/final/commands/results-{sdk,web,other,chain}.json`.

| Group | Passed |
|---|---:|
| SDK public APIs | 57 |
| Solana mock/setup/actual read-only | 200 + 2 + 4 |
| Base mock/setup | 48 + 2 |
| Wizard mock/actual read-only | 8 + 2 |
| Checkout mock/actual read-only | 28 + 4 |
| Prism mock/actual read-only | 22 + 2 |
| Generated consumers | 44 |
| Isolated Saturday | 12 |
| Acceptance total | 435 |
| Local SBF / Foundry | 23 + 23 |

Mode skips, focused 16 and ten supplemental observations are not double-counted. Foundry includes 256-run fuzz. Full Solana mock took529317 ms; focused preflight325363 ms. Final actual Eiii/official Devnet production build passed in 7657 ms and final web TypeScript passed in 8159 ms. The full WEB runner exited 0. QA verified no listeners on test ports3001/3002/3010/3011/3012/3015/3017 before releasing the candidate output to Lead for 3016; after-browser contexts closed normally.

## Retained execution history

QA detected copied Prism port3009 would conflict with preserved OneLink preview before starting OTHER. Lead adapted only isolated config/server to3017; no conflict occurred.

First OTHER exited 1 after11592 ms with 14 invalid-URL failures and two skips: concurrent group wrappers read/wrote shared isolated harness files, leaving four empty configs/server files. Protected sources were unchanged. `final/first-other-isolation-failure` preserves logs, results and empty-file evidence. Lead separated serial preparation and unique per-group runners; corrected OTHER passed 112.

First WEB passed 38 existing desktop checks then the new long test timed out on exact button name Connect wallet (actual name includes an arrow). QA stopped only verified owned WEB PID 35300 and descendants, retained `final/first-web-locator-failure` and `flicker/stopped-web-owned-pids.json`, and changed the new locator to semantic /^Connect wallet/. No product behavior or continuous assertions were weakened. Corrected focused 16 and complete WEB 266 passed.

## Preservation and limits

Root independently recorded 137 protected sources, four tags, three serving artifacts and 2241 original Saturday files unchanged in `web/test-results/flicker/preservation-final-before-commit.json`. Root additionally verified the original 3009 BUILD_ID unchanged and current root/candidate/manifest source identity. Existing 3003-3009 previews and outputs were not rebuilt or stopped by QA. Frontend/Reviewer visual and source reviews are separate from these executed test receipts.

This is local automated acceptance, synthetic wallet behavior and public Devnet reads. Real extension permission dialogs, real signing/payment and production deployment were not performed. Trusted RPC authenticity remains an existing limitation.

Frontend independently reviewed final manual/complete desktop/mobile start/end images and before comparisons: visual PASS, retained layout/focus/terms/hash/consent/closed gate, no clipping. Six static disconnected/home screenshot pairs were byte-identical; this is supplemental visual evidence.
