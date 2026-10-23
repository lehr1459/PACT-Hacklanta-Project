# Staging preparation evidence and owner handoff

This pass prepares a portable, isolated Linux VM deployment. No provider, account, VM, domain, public certificate, production secret or external service was created/configured. No deployment, publication, main merge, Phantom approval or blockchain transaction was performed. Existing SDK contracts, licensing/API behavior and Solana/Base programs are unchanged. `web/next-env.d.ts` uses canonical production generated references so a clean production build can remain clean; no dirty-source exception/reset was introduced.

## Deliverables

- [Commit-bound source artifact tooling](../../../scripts/release/staging-source.mjs): deterministic private ZIP, complete original Git tree/commit and file hashes, independent digest/revision verification, offline clean materialization without history/remotes/hooks.
- [Portable staging kit and exact commands](../../../deployment/staging/README.md): manually controlled Compose, verified-loopback API/Next/PG listeners, operator TLS Caddy, pinned images, private runtime injection, distinct migrator authority, strict context verification and read-only preflight.
- [Owner setup](STAGING_OWNER_SETUP.md): database roles/migrations, verified TLS, secrets, clocks, backups/restoration, monitoring, restart custody and owner go/no-go.
- [Hosting options/costs](HOSTING_OPTIONS.md), [all-four-check branch protections](BRANCH_PROTECTION.md), and [three-identity manual Phantom acceptance](PHANTOM_ACCEPTANCE.md).

Provider/domain are deliberately configurable and unset. A source kit and a loopback test rehearsal can be produced now. The final strict hosted-origin Next build and immutable Linux application images require the approved HTTPS origin and a Linux Docker environment. A source ZIP is not a hosted release approval.

## Executed local evidence

Local evidence is private/ignored under `web/test-results/staging-prep-20261023/`. Do not upload that directory: it includes disposable SQL backups, TLS fixture keys, password material and raw local test logs. Export only reconstructed sanitized summaries/digests.

| Check | Actual evidence and limit |
| --- | --- |
| API production artifact | Fresh clean checkout of `878a55e273014e594241aa88829857435673656a`; 67 runtime files, `sourceDirty:false`, actual native PostgreSQL/loopback HTTP readiness, liveness, malformed-key denial, signed mint, valid key, graceful restart persistence and signed revoke denial. Windows unpacked runtime; no local container execution. |
| Native security/regression | **73 tests passed, zero failures/skips**: authentication, tenant boundaries, resources, connect, clock faults/recovery, expiry/deadline/admission, maintenance and recovery. Includes a portable dump/restore variant that imports the actual packaged API database/service modules and quarantine SQL. |
| Portable backup/recovery | Verified official EDB18.6 clients on the tested18.4 server; actual custom-format `pg_dump`, archive TOC and transactional `pg_restore` into a separate empty database. Preserved the unsafe same-pepper snapshot counterexample; quarantine/new pepper/new clock denied old key/cookie/grant/code/proof, retained app/resource history and allowed fresh authorization. This is local fixture evidence, not provider PITR or achieved RPO/RTO. |
| TLS and least privilege | Separate disposable local TLS/role fixture: six migrations repeated idempotently/checksums verified; runtime schema verification passed; direct DDL/migration-table/clock-update attempts denied with PostgreSQL42501 and API503; verified TLS/fsync/synchronous commits; wrong CA and certificate hostname rejected. No OS trust-store or real provider credential changed. |
| Artifact/config policy | Source-kit, Compose input and web-context negative tests are wired into the required Node CI lane. Source-kit tests independently passed9/9 and initial preflight tests independently passed4/4 during security review; final aggregate receipts belong to the final exact-commit validation record. |

The PostgreSQL18.6 client ZIP SHA256 was independently checked against the [EDB maintainer confirmation](https://github.com/EnterpriseDB/edb-installers/issues/746) and publisher sidecar before executable use. The server stayed18.4; no runtime/dependency pin was changed by using newer same-major backup clients. The first privilege-fixture assertion expected raw42501 through the API wrapper; corrected verification checks raw SQL42501 directly and the deliberately redacted503 at the API boundary. No application control was weakened.

## Review corrections

Independent review found and corrected inherited Git context/config injection and linked-output/root-destination risks in artifact materialization. Negative tests cover those boundaries. Build npm configuration is limited to explicit approved keys, and Compose control/preflight sanitize ambient interpolation and force a local daemon. Private migration configuration cannot be substituted into the normal runtime. Image labels are checked as operator assertions; image contents, embedded binding/manifest and actual Linux acceptance remain separate gates.

Manual acceptance preserves the seller ownership rule: developer D cannot bind seller S's offer. S must authenticate/register the successful seller-owned app, or D must separately create a D-owned offer under explicit transaction permission. Newly bound resources are already enabled; rotated replacement credentials remain active until buyer tests finish. No delegation/ownership shortcut was added.

## CI and release boundary

The verified foundation [GitHub run39895664596](https://github.com/lehr1459/PACT-Hacklanta-Project/actions/runs/39895664596) passed `node-and-browser`, `pinned-chain`, `hosted-api-and-browser` and `hosted-portable-windows` at `878a55e`. Optional public reads correctly skipped. That run does not validate later kit code. Require a separate exact final-commit result for all four jobs and independently retain the final source ZIP digest. The generated artifact's `ciValidated:false` is intentionally not rewritten based on a later receipt; keep external CI evidence bound to its source SHA.

Read-only GitHub inspection on October23 found both `main` and the feature branch unprotected and no rulesets. Four exact required contexts and GitHub Actions source15368 are documented; repository protections were not changed. The earlier user authorization permits only feature-branch CI validation pushes; it does not authorize main merge, provider changes or staging deployment.

Docker Engine/daemon is unavailable on this workstation. The existing Linux CI validated the prior API image; it did not execute this new multi-service Compose topology. Do not report static JSON/policy tests or a Windows web rehearsal as Linux/container/TLS acceptance.

## Exact owner gates

1. Accept the source SHA, separately retained archive SHA256, all-four-check final CI result and independent review.
2. Select provider/account/region, budget and isolated hostname; approve provisioning, DNS/certificates, SSH/incident ownership and privacy/retention decisions.
3. Approve Linux Docker execution and produce/inspect domain-bound application images using the kit. Verify image contents/binding, read-only/nonroot/loopback mounts, TLS and ingress denial.
4. Provision new roles/database/secrets/clock only in isolated staging; migrate six files, apply/test least privilege and health/failure behavior.
5. Run actual host backup/restoration, clock/storage/time, graceful restart/crash-lock and monitoring/certificate-renewal drills; accept measured RPO/RTO and manual-recovery availability.
6. Arrange an eligible independent GitHub reviewer, approve branch protection settings, and verify their enforcement. No main merge is part of this pass.
7. Approve human message-only Phantom acceptance with D/S/B. Separately authorize any offer/purchase transaction, then record actual outcomes before approving a controlled pilot.

Node security review remains due **2026-11-05 00:00UTC** (November4,7pm EST), earlier on a new advisory/before hosting. Dependency exceptions still expire **2026-11-15 00:00UTC** (November14,7pm EST). The missed October21 review was completed October22; these gates are not postponed by staging preparation.
