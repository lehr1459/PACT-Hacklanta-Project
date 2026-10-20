# Owner-controlled staging and Devnet pilot

Prepared 2026-10-19. This is a checklist for Phases9–10, not authorization to execute them. The current engineering request authorizes local code, disposable test fixtures, tests and commits only. The existing public PACT deployment must remain untouched. Saturday Lights is outside this project.

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

The runtime security review is due **October21,2026**. Existing dependency exceptions expire **November15,2026**, earlier when new dependencies change reachability. Passing a local build does not waive either gate. Owner approval must cite the exact reviewed source/artifact revision and actual CI receipts.

Accept the concrete [clock model](CLOCK_ADR.md) and [operator procedures](OPERATIONS.md): strict negative time slew may stop authorization, synchronous disk cannot be interrupted, automatic snapshot rollback detection is unsupported, maintenance needs a scheduler, and account erasure is limited to10000actual rows with all auth ingress stopped/drained. Retention/privacy and backup policies need owner/legal approval before external use. No local simulation certifies the eventual provider or hardware.

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

Start with the independent PACT consumer. Invite only1–3 owner-approved developers with bounded free quotas and explicit custom-auth/Devnet limitations. Do not contact or invite anyone without instructions. Saturday Lights can be a later, separately authorized project; it is not an acceptance dependency here.

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
