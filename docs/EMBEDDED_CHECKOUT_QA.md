# Embedded checkout independent QA

Current local gate: PASS, 2026-10-11 UTC. All requested automated acceptance completed on frozen source. No real wallet approval, signature, simulation, submission, transfer, deployment or publishing occurred. Real Phantom purchase remains a separately authorized manual boundary.

Approved scope: additive SDK checkout/widget and standalone example, independent mocked transaction acceptance, public Devnet read-only smoke and regressions. No real wallet connection, signing, simulation, broadcast, transfer, deployment, publishing or credential access. Saturday Lights source is read-only; its compatibility consumer is generated inside ignored PACT test artifacts. PACT3003 remains serving until coordinated stop; Prism3004 and Saturday3005 are never changed by QA.

QA ownership: packages/pact-sdk/tests/checkout-qa*.test.mjs and independent fixtures; examples/pact-checkout-vanilla/tests/**; isolated ignored consumers and this report. Backend owns SDK implementation/build/dependencies; Frontend owns widget/example implementation. Existing Playwright tooling is reused without a QA installation.

## Final executed results

All commands below exited0. Logs reside in `web/test-results/checkout-command-logs/`.

| Check | Result | Log |
| --- | --- | --- |
| SDK `npm test` | 57/57,15.293s: root27 + Backend5 + independent25 | `sdk-verified-final.log` |
| SDK `npm run typecheck` | PASS | `sdk-typecheck.log` |
| Checkout mock desktop/mobile | 28/28,16.0s | `checkout-mock-real-final.log` |
| Actual Devnet checkout read-only desktop/mobile | 4/4,4.9s | `checkout-live-resource-final.log` |
| Isolated unchanged Prism mock / actual reads | 22/22,1.9m / 2/2,9.9s | `prism-mock-second.log`, `prism-live.log` |
| Preserved Solana configured suite | 154/154,3.3m | `solana-regression.log` |
| Solana setup / actual reads | 2/2,17.8s / 2/2,15.6s | `solana-setup.log`, `solana-live.log` |
| Preserved Base configured / setup | 48/48,1.8m / 2/2,13.2s | `base-fixture.log`, `base-setup.log` |
| Wizard mock / actual reads | 8/8,18.8s / 2/2,15.2s | `wizard-mock.log`, `wizard-live.log` |
| Actual generated Next.js/React consumers | 44/44,4.2m; generated outputs typechecked and production-bundled | `generated-consumers.log` |
| Final actual-config web production build | PASS; static5/5, `/`, `/base`, `/integrate` | `web-final-actual-build.log` |
| Final web `tsc --noEmit` | PASS | `web-final-typecheck.log` |
| Actual-config production HTTP | all3 routes200, actual program/no synthetic program, empty stderr | `web-actual-http.log` |
| Example port fallback/static allowlist | owned3006 retained, example3007; page/bundle200; POST/traversal/unknown404 | `server-fallback.log` |
| Fresh outside-repository tarball install/import/types | PASS | `portable-final-install.log`, `portable-final-import.log`, `portable-final-types.log` |

Lead independently ran unchanged actual-SBF LiteSVM23/23 and preserved Foundry23/23 including256-run fuzz. Lead logs `%TEMP%\pact-checkout-litesvm-20261010.log` and `pact-checkout-foundry-20261010.log`; these are Lead-run evidence.

Independent tests import compiled package public exports. The25 checkout cases cover instruction/accounts/compute-budget byte parity, unsigned output mutation isolation, exact UTF8 metadata/hash/economics, consent, active entitlement avoiding signing, failed simulation/rejection, fresh finalized buyer-bound proof, signed message tampering/zero signature rejection, same-client/cross-client locks, storage before/after RPC acceptance, paired legacy protection, confirmed-memory incarnation conflict, sticky confirmation, expiry release only with unchanged finalized baseline, changed baseline retention, ambiguous acceptance and replacement-client read-only recovery, identity changes and callback exceptions. Each case receives a fresh Node module realm; durability within its case uses real SDK memory/storage. The runner removes inherited `NODE_TEST_CONTEXT` and requires exactly one selected child TAP pass. The late-body race test genuinely waits5s, releases old timed-out offer A during same-slot B parsing, and verifies B's2,000,000-lamport/120-second quote.

Mock28 comprise24 widget cases,2 standalone palette cases and2 original Saturday-worker cases. Both exact ESM/IIFE bundles execute without React/Next or external runtime imports. Coverage includes terms/consent/mock finalized purchase, HTML-like metadata rendered as text, missing/expired/wrong/silent/null identity, offline/hidden resume,8s freshness/12s frozen slot, consent clearing after edits, teardown, reentrant active-callback destroy/disconnect delivering inactive host state, malformed journal blocking access, confirmed-active purchase staying closed until finalized recovery and no duplicate submission. Standalone remix works only with current fresh entitlement. Original Saturday worker consumes updated compiled root exports, verifies synthetic active then expired access and closes on identity change. Saturday source/server unchanged.

## Actual reads and limitations

Live checkout tests inject no provider and click no wallet control. RPC allowlist is exactly `getGenesisHash` and `getMultipleAccounts`. They verify actual quote plus disconnected locked widget and actual styled standalone app. Prism live tests use synthetic identity with real public reads, not proof of real Phantom ownership.

Independent public SDK quote at `2026-10-11T01:07:20.177Z`, context509730921, chain timestamp1791680839: program `EiiiWWsW2kkqP6nugHz6iBADvhnW5xnibAtZ82ZExVqy`, offer `7EdfowQEZyVyyp7bYdQyzmprZtVU9mVba8cysHm2Ardh`, seller `HXmEkejco1WDhYx3j94388JUSkqL6cCyf3BxxUdQZuz2`, active true, price1,000,000 lamports, duration180 seconds, terms hash `0xf9300ddb0b3dc043942d78fbe7c25b12c227b9dd1ac58373f401bda1d3b7b35a`. Raw output/methods: `actual-quote.json`. No new live entitlement or payment is claimed. Trusted RPC correctness remains an assumption; client-side gates do not provide production-grade server authorization.

## Package, reports and screenshots

Final `npm pack --ignore-scripts --json` used verified frozen build/latest README:309009 bytes; SHA1 `96ceddd06f8c0f0719cac64a504b8cce8eec0b31`; SHA256 `e4a76e0dfee122c2e438b2a0377ca76884de0d003ff015cf9c8ca27a275dfb26`. Fresh consumer `C:\Users\Lehr\AppData\Local\Temp\pact-checkout-final-consumer-17dc0bcd0ba64a4aa48c430c1e8eac5f`: root/checkout/widget/browser ESM imports SSR-safe, strict NodeNext types pass. Installed browser hashes match local bundles:

- ESM `9ec65583257f82c0cec453c11c87c774ca949ba3ce7ba08ae118dac4c2ebc669`.
- IIFE `26b13b80ceec0c6f4295b86a8851d2a64e94331950f9eece69a6230d361fbdcd`.
- Unchanged root SDK source `aa09c4a453c02f7bcb82d3e268883add4478723e803c5be2ff6e04e5193e84fd`.

Lead current audit `npm audit --omit=dev`:4 moderate,0 high/critical, expected exit1; web3/jayson/stream-json/uuid advisory propagation remains, not security clearance. Log `%TEMP%\pact-checkout-sdk-audit-20261010.json`.

Reports: `web/playwright-report/checkout-mock/`, `checkout-live/`, `checkout-prism-mock/`, `checkout-prism-live/`, plus unchanged-suite reports. Consumers: `web/test-results/checkout-saturday-consumer/` and isolated `checkout-prism-consumer/`.

Screenshots in `web/test-results/`: `checkout-actual-example-desktop-checkout.png` and mobile equivalent (actual disconnected styled app; Lead visual PASS), `checkout-live-desktop-checkout.png`/mobile (actual widget), `checkout-esm-desktop-checkout.png`/mobile and IIFE equivalents (synthetic finalized state). Actual app assertions prove CSS `text/css`, Arial,0px margin, expected background/grid, no stylesheet/module/CORS console errors, failed resources, page errors or horizontal overflow.

## Failure history retained honestly

1. Initial fixture brace syntax error prevented execution; corrected and `node --check` passed. Initial wrong-relative log directory command prevented build; corrected path and subsequent build passed.
2. First browser10 passed/4 failed: fixture omitted legitimate `isBlockhashValid`. Fixed fixture. `browser-first.log` remains; individual first-run artifacts were overwritten by Playwright cleanup, so no retained first-trace claim.
3. Prism first config loaded two installed Playwright copies and failed before tests. QA config/CLI now uses original example's copy; no app edit. Failed `prism-mock.log`, successful second22/22.
4. Initial shared-identity unit cases were contaminated by durable module memory. First subprocess workaround inherited `NODE_TEST_CONTEXT`, falsely counted wrappers without executing selected bodies. Earlier isolated/full52/53/57 draft counts are superseded and invalid independent evidence. Fixed context plus mandatory selected child TAP count. A legacy fixture status110/context100 mismatch was corrected. Genuine final `independent-real-final.log`25/25 and `sdk-verified-final.log`57/57 are authoritative.
5. Expanded browser22 passed/4 failed: active buy button renamed `License active`, so old locator absent; recovery is `refresh`, not a new `purchase`. Test-only corrections. Next24 passed/2 failed: virtual120s timeout with permanently frozen fake slot correctly kept access closed. Fresh progressing111 slot then finalized recovery passed. Failures preserved in `checkout-mock-expanded-failure/` and `checkout-mock-recovery-fixture-failure/`.
6. Added standalone synthetic provider lacked required `removeListener`; correctly failed closed (26 passed/2 failed). Accurate fixture capability fixed; failures retained in `checkout-mock-example-provider-fixture-failure/`, final28/28 passed.
7. First actual standalone screenshots were unstyled due QA CSS octet-stream MIME. Lead found it. Only harness MIME changed; computed-style/resource assertions added, actual4/4 styled rerun passed. Prior PNGs retained as `checkout-actual-example-*-unstyled-history.png`.

Resolved source findings: confirmed-memory incarnation conflict, truthful confirmed phase under storage faults, reentrant host closure, unresolved/malformed journal access blocked before fresh-active acceptance, exact read/session/account/abort-bound snapshot capture. Reviewer source gate PASS. No unresolved critical local acceptance failure remains.

## Final release

Final web build restored actual `.env.local`; production smoke actual program/no synthetic program and all3 HTTP200, empty stderr, then final typecheck PASS. At release all QA listeners3001/3002/3006/3007/3008/3009 stopped; only original Prism3004/PID9552 and Saturday3005/PID33544 remained. PACT3003 was stopped by Lead for builds. QA released `.next` and server ownership after all acceptance; Lead restores previews. No secrets or actual transaction actions were accessed.
