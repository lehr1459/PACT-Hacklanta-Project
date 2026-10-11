# One-Link independent QA

Current verdict: local One-Link acceptance PASS. The immutable baseline passed 387 acceptance checks and 46 local program checks; the final candidate passed 419 acceptance checks and 46 local program checks. All final command groups exited 0. No unresolved critical local defect remains. Deployment and real Phantom purchase remain outside this authorization.

QA used immutable public source copies under `.deployment-candidates/one-link/baseline` and `final`, with physically copied existing dependencies. This is not a fresh npm installation proof. Existing serving outputs and previews on ports 3003–3008 remain untouched. QA performed no real wallet approval, signing, simulation, send, deployment, publishing or site mutation. Preserved transaction suites use synthetic providers and dummy signature bytes; actual-network tests permit only public read RPC methods.

## Executed baseline

`node qa/one-link/run-acceptance.mjs .deployment-candidates/one-link/baseline <group>` ran SDK first, then `web`, `other` and separate `chain` outputs. Shared web/.next builds were serial. The wrapper retains assertions, removes inherited NODE_TEST_CONTEXT for genuine SDK child execution, and changes only isolated safety paths/logging and generated/checkout ports to 3012/3015. Saturday uses its nested copied candidate, never original source.

| Suite | Passed checks |
| --- | ---: |
| SDK | 57 |
| Solana mock / setup / actual read-only | 154 / 2 / 2 |
| Base mock / setup | 48 / 2 |
| Wizard mock / actual read-only | 8 / 2 |
| Generated consumers | 44 |
| Prism mock / actual read-only | 22 / 2 |
| Checkout mock / actual read-only | 28 / 4 |
| Saturday candidate | 12 |
| Acceptance total | 387 |
| Local SBF / Foundry | 23 / 23 |

All baseline child exits were 0, including builds and typechecks. Foundry includes 256-run fuzzing. Genuine arguments, child codes and durations are in `web/test-results/one-link/baseline/commands/results-{sdk,web,other,chain}.json`. Generated checks completed in 256599 ms; Saturday in 12485 ms. Baseline test listeners were closed after completion.

## Current final evidence

Final SDK 57, OTHER (checkout 28+4, Prism 22+2, generated 44, Saturday 12), and local chain 23+23 groups passed with actual child exit 0. Their unchanged outputs need no repeat for the purchase-link codec and fixture corrections. Actual final acceptance is 419: baseline 387 plus 16 mock helper executions, 14 mock browser checks, and two actual-network link checks. Setup/live helper cases are explicitly skipped. Focused runs are supplemental, not added again to this total.

The eight helper cases check exact TEST bytes/hash, Unicode/whitespace preservation, offer-only compatibility, malformed/missing/duplicate/version/settings input, canonical base64/UTF-8/schema, safe origins and raw URL controls, and exact 1024-byte / 2048-character boundaries. A standalone eight-case run passed; final mock execution uses both desktop/mobile projects.

New browser checks retain fresh on-chain matching and explicit consent: complete-link exact prefill/reset; offer-only manual workflow; mismatch and malformed recovery; seller metadata/link copy success/fallback and overlapping completion; edit invalidation; inactive-offer closure; connected synthetic buyer consent and reload reset. Signing throws and reads are allowlisted. Responsive captures cover 320, 390, 768, 1024 and 1440 pixels, with page-error and overflow assertions.

## Actual public metadata compatibility

Independent SDK reads passed at 2026-10-11T04:11:52.102Z, context slot 509777329, chain timestamp 1791691912. The real program `EiiiWWsW2kkqP6nugHz6iBADvhnW5xnibAtZ82ZExVqy` and offer `7EdfowQEZyVyyp7bYdQyzmprZtVU9mVba8cysHm2Ardh` returned seller `HXmEkejco1WDhYx3j94388JUSkqL6cCyf3BxxUdQZuz2`, active true, price 1000000 lamports and duration 180 seconds. The SDK accepted these exact 115 UTF-8 bytes with hash `0xf9300ddb0b3dc043942d78fbe7c25b12c227b9dd1ac58373f401bda1d3b7b35a`:

```json
{"schema":"pact-solana-license-v1","title":"TEST","terms":"TEST","priceLamports":"1000000","durationSeconds":"180"}
```

Evidence: `web/test-results/one-link/public-test-compatibility.json`. Only official Devnet getGenesisHash/getMultipleAccounts were used. This proves public offer/metadata compatibility, not wallet ownership or a purchase.

## Retained failure history

- The initial wrapper shortened Saturday's copied relative path incorrectly; corrected before that suite ran. Original Saturday was never built or edited.
- PowerShell quoting corrupted a new QA screenshot insertion, caught by early TypeScript checks. Corrected test syntax and froze files before overlays; product source was unaffected.
- First final WEB run found a real browser codec defect: Buffer 6 does not support Node's base64url encoding name. Valid complete links failed UTF-8 decoding. Lead corrected the helper to ordinary base64 with explicit alphabet/padding mapping and canonical checks. The stopped child code was 4294967295 after 171080 ms. Logs, results and traces are in `final/first-encoding-failure`.
- Positive banner assertions were updated to exact `Purchase link verified` plus success class because the final text no longer says match. Raw-byte, consent and mismatch assertions were preserved.
- Second final mock run exited 1 after 360627 ms: 180 passed, four failed, six skipped. New seller/buyer stubs omitted window.isPhantomInstalled required by the installed adapter. Both test stubs now include it; product wallet configuration is unchanged. Evidence: `final/second-fixture-failure`.
- Focused preflight passed 12/14; immediate seller URL reads after responsive captures failed. A fixed-slot fixture could exceed unchanged-slot freshness, so context and Clock.slot now advance coherently while Clock Unix time remains 1000. A subsequent coherent-slot preflight also passed 12/14 and exposed the transient query-data/progress/timer freshness boundary. The earlier fixed-slot explanation was incomplete. Retry assertions now require fresh Copy readiness and canonical URL before unchanged exact-value checks. Evidence: `final/third-frozen-slot-fixture-failure` and `final/fourth-readiness-boundary-failure`. No freshness limit was weakened.
- The malformed-link case additionally includes section=seller, requiring visible buyer error and usable manual recovery after the narrow initial-route fix.

All paths in the failure list are under `web/test-results/one-link/final`. The final completed results and supplemental checks below supersede the pending status recorded during these historical failed runs.

A later focused preflight again passed 12/14 (57.6 seconds) and identified the definitive seller failure: exact getByLabel('Buyer purchase link') cannot locate the textarea once its content contributes to its wrapping label name. The previous immediate empty-value observation was not proof of a product freshness defect. Lead requested stable explicit accessible names on the two new readonly controls. Frontend added aria-labels for Buyer purchase link and Exact metadata JSON; QA retained exact semantic locators and added an explicit role/accessibility-name assertion. Canonical/exact URL and empty-after-edit assertions remain. Retry readiness remains appropriate for real transient freshness. Evidence is retained in final/fifth-readonly-label-failure.

Aria-label focused rerun passed 13/14, actual child exit 1 after 48589 ms. Desktop seller passed; mobile seller's scheduled freshness poll invalidated the copy scope during outstanding clipboard promises, so feedback was correctly discarded. Log/result/traces are retained in final/sixth-clipboard-poll-boundary-failure. The synthetic seller test now pauses its installed browser clock only after fresh enabled-copy and canonical URL assertions, isolating overlapping clipboard completion ordering from unrelated poll scheduling. No product timer, guard or assertion changed.

Corrected focused preflight passed all 14 cases, genuine child exit 0 after 36570 ms (Playwright 36.0 seconds). Full stdout and child proof: final/focused-browser.log and final/focused-browser-result.json. All seller copy, accessible-name, exact-byte/link, overlap, edit-reset and invalid+seller recovery assertions passed on desktop/mobile. The complete final WEB pipeline subsequently passed; its results are recorded below.

## Final completed receipt

The final WEB pipeline passed 250 checks: Solana mock 184, setup 2, actual read-only 4; Base mock 48, setup 2; wizard mock 8, actual read-only 2. All child codes were 0. Mode skips are excluded from totals. Combined with SDK 57 and OTHER 112, final acceptance is 419. Local SBF 23 and Foundry 23 also passed. `web/test-results/one-link/final/reconciliation.json` reconciles actual summaries and all group child codes; `final/commands/results-{sdk,web,other,chain}.json` records exact commands and durations.

The final actual-Devnet production build passed in 7687 ms and web TypeScript passed in 3977 ms. Build process used program `EiiiWWsW2kkqP6nugHz6iBADvhnW5xnibAtZ82ZExVqy` and official Devnet RPC. No synthetic build configuration remains. QA listeners 3001/3002/3010/3011/3012/3015 were absent after completion. QA released the final candidate's output before Lead started its local preview on 3009; existing previews remained untouched.

Supplemental checks are not counted again in 419: focused browser 14/14, genuine exit 0 after 36570 ms, and successful Copy Buyer Link at widths 390/1440 on the actual-config local preview, exit 0. The latter captured exactly the displayed URL, affirmative success feedback, only intercepted read methods, zero page errors and no overflow. Evidence: `web/test-results/one-link/copy-buyer-success.json`. Its identity/accounts are explicitly synthetic; no signing method or transaction was invoked.

Final five-width screenshots are under `.deployment-candidates/one-link/final/web/test-results/one-link/`, named `{desktop,mobile}-solana-{complete-link,seller-share,invalid-link}-{320,390,768,1024,1440}.png`. Actual-network TEST screenshots are `{desktop,mobile}-solana-actual-TEST-shared-link.png`. The focused/full runs assert no horizontal overflow or page errors, explicit textbox naming, native keyboard focus, consent reset and disabled purchase until the required conditions. Frontend independently reviewed complete/invalid buyer captures and all five desktop seller-sharing captures; mobile seller files are available for its final review. Routine stale/pending snapshots can legitimately disable sharing in a capture; this is enforced closure, not a purchase-ready claim.

Remaining limits: real Phantom extension permission dialogs and a real-wallet One-Link purchase were not exercised. Client gating trusts the configured RPC and is not server authorization. Links contain public metadata and support only the bounded exact JSON payload. Existing oversized metadata/manual JSON workflows are preserved. Public Devnet reads prove current compatibility, not future RPC availability or legal rights. No production deployment of this follow-up was performed or authorized by QA.