# Solana independent QA

Current verdict: **PASS for local functional acceptance**, with no unresolved critical functional blocker observed. Actual compiled program passes 23 local LiteSVM tests, including 14 independent tests. Final configured Solana production acceptance passes 32/32 executions: 24 browser and 8 helper executions across desktop Chromium and mobile Chromium. Solana unconfigured production acceptance passes 2/2; preserved Base browser acceptance passes 48/48 plus its separate 2/2 setup cases. Real Phantom and deployed Devnet gates remain **PENDING**. Dependency audit findings below prevent a production security clearance claim.

Packaged artifact independently hashed to `d13828b060327ef9f702b076b8681e4b9e1e8c04f961191d1df17b2babf52a62`. Combined discovery runs 23 tests (14 independent plus 9 Backend), all pass in 0.094 seconds. The QA loader now uses `artifacts/pact_licensing.so`. Preserved Base Foundry suite independently rerun: 23 passed, 0 failed, 0 skipped, including 256-run fuzz cases.

## Actual local SBF evidence

Run from `solana`: `.\.tools\venv\Scripts\python.exe -m unittest discover -s tests/qa -p 'test_*.py' -v`.

Observed: 14 tests passed, exit 0, 0.050 seconds. Independent harness `tests/qa/test_independent_svm.py` loads `artifacts/pact_licensing.so` into LiteSVM. Fixed synthetic public addresses, zero signatures, and disabled signature verification exercise program signer flags without generating or accessing keys. This does not test cryptographic authentication.

## Configured production browser evidence

Run from `web`: `npx playwright test --config=tests/solana/playwright.config.ts`. Final configured run: 32 passed in 1.4 minutes, exit 0. Runner builds production Next.js with synthetic public program ID and loopback RPC, serves port 3002, and intercepts every POST. Unexpected external POSTs fail the test. The injected Phantom-compatible provider returns unsigned transactions unchanged; no cryptographic signing or external transaction submission occurs.

Verified: extension missing state; connection rejection/retry; full public address accessible title; disconnect; wallet switch closes previous access; wrong genesis; owner corruption and hanging RPC; exact metadata/hash/price/duration plus approval; simulation failure and approval rejection prevent submission; public verification identity and input clearing; durable frozen-slot closure; offline/hidden closure and fresh resume; original sender attribution after pending account switch; account switch during simulation prevents approval; 120-second unknown-confirmation preserves signature without automatic retry; 64KiB metadata usability and approval reset; desktop/mobile keyboard controls and zero horizontal overflow. Helper tests independently cover native wire/PDA layouts, malformed discriminator/linkage/bump, shared UTF-8 boundaries, same-context account reads, exact Clock/context equality, executable loader/owners, requested minimum context rejection, freshness/slot-progress and exact monotonic expiry.

Ignored visual artifacts: `web/test-results/solana/desktop-solana-normal.png`, `mobile-solana-normal.png`, `desktop-solana-64k.png`, and `mobile-solana-64k.png`. Lead independently reviewed normal desktop/mobile screenshots and the mobile 64KiB screenshot.

Coverage: exact seller settlement and buyer rent; buyer-bound entitlement; duplicate purchase rollback; exact expiry repurchase; seller-only deactivation preserving issued licenses; missing buyer/seller signer; readonly and substituted system/seller accounts; wrong PDA; invalid account owner, discriminator, size, linkage and bump; invalid terms; maximum nonce/duration; immutable offer reinitialization; extra price argument rejection; insufficient payment atomic rollback; prefunded PDA recovery; negative Clock and expiry overflow; unsigned simulation returns expected accounts without persisting changes.

## Remaining acceptance gates

Synthetic browser acceptance above is complete. It mocks provider/RPC responses and cannot establish extension permission-dialog or actual network behavior.

Manual Chrome with the real Phantom extension remains an operator gate: installation detection, connect permission/rejection, displayed public address, locked/unlocked behavior, account switching and disconnect. The app must verify RPC Devnet genesis; an extension network label cannot prove the RPC cluster. Wallet signing/broadcast and deployed-program purchase/verification remain separate, unauthorized Devnet gates.

## Final regression and build evidence

- Preserved Base `npx playwright test --config=playwright.config.ts`: 48 passed, 2 intentional missing-address skips, 1.8 minutes. Separate `$env:PACT_QA_MODE='setup'; npx playwright test --config=playwright.config.ts -g 'missing contract shows'`: 2 passed, 12.1 seconds. Existing assertions/fixtures preserved; only `/` navigation changed to `/base` and the legacy config ignores the separate Solana suite.
- Solana `$env:PACT_SOLANA_QA_MODE='setup'; npx playwright test --config=tests/solana/playwright.config.ts setup.spec.ts`: 2 passed, 10.4 seconds. Root explicitly shows setup pending, write controls disabled, gate closed, fallback link present and zero POSTs. Outputs use `test-results/solana-setup`, preserving configured screenshots.
- Final independent `npm run build`: exit 0, successful compilation, TypeScript and 4/4 static pages; `/` and `/base` present. Restored default public RPC endpoints and empty program/contract IDs; no synthetic deployment ID remains in the production build.
- Final independent `npm run typecheck`: exit 0. `git diff --check`: exit 0.
- After runners finished, no listener on ports 3001 or 3002. Protected unrelated port 3000 was not altered.
- Reviewed `docs/SOLANA_DEPLOYMENT_PACKAGE.md`: packaged artifact hash and actual local test claims match independent evidence. Operator-only future signer paths and deployment commands were not executed. No live address, balance, transaction or deployed program is asserted.

## Dependency limitation

Initial independent `npm audit --omit=dev --json` returned exit 1: 26 findings. After Frontend removed the unused wallet React UI dependency, final audit reports 24 findings (13 high, 11 moderate, zero critical). Transitive React Native/mobile/Metro and web3.js jayson/stream-json/uuid chains remain. Local browser fixtures do not exercise a Metro server or UUID supplied-buffer APIs; this is not evidence that the dependency tree is secure. Upstream updates or validated overrides remain a future hardening task. No production security claim is made.

## Browser run history

Initial runner failed before tests because its working directory defaulted to the nested config directory; QA set an explicit web working directory. First actual run exposed a real blocker: the Devnet query called a helper returning undefined after success, which TanStack treated as an error and disabled all writes. Frontend now returns the verified genesis string. QA also narrowed alert selectors to distinguish actual error text from Next's route announcer. The corrected intermediate production run passed 28/28. Final acceptance adds the full-address accessible control, pre-sign account switching and browser 64KiB metadata, with a durable frozen-slot assertion rather than accepting a transient render closure.
