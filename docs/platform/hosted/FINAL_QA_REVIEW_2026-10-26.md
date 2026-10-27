# Final local QA and topology review — October 26, 2026

This review separates local synthetic acceptance from provider hosting and human Phantom acceptance. The root acceptance report must bind final results to the final source SHA; the baseline observations below do not replace that gate.

## Independently verified baseline

Read `AGENTS.md`, the complete current owner request, staging release report, hosted integration/testing guides, validation runners, native consumer tests and deployment kit. The existing Express and production Next consumer cases already enforce protected backend GET/POST operations through actual HTTP, the private client, native PostgreSQL and the hardened reader. Their provisioning imports repository QA helpers; that is useful integration coverage but does not alone prove that an outside developer can consume a separately installed application. The final independent developer demonstration is a separate required gate.

The reviewed Windows Node executable was independently hashed as `d702daa815eabbff763c7d3808e235cf031cf2ca70211b56847bc72f51e240e5`; actual versions are Node 24.22.1 and npm 11.19.1. In an ordinary clean detached clone of `31fd16023ccbed4f9f06f6d85aedc79ea7346728`, all **17 staging source/configuration/context policy tests passed**, with zero skipped cases.

An initial attempt in the compatibility workspace produced nine passing source tests and two module-loader failures because the existing `deployment` junction resolves to the older compatibility repository. This was preserved as a failed attempt, then repeated in an ordinary clone. No import guard or test expectation was relaxed.

## Actual native same-host topology

Added `scripts/hosted-qa/topology.mjs`: a disposable native equivalent of the Compose topology, with actual Caddy 2.11.7 → production-built Next → API → PostgreSQL 18.6 over verified database TLS under a restricted runtime role. Its gateway configuration derives from the staging Caddyfile, changing only local addresses/ports, certificate locations and loopback binding. It does not use ACME, install a trusted root, change a firewall, start an external service, or broadcast a transaction.

The baseline rehearsal passed **14 assertion groups**: restricted database permissions/TLS; HTTP 426; rejection of untrusted gateway TLS; complete HTTPS readiness; signed administrator login with Secure/HttpOnly cookies; seller-proven resource and two policy versions; credential operations; foreign-origin denial; spoofed forwarding headers; API outage 503; graceful API reopen with persistent authority; Next outage 502 and restart; actual migrator `pg_dump`/transactional `pg_restore` plus packaged offline quarantine; and fresh recovery authority denying the old key/cookie while preserving history and permitting fresh wallet authentication.

The original two-day disposable certificate had expired. Native PostgreSQL correctly rejected it with `CERT_HAS_EXPIRED`. A new disposable loopback certificate was generated, then copied/reloaded only into the owned QA PostgreSQL cluster; verification stayed enabled. The first topology draft also refused its restoration target because its local database-name grammar omitted the explicit `_restored` suffix. The grammar was corrected to allow exactly the documented disposable target; the complete rehearsal then passed. Final acceptance must rerun the now clean-source-enforcing harness after committing it.

## Reproduce the topology gate

Use a new ordinary clean checkout with reviewed dependencies and no active environment files. Build SDK and production Next with `PACT_ENV_PROFILE=test`, `PACT_APP_ORIGIN=https://127.0.0.1:3443`, disabled legacy authentication/server policy, stateless marketplace, the fixed Devnet program and approved public Devnet RPC. Do not reuse an HTTP/3112 saved build: the saved binding must match the TLS origin. Keep ports 3080, 3443, 3444 and 3445 free.

Prepare two **new empty** databases on a disposable loopback PostgreSQL 18.6 cluster, named `pact_hosted_qa_topology_<eight-hex>` and the same name plus `_restored`. Create unique `pact_topology_migrator_<eight-hex>` and `pact_topology_runtime_<eight-hex>` roles, neither superuser nor role/database creator. The migrator owns both databases. Apply all six migrations twice to the source database; verify checksums. Use the staging runbook's runtime grants: DML on application tables, SELECT on migration metadata and SELECT/INSERT on clock bindings, with no DDL or clock/metadata mutation. Grant runtime CONNECT to both databases. Do not migrate or populate the empty restoration target.

An external private JSON contains exactly `connectionString`, `migratorConnectionString` and `restoreConnectionString`. The first is the runtime role on the source database; the others are the migrator on source/empty target. Each URL uses exact loopback, `sslmode=verify-full` and the private CA path. Never print or commit this file. Supply separately verified PostgreSQL 18.6 `pg_dump`, `pg_restore`, and `psql` clients and a verified Caddy 2.11.7 executable. Supply private `ca.crt`, `server.crt`, `server.key` for SAN IP 127.0.0.1; use process-local trust only.

```text
node scripts/hosted-qa/topology.mjs --web <absolute-clean-built-web> --database-config <absolute-private-json> --caddy <absolute-verified-executable> --caddy-sha256 <verified-executable-sha256> --tls-dir <absolute-private-tls-directory> --pg-bin <absolute-reviewed-18.6-bin> --output <new-absolute-private-output> --revision <exact-clean-source-sha>
```

The harness checks saved build provenance and initial clean source, uses only loopback listeners, waits for the durable clock ceiling before API reopen, stops the API before backup, refuses nonempty/identical restore targets, runs restore quarantine through actual `psql` with `ON_ERROR_STOP`, and uses a fresh pepper/clock after restoration. No password is passed in command arguments. Child logs, clock state and SQL backup are private and must not be uploaded; only the reconstructed `results.json` is a shareable receipt after review. Its `hostedApproved:false` and `dockerExecuted:false` remain explicit. The target must be fresh for every repetition.

Caddy provenance: [official 2.11.7 release](https://github.com/caddyserver/caddy/releases/tag/v2.11.7), publisher SHA512 checksums. The reviewed Windows archive SHA512 is `c308154504e53755958ffc62d8a2657ab17eefd6dd25c45dbb2c3d93d29519971f77ca652f7d0f2bcb7f980b9ba3822478865e29969d0272d7613550a43152b1`; executable SHA256 is `5f93a9bd555f3aac9d33af2756ba14b3519d8cca4ffd55256bdaeab444c9db2a`. Publisher checksums establish asset identity, not an independent binary security audit.

## Acceptance boundaries

This native gate meaningfully tests the complete local TLS request path and recovery. It does not execute Linux Compose namespaces/capabilities/read-only mounts, prove provider availability or ingress, validate certificate renewal/offsite custody, establish an SLA, or complete real Phantom/device acceptance. Those external/human gates remain separate. Mocks and synthetic account bytes are never receipts for a real Devnet purchase.

The final merge review must additionally require the complete original/hosted matrices, independent developer demonstration, dependency/provenance audits, production artifact smoke, exact proposed-merge GitHub checks, deployment isolation, and final source/security review. Any failing required engineering gate blocks merge. Node review remains due November 5 UTC and dependency exceptions expire November 15 UTC.
