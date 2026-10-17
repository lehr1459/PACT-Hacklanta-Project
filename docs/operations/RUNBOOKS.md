# Operating procedures

These procedures apply to the verified local snapshot and the supported customer-hosted single persistent Node model. They authorize no deployment, chain transaction, wallet approval or publication. Roles describe responsibilities; the owner must assign actual people and private contact channels.

| Role | Responsibility |
| --- | --- |
| Release owner | Approve configuration, package/archive hashes, licensing/distribution and rollback decision. |
| Service operator | Verify runtime/topology, origin/TLS, RPC configuration, process health and redacted evidence. |
| Chain custodian | Independently verify upgrade authority and approve any separate chain operation. |
| Security contact | Receive private reports, coordinate containment/disclosure and preserve evidence. |

## Startup and shutdown

Verify the outer archive hash through a trusted channel, then run archive verification and relocated smoke using the pinned runtime. Keep the loopback port from the binding free. A stale build, changed public environment or missing critical hosted configuration must fail startup. Preserve the failure receipt; fix configuration or rebuild the full candidate rather than editing compiled files.

For any future hosted service, verify a single persistent process before enabling auth, correct TLS/proxy forwarding, exact public origin and server-owned offer/resource policy. Configure secrets outside the archive. Start one supervised Node process; stop that owned process gracefully, then use a bounded process-tree shutdown if necessary. Never kill an unidentified process to free a port. Browser journals survive a server restart; sessions and challenges do not.

## Health and RPC outage

Marketplace `GET /api/v1/health/live` checks the running handler without RPC. `GET /api/v1/health/ready` performs bounded identity/Clock/program checks and reports configured authentication capability without granting a session. The platform example uses the `/api/pact` prefix instead. Successful liveness alone is not chain readiness or proof of a particular deployed ELF. Readiness is read-only and can fail on network or provider problems.

On repeated readiness failure, keep protected access closed, distinguish process failure from RPC timeout/wrong genesis/invalid accounts, and record only error codes/status/duration. Do not log private provider URLs. Validate a separately reviewed `SOLANA_RPC_FALLBACK_URL`; one full attempt must settle before fallback under the original deadline. Never switch network/program or weaken freshness to restore availability. Rotate a private RPC endpoint through validated runtime configuration; public endpoints/settings require a new bound build.

## Available diagnostics

The handler returned by `createPactApiHandler` has an in-process `handler.metrics()` method. It returns frozen snapshots of request counts by fixed operation, status class and terminal failure category; latency bins; observer pending/dropped/failure counts; and HTTP, RPC and authentication gauges. Counters are process-local and reset at restart. No public metrics route or external collector is supplied. Keep operator access to snapshots separate from customer endpoints.

`latencyMs` bins are **disjoint**: `le5`, `le20`, `le100`, `le500`, `le1000`, `le5000`, `over5000`. For example, `le20` counts requests over 5 ms and at most 20 ms. The bins sum to the request total; they are not cumulative Prometheus histogram buckets. Derive percentile bounds from bins or collect reviewed diagnostic events for actual percentiles. Do not report exact p95 from a coarse bucket alone.

Optional `diagnostics.onEvent(event)` receives only the flat allowlisted schema version, server-generated UUID request ID, fixed operation/method, HTTP status, duration and coarse failure category. The response exposes that UUID as `x-pact-request-id`; caller-provided identifiers are not trusted for correlation. Events omit URLs, endpoints, wallets, offers, signatures, cookies, payloads and agreement text.

Hooks run synchronously and are not awaited. Keep them bounded and nonblocking; an arbitrarily slow synchronous callback can still block Node. Return only `undefined` or a native Promise. At most four unsettled promises are retained; further events increment `observer.dropped`. Throws, rejections and unsupported thenables are isolated and counted, without changing the response. Alert on observer failures/drops and bound your own logging queue and retention. The SDK retains no event history.

RPC gauges expose `inflight`, `queued` and `quarantined` for public and protected pools. This release does **not** provide per-endpoint attempt or failover counters. A terminal success can follow fallback, so success totals cannot be called primary-provider health or failover counts. Use terminal success/failure categories, readiness results, latency and saturation gauges for the available operating gate; collect separately reviewed provider-side evidence if endpoint-level diagnosis is required.

## Authentication store and resources

Challenges, sessions, request budgets and operation counters are ephemeral. Restart, crash, process replacement or a second replica loses or splits this state. Reauthenticate after restart. Do not restore an old session map or claim distributed consistency. Identity proof with disabled policy grants no entitlement or protected resource rights. Resource authorization requires a fresh server-owned offer check immediately before delivery/commit; wallet connection and browser UI state are insufficient.

If hidden/offline state, account change, RPC failure or expiry closes access, preserve that closure. Do not manually set `authorized`, bypass the final resource check or add retries that perform a side effect twice. Current prepared operations commit synchronously in this process; cross-service/database atomicity is unsupported.

## Purchase uncertainty

Do not delete or edit a pending checkout journal merely because the user waited or an RPC timed out. Do not automatically request a wallet signature or resend a transaction. Recover the same transaction incarnation through the public read-only recovery API. A confirmed attempt remains protected until definitive finalization; expiry release requires the exact recorded baseline and finalized uncertainty checks. Legacy records lack a safe expiry baseline. Preserve incompatible, partial or conflicting records for recovery. Ask the user to inspect their wallet only through normal explicit interaction; never approve a prompt for them.

## Metadata and data restoration

Accepted metadata commitments bind exact UTF-8 bytes. Preserve accepted bytes in the customer's separately managed content system. Reformatting JSON can invalidate a commitment even if fields look equivalent. No metadata registry, database or durable customer content store is supplied by this repository. Restore externally retained accepted bytes and verify their hash before presenting terms. Do not reconstruct a legal agreement from a hash or claim recovery of missing content.

There are no repository database migrations or server database backups to restore. Keep verified archives, outer receipts, configuration requirements and redacted incident evidence separately. Never include wallet credentials or copy browser private/session data into a release. Server session restoration is intentionally unavailable.

## Deployment mismatch and authority

The historical inspected Devnet ELF (`d13828b0…`) differs from current local reproducible SBF (`408580c1…`). A current-artifact identity check must fail until an independently authorized upgrade actually happens. Preserve the historical receipt's `current:false`; never relabel it as current deployment evidence. The observed public upgrade authority does not prove who controls it, custody procedures or multisig governance. An upgrade requires separate owner/custodian approval and read-only identity review before and after; this runbook performs none.

## Rollback

Select the previous trusted archive, runtime and matching environment binding as one unit. Verify hashes, extract to a new directory, install locked runtime dependencies and smoke before replacing a process. Restore the prior process/config only after the release owner approves. A rollback invalidates sessions and requires reauthentication. Preserve purchase journals and use recovery against actual chain state. Web rollback does not reverse on-chain purchases, upgrades, expiry, ownership or payments. No chain rollback or data deletion is part of this procedure.

## Security disclosure

Keep a suspected exploit private while the designated security contact assesses it. Record affected revision/package/archive hash, reproducible steps, error codes and redacted timestamps. Never request seeds/private keys or include private RPC credentials, accepted legal text, session cookies or personal data. Contain by disabling protected policy or stopping the affected process, not by weakening authentication. The release owner decides notification, fix and coordinated disclosure with the security contact. A real reporting contact and response rota must be established before hosting.
