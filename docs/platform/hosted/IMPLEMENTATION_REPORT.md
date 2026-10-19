# API-first integration implementation evidence

This is a live engineering record, started 2026-10-19. Pending rows are not completion claims. Source specification: [master plan](MASTER_PLAN.md). Current branch: `codex/api-first-integrations`. Existing public deployment, Solana program and isolated Base fallback are preserved.

## Checkpoints and phase gates

| Phase | Commit / gate | Evidence |
| --- | --- | --- |
| Preservation | `9074ddd` | Preserves the sole pre-existing `web/next-env.d.ts` change on the dedicated feature branch. Foundation remains `57b425f`. |
| 0: architecture/security | `37e0275` — PASS design | [ADR](ADR.md), [architecture review](ARCHITECTURE_REVIEW.md), [security review](SECURITY_REVIEW.md), [QA review](QA_REVIEW.md). Separate hosted model and custom protocol are explicit. |
| 1: persistence/control plane | `6e02504` — PASS locally | PostgreSQL migration, durable wallet-admin sessions, exact transactional action proofs, owner-scoped apps, callback DNS renewal/revoke, server credentials and rotation/revoke. Service7/7, independent native-PG HTTP11/11, security9 checks plus callback lifecycle pass. |
| 2: seller/resource policy | `816c167` — PASS locally | Actual hardened reader verifies active seller-owned offers; immutable resource keys, signed version preconditions, policy history/epochs and outage-safe disable. Service10/10; independent combined PG/HTTP/SDK18/18; security interleaving3/3. |
| 3: hosted buyer identity | `cfb973c`, `e581819` — PASS locally | Limited custom backend-initiated login, strict message proof, one-use codes/PKCE/issuer, grants/revoke, fixed Next gateway and actual connect page. Service16/16; combined native-PG/HTTP/gateway36/36; production browser12/12. |
| 4: access decision engine | `3772d0b` — PASS locally | Backend-only key/grant/resource authorization through the unchanged hardened reader. Independent combined native PostgreSQL/HTTP/gateway/actual SDK55/55. Root post-fix service19/19; independent security3/3 and review PASS. |
| 5: integration console | PASS locally; focused commit follows | Functional owner console and preserved generator. Service29/29, independent console16/16, connect12/12 and native-PG/API55/55; QA/security PASS. |
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

## Phase3 implementation and review

Migrations003–004 add durable login/challenge/code/grant state and callback incarnations. Two independently instantiated services with separate PostgreSQL pools redeem one code exactly once. The app backend initiates the request, keeps state/PKCE/session authority, validates issuer and exchanges the short-lived code using its scoped key. Grants are app/environment/wallet/epoch bound, server-side only and revocable. This is custom private-pilot authentication, not OAuth/OIDC/SIWS conformance or public SSO.

The dynamic `/connect` page shows actual app, verified requesting website, issuer, purpose, wallet and exact SDK-bound message before an explicit sign action. Cancel, refusal, hidden page, account switch and expiry invalidate pending UI work. The fixed operator-configured `/v1` gateway preserves required cookies/Origin and strips forwarding/CORS headers; it bounds bodies/deadlines, refuses redirects and never retries mutations. Existing `/api/v1` remains unchanged.

Root's complete service suite: **16/16 PASS**. Root replayed independent native-PG/HTTP/gateway tests: **36/36 PASS**. Independent QA built a separate consumer backend whose own HttpOnly session retains state/PKCE and grant, then ran actual production Next/gateway browser flows: **12/12 PASS** at desktop1280 and narrow320px. Fresh nonce CSP, framework hydration, keyboard focus, no page overflow, no CSP/console failures and no browser key/grant exposure were checked. Root inspected the narrow rendered screenshot. Production build and typecheck pass in an isolated checkout, leaving the workstation `.env.local` and root `.next` untouched.

Production source was built from isolated local validation snapshot `7b71af9d112e3b61e9f2417f156c9da9e9ac7600` (a temporary local commit object, not a release/remote receipt). QA corrected only harness startup environment/import and alert selector issues after that build: Next's empty route announcer matched an unscoped alert locator. The intended error text and denial assertions were preserved; no product/CSP policy was relaxed. Final code/fixtures are included in the focused feature commit. Final Phase8 clean committed-checkout validation remains required.

Security review fixed wallet-switch code issuance while old verification awaited locks, callback/key expiry during grant insertion, callback revoke→renew resurrection, and cross-issuer reuse with the same DB/pepper. Every verifier now includes canonical issuer origin; changing origin requires new authentication/keys/domain proofs. Whole Phase3 security disposition is PASS locally after inspecting browser receipts and independently executing code/gateway/race/issuer cases. Same-origin restarts retain state; foreign-issuer authority denies in both directions.

Strict CSP exposed the existing external font import and Next image inline styling. The same font families/weights are now self-hosted from pinned Google Fonts commits with verified SHA256 and adjacent OFL notices, and new hosted branding uses a plain image. Remaining marketplace tokens/layout and original brand component are unchanged. Full marketplace/font regressions remain in Phase8. No actual Phantom popup, assistive device, external DNS, hosting or remote CI was accepted.

Phase7 must additionally harden durable authentication against host-clock rollback across process restarts; current time checks are monotonic within a process and hosting requires a synchronized trusted clock. This is an explicit reliability/security acceptance item before any pilot, not a claim of distributed clock safety.

## Phase4 implementation and review

`POST /v1/access/check` derives application, wallet and offer from the key, app-scoped grant and saved resource. The lifetime SDK reader supplies fresh account/Clock/provenance evidence. After RPC completes, a locked SQL transaction checks current owner, app, key, grant, policy epoch and resource version; a synchronous final guard preserves the original read age and hard credential/grant expiry. An ALLOW's advertised deadline also stops at the earliest key/grant, license, read-age or progress deadline. There is no positive authorization cache.

Known missing/expired entitlements return typed DENY with an existing offer-only marketplace URL and an explicit requirement for the seller's exact metadata bytes. Resource disable, invalid authority, uncertain chain state and database failure deny. Offer deactivation preserves existing unexpired entitlements. Readiness now verifies every migration checksum and the actual chain reader. Redacted bounded asynchronous usage, reason counts, latency and audit collection cannot change an access result.

Independent QA's combined native PostgreSQL/actual HTTP/gateway/SDK suite is **55/55 PASS**, including 19 new Phase4 checks. Root inspected the implementation, initially replayed 13 access checks, and ran the complete post-fix service suite: **19/19 PASS** (`phase4-service-root-final.log`). Reservation tests verify independent application admission, protected SQL capacity during control saturation, bounded key/app quotas, RPC timeouts and protected HTTP access during incomplete-body floods.

Review found and fixed an aborted-request admission leak and a response freshness deadline that initially omitted key/grant expiry. The regression now confirms abandoned body slots release exactly once while unsettled handler work retains capacity; a disconnected request cannot later enter a new handler after its admission was released. Original read freshness cannot be reset by SQL or telemetry delays. Raw receipts, including the initial failure, remain under `web/test-results/hosted-qa-baseline`. Independent security executed all three access tests and inspected the final combined QA receipt: local Phase4 PASS. Phase7 still must verify durable clock rollback protection and total-handler/slow-body deadlines; bounded individual SQL/RPC work does not establish a universal ten-second handler limit.

## Phase5 implementation and review

The additive Hosted API entry on `/integrate` opens `/integrate/developer`; the original generator and controls remain at the original route with a self-hosted anchor. The new dynamic console uses the fixed gateway, fresh nonce CSP and existing visual identity. Developers explicitly connect, review and sign administration messages. Every sensitive action displays its exact payload and message, checks the proven/connected wallet and consumes the existing signed backend contract.

The console uses real app, callback/DNS, resource/version history, credential/rotation/revocation, usage, audit, settings and readiness routes. Public account/app-scoped registration, callback and resource drafts resume in this tab's session storage; an allowlist, size bound and known-platform-secret/proof rejection keep sensitive state out. Logout/account changes and successful submissions clear the relevant drafts. Secret/DNS values appear once in memory, clear on hidden/navigation/wallet/session transitions, and never enter generated templates. Copy feedback is bound to the actual value copied. API credentials and grants never perform browser authorization.

Onboarding notices derive from saved records, key/callback expiry and recorded usage. An existing bound-offer selector supports reuse, while a new offer requires canonical address entry and a fresh server-side seller check. There is no invented discovery or incident-alert endpoint. Test console distinguishes actual read-only database/chain readiness, configuration metadata, synthetic appearance previews and missing customer-backend receipts. Complete runnable integration examples remain Phase6 work.

Review fixed cached-app/session mixing, actual `AUTH_REQUIRED` cleanup, resource-history busy state and once-secret app/key binding. The service credential list now prioritizes every active/unexpired key before bounded recent history, avoiding a hidden old active key after many rotations. Root and security independently ran its regression with 55 newer expired records: **1/1 PASS**, including signed revocation. Security separately passed seven public-draft boundary checks.

Adversarial review then reproduced seven late-expiry cases in the actual SQL implementation: generic signed mutations, draft creation and admin login could cross proof/session expiry during final writes. The corrected control plane locks and revalidates the current session/account, then checks the relevant hard proof/session deadlines after awaited writes/audit and before transaction completion. Root's checked-in temporal regressions pass **9/9**, including logout/account disable between preliminary lookup and locked draft creation. The independent seven-case reproduction now returns401 with complete rollback. The complete post-fix service suite passes **29/29**.

Pinned no-write TypeScript validation and the guarded production build pass in isolated checkout `web/test-results/hosted-web/phase5`, final product snapshot `8c70ae170e0de851edab4ee2b0669e1300b55edd`. This is a local validation object, not a release or remote-CI receipt. Next's generated type-reference update occurs only in that candidate; the preserved workstation file is untouched. Independent console **16/16**, connect regression **12/12**, and combined native PostgreSQL/API/gateway **55/55** pass; independent QA and security accept Phase5 locally. The browser suite exercised missing-license denial, fresh allowance, usage/audit, readiness outage/recovery, app pause, keyboard controls and narrow320 layout. Root inspected the sanitized desktop/narrow screenshots.

Browser review fixed the resource input's literal hyphen for modern HTML pattern syntax. Subsequent harness-only corrections use exact accessible roles and await actual focus/actionability without weakening product assertions. The aggregate artifact audit checked116 files across10 preserved directories against169 known proof hashes: no platform secret, binding, signature or recording found;15 source-only error contexts contain zero page snapshots. Receipts are `phase5-service-root-final.log`, `phase5-console-final-passed.log`, `phase5-connect-regression-final.log`, `phase5-native-pg-combined.log`, `phase5-artifact-audit.log` and `phase5-qa-typecheck.log` under the ignored baseline directory. Actual Phantom/device acceptance and full marketplace regressions remain later gates. [Local testing instructions](LOCAL_TESTING.md) cover starting the two local processes without deploying anything.

## Evidence boundaries

Implemented locally, CI verified, staging accepted and human acceptance are separate categories. Synthetic Ed25519 proofs and RPC fixtures must remain labeled synthetic. No real Phantom prompt, transaction, staging host, live DB/provider, deployment or publication has been accepted by this record.

Human decisions: approved hostname/TLS/gateway, persistent host and PostgreSQL provider, secret manager, private RPC costs/capacity, operators/contact/on-call, privacy/terms/retention/account recovery and SDK distribution rights. Exact gates are in the staging/pilot checklist.

Review the announced Node security release by **2026-10-21**. Reassess dependency exceptions by **2026-11-15**, earlier if new dependencies change reachable surfaces. Neither date is extended by this project.
