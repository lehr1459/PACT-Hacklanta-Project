# Final PostgreSQL concurrency corrections

Observed October26 evening in America/New_York (October27 UTC). These are reproduced engineering defects found during final acceptance. This record does not replace exact-revision CI or approve hosting.

## Protected access and telemetry

Proposed-merge [run40437171434](https://github.com/lehr1459/PACT-Hacklanta-Project/actions/runs/40437171434) checked out `91db8101b5e632be49c4f289e9ec6afda856d190`, whose tree exactly matched feature commit `0f7e49bc77909cb3c4033a48fc5ea0d05a0d0a10`. Native acceptance passed84/85 cases; bounded diagnostics located the legitimate concurrent-load HTTP200 assertion. The separate push job passed. A green repetition alone did not establish a correction.

The diagnostic push at `db9ce19a838e7f664b460e9c2e9ab20b2cb8f868`, [run40438425939](https://github.com/lehr1459/PACT-Hacklanta-Project/actions/runs/40438425939), identified `DATABASE_UNAVAILABLE`/HTTP503. PostgreSQL deadlock statements showed application-row locking waiting on a telemetry audit insertion and the inverse owner-row wait.

Protected verification locks the account before its application. Telemetry previously inserted usage rows first, whose foreign keys acquire an application key-share lock, then inserted an audit event requiring an owner key-share lock. Concurrent transactions could therefore hold one parent while waiting for the other.

The fix explicitly acquires the account key-share lock before telemetry writes. Existing protected/control `FOR UPDATE` locks, foreign keys, transactions and error handling remain intact. There is no retry, discarded-observation workaround, capacity/deadline increase or freshness extension.

The new Phase4 regression forces the interleaving using actual PostgreSQL lock observations and `pg_blocking_pids`. Before correction: application wait, one SQL40P01 and protected HTTP503. After correction, the identical test observes an owner wait, zero deadlocks, HTTP200/ALLOW and zero telemetry failures. Focused Phase4 plus actual-host-clock load validation passed21/21 cases, without skips.

## Reauthentication and an existing session

Independent review found a separate reachable cycle. Reauthentication locks the account before retiring the old session. The former joined `lockSession` query could lock that session before waiting for its account. Two legitimate tabs could deadlock without forged credentials.

The fix explicitly locks the active account first, then the exact token/account session with no revocation and a fresh expiry. Original lease checks, signed-proof bindings, final guards and full row locks remain. A request queued behind successful reauthentication must fail401 using its retired session; its proof must not migrate to new authority or modify the application.

The new Phase1 regression holds the real login's account lock, observes the concurrent mutation waiting, and uses a separate observer's `NOWAIT` probe to establish whether the old session is already locked. Before correction: one SQL40P01, login200 and mutation503. The identical test afterward: zero deadlocks, login200 and mutation401/`AUTH_REQUIRED`, with saved state unchanged and old-proof reuse denied. Complete Phase1 native validation passed12/12 cases, without skips.

## Evidence and remaining gates

Both regressions are mandatory: the native minimum increases from85 to87. All original cases remain. The parent still requires successful child exit and complete unskipped TAP counts. Diagnostic output reconstructs only fixed filenames, bounded coordinates/counts, allowlisted error codes and HTTP status integers, bound to actual source revision, run and source fingerprint. Raw assertions, proofs, secrets, backups and private fixture configuration stay ignored.

The subsequent incomplete-body investigation establishes a separate transport-test race: Node starts its seven-second receipt guard before headers finish, while the service starts its seven-second deadline after headers. The previous test incorrectly required only the service's503 response. Two mandatory cases now independently force the native408 and service503 paths, assert connection closure, released admission and no authentication writes, and retain the existing native limits. This additional case raises the native minimum to88; it changes no production timeout or entitlement freshness limit. Independent local replay passed5/5 cases with zero skips, including native408 at7044ms and application503 at210ms. See `services/pact-api/CONTRACT.md` for the distinct response contracts.

Local red/green observations bind recorded file hashes on the `db9ce19` working-tree base; they are not final-commit CI receipts. The clean committed revision still requires the complete hosted matrix, production artifact/container smoke and all four proposed-merge GitHub jobs before normal merge.

The earlier `cc1f7d2` console-only failure had no retained coordinate and its complete PostgreSQL log had no deadlock marker. Its historical cause is **not established** by these fixes. Windows console repetition passed48 cases; bounded browser failure coordinates now support investigation if it recurs. Do not claim every historical failure shared this cause.

No API/SDK wire contract, migration, Solana program, Base contract, deployment setting, wallet approval or blockchain transaction changed. Provider-hosted operation and real Phantom/device acceptance remain separate owner gates. Node review remains November5, 2026 at00:00UTC; dependency exceptions expire November15 at00:00UTC.

## Local Windows fixture launch and failure cleanup

The ff20a23 local full hosted attempt returned database-unavailable failures and then hung in consumer fixture setup. Narrow probes establish connection acquisition expiring before TLS: TCP connected in 1 ms, no SSL response arrived before the unchanged 1,500 ms connection guard, and no query was executed on those failed connections. Five credential-free SSL-request samples took 685–1,265 ms before restarting the disposable cluster. Restarting the same PostgreSQL 18.6 binary/data/TLS/durability configuration with a minimal environment, native Windows executable paths and an explicitly hidden console reduced five samples to 21–132 ms. This establishes a local launch-environment problem; it does not attribute the difference to an unmeasured OS component. No security setting, timeout, TLS validation or database durability limit was relaxed. A failed intermediate launch with forward-slash executable/ComSpec paths is retained as a launcher error.

The failed setup also exposed an independent test-resource leak. The consumer proxy now registers cleanup before initializing its API fixture. Access-fixture initialization now attempts closure of every allocated API/database/RPC resource and rethrows the original error. A mandatory native regression forces both early and post-listener failures and checks exact error identity, closed database state and refused API/RPC connections. The new minimum is 89 cases. Focused control-plane plus consumer acceptance passed 15/15 with zero skips on the corrected local launch. The incomplete full attempt and failed diagnostic attempts are retained; they are not counted as passing acceptance.

Both ff20a23 Linux hosted push and proposed-merge jobs independently passed their full 21-command hosted matrix, including 16 console and 12 Connect cases, before the cleanup-only correction. This does not establish the cause of the historical Linux console-only failure. The bounded diagnostic instrumentation is retained, its historical cause remains unproven, and all final-source local and proposed-merge CI gates must still pass.
