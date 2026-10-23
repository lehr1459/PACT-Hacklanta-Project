# Isolated PACT staging build kit

This is a **private source release artifact and owner-run Linux recipe**, not a deployed service or an approved hosted image. Provider and domain are unset. The existing public Vercel deployment is outside this kit. Solana Devnet only; no program changes, package publishing, wallet approvals or transactions are performed by these preparation tools.

Start with [hosting options and cost estimates](../../docs/platform/hosted/HOSTING_OPTIONS.md), [the owner operations checklist](../../docs/platform/hosted/STAGING_OWNER_SETUP.md), [branch protections](../../docs/platform/hosted/BRANCH_PROTECTION.md) and [manual Phantom acceptance](../../docs/platform/hosted/PHANTOM_ACCEPTANCE.md).

## What the artifact proves

`scripts/release/staging-source.mjs create` requires a clean committed tree before and after capture. It packages every tracked regular file from Git objects, with original file modes, complete Git tree, original commit object, and per-file SHA256. Ignored `.env` files, workstation settings, dependencies, clock files, database backups and test evidence are never read into it. Unsafe paths, symlinks, active environment files and secret/backup filenames are refused. The deterministic ZIP and separate SHA256 file are written below `.deployment-candidates/staging/FULL_SOURCE_SHA/`.

Retain the full source SHA and outer ZIP SHA256 independently. Verification checks both plus the complete original Git tree; the archive cannot authenticate itself merely by containing its own checksums. No signing certificate or third-party distribution approval is implied. Use the trusted verifier from the reviewed checkout, not an unverified executable extracted from an unknown archive.

```sh
node scripts/release/staging-source.mjs create
node scripts/release/staging-source.mjs verify /private/transfer/pact-staging-source.zip FULL_SOURCE_SHA RETAINED_ZIP_SHA256
node scripts/release/staging-source.mjs materialize /private/transfer/pact-staging-source.zip FULL_SOURCE_SHA RETAINED_ZIP_SHA256 /private/build/pact-source
```

The final destination must be new; linked ancestors and filesystem roots are rejected. Materialization restores only the original commit/tree as a shallow local Git repository, with no history, hooks or remotes and a clean index. It does not fetch, create a substitute commit, or rewrite the operator's checkout. UNIX modes do not establish Windows private ACLs; retain private transfer/evidence in an owner-restricted Windows directory. The final report carries the actual SHA/path; uppercase names in this document are required operator substitutions.

The source manifest deliberately says `deployable:false`, `originBound:false`, `ciValidated:false` and `published:false`. Four successful checks at an earlier SHA do not approve a new artifact. Require all four successful jobs on the **exact final approved source SHA** before hosting; review skipped/neutral outcomes manually. No push is performed by this kit.

## Prepare a domain-bound web context after owner approval

Use a clean materialization with pinned Node24.22.1/npm11.19.1. Check the OS download URL/hash in `scripts/validation/runtime.json` before execution. Use x86-64 Linux for the final Linux image/build evidence. Docker Engine must be a local rootful Linux daemon at `/var/run/docker.sock`, with Compose v2; Docker Desktop, remote Docker contexts, Windows containers and ARM are outside this recipe.

Once an owner approves a new staging hostname, privately create an external **nonsecret** public-build JSON using `public-build.json.example`. It contains only the exact canonical HTTPS PACT origin and an intentionally public credential-free Devnet RPC origin. Never use the existing production domain. Do not invent a final hostname or use a CI/test build as staging.

```sh
node deployment/staging/bin/prepare-web.mjs /etc/pact-staging/public-build.json FULL_SOURCE_SHA
node deployment/staging/bin/verify-web-context.mjs .deployment-candidates/staging/FULL_SOURCE_SHA/web-context FULL_SOURCE_SHA
```

The builder installs locked SDK/web packages, compiles SDK and Next, verifies clean source **again**, and records saved public binding/BUILD_ID and every private context file's hash. It creates no image and starts no listener. It passes only explicit public settings and a public RPC to the build; private runtime RPC is injected later. It rejects active environment files through the existing resolver. No ignored environment files or node_modules are copied. The `.next` runtime is tied to the approved origin and cannot be rebound by changing Compose variables. A failing build/context is retained privately for inspection; never blindly delete/reset another checkout to rerun it.

Without an approved domain, a separate local rehearsal is available:

```sh
node deployment/staging/bin/prepare-web.mjs --rehearsal FULL_SOURCE_SHA
node deployment/staging/bin/verify-web-context.mjs .deployment-candidates/staging/FULL_SOURCE_SHA/web-rehearsal-context FULL_SOURCE_SHA --allow-rehearsal
```

Its binding is profile `test`, origin `http://127.0.0.1:3000`, and manifest `testOnly:true`. Verification rejects that context by default. The existing hosted start resolver also rejects the test/hosted mismatch. Rehearsal output is not a domain-bound release.

## Owner-controlled image preparation

The following commands are **pending execution on the approved Linux build/host**, after source/CI/security review. They build local images only. Do not push them or publish packages. Keep build logs private. Node and PostgreSQL pins have review deadlines; a digest is identity evidence, not a perpetual security clearance.

```sh
docker --host=unix:///var/run/docker.sock pull node:24.22.1-bookworm-slim@sha256:55fb5f5a527ea2c5c4a95f963e48ef90aa38c7b346054fdc8ee9957a2b55d205
docker --host=unix:///var/run/docker.sock build --pull=false --file services/pact-api/Dockerfile --label org.opencontainers.image.revision=FULL_SOURCE_SHA --tag pact-staging-api:FULL_SOURCE_SHA .
docker --host=unix:///var/run/docker.sock build --pull=false --label org.opencontainers.image.revision=FULL_SOURCE_SHA --label org.pact.staging.origin=https://APPROVED_STAGING_HOSTNAME --tag pact-staging-web:FULL_SOURCE_SHA .deployment-candidates/staging/FULL_SOURCE_SHA/web-context
docker --host=unix:///var/run/docker.sock image inspect --format '{{.Id}}' pact-staging-api:FULL_SOURCE_SHA
docker --host=unix:///var/run/docker.sock image inspect --format '{{.Id}}' pact-staging-web:FULL_SOURCE_SHA
docker --host=unix:///var/run/docker.sock pull postgres:18.4-bookworm@sha256:882236b897e39051d2368c5ccc6cda944904723506b2dfc97f2a8f5bc9afa382
docker --host=unix:///var/run/docker.sock pull caddy:2.11.7@sha256:504a44d7d74bd2bc28a66afc4774912fc21223ca8a67734af1c54ab2f999b489
```

API Docker context is restricted by its existing Dockerfile-specific allowlist. Web build must use only the verified emitted context, never the repository root. Retain immutable application image IDs/digests, source ZIP hash, build receipts and web manifest. Labels must match the source/origin but are only operator assertions: inspect/compare the embedded `/pact/web-runtime-manifest.json`, actual saved Next binding and expected API runtime/migration hashes, then execute isolated Linux image acceptance. Preflight does not prove image contents or replace that acceptance. Test image exports privately with `docker save` if transfer is necessary; no registry publication is required.

## Configure the separate host, then start only with authorization

The operating runbook supplies exact PostgreSQL role/grant, migration, backup and recovery instructions. Prepare external `/etc/pact-staging/compose.env` from the nonsecret template. Set both application image variables to the observed immutable image IDs. All four containers use Linux host networking: only Caddy80/443 is public; Next binds127.0.0.1:3000, API127.0.0.1:4100, PostgreSQL127.0.0.1:55432. Restrict SSH separately. Do not use `ports:` or broaden internal listener addresses.

Prepare existing, private, nonlinked persistent directories and private JSON/TLS/password files, with the exact UID/mode ownership in the operating checklist. Runtime JSON never enters Compose environment interpolation, image layers, public variables or CLI arguments. `api-migrate.json` is a separate copy of the API template using **pact_migrator** as database user; `api-runtime.json` must use **pact_runtime**. Migration mounts the clock read-only and never bootstraps authority. Both need valid private configuration; no placeholder credentials are generated by this kit.

Caddy uses an operator-supplied fullchain/key, automatic HTTPS issuance is disabled, and its logs are discarded to avoid callback-code leaks. Certificate procurement/renewal and alerting are explicit owner responsibilities. PostgreSQL requires a server identity with IP SAN127.0.0.1 and the approved CA. No host trust-store changes are performed by this preparation.

```sh
# Read-only static check works before selecting a provider.
node deployment/staging/bin/preflight.mjs --static
# Actual host preflight is read-only and requires all private files/images first.
node deployment/staging/bin/preflight.mjs /etc/pact-staging/compose.env FULL_SOURCE_SHA
node deployment/staging/bin/compose.mjs /etc/pact-staging/compose.env config FULL_SOURCE_SHA
# The commands below actually start/apply services: owner approval is required.
node deployment/staging/bin/compose.mjs /etc/pact-staging/compose.env start-db FULL_SOURCE_SHA
```

Confirm database health/identity through private TLS tooling, create the two least-privilege roles and set passwords interactively as documented. With API/ingress stopped:

```sh
node deployment/staging/bin/compose.mjs /etc/pact-staging/compose.env migrate FULL_SOURCE_SHA
```

Verify six migration checksums and apply the runtime grants. Then:

```sh
node deployment/staging/bin/compose.mjs /etc/pact-staging/compose.env start-private FULL_SOURCE_SHA
node deployment/staging/bin/compose.mjs /etc/pact-staging/compose.env status FULL_SOURCE_SHA
```

Probe loopback readiness and protected denials, complete database/RPC outage and restart/recovery tests with ingress closed, verify certificates and gateway configuration, and obtain explicit approval before:

```sh
node deployment/staging/bin/compose.mjs /etc/pact-staging/compose.env start-ingress FULL_SOURCE_SHA
```

The wrapper fixes the local daemon and sanitizes Compose interpolation so ambient `PACT_*`, `COMPOSE_*` and Docker context variables cannot silently override the reviewed file. It never builds/pulls images. Every service has an explicit profile, so plain `compose up` starts no default service. Inspect final Linux Compose behavior before opening ingress.

## Availability, logs and safe stopping

Containers run continuously in the Docker daemon after an authorized detached start. This recipe deliberately uses `restart:no`: healthcheck failure does not restart or remove a live clock owner, and a VM reboot/crash requires operator intervention. Establish an external HTTPS readiness monitor (30second interval / two consecutive failures is a proposed starting point), process/container exit and disk/time/certificate alerts, a named responder and an accepted response window. Liveness alone is insufficient. There is no high availability or zero-downtime guarantee; do not clone API replicas/volumes or enable autoscaling.

Graceful API restart keeps unexpired hosted SQL sessions/grants/key verifiers with unchanged issuer/pepper/clock. Consumer-example/legacy SDK local sessions require login again after their own restart. Crash locks require stopped-owner proof and manual custody; they are never deleted automatically. Backup restoration requires offline quarantine plus new pepper and empty clock namespace, followed by fresh authentication and credentials.

```sh
node deployment/staging/bin/compose.mjs /etc/pact-staging/compose.env stop-ingress FULL_SOURCE_SHA
node deployment/staging/bin/compose.mjs /etc/pact-staging/compose.env stop FULL_SOURCE_SHA
```

Stopping preserves all persistent directories. No `down --volumes`, reset, clock cleanup or automatic restore command is supplied. Default Docker/request logs are disabled for all services; verify sanitized health/exit alerts and incident diagnostics privately. Do not forward raw HTTP URLs, authorization headers, signed proofs, SQL errors or backup contents to a provider log collector. Complete the backup/restore drill and manual Phantom record before a pilot. Real-wallet connection/message tests and transactions remain separate owner-controlled acceptance actions.
