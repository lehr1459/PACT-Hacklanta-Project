# SDK and independent example QA

Current local gate: PASS, 2026-10-10. Independent compiled package checks, standalone installation, synthetic browser acceptance and actual Devnet read-only acceptance passed. Real Phantom ownership/permission-dialog testing and a real currently active license unlocking this app remain unverified; no signing, simulation, send, purchase or deployment occurred during this QA.

## Commands and results

- `packages/pact-sdk`: `npm run typecheck` PASS; `npm test` rebuilt compiled exports and passed 27/27 independent Node tests, 15.272 seconds. Tests import public `@pact/sdk`, not source. Earlier 25-test iterations also passed; the final run adds deactivation and malformed negative expiry/zero terms coverage.
- `examples/pact-demo-app`: `npm run typecheck` PASS; `npm run test:browser` synthetic production target port3005 passed 20/20 in 2.0 minutes (two live-mode tests skipped).
- Additional collected edited-offer race case: `npx playwright test --grep 'late response for edited offer' --output test-results/offer-race --reporter=list`, 2/2 PASS, 10.9 seconds. Total synthetic browser acceptance: 22 executed tests, 11 scenarios across desktop and Pixel7.
- `$env:PACT_SDK_QA_MODE='live'; npm run test:browser` final run passed 2/2 in 9.9 seconds (22 synthetic tests intentionally skipped). These use real public Devnet RPC and synthetic public identities, not real Phantom wallet ownership.
- Final default-config `npm run typecheck; npm run build` PASS, 7.614 seconds total; Next16.4 compiled629ms, TypeScript1445ms, static3/3. Final build uses actual default Devnet RPC and offer, not loopback fixtures.
- QA shutdown check: no listeners3004/3005. Existing marketplace3003 listener25140 was observed and untouched.

## Coverage and package portability

Independent binary fixtures follow the wire spec. SDK cases cover active/strict expired/missing licenses, wallet/offer/PDA identity, account ownership/discriminators/layout/bump, executable program, Devnet genesis, coherent Clock/context, backwards slots/timestamps, frozen12-second slot progress, freshness8-second expiry projection, malformed RPC envelopes, HTTP/transport errors, whole5-second header/body deadlines, concurrent-call fail-closed behavior and caller input mutation across awaits. Seller deactivation preserves an existing unexpired buyer license.

Browser cases cover missing extension, rejected synthetic connection, connected address, active premium remix, disconnect/account changes, silent provider identity changes/null, old-wallet and old-offer response races, automatic expiry, frozen/stale/error/wrong-network/corrupt-account/timeout locks, offline/hidden/rapid visibility recovery, keyboard controls, responsive width and zero pageerrors. All POST methods are restricted to getGenesisHash/getMultipleAccounts; synthetic signing methods throw if called. No cryptographic keys or signing are used.

`npm pack --pack-destination <external temporary consumer> --json` final tarball: pact-sdk-0.1.0.tgz,6676bytes, SHA1 53a6c1be1014482b6b8c56953ede4802a4eb9516; four package files only README/distJS/distTypes/package.json. Fresh external install with `npm install --ignore-scripts --no-audit --no-fund ./pact-sdk-0.1.0.tgz`, `node consumer.mjs`, and strict NodeNext TypeScript consumer check all PASS. External consumer path: C:\Users\Lehr\AppData\Local\Temp\pact-sdk-consumer-58530d243f8a4068b90494b47207a49c. No marketplace source imports or package publication. Final README dependency limitation changes were repacked/reinstalled; source remains unchanged. Existing reported four moderate SDK dependency advisories are not a security clearance.

## Actual public Devnet evidence

At 2026-10-10T22:59:17.293Z, compiled public SDK actual reads verified Devnet genesis and coherent program/offer/license/Clock accounts for program EiiiWWsW2kkqP6nugHz6iBADvhnW5xnibAtZ82ZExVqy and offer7EdfowQEZyVyyp7bYdQyzmprZtVU9mVba8cysHm2Ardh:

- Buyer GNqRCZsgYUAJtetw5PJZvgpkz663XoiQTfNajDxyJ2kS: license4Fy2xybQjZisNkkwrupvAkmBABmNPrcJxAhNmE4Sj4a6, context509698769, chainTimestamp1791673157, expiry1791672052, state expired, active false.
- Seller HXmEkejco1WDhYx3j94388JUSkqL6cCyf3BxxUdQZuz2: licenseDntK7eJcVnsodWsrDvCJsPFAfP2YA9692h9Kx9VHxakL, context509698771, chainTimestamp1791673157, expiry0, state missing, active false.

Actual desktop/mobile UI asserts precisely buyer expired and seller missing, both locked. Synthetic injected identity with actual network reads proves app interpretation, not possession/authentication of those wallets. Active unlocking is demonstrated only by controlled fixtures; live active entitlement demonstration remains pending separate operator action. RPC trust, initial-read honesty and browser-only authorization remain limitations; backend protected resources need authenticated server authorization.

## Failure history and artifacts

An initial npm invocation from repository root returned ENOENT because root has no package.json; corrected working directory, no tests ran there. A read-only date command used unsupported WindowsPowerShell Get-Date -AsUTC; UTC evidence above was obtained with Node instead.

Initial actual browser tests failed2/2 because an outdated test expected buyer license missing. Actual UI already correctly showed expired at context509698555. Public compiled SDK confirmed expired state; external chain activity had changed the earlier historical absence. Tests were corrected to exact expired-buyer/missing-seller expectations and final2/2 passed. No product code changed for this failure. Entire initial failure report/trace preserved under examples/pact-demo-app/test-results/live-initial-missing-assumption and playwright-report/live-initial-missing-assumption.

Evidence paths, relative to example directory:

- playwright-report/synthetic/index.html: original20 passing synthetic checks.
- test-results/offer-race/.last-run.json: additional2 race checks passed.
- playwright-report/live/index.html: final2 actual-read checks and JSON identity/method/context attachments.
- test-results/desktop-prism-synthetic-unlocked.png and mobile-prism-synthetic-unlocked.png.
- test-results/desktop-prism-actual-devnet-synthetic-identity.png and mobile-prism-actual-devnet-synthetic-identity.png: current seller missing gate.
- test-results/live-initial-missing-assumption/*/test-failed-1.png: actual buyer expired gate, preserved with traces and context.

QA edited only its new SDK tests/example tests/config and this report. Existing marketplace/program files and marketplace preview were not altered by QA during this objective.
