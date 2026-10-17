# Wallet and accessibility acceptance

This is the operator checklist for the current Solana Devnet integration. Fixture results, actual wallet observations and human authorization are separate evidence. **No real Phantom approval, message signature, transaction signature or broadcast was performed by the agent for this checklist.** Items requiring those actions remain **HUMAN ACTION REQUIRED** until a human records an observation. A prepared checklist is not a completed wallet acceptance report.

## Prepare the session

Record UTC time, source commit, SDK version/tarball SHA-256, browser/OS, Phantom version and device. Confirm the intended same-origin application configuration, Devnet genesis and program identity through the [release procedure](SOLANA_RELEASE.md). The current local program artifact and the historically deployed artifact are distinct; do not infer deployment from a local build. Use an approved deployment and its documented compatibility evidence. This checklist does not authorize an upgrade.

Use distinct seller **S** and buyer **B**, disposable public demonstration terms, and sufficient Devnet test SOL for the offer price, network fee and entitlement-account rent. Testnet assets have no monetary-value claim. Never record seeds, private keys, session/binding cookie values, authentication signatures or sensitive metadata. Inspect cookie flags without copying values. Public offer/transaction references may be retained in the operator's restricted evidence record.

Run the locked fixture suites first. Disable synthetic providers when opening an actual wallet session. Never present a fixture transaction signature as a network receipt. A real desktop extension and an actual mobile Phantom environment require separate records; Pixel7 browser emulation does not validate mobile-wallet handoff.

## Human-run wallet checks

| Step | Expected observation | Status before operator execution |
| --- | --- | --- |
| Open marketplace/embedded checkout without interaction | No connection, authentication or signing prompt; access closed; missing-extension guidance explicit | Not executed with real wallet |
| Explicit connect, reject, retry | Rejection closes safely; a separate connect action shows the intended full public identity | HUMAN ACTION REQUIRED at wallet prompt |
| Disconnect and switch S/B | Old access closes, consent clears, fresh identity-bound state required; no automatic purchase | Human UI check pending |
| Seller metadata review | Exact public JSON, commitment, integer price and duration agree; consent is deliberate | Human review pending |
| Seller create transaction | Human reviews Devnet/program/accounts, price and fees; rejection causes no submission; an approved attempt records its original signature and actual finalization/offer PDA | HUMAN ACTION REQUIRED for signing/broadcast |
| B opens seller link/manual metadata | Exact bytes match the commitment; consent initially unchecked; edits/reload clear consent; incorrect metadata prevents purchase | Human review pending |
| Buyer rejects purchase, then separately approves | Rejection grants nothing. Human reviews the transaction before approving a separate attempt; no automatic replacement approval | HUMAN ACTION REQUIRED for signing/broadcast |
| Settlement and entitlement | Finalized signature verified independently; seller receives exact price, B pays price plus actual rent/fee; canonical B-bound entitlement and expiry match; seller wallet alone does not impersonate B | HUMAN ACTION REQUIRED for preceding transaction; subsequent reads are read-only |
| Same-origin message authentication | Human reviews exact origin, Devnet genesis, program, B, expiry and no-transaction purpose; rejection leaves server access closed; successful proof alone does not bypass license checks | HUMAN ACTION REQUIRED for message approval/signature |
| Private asset/operation | Server policy selects the offer; authenticated fresh B entitlement grants the configured request; arbitrary public address lookup cannot grant it | Human observation pending after proof |
| Logout, switch, disconnect, hidden/offline and RPC failure | Old result closes; returning requires current state and a new proof where invalidated; no stale grant | Human observation pending |
| Exact expiry and optional repurchase | Asset/operation denied at expiry. A new purchase is a separate manual decision with new approval | HUMAN ACTION REQUIRED for any new transaction |
| Seller deactivation | New purchases blocked while an existing unexpired B license remains valid | HUMAN ACTION REQUIRED for deactivation transaction |
| Uncertain purchase/reload/second tab | Original signature remains protected; status checks never sign/resend. Only finalized lifetime evidence plus the exact unchanged missing/initialized baseline can release expiration protection | Real uncertainty scenario not executed; human-approved scenario required |

Do not manufacture a live uncertainty scenario by repeatedly submitting. Prepare the interruption and recovery steps first; preserve the original public signature and journals. A timeout, absent status or an expired blockhash alone does not permit a retry. Fixture uncertainty coverage remains distinct from this human record.

## Focused accessibility checks

Automation checks keyboard activation, native details, invalid-field descriptions visible while focused, wizard focus, verification busy/result semantics, default widget focus contrast, conditional wallet-control focus handoff, stable live-region text, desktop/Pixel7 and 320px reflow, and forced-colors/reduced-motion behavior. See [validation commands](VALIDATION.md#focused-accessibility).

Human checks still required:

- With keyboard alone, traverse forward/backward through tools, inputs, metadata details, consent, purchase/recovery and links; focus remains visible and order follows the task.
- With an actual screen reader, verify labels, error descriptions, busy/result announcements, purchase/confirmation/uncertainty messages and expiry closure. Stable polling must not repeatedly interrupt speech. DOM semantics alone do not prove announcements.
- Inspect real Phantom popup/dialog naming, keyboard containment, Escape/rejection and focus return. PACT has no application-owned wallet modal; the native extension UI is outside the fixture DOM.
- Test actual browser zoom at 200% and 400%, platform text scaling and narrow mobile orientation. A 320px viewport is reflow evidence, not proof of native zoom behavior.
- Verify meaning without color: active/expired/locked, metadata mismatch, unavailable/failed and progress all have text. Confirm focus/error visibility with the OS's high-contrast settings.

## Evidence record

For each row record `PASS`, `FAIL`, `BLOCKED` or `NOT EXECUTED`, UTC, environment/commit/artifact identity, expected versus observed behavior and a redacted attachment/reference. Leave unavailable human steps pending. Record automation command, exit/counts and exact receipt separately. Any failure must retain its original evidence and a distinct corrected rerun; never relabel an earlier failure as a pass. No full screen-reader, native zoom or real-wallet acceptance claim follows from passing fixtures.
