# Devnet purchase submission and confirmation handling

## Authorized scope

The operator authorized local diagnostic/frontend transaction-handling fixes, independent QA and security review, automated regression checks, production build, and public read-only Devnet browser checks. No real wallet approval, signing, simulation, broadcast, purchase, transfer, program upgrade/deployment, or authority change is authorized.

The first purchase's public signature is `2p1M8d5YfNuCfSiPvUTri4xRgAte16oSnEMP5QtnBeufLtyWc8ndmMzFc7bNWCw79cAJNgrcR1FGQtqEbz9BJP7H`. Buyer: `GNqRCZsgYUAJtetw5PJZvgpkz663XoiQTfNajDxyJ2kS`; seller: `HXmEkejco1WDhYx3j94388JUSkqL6cCyf3BxxUdQZuz2`; offer: `7EdfowQEZyVyyp7bYdQyzmprZtVU9mVba8cysHm2Ardh`; program: `EiiiWWsW2kkqP6nugHz6iBADvhnW5xnibAtZ82ZExVqy`.

## Established defects and historical limits

Independent root/QA reads at finalized slot `509685295` and nearby contexts verified the Devnet genesis. Historical signature status was null, and confirmed/finalized transaction lookups were null. The buyer-bound license PDA `4Fy2xybQjZisNkkwrupvAkmBABmNPrcJxAhNmE4Sj4a6` was absent. Buyer balance remained 1,500,000,000 lamports; seller balance remained 7,298,607,118 lamports. Returned histories showed funding and offer creation, without purchase settlement. The offer is active, costs 1,000,000 lamports and grants 180 seconds of access.

The original RPC response/error and validity window are unavailable. These reads establish no successful purchase recorded in the checked state; they cannot distinguish preflight rejection, transport loss, dropped delivery, or expired blockhash. Expired entitlements retain their accounts, so expiry of access does not explain an absent account. Only the documented credential-free public Devnet endpoint was verified available; no independent provider or credential was invented.

Confirmed frontend defects before this fix:

1. `submitted=true` was set before RPC acknowledgment, then every subsequent exception was replaced by the generic confirmation-unknown message. Explicit preflight rejection and transport uncertainty were conflated.
2. The SDK's public rejection details/cached logs were hidden, and the generic error helper truncated multiline error text.
3. A single transient status-read failure ended the advertised 120-second monitoring loop.
4. The app discarded `lastValidBlockHeight`, lacked pre-send expiry checks, and relied on elapsed time instead of chain validity for expiry classification.
5. A render-state busy flag and page-memory signature alone were insufficient to protect unresolved purchases across repeated events, wallet changes, or reloads.

[Solana's send documentation](https://solana.com/docs/rpc/http/sendtransaction) distinguishes RPC acceptance from confirmation; [latest-blockhash documentation](https://solana.com/docs/rpc/http/getlatestblockhash) provides the validity height. Backend and Security reviewed the proposed fixes before implementation. The installed SDK wraps multiple send JSON-RPC failures as `SendTransactionError`, so its class alone cannot prove preflight rejection.

## Implementation and acceptance

**READY for one separately authorized manual existing-offer purchase retry.** Frontend implementation, independent QA and Security/Reviewer reconciliation passed within this local/read-only scope. This verdict does not authorize signing or a live transaction.

Final executed acceptance:

| Check | Result |
| --- | --- |
| Configured Playwright regression suite | 154 passed, zero failed, four intentional separate-mode skips; 3.2 minutes, exit 0. Preserves all prior 96 checks and adds 58. |
| Separate missing-configuration browser checks | Two passed; 10.4 seconds. |
| Actual Devnet read-only desktop/mobile browser checks | Two passed; 15.8 seconds. Existing offer displays 0.001 SOL / 180 seconds; public buyer verification reports no entitlement and Studio stays closed. No wallet connection or transaction RPC is permitted. |
| Actual-config production build and TypeScript | Both exit 0; compilation 469 ms, build TypeScript 3.8 seconds, all four static pages generated. Actual program present, synthetic fixture absent. |
| Independent Security/Reviewer | PASS after source, regression, failure-history, build and public forensic reconciliation. |
| Protected files/artifact and final preview | No program/Solidity/Base/dependency changes; artifact SHA256 unchanged. Restored `http://localhost:3003/` and `/base` both HTTP 200; actual program present, fixture absent, server stderr empty. Lead visually reviewed actual desktop/mobile screenshots. |

The first typecheck's two nullability errors were corrected by capturing the validated program constant in closures. Initial regression results were 148 passed/six failed/four skipped: the six new diagnostic assertions matched Next's empty route announcer as well as the correct application error. QA preserved the failures, narrowed only those selectors and retained all error/no-send/width assertions; the complete corrected rerun passed. See `docs/SOLANA_QA.md` for commands and failure history.

Final independent public resample at `2026-10-10T22:28:35.853Z` through `22:28:38.032Z`, context `509691060`, still has a null historical purchase status, null confirmed/finalized transaction, absent buyer license, buyer 1.5 SOL and seller 7.298607118 SOL. Histories are unchanged; no purchase settlement is observed. The earlier root-cause limits therefore remain.

Evidence: `web/playwright-report/solana`, `solana-setup`, `solana-live`; ignored `web/test-results/solana-live/diagnostic-final-production-build.log`, `diagnostic-final-typecheck.log`, `diagnostic-final-public-forensics.json`, and desktop/mobile `*-actual-offer-verification.png`. Original failures are preserved under `diagnostic-first-run` results/reports.

| Requirement | Implemented boundary |
| --- | --- |
| Public RPC/simulation diagnostics | Bounded, nonthrowing formatter preserves the error message, structured execution detail and last eight cached log lines; removes control characters, endpoint URLs, credential-like text and long encoded payloads. React renders plain text and the existing error notice wraps on mobile. |
| Accurate transaction states | Constructed and wallet-signed messages precede transport; RPC-accepted is shown only after acknowledgment of the exact signature. Confirmed, finalized, explicit rejection/on-chain failure, expiry and unresolved states remain distinct, including storage/refresh failures after known outcomes. |
| Validity window | Public attempt records retain the original blockhash and last valid block height. Before sending, confirmed height/validity and wallet/offer identity are checked without changing or re-signing the message. |
| Bounded recovery | Transient public status reads retry within the monitoring deadline with bounded backoff. Status contexts must be valid and cannot go backwards. Confirmed observations remain sticky; elapsed time alone produces pending/unknown, never expiry. |
| Conservative expiry | After a possible send, expiry requires finalized height strictly beyond the validity limit, a subsequent successful historical status lookup with no confirmation and an invalid blockhash. Purchase protection is released only after a fresh canonical snapshot has no initialized entitlement. An existing entitlement, even expired, retains protection when the prior outcome is unresolved. |
| Duplicate protection | A synchronous action lock plus same-attempt Web Lock blocks repeated/cross-tab actions. Per-attempt public storage prevents unrelated writes overwriting records; records survive reload and wallet changes. State comparisons and cleanup are signature-specific. Storage failure remains closed. |
| Transaction integrity | The previously reviewed full-message equality and canonical captured-wire checks remain unchanged. Only the copied verified wire can be passed once to submission, with preflight enabled and `maxRetries:0`. No automatic resend/re-sign or signed-byte persistence. |

The recovery path checks an existing signature only and never initiates another transaction on the same click, even after resolving an old attempt. Web Locks require a supported secure-context browser such as Chrome on localhost; absent locking or unavailable recovery storage stops the action before broadcast. This is browser-local duplicate protection plus program-level active-license rejection, not cross-device coordination or production content authorization.

Files for this scoped fix:

- `web/components/solana-app.tsx`: submission/recovery integration, synchronous/cross-tab exclusion and existing error-notice wrapping.
- `web/lib/solana/transaction-state.ts`: public attempt records, safe diagnostics and expiry-aware read-only confirmation.
- `web/README.md`: behavior and evidence boundaries.
- `web/tests/solana/browser.spec.ts`, new `transaction-state.spec.ts`, and `live-read.spec.ts`: independent regressions and actual read-only offer/buyer browser verification.
- `docs/SOLANA_QA.md`, this report, `docs/STATUS.md`, `docs/HANDOFF.md`, `docs/DECISIONS.md`, and live-runbook notes: evidence and operator handoff.

Existing uncommitted integration work is preserved. No program source/artifact, Solidity, Base route, dependency manifest/lockfile or deployment configuration was changed by this fix.

## Operator stop gate

The local acceptance and independent review gate passed. Stop before any live transaction until the operator explicitly authorizes one manual purchase of the existing offer; this readiness report does not itself authorize a wallet request or transaction. Preserve the offer PDA and exact seller metadata, verify the distinct buyer and Devnet configuration, and inspect any future ambiguous signature before considering another attempt. Never blindly resubmit or replace an unresolved transaction. No remaining critical local functional blocker was found; original-error uncertainty, real Chrome/live settlement evidence, exact seller metadata availability and existing dependency advisories remain limitations/prerequisites. No new program deployment or authority action is needed.

After the final readiness gate passes and the operator separately authorizes one purchase:

1. Open `http://localhost:3003/` in Chrome with Phantom. Confirm the exact program above, Devnet, and buyer `GNqRCZsgYUAJtetw5PJZvgpkz663XoiQTfNajDxyJ2kS`. Do not use the seller or dedicated upgrade-authority wallet.
2. Select **Buy a license** and enter the existing offer `7EdfowQEZyVyyp7bYdQyzmprZtVU9mVba8cysHm2Ardh`. Paste the seller's original metadata JSON unchanged. Its hash must be `0xf9300ddb0b3dc043942d78fbe7c25b12c227b9dd1ac58373f401bda1d3b7b35a`; PACT must report matching terms, 0.001 test SOL, 180 seconds and the expected seller. Check the approval box only after review.
3. Verify the buyer has price plus entitlement rent and the current network fee. The earlier public rent quote was 0.00106172 SOL and the one-signature fee 0.000005 SOL, giving 0.00206672 SOL for an uninitialized entitlement; these are quotes, not guaranteed future costs. The last investigation found 1.5 SOL, ample for this demo. The existing offer requires no new seller transaction or offer rent.
4. Click **Purchase license** once. If PACT finds a protected prior attempt, this click performs read-only reconciliation only; it must not request a new signature. Resolve the displayed outcome first and stop on ambiguity. Do not delete recovery storage to bypass protection.
5. Only for a newly constructed transaction covered by the separate authorization, review Phantom and approve the intended Devnet purchase once. Preserve the displayed signature, diagnostics and Explorer link. Wallet-signed, RPC-accepted and finalized mean different things; an acknowledgment alone does not prove payment. Any unresolved outcome requires inspection, never automatic or blind resubmission.
6. After finalization, independently verify the transaction, exact 0.001 SOL settlement and buyer-bound entitlement. A fresh buyer snapshot should unlock Studio; switching to the seller must close it. Access expires 180 seconds from the program's purchase timestamp, rather than from the UI click or finalization. Checking expiry requires no transaction.

Manual Chrome checks still pending: actual Phantom approval/rejection, account switching during approval, the authorized send, finalized settlement, buyer unlock, seller exclusion and real-time expiry. Synthetic transaction regressions and public read-only browser checks do not establish these results.
