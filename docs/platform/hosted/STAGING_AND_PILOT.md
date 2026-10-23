# Owner-controlled staging and Devnet pilot

Prepared 2026-10-19. This is a checklist for Phases 9–10, not authorization to execute them. The current engineering request authorizes local code, disposable test fixtures, tests and commits only. The existing public PACT deployment must remain untouched. Saturday Lights is outside this project.

## Required owner decisions

Record each decision and approver in a private operating record. Do not fill missing fields with an invented domain, account, person or legal representation.

| Decision | Evidence required before staging |
| --- | --- |
| Hostname/TLS and gateway | Approved PACT HTTPS origin, exact routing to console and `/v1`, TLS ownership, no alternate upstream bypass, no raw auth URL/header logging, forwarding-header policy |
| Persistent Node hosting | Approved provider/account and one supervised persistent process; no serverless or hidden replicas; bounded CPU/memory, graceful shutdown and restart policy; private durable local clock volume, ACLs, fsync latency and long-duration NTP/suspend acceptance |
| PostgreSQL | Approved provider/region, encrypted transport/storage, fsync/synchronous commit, pool/connection limits, least-privilege runtime role, separate migration authority, capacity-count preflight, backup access and offline quarantine/rekey restore drill |
| Secrets | Approved encrypted secret manager and access roles for DB, API verifier pepper and private RPC; rotation/revocation procedure; no wallet custody |
| RPC/capacity | Approved Devnet-only RPC endpoint(s), cost ceilings, health/failover evidence, measured quotas and admission limits |
| Operations | Named operating owner, backup owner, private incident contact, on-call expectations and notification channel |
| Account recovery | Wallet-only control is current behavior. Lost admin wallet recovery/delegation is unsupported; owner accepts or commissions a separately reviewed design |
| Domain verification | DNS TXT proof expiry/revalidation, domain-hijack response and allowed local-development registrations accepted by owner |
| Privacy/legal | Developer terms, purpose/disclosure of wallet addresses and redacted logs, retention/deletion/backup policy, rights to distribute private SDK artifacts; no SLA/commercial/Mainnet claims |
| Acceptance scope | Distinct seller/buyer test wallets, actual supported browser/device list and explicit authorization of each human-run transaction workflow |

The overdue October 21 runtime review is completed in [the October 22 record](../../security/RUNTIME_REVIEW_2026-10-22.md): exact reviewed Node 24.22.1/npm 11.19.1, next internal review **November 5, 2026**, earlier on a new advisory or before hosting. Existing dependency exceptions still expire **November 15, 2026**, earlier when new dependencies change reachability. Passing a local build does not waive either gate. Owner approval must cite the exact reviewed source/artifact revision and actual CI receipts.

Machine cutoffs are the start of those dates at 00:00 UTC: **November 4 at 7 pm EST** for Node and **November 14 at 7 pm EST** for dependencies in America/New_York. Review before the cutoff; no end-of-local-day grace is implemented.

Accept the concrete [clock model](CLOCK_ADR.md) and [operator procedures](OPERATIONS.md): strict negative time slew may stop authorization, synchronous disk cannot be interrupted, automatic snapshot rollback detection is unsupported, maintenance needs a scheduler, and account erasure is limited to 10,000 actual rows with all auth ingress stopped/drained. Retention/privacy and backup policies need owner/legal approval before external use. No local simulation certifies the eventual provider or hardware.

## Before authorizing a push

1. Record the exact clean feature SHA and review the [release-preparation findings](RELEASE_PREPARATION_2026-10-22.md). Confirm that no production environment, wallet credential or private proof enters the commit.
2. Inspect every connected deployment provider/webhook for this repository. Record project/account, production branch, preview triggers, domain assignments and any automatic deployment rule. A GitHub push can trigger provider deployment independently of this validation YAML. Visible October 22 Vercel metadata shows no Git link for the personal PACT project; recheck immediately before a push and do not generalize that observation to other teams/hooks. Changing a connection or disabling automation requires separate owner approval. Preserve the current public deployment and domains.
3. Explicitly authorize only the named feature-branch push/CI action after deployment isolation is established. Example commands below are **owner steps, not executed by this preparation pass**:

   ```text
   git switch codex/api-first-integrations
   git status --short
   git rev-parse HEAD
   git push origin HEAD:refs/heads/codex/api-first-integrations
   ```

   Require an empty status and the approved SHA before the last command. Do not merge, force-push, push tags or update the default branch. The unfiltered `push` event starts the four synthetic jobs on the feature branch.
4. Inspect the actual run SHA/event and all four required job results. Preserve restricted hosted summaries and source/artifact identifiers; keep raw proof/recording material private. Remote `main` has no workflow file, but read-only REST confirms the workflow is already registered and active (ID 387452219). GitHub's event documentation permits API/CLI dispatch after a prior run while its manual guide also describes a default-branch prerequisite. Dispatch capability has not been execution-tested here. Use the authorized push for required synthetic CI; inspect current registration and separately authorize any optional API/CLI public-read dispatch. Do not copy only YAML into old main or change the default branch as a presumed workaround. Any later default-branch integration requires its supporting source/scripts and separate approval.
5. With actual status contexts available, have the repository owner configure/verify branch rules requiring `node-and-browser`, `pinned-chain`, `hosted-api-and-browser` and `hosted-portable-windows`, applicable reviews and force-push/deletion restrictions. October 22 metadata reports remote branches unprotected and no rulesets; detailed admin protection access was 403. No rule was changed here. Provider deployment checks/isolation remain separate from GitHub merge checks.

## Exact staging operator sequence

These steps require a separate staging authorization naming provider/account, hostnames, costs, operator and exact source/artifact. They are not commands to run against the existing public project.

1. **Accept source and artifact:** require the four remote jobs, including actual Linux Docker, on the approved SHA. The CI smoke removes its uniquely named test image; it does not publish a deployable PACT image. Separately approve private artifact transfer/build, record its final digest, and repeat the approved smoke if the staging artifact is rebuilt. Do not substitute the pinned base-image digest for the final PACT image identity.
2. **Approve concrete routing:** one API process owns its private clock and listens on loopback. A co-located supervised persistent Next/gateway and API is a staging candidate; the gateway forwards only its fixed configured upstream and presents the exact approved PACT HTTPS issuer. A container's ordinary published port cannot reach its internal loopback listener; the prepared Linux container smoke uses host networking. A remote HTTPS gateway/reverse proxy/private perimeter is a separate topology that needs explicit validation. No hidden API replicas, shared/network clock volumes or unsupported serverless owner.
3. **Provision privately:** with ingress closed, create the approved PostgreSQL database and separate migration/runtime roles, encrypted transport/storage, verified durability, bounded connections and backups. Prepare a new private persistent clock directory owned by the runtime UID/GID. Approve supervisor/time synchronization, negative-slew/suspend policy, disk latency/ACLs and stopped-owner recovery; local fixtures do not certify that host.
4. **Inject configuration:** use the approved secret manager, not source/browser variables or shell arguments. API nonsecret settings: `PACT_HOSTED_PROFILE=hosted`, exact `PACT_HOSTED_ORIGIN`, `PACT_HOSTED_PROCESS_MODEL=single-persistent-process`, loopback host/port and absolute `PACT_HOSTED_CLOCK_DIRECTORY`. Inject `PACT_HOSTED_DATABASE_URL` with `sslmode=verify-full`, a newly generated verifier pepper, `SOLANA_RPC_URL` and optional distinct fallback privately. Omit local PGlite paths. Supply the web application's strict hosted build/start profile from [environment profiles](../../operations/ENVIRONMENTS.md), plus fixed `PACT_HOSTED_API_INTERNAL_URL`; build and runtime public/origin/auth/policy bindings must match. The private RPC/pepper/app key never belongs in `NEXT_PUBLIC_*`.
5. **Migrate explicitly:** inspect the six committed migration files/checksums. With migration-role configuration injected, from the approved repository/artifact root execute `npm --prefix services/pact-api run migrate`; from the image working directory `/pact/services/pact-api`, use `npm run migrate`. Retain only the sanitized result. Restore runtime-role configuration before the supervisor launches `node services/pact-api/src/start.mjs` from the repository/artifact root, or `node src/start.mjs` from the image working directory (its existing CMD). Hosted startup verifies schema and must not perform DDL. Only the one authorized API owner may acquire the clock; startup refusal is investigated, never bypassed by deleting its record/binding.
6. **Probe before traffic:** from the approved host/gateway, verify exact runtime and image digest; `/v1/health/live` and `/v1/health/ready`; schema drift denial, PostgreSQL TLS/durability, Devnet genesis/program/readiness and fixed gateway/issuer. Test malformed/missing keys, unauthorized origins and direct-upstream access. Liveness may stay healthy while readiness/access deny. Keep raw headers, cookies, callback URLs and proofs out of logs/monitoring. Accept ingress/perimeter rate limits before opening external traffic.
7. **Rehearse recovery privately:** verify graceful restart, process-crash lock custody, schema drift/DB outage, RPC outage/staleness and clock failure deny without stale allowance; verify recovery settles reservations. Restore a backup into an isolated new database with all ingress stopped. With its operator connection supplied privately through approved PostgreSQL service/environment configuration, run `psql --set=ON_ERROR_STOP=1 --file=services/pact-api/operations/restore-quarantine.sql` from the repository/artifact root; from the image service directory the file is `operations/restore-quarantine.sql` (the slim application image is not assumed to include psql; use approved operator tooling). Never put a secret DSN/password in command arguments. Then use a new pepper and empty private clock directory before listening. Reprove callbacks and reissue/regrant deliberately; old key/session/grant/code/proof must deny. Never overwrite live data or reuse an old bearer namespace.
8. **Approve a real consumer and people:** establish a separate HTTPS consumer backend/callback, server-only credentials and session store, distinct admin/seller/buyer wallets and exact public offer metadata. Approve wallet-message tests separately from any offer/purchase transaction. Execute the human matrix below, record sanitized evidence and deviations, then conduct rollback and pilot go/no-go. No invitations, messages, transactions or rollout follow automatically.

## Staging acceptance record

1. Approve a new staging target. Do not reuse or replace the older public site. Confirm current implementation/security/QA reports have no unresolved consequential defect. At the proposed exact revision require the original `node-and-browser` and `pinned-chain` jobs plus the new `hosted-api-and-browser` and `hosted-portable-windows` jobs to pass, including actual Linux container execution. Owner-approved push/run and required-status configuration remain separate actions; the foundation's earlier green run is insufficient.
2. Supply external configuration through the approved secret manager. Verify runtime and schema version, migration checksums, app/key/grant revocation, fixed Solana Devnet genesis/program, exact PACT origin and gateway restrictions. No credentials belong in browser build variables.
3. Prove liveness separately from readiness. DB/RPC/auth outages and malformed upstream state must deny protected requests. Measure protected admission under public/auth load; do not widen freshness limits to meet latency targets.
4. Register two independent developer applications and distinct admin wallets. Prove cross-tenant reads/writes fail, callbacks require domain proof and signed mutation, and key creation/rotation/revoke works without secret retention in browser storage/logs.
5. Exercise an independent consumer application's real backend. Its session keeps the grant and PKCE verifier server-side; its callback checks state and issuer; its protected route denies before a license, allows only after fresh verified state, and denies at expiry/logout/revoke. Verify a forged browser wallet address or positive callback cannot bypass it.
6. Have human wallet owners inspect and approve their own message prompts. Record rejection, missing wallet, wrong account, account switch, stale challenge, callback errors and logout. Message signing is separate from purchasing. An agent must never approve a wallet prompt or sign/broadcast a transaction.
7. Only in the separately approved Devnet transaction workflow, have seller/buyer owners perform the existing PACT offer and checkout steps. Preserve exact metadata and finalized settlement evidence. Recover uncertainty by reading the original transaction; never blindly submit again. Record expected deactivation behavior: new sales blocked, existing unexpired entitlement preserved.
8. Restart the service and verify durable replay/revocation behavior. Restore an isolated backup with routing disabled, apply the documented new authentication epoch/pepper procedure, verify restored credentials cannot revive, then reauthenticate/reissue deliberately. Do not test restore against live data.
9. Test keyboard navigation, actual screen reader/zoom and approved devices. Synthetic desktop and emulated mobile tests are separate evidence; do not infer verified mobile wallet handoff.
10. Execute a rollback drill. Disable the hosted gateway, preserve SQL/audit evidence and customer purchase journals, and return to the unchanged self-hosted integration option. No rollback can reverse chain settlement or retract delivered content.

Keep codes, keys, grants, signed challenges, private URLs, wallet secrets, personal details and exact legal agreements out of acceptance artifacts. Public transaction IDs/wallets can still be correlatable personal data; apply the approved disclosure/retention policy.

## Controlled pilot

Start with the independent PACT consumer. Invite only 1–3 owner-approved developers with bounded free quotas and explicit custom-auth/Devnet limitations. Do not contact or invite anyone without instructions. Saturday Lights can be a later, separately authorized project; it is not an acceptance dependency here.

Measure onboarding completion, backend deny/allow correctness, RPC/DB availability, error classes, latency under the accepted load and support burden. Separate synthetic evidence from actual wallet receipts. Review incident response, domain expiry, key age/rotation and consumer state/expiry handling. Rotate/revoke trial credentials after the pilot; pause integrations while preserving historical evidence.

The owner records go/no-go and remaining discrepancies. Wider Devnet availability, SDK publication/distribution, distributed replicas, pricing/billing, webhooks, Mainnet, protocol changes and commercial guarantees require new scoped decisions and authorization.

## Evidence categories

| Category | What qualifies |
| --- | --- |
| Implemented locally | Inspected source plus reproducible passing local checks at the recorded revision |
| CI verified | Actual remote job receipts at the exact implementation revision; the foundation's earlier green run is baseline evidence only |
| Staging accepted | Approved hosting/configuration, operational receipts and actual acceptance record |
| Human action required | Owner choices, external account authorization, real wallet approvals and device/operator acceptance |
| Not deployed | No claim that local code is available on the older public site |
| Not supported | Mainnet, commercial production/SLA, copyright transfer, public OAuth/OIDC SSO, wallet custody and other excluded features |
