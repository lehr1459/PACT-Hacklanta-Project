# Integration wizard independent QA

Current local gate: PASS,2026-10-10. New wizard/generated component acceptance, preserved marketplace regression, restored actual-config production build/typecheck and HTTP smoke all passed. No unresolved critical local acceptance failures. Real Phantom permission dialogs and real wallet ownership remain outside this QA.

No real wallet connection, signing, simulation, transaction submission, transfer, deployment or publishing occurred. Synthetic providers use fixed public addresses and no cryptographic keys. Lead stopped the verified PACT3003 preview before shared web builds. Prism3004 remains untouched.

## Actual results

| Check | Result |
|---|---|
| SDK compiled public-export regression, npm test | 27/27 PASS,15.274s |
| web npm run typecheck, including new tests | PASS,7.697s |
| Actual generated Next.js/React consumer production compilation | PASS for both targets |
| Final generated browser runtime | 36/36 PASS,3.6min |
| Supplemental config guards and active hung-refresh browser cases | 8/8 PASS,46.7s |
| Wizard mock acceptance (2 generator helper executions +6 browser executions) | 8/8 PASS,20.9s;2 live cases intentionally skipped |
| Wizard actual public Devnet read-only desktop/mobile | 2/2 PASS,13.4s;8 mock cases intentionally skipped |
| Preserved Solana configured regression | 154/154 PASS,3.2min (76browser+78helpers);4 mode skips |
| Preserved Solana setup and actual read-only live | 2/2 PASS12.0s setup;2/2 PASS13.8s live;156 other-mode skips each |
| Final actual-config web production build/typecheck | PASS;Next compile472ms,TypeScript3.6s,static5/5;routes /,/base,/integrate |
| Final production HTTP and listener release | HTTP200 allthree routes;actualID true on root/integrate,syntheticID false;QA3002/3006/3007 stopped |

Final generated acceptance totals44 browser executions (22 scenarios across desktop/Pixel7), not counting the initial24 passing iteration again. Reads were intercepted with an exact public Devnet URL/method allowlist. Synthetic providers expose forbidden signing methods that throw if invoked; assertions confirm zero calls. Every new browser case checks zero pageerrors and no horizontal overflow.

## Generated code and workflow verification

The QA consumer script transpiles the real generator/template module, calls generateIntegration, then writes returned configuration/component verbatim into an ignored independent Next app. Both emitted Next.js and React targets undergo genuine production bundler/TypeScript compilation. The React target runs under a client wrapper as a representative React consumer; this is not a claimed independent Vite build. Existing installed dependencies are reused through an ignored node_modules junction. No production fixture route was added.

Independent byte equality against generateIntegration verified the compiled/runtime consumer files:

- Next.js PactLicenseGate.tsx SHA256 ea840a8ec6649642f2d6adee2a2a732f31a335ab882e7beae072f79a7fba99d4.
- React PactLicenseGate.tsx SHA256 fcbfb941940a5cae35b20372e33f7328230fe54a055d88c7283f5b9dc2b1af1f.
- Shared pact-config.ts SHA256 25c5a536e495390bb40bc29758e08f81487861dbb6e9c85ac75a9d5ae2822282.

Runtime cases cover SSR/missing extension, rejected connection, active/missing/strict expired licenses, wallet mismatch/account changes, explicit null events with stale provider key, unsolicited events while disconnected, silent identity/null/getter failure, late RPC responses, pending connection success/rejection after account events, RPC/network/account errors, whole deadline timeout, frozen slot12s, stale active snapshot8s, offline/hidden recovery and disconnected locking. QA-only widened invalid configuration variants exercise both wrong program and wrong network before any RPC call; original emitted component bytes are unchanged.

Wizard checks reject invalid canonical addresses, unsupported framework and HTML-like app names; validate exact fixed program/RPC/offer, full AI prompt includes identical configuration and component, honest unpublished local SDK setup/install, clipboard success/manual fallback, synthetic labelled locked/valid/expired preview, edited-field output invalidation, pending validation races, wrong genesis/program owner/offer owner, and generation for both targets. Actual browser navigation enters existing Seller studio and returns to Integrate preserving the selected offer; no create-offer control or wallet connect is clicked.

## Actual network evidence and limitations

Actual wizard browser tests used no provider or wallet connection. Only getGenesisHash/getMultipleAccounts POST methods reached https://api.devnet.solana.com. Structural validation of the known offer is not buyer entitlement or wallet ownership verification.

Independent public compiled SDK read at2026-10-10T23:20:03.385Z validated program EiiiWWsW2kkqP6nugHz6iBADvhnW5xnibAtZ82ZExVqy, offer7EdfowQEZyVyyp7bYdQyzmprZtVU9mVba8cysHm2Ardh, public lookup holder11111111111111111111111111111111; context509703985, chainTimestamp1791674403, derived licenseB5NAQTFEEJrMA751Xp8u27BtroQvw2xvezVSNEUJZMYz, missing/expiry0/activefalse. The SDK verified Devnet genesis and coherent program/account/Clock state.

No real Phantom permission dialogs or wallet possession are established. Active premium unlocking is fixture evidence. Client-side gating alone is not production security; confidential resources require authenticated wallet ownership and server authorization with fresh entitlement. RPC trust/first-read honesty and existing dependency advisories remain limitations.

## Failure history

Before any generated browser run, the QA harness failed twice: Windows ESM absolute import required pathToFileURL; Turbopack rejected a dependency junction outside the chosen filesystem root. QA corrected its harness file URL and workspace root, preserving generated component bytes. Panic log C:\Users\Lehr\AppData\Local\Temp\next-panic-48c391db4b944093b51df7dd13d3ae05.log. No product changes required.

Initial generated24/24 passed3.4min. A conservative pending-connect product hardening saved after that output snapshot was covered by the final regenerated36 plus supplemental8.

First wizard run:4 PASS/4 FAIL/2 intentionally skipped45.6s. Exact input-label locator failed because inline error text changed accessible names; unscoped alert matched Next route announcer. Second run:6 PASS/2 FAIL/2 skipped1.8min, remaining exact getByLabel Framework timed out. QA fixed only selectors to semantic textbox prefixes, scoped diagnostic alert and named combobox. All output invalidation/noRPC/no-signing assertions remain. Corrected complete run8/8 PASS20.9s. Both failed reports/traces/screenshots are retained; no UI change was made to fit tests.

## Reproduction and artifacts

From web:

- npx playwright test --config tests/integration/generated.config.ts
- Supplemental run: same config with --grep 'configuration program|hung refresh' --output test-results/integration-generated-extra --reporter=list.
- npx playwright test --config tests/integration/playwright.config.ts
- Actual wizard mode: set PACT_INTEGRATION_QA_MODE=live for the preceding command; remove afterward.
- Legacy configured/setup/live: tests/solana/playwright.config.ts with PACT_SOLANA_QA_MODE unset/setup/live respectively.

Ignored exact evidence paths:

- web/test-results/integration-command-logs/: generated-final.log,generated-extra8.log,wizard-mock.log,wizard-mock-final.log,wizard-mock-corrected.log,wizard-live.log,solana-regression154.log,solana-setup.log,solana-live.log,final-build.log,final-typecheck.log,final-http-server.log and final-http-server.stderr.log.
- web/playwright-report/integration-generated-main36/index.html; supplemental8 output web/test-results/integration-generated-extra/.last-run.json and log.
- web/playwright-report/integration-mock/index.html and integration-live/index.html.
- Initial wizard failed artifacts web/test-results/integration-mock-initial-locators and integration-mock-second-framework-locator, matching web/playwright-report directories.
- Generated actual consumer web/test-results/integration-consumer/app/{nextjs,react}/PactLicenseGate.tsx and pact-config.ts.
- Screenshots web/test-results/desktop-integration-wizard-generated.png and mobile-integration-wizard-generated.png.
- Actual screenshots web/test-results/desktop-integration-wizard-actual-devnet.png and mobile-integration-wizard-actual-devnet.png.
- Generated runtime screenshots web/test-results/{desktop,mobile}-generated-{nextjs,react}-actual-generated-active.png.

QA owns only new integration tests/config/harness and this report, plus the explicitly authorized legacy root Playwright testIgnore entry. No old marketplace implementation, program, SDK source or Prism example source was modified by QA.


Final default build restored .env.local actual Devnet configuration. A temporary QA-owned production server3006 returned HTTP200 on root,/integrate,/base; root/integrate showed actual deployed program and no synthetic program/setup-pending state. QA verified its process command before stopping it. Listener check then found only untouched Prism3004 PID9552 among3002/3003/3004/3006/3007. Shared web.next ownership released to Lead for its3003 preview restore. git diff --check for QA-owned tracked config/report/tests passed (line-ending normalization warning only).
