# Buyer offer refresh stability

Local branch `fix/offer-refresh-stability`; rollback checkpoint `117b7934e1818d35942636f7f880bcff0b0d1509` preserves reviewed One-Link Purchasing. No deployment, push, publish, wallet approval, signing or blockchain broadcast is authorized by this fix. Saturday Lights, SDK, program and enterprise styles remain unchanged.

## Reproduced cause before changes

QA observed the unchanged production build on port 3009 for 60 seconds in three cases: manually entered exact TEST offer while disconnected, manually entered while connected through a synthetic Phantom provider, and complete One-Link metadata. Actual public offer/program/Clock account bytes were obtained read-only; responses with advancing slots and connected wallets were synthetic. The offer was `7EdfowQEZyVyyp7bYdQyzmprZtVU9mVba8cysHm2Ardh` on the deployed Eiii program.

Each case recorded 15 offer-panel removals/reinsertions at roughly four-second intervals, with changed DOM-node identities and 0.6–194 ms absence. No recurring document navigation or page error accompanied them. Evidence: `web/test-results/flicker/before.json`, matching PNG captures and public fixture. Initial startup frame events are distinct from the subsequent flashes during polling.

`useSolanaSnapshot` publishes `snapshot` only when `fresh` is true. A successful poll first publishes a new `query.data` object. The previous progress effect runs later, briefly failing `progress.snapshot === query.data`; the 200ms clock state can also precede the new request start time. `SolanaApp` derives `offer` from this fresh snapshot and replaces its details with an empty state when absent. This removes and remounts the offer subtree; it is not a full-page reload, HMR, router navigation, CSS animation or wallet-listener loop. Background `isFetching` wording was a secondary visible change, not the snapshot gap's cause.

## Fix and invariants

The hook reconciles an accepted new snapshot's progress and observation time with a guarded state adjustment during its own render, before children commit. This follows [React's documented conditional state adjustment](https://react.dev/reference/react/useState#storing-information-from-previous-renders). It does not introduce a cached display offer or authorize against stale data.

- A greater slot or new scope uses the request's original `startedAtMs` for progress time.
- An equal slot updates snapshot identity without renewing progress time.
- A backward slot is not accepted; the unchanged reference guard keeps access closed.
- A new accepted result samples `performance.now()` once, removing the old clock-tick alignment gap. Slow responses keep their original request start time.
- Existing query configuration, session isolation, fresh/valid expressions and snapshot return stay unchanged. The 4-second polling, 200 ms observation tick, 5-second read timeout, 8-second freshness and 12-second slot-progress deadlines remain intact.
- Buyer, public verification and closed Studio loading labels appear only before current-query data exists. Errors, paused checks and stale-state messaging remain visible. Account/offer changes discard the previous scope.
- Transaction construction, signing/submission safeguards, metadata commitment checks, consent, purchase guards and One-Link encoding remain unchanged.

Only product files `web/lib/solana/use-snapshot.ts` and `web/components/solana-app.tsx` change. No dependency, CSS, manifest or configuration change is needed.

## Independent validation

Backend's exact comparison against 117b793 passes: reversing only the three initial-loading predicates restores the original SolanaApp bytes; hook fresh/valid/query/session predicates remain unchanged. QA's focused 16/16 regression passes, genuine child exit 0 after 325363 ms: it observes DOM identity for 60 seconds and continuous gate state, verification and seller sharing for 30 seconds over successful polls on desktop/mobile, with error/timeout/frozen/backward-slot/expiry/offline/hidden/account-change closure checks. The fresh complete suite passes 435 acceptance checks (SDK57 + WEB266 + OTHER112), plus 46 local program checks (SBF23 + Foundry23). The focused16 are supplemental and not counted twice. Final actual-program/official-Devnet production build and TypeScript exit 0 after 7657 ms and 8159 ms.

The exact TEST after harness exits 0: six 60-second desktop/mobile cases (manual disconnected, manual synthetic-connected and complete link) retain one original offer panel with zero removals or replacements and preserved metadata-input focus. Four 30-second empty-home cases also pass. All ten have zero post-ready navigation, page/console errors or overflow, with one document navigation entry each. Evidence: `web/test-results/flicker/after.json`, `public-fixture-after.json` and matching `after-*-start/end.png`. Connected providers and repeated advancing-slot RPC responses are synthetic; no license account was supplied in this exact-offer observation. The gate correctly stayed closed. Valid/expired Studio behavior is separately covered by the regression fixtures.

Final coordinated verdict: READY locally. Frontend independently reviewed desktop/mobile before/after captures and passed visual preservation. Backend passed exact protected-code comparison. QA independently executed all receipts and continuous observations. Reviewer reconciled the source, results, visual review and preserved artifacts, with no remaining local blocker. Lead records the local checkpoint on the dedicated branch; production remains unchanged. Independent report: [OFFER_STABILITY_QA.md](OFFER_STABILITY_QA.md). Failed preliminary harness executions are retained and clearly separated from passing final runs.

Modified-file inventory: the two product files above; `web/tests/solana/offer-stability.spec.ts`; isolated validation adapters `qa/offer-stability/prepare.mjs`, `run.mjs`, `preservation.mjs`; this runbook, `docs/OFFER_STABILITY_QA.md`, `docs/DECISIONS.md`, `docs/HANDOFF.md` and `docs/STATUS.md`. Dependencies added: none. Generated evidence and packaging remain ignored; unrelated existing untracked files are excluded from the checkpoint.

Baseline source is isolated under `.deployment-candidates/offer-stability/baseline`; final under `final`, with physical copies of existing dependencies rather than a fresh install. Existing previews 3003–3009 are protected. QA released the restored build; final preview runs at http://localhost:3016/ (PID38932, root tool session50092). HTTP smoke passes `/`, `/integrate`, `/base`, 23 static assets and actual deployed program/official Devnet configuration. Source/copy/manifest identity passes for all three frozen product/test files. Preservation passes 137 protected sources, four tags, three serving artifacts and 2241 original Saturday Lights files; the earlier One-Link BUILD_ID remains unchanged. Both existing public URLs still respond 200; no deployment was made.

Reproduction from the PACT root, with existing dependencies:

```powershell
Set-Location C:\Hackathon\PACT
node qa/offer-stability/prepare.mjs baseline
node qa/offer-stability/prepare.mjs final
node qa/offer-stability/run.mjs build
node qa/offer-stability/run.mjs prepare-tests
node qa/offer-stability/run.mjs acceptance sdk
node qa/offer-stability/run.mjs acceptance web
node qa/offer-stability/run.mjs acceptance other
node qa/offer-stability/run.mjs acceptance chain
node qa/offer-stability/preservation.mjs
```

Prepare copied test configuration once, serially, before running acceptance groups. Shared web builds remain serialized; SDK build/tests complete before consumer suites. Isolated generated/checkout/Prism ports are 3012/3015/3017, preserving the One-Link preview 3009. Stop only this fix's preview before rebuilding; preserve all earlier demos. Once actual-config output is restored, launch in another terminal:

```powershell
Set-Location C:\Hackathon\PACT\.deployment-candidates\offer-stability\final\web
node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3016
```

Rollback source in a separate directory without overwriting this work:

```powershell
git worktree add --detach C:\Hackathon\PACT-offer-stability-rollback 117b7934e1818d35942636f7f880bcff0b0d1509
```

## Limits and release boundary

The connected-wallet evidence uses synthetic providers with signing prohibited. Real Phantom dialogs, network settings, live signing/payment and a live timed entitlement remain separate manual checks requiring authorization. Actual RPC availability can change. Client-side Studio gating is not backend authorization or a production security guarantee. This is a local stability fix; production stays on the existing reviewed deployment until separate approval.
