# API-first integration implementation evidence

This is a live engineering record, started 2026-10-19. Pending rows are not completion claims. Source specification: [master plan](MASTER_PLAN.md). Current branch: `codex/api-first-integrations`. Existing public deployment, Solana program and isolated Base fallback are preserved.

## Checkpoints and phase gates

| Phase | Commit / gate | Evidence |
| --- | --- | --- |
| Preservation | `9074ddd` | Preserves the sole pre-existing `web/next-env.d.ts` change on the dedicated feature branch. Foundation remains `57b425f`. |
| 0: architecture/security | `37e0275` — PASS design | [ADR](ADR.md), [architecture review](ARCHITECTURE_REVIEW.md), [security review](SECURITY_REVIEW.md), [QA review](QA_REVIEW.md). Separate hosted model and custom protocol are explicit. |
| 1: persistence/control plane | `6e02504` — PASS locally | PostgreSQL migration, durable wallet-admin sessions, exact transactional action proofs, owner-scoped apps, callback DNS renewal/revoke, server credentials and rotation/revoke. Service7/7, independent native-PG HTTP11/11, security9 checks plus callback lifecycle pass. |
| 2: seller/resource policy | PASS locally; focused commit follows this record | Actual hardened reader verifies active seller-owned offers; immutable resource keys, signed version preconditions, policy history/epochs and outage-safe disable. Service10/10; independent combined PG/HTTP/SDK18/18; security interleaving3/3. |
| 3: hosted buyer identity | Pending | No completion claim. |
| 4: access decision engine | Pending | No completion claim. |
| 5: integration console | Pending | No completion claim. |
| 6: contracts/docs/examples | Pending | No completion claim. |
| 7: reliability/security/operations | Pending | No completion claim. |
| 8: complete validation | Pending | Exact new-commit remote CI also requires authorized push/run. |
| 9: staging/wallet acceptance | Preparation only | [Owner checklist](STAGING_AND_PILOT.md). No hosting or wallet action authorized. |
| 10: controlled pilot | Preparation only | Owner decisions and invitation/rollout approval required; no external app edits. |

## Verified foundation evidence

Independent QA inspected GitHub run [39017755163](https://github.com/lehr1459/PACT-Hacklanta-Project/actions/runs/39017755163): both required `node-and-browser` and `pinned-chain` jobs succeeded at `57b425f148e65840c23283b4283ce1e22ccb45bd`. This does not validate later feature commits.

The local replay used verified portable Node24.22.0/npm11.19.1. Node executable SHA256 matches `scripts/validation/runtime.json`; global Node24.11.1 was not modified. At feature revision `37e0275`:

- `scripts/validation/run.mjs environment`: PASS.
- `scripts/validation/run.mjs node`: PASS, including SDK625 tests, existing API/auth and repository policy suites.
- `scripts/validation/run.mjs all-chain`: PASS, including compiled Solana43 tests, Base23 tests and committed/compiled artifact checks.

Raw ignored receipts are in `web/test-results/validation/{environment,node,all-chain}/results.json`, with baseline captures under `web/test-results/hosted-qa-baseline`. These are local Windows targeted receipts, not clean final feature-release or new remote CI results.

An existing `web/.env.local` was detected by existence only and preserved without reading. Final release builds/browser validation must run in an isolated clean committed checkout. Never copy workstation environment files into that checkout.

Independent QA installed disposable native PostgreSQL18.4 under ignored tooling, verified the archive against registry SHA512, and restricted it to loopback with test-only credentials. Separate SQL fixture probes demonstrated competing-client one-use consumption, restart persistence and an isolated cold-copy restore. Those tooling probes are not by themselves platform-authentication, migration, backup or restore-epoch acceptance.

## Phase1 implementation and review

`services/pact-api` adds a private persistent Fastify/pg service and checksum-bound SQL migration. PGlite is local/test only. Native Ed25519 exact-message signatures authenticate admins; keys use externally peppered HMAC verifiers and once-only reveal. Sensitive configuration changes consume session/app/action/payload-bound proofs transactionally. SQL row locks serialize quotas and concurrent partial edits. Callback registration never fetches a URL; bounded DNS proof renewal/revoke preserves explicit control.

Root ran pinned `npm --prefix services/pact-api test`: **7/7 PASS**. QA ran `node --test scripts/hosted-qa/phase1.test.mjs` against native PostgreSQL and actual loopback HTTP: **11/11 PASS**. Coverage includes two tenants, wrong payload/session/wallet, signature replay/races, strict Origin/CSRF, callbacks and DNS fixtures, once-only keys, overlap/zero-overlap rotation, revoked/disabled/paused authority, quotas, restart and DB outage. Root inspected actual implementation and receipts. Independent security ran nine additional checks and the final callback lifecycle; its [Phase1 disposition](SECURITY_REVIEW.md) is PASS locally.

Review defects were fixed before acceptance: stale partial app updates restoring old active status, concurrent/rotation quota bypass, unbounded unsettled DNS resolution, incomplete topology markers and disabled-account authority. The final service graph's initial audit returned zero vulnerabilities; SDK addition in Phase2 requires a new assessment. No license ALLOW, hosted buyer authentication or console completion is asserted by Phase1.

## Phase2 implementation and review

Migration002 adds server-owned resources and immutable version history. The persistent public SDK reader verifies Devnet genesis/program/PDA/owner/Clock, active offer and seller equal to proven admin before binding. Every binding/update has an exact action signature; `expectedVersion` prevents overwriting intervening policy changes. Epoch increments will invalidate existing grants when Phase3 implements them. Disable-only mutations remain available during RPC outage. Snapshot freshness is checked again after SQL history/audit work before transaction completion; stored verification time is the actual SDK snapshot time.

Root's pinned service suite: **10/10 PASS**. Independent QA: **18/18 combined Phase1–2 PASS** against native PostgreSQL, actual HTTP and independent synthetic wire RPC passed through the real hardened reader. Wrong seller, missing/inactive offer, wrong genesis/program/Clock, RPC failure, malicious selectors, immutable-key/tenant attacks and concurrent version updates deny. Security separately tested account disable and proof expiry during the chain read with rollback/unchanged epoch, plus resource tests: PASS. Expirable action proofs do not constrain retention of policy history through a foreign key.

The hosted service's local SDK file link is outside its own audit graph. Security explicitly reviewed **both** graphs: new service graph zero findings; linked SDK four existing moderate findings, zero high. Actual imported paths retain reviewed UUIDv4-only/no stream-json reachability; bounded exceptions still expire November15. This is not a zero-vulnerability claim. SDK source/exports, protocol/program and Base remain unchanged.

## Evidence boundaries

Implemented locally, CI verified, staging accepted and human acceptance are separate categories. Synthetic Ed25519 proofs and RPC fixtures must remain labeled synthetic. No real Phantom prompt, transaction, staging host, live DB/provider, deployment or publication has been accepted by this record.

Human decisions: approved hostname/TLS/gateway, persistent host and PostgreSQL provider, secret manager, private RPC costs/capacity, operators/contact/on-call, privacy/terms/retention/account recovery and SDK distribution rights. Exact gates are in the staging/pilot checklist.

Review the announced Node security release by **2026-10-21**. Reassess dependency exceptions by **2026-11-15**, earlier if new dependencies change reachable surfaces. Neither date is extended by this project.
