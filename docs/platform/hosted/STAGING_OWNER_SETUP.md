# PACT staging owner setup

Prepared October 23, 2026 for an isolated portable Linux VM with Docker Compose. The provider, account, region, domain, VM, certificate authority, PostgreSQL endpoint, secret manager, costs and operating owner are **unset**. This document prepares owner actions; it does not authorize provisioning, deployment, DNS changes, database changes, wallet actions or a pilot. Keep the existing public PACT deployment and its domains unchanged. Saturday Lights is outside this work.

The existing four-check CI result for `878a55e` is foundation evidence for this preparation. A newly added staging kit needs its own reviewed commit, artifact identity and applicable validation. It does not inherit CI approval from that earlier commit. The [kit instructions](../../../deployment/staging/README.md) describe `postgres`, `api`, `web`, `gateway` and the separate offline `migrate` service, strict source/context verification, read-only host preflight and owner-run control commands. This runbook does not claim that kit has run on a VM.

## 1. Record the owner decisions before running anything

Create a private operating record containing:

| Decision | Required value and evidence |
| --- | --- |
| Source and artifact | Clean approved commit, all four required GitHub job receipts for that commit, final PACT image digest or approved archive SHA256; the Node base-image digest is not the application digest |
| Isolation | New staging project/VM/database/secrets/domain; evidence that the old public project, production branch and deployment hooks are unaffected |
| Host | Linux distribution, patched kernel, Docker/Compose versions, bounded CPU/memory/disk, single API process, runtime UID/GID, operator and incident contact |
| Origin | Exact PACT HTTPS origin with no path/trailing slash; separate approved consumer HTTPS origin and exact callback |
| TLS and DNS | Domain owner, certificate issuance/renewal, DNS access, public TLS policy and absence of alternate direct API ingress |
| PostgreSQL | Approved PostgreSQL18.6 endpoint/region, verified hostname/CA, encryption at rest, durable commits, role grants, connection and storage budget |
| Secrets | Approved injection mechanism, access roles, DB credentials, fresh API pepper, private Devnet RPC and rotation/revocation procedure |
| Time and volume | Private local persistent clock volume, ACLs, trustworthy wall time, NTP/suspend policy, disk latency and stopped-owner recovery acceptance |
| Backups | Backup owner, encrypted destination, schedule, retention, restore test, measured recovery-point objective (RPO) and recovery-time objective (RTO) |
| Service expectations | Accepted maintenance windows and availability limits, external readiness monitor, alert recipient, response expectations and retention scheduler |
| Human acceptance | Named developer, seller and buyer operators; approved browsers/devices; separate message-signing and Devnet transaction permissions |

Do not invent a hostname, provider or credential to make a template render. Do not connect this kit to the existing public deployment. Read [staging and pilot gates](STAGING_AND_PILOT.md), [clock assumptions](CLOCK_ADR.md) and [operations](OPERATIONS.md).

## 2. Accept the source, runtime and topology

From the approved checkout, record `git rev-parse HEAD` and require an empty `git status --short`. Build/transfer only the reviewed artifact using the final kit instructions. Do not copy workstation environment files, ignored logs, SQL backups, clock files or wallet material into the build context. Keep image/registry credentials out of arguments and build arguments. Building locally does not authorize pushing an image.

The reviewed runtime is Node24.22.1/npm11.19.1 with Next16.4.1 and React19.3.0. Check the authoritative `scripts/validation/runtime.json` and dependency policy again before hosting: Node review is due November5, 2026 and dependency exceptions November15, 2026, both at00:00UTC, or earlier on a new advisory. The October21 review was completed October22; it is not an indefinitely valid waiver.

The API supports one persistent Node process on one approved host, one private local clock directory and PostgreSQL. It rejects recognized serverless/worker topologies. No API replicas, autoscaling, worker cluster, network/shared clock filesystem, copied authority directory or automatic active/passive takeover is supported. There are two SQL pools with at most two connections each; reserve additional separate migration/backup/operator connections within the provider limit.

The API binds only to loopback. A normal Docker `ports:` mapping cannot expose a listener bound to loopback inside a container. The prepared Linux approach uses host networking so a co-located gateway can reach the API. Review the actual final Compose network model; never change the API bind to `0.0.0.0` to work around it. Externally expose only the approved HTTPS gateway, with SSH/admin access restricted separately. Do not publish PostgreSQL or the API port.

## 3. Configure certificates, roles and the new database

PostgreSQL18.6 is the staging/CI target after [security review](../../security/POSTGRES_REVIEW_2026-10-23.md); the inherited18.4 target is superseded. Other server versions are not established by a passing18.6 test; the application does not enforce a server-version gate. Pin and verify approved PostgreSQL client tools too. A provider patch/version substitution needs review and a fresh migration/auth/restore drill.

The following is **prepared operator SQL**, not executed provisioning. The kit initializes a new private PostgreSQL cluster with operator `pact_operator`, database `pact_hosted` and loopback port55432. Confirm this is the new empty staging cluster, not an existing database or public deployment. Do not point its data mount at an existing cluster. Run the following through private authenticated operator tooling only after the PostgreSQL service has initialized. Passwords come from the approved secret manager; no password literal belongs in this script, shell history, chat or a receipt.

```sql
-- Connected to the approved server's administrative database as an operator.
CREATE ROLE pact_migrator LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
CREATE ROLE pact_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
ALTER DATABASE pact_hosted OWNER TO pact_migrator;
REVOKE ALL ON DATABASE pact_hosted FROM PUBLIC;
GRANT CONNECT ON DATABASE pact_hosted TO pact_runtime;
```

Set each login's password through the provider/secret manager or interactive `psql` `\password pact_migrator` / `\password pact_runtime` in a private nonrecorded operator session. Never grant runtime membership in the migrator or operator role. Connect explicitly to the new `pact_hosted` database before the next statements:

```sql
ALTER SCHEMA public OWNER TO pact_migrator;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO pact_runtime;
ALTER ROLE pact_migrator IN DATABASE pact_hosted SET search_path = public;
ALTER ROLE pact_runtime IN DATABASE pact_hosted SET search_path = public;
```

Supply an operator-approved PostgreSQL certificate/key and trusted CA in the kit's private `postgres-tls` directory. The server certificate needs IP SAN `127.0.0.1`; the wrapper requires that exact loopback host/port/database, and the CA mounts at `/run/pact-postgres-ca.crt` in API/migration containers. The certificate identity must match the connection host. Hosted URLs accept only `postgres:`/`postgresql:` and require `sslmode=verify-full`; allowed query keys are `sslmode`, `sslrootcert`, `sslcert` and `sslkey`, with no duplicates. There is no separate `PACT_*` CA variable. This kit mounts only the CA for the API; an mTLS client-cert topology requires separately reviewed mounts/configuration. Percent-encode URL credentials/paths correctly; never print the resulting secret URL. `sslmode=require`, `prefer`, disabled verification, arbitrary pooler URL parameters and `NODE_TLS_REJECT_UNAUTHORIZED=0` are not substitutes.

This kit uses its local containerized PostgreSQL endpoint; moving it to a remote managed provider is a configuration/topology change requiring review of the wrapper, certificates and acceptance. Confirm server version, encryption and durability through each approved role's private connection:

```sql
SHOW server_version;
SHOW fsync;
SHOW synchronous_commit;
SELECT ssl FROM pg_stat_ssl WHERE pid = pg_backend_pid();
```

Expect PostgreSQL18.6, `fsync=on`, `synchronous_commit=on`, and `ssl=true`. The last query proves encryption for that session, not hostname verification: also test that a wrong CA/hostname fails without suppressing verification. API pools request synchronous commit on every connection. Provider storage, replica/failover and power-loss guarantees still need owner acceptance. Do not disable durability to achieve a latency target.

## 4. Inject the API and web configuration privately

Use the kit's documented private configuration mounts/injection interface; do not place secret values in a Compose command, image, public build variable or shell `export` pasted into a recorded terminal. Do not commit a populated environment file. Operators with Docker access can inspect container memory/configuration: restrict VM/Docker access accordingly. `bin/inject-runtime.mjs` reads only its private mounted JSON into the same Node process; the secret values do not enter Compose environment interpolation. The service itself never loads `.env` files.

Copy/configure the **nonsecret** [compose.env.example](../../../deployment/staging/compose.env.example) outside the checkout, conventionally `/etc/pact-staging/compose.env`. It supplies the approved domain, public RPC origin, immutable preloaded API/web image identities, exact reviewed source revision and absolute host paths. `PACT_CONFIG_DIRECTORY` points to the reviewed `deployment/staging` directory; `PACT_PRIVATE_DIRECTORY` points to the private files below. No image is pulled/built automatically. Compose pins the official Caddy2.11.7 image by immutable digest; recheck advisories before hosting.

| Private host file/directory under `PACT_PRIVATE_DIRECTORY` | Contents and access |
| --- | --- |
| `api-runtime.json` | From `api-runtime.json.example`: runtime-role URL, fresh pepper and private RPC; regular file owned by UID1000, mode0600 |
| `api-migrate.json` | Separate API-template file with the migrator-role URL and valid configuration; UID1000, mode0600; mounted only into offline migration |
| `web-runtime.json` | From `web-runtime.json.example`: private web RPC only; regular file owned by UID1000, mode0600 |
| `postgres-password` | New cluster operator bootstrap password; readable by PostgreSQL UID999 only; never reused as API/runtime credentials |
| `postgres-tls/ca.crt` | Approved CA, readable at its read-only API/PG mount |
| `postgres-tls/server.crt`, `postgres-tls/server.key` | Server TLS identity; verify actual names in `postgres/postgresql.conf`; private key readable only by UID999 |
| `gateway-tls/fullchain.pem`, `gateway-tls/privkey.pem` | Approved staging HTTPS certificate/key, readable by gateway UID1000; private key restricted |

The separate `PACT_PG_DATA` directory belongs to UID999; `PACT_CLOCK_DIRECTORY` belongs to UID1000 and mode0700. The wrapper verifies private JSON file UID/mode, regular-file identity, allowed keys and nonplaceholder values. No symlinks, silent missing-path creation or substitution of a migration URL in the live runtime file. Review final preflight requirements before creating directories.

| API setting | Staging value or requirement |
| --- | --- |
| `PACT_HOSTED_PROFILE` | `hosted` |
| `PACT_HOSTED_ORIGIN` | Approved exact public PACT HTTPS origin, without path/query/trailing slash |
| `PACT_HOSTED_PROCESS_MODEL` | `single-persistent-process` |
| `PACT_HOSTED_HOST` | `127.0.0.1` or approved `::1` |
| `PACT_HOSTED_PORT` | Approved unprivileged loopback port; image default4100 |
| `PACT_HOSTED_CLOCK_DIRECTORY` | Existing private persistent local directory as seen by the API container; image default `/pact-clock` |
| `PACT_HOSTED_DATABASE_URL` | Private runtime-role PostgreSQL URL with verified TLS and mounted certificate paths |
| `PACT_HOSTED_PEPPER` | Fresh cryptographic secret of at least32 random bytes encoded base64url, generated/stored by the approved secret manager |
| `SOLANA_RPC_URL` | Explicit approved private Solana Devnet RPC; no Mainnet |
| `SOLANA_RPC_FALLBACK_URL` | Optional distinct approved server-only fallback |
| `PACT_HOSTED_LOCAL_DB` | Omit; PGlite is a local/test alternative, not staging PostgreSQL |
| `WEB_CONCURRENCY` | Omit or `1`; no worker/hosting markers that imply unsupported topology |

Keep migration-role injection separate from runtime-role injection. The migration CLI uses the same configuration validator, including HTTPS origin, secret, RPC and clock-directory settings, but does not start a listener or bootstrap the clock.

For the web/gateway, follow [environment profiles](../../operations/ENVIRONMENTS.md) and the final staging kit. Explicit hosted build/start settings must match: `PACT_ENV_PROFILE`, Devnet/program/public RPC, exact `PACT_APP_ORIGIN`, auth/process/policy selections and any protected offer. The kit selects legacy SDK `PACT_AUTH_MODE=disabled`, `PACT_PROCESS_MODEL=stateless`, `PACT_SERVER_POLICY=disabled`; this does not disable the independent hosted SQL console/connect authentication. It fixes `PACT_HOSTED_API_INTERNAL_URL=http://127.0.0.1:4100` and Next loopback port3000. Browser RPC must be intentionally public, HTTPS origin-only and credential-free. API pepper, private RPC, DB URL, API key and wallet grant must never enter `NEXT_PUBLIC_*`, React props, browser storage or build bindings.

## 5. Verify and apply the six migrations

Keep all ingress and API owners stopped. From the approved repository/artifact root, inspect the committed files. These SHA256 values are for the unchanged LF-encoded files at the preparation baseline; compare them with the final reviewed source and investigate any difference. Never edit an applied migration to resolve a mismatch.

```text
89e804b9590bc8f4855ed8ca9c8e71c3a1687597d7e86643d43ddab44995a389  001_platform.sql
a5f548b101e78921326e424fb021a4d93ec2fadcd8fc06df97f96a377e6ecd63  002_resources.sql
fd811bfc647b2d0fae7fd65552aa28fb9df6b0eab00829bfd25e920da60b135c  003_connect.sql
19714c4c79f0568746aff561b3ccac6312f9d2c59eaf0648557516566bd81fee  004_callback_incarnation.sql
88860dfa735088e8c9ebaa8712b2cc55bb082c013cd9d5a5dc71e406c53e3dd9  005_access_observability.sql
961e4f31e3d8aa5c7847a9d08702426fb37fcdfd20edaca13356346d9b898b2c  006_clock_authority.sql
```

```sh
sha256sum services/pact-api/migrations/*.sql
```

With approved migration-role configuration privately injected, run the existing CLI from the repository/artifact root:

```sh
npm --prefix services/pact-api run migrate
```

Inside the existing API image's `/pact/services/pact-api` working directory the equivalent is `node src/migrate.mjs`. The final kit must supply the reviewed one-off migration invocation; do not start its normal API service as migration authority. A successful migration prints only `Hosted schema migration verified.` It takes an advisory transaction lock, compares stored names/checksums, applies missing approved SQL and records checksums atomically. Unknown/applied-changed files fail. Migration006 resets nonlocal callback proofs; first clock bootstrap also retires pre-clock credential metadata.

After migration, the operator applies runtime grants in this database:

```sql
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO pact_runtime;
REVOKE ALL ON platform_migrations, clock_bindings FROM pact_runtime;
GRANT SELECT ON platform_migrations TO pact_runtime;
GRANT SELECT, INSERT ON clock_bindings TO pact_runtime;
```

These migrations create text IDs and no sequences, so no sequence grants are needed. Review privileges for each future migration instead of granting blanket default privileges on future tables. Verify runtime cannot create/alter/drop schema or tables, cannot change `platform_migrations`, and cannot update/delete clock bindings. Provider/operator privilege tests are pending until performed on the selected target.

Switch to runtime configuration. Hosted startup verifies the exact migration list/checksums and performs no DDL. An optional verification without listener/clock bootstrap, from the artifact root with runtime configuration injected, is:

```sh
node --input-type=module -e 'import {configuration} from "./services/pact-api/src/config.mjs"; import {createDatabase,verifySchema} from "./services/pact-api/src/database.mjs"; const db=await createDatabase(configuration()); try {await verifySchema(db); console.log("SCHEMA_OK");} finally {await db.close();}'
```

## 6. Prepare the clock, start privately and probe HTTPS

Before first API startup create the selected local persistent clock directory, owned by the **actual runtime UID/GID**, mode0700. Do not populate it with an old authority file. The existing image uses nonroot `node`; inspect the final Compose user/mount mapping before creating the host directory. It must survive container replacement. Mount certificates read-only and the clock writable; use a read-only container root filesystem and the final kit's bounded runtime settings. Never add a clock-volume cleanup task.

With ingress closed, use the final kit's reviewed startup command as runtime authority. The existing image starts `node src/start.mjs`; direct artifact-root startup is `node services/pact-api/src/start.mjs`. Do not run both. Confirm exactly one owner acquired the directory. A healthcheck must not restart a still-live process into a second owner or erase its lock.

Probe process liveness separately from readiness on the approved loopback host and public HTTPS gateway. With a nonsecret approved origin already set as `PACT_STAGING_ORIGIN`:

```sh
curl --fail --silent --show-error --max-time 10 "$PACT_STAGING_ORIGIN/v1/health/live"
curl --fail --silent --show-error --max-time 10 "$PACT_STAGING_ORIGIN/v1/health/ready"
```

Use system/approved CA verification; never add `-k`. Readiness must name `solana-devnet` and reviewed program `EiiiWWsW2kkqP6nugHz6iBADvhnW5xnibAtZ82ZExVqy`. It checks schema and actual hardened reader readiness, not a buyer entitlement. Verify the exact HTTPS issuer, DNS/certificate renewal, fixed `/v1` routing, rejected unauthorized Origins, missing/malformed credential denial, and inaccessible direct API/DB ports. Test DB/RPC failures privately and expect503/fail-closed authorization; liveness can remain200 during dependency failure. Do not open traffic based solely on liveness.

Disable raw request URL/query, body, cookie, Authorization and callback-code capture at the TLS proxy, web, consumer, APM and error collector. The API disables request logging, but that does not configure the proxy/provider. A callback URL can contain a bearer code; even HTTP access logs are sensitive. Alerts use fixed error classes/request IDs and numeric status, never raw proofs. Verify redaction with disposable fixture material before any human proof. Do not collect automatic browser traces/screenshots with live secrets.

The owner approves perimeter limits, dashboard/uptime monitor, alert recipient and renewal jobs. API route/IP limits see loopback aggregate rather than trusted external client IP; forwarded headers are not trusted. Nonlocal callback verification lasts24hours and needs deliberate DNS revalidation/renewal; the proof token also expires after24hours. Renewal changes callback incarnation and can invalidate pending login. The code has no automatic DNS renewal or retention scheduler.

## 7. Rehearse normal restart, crash and authentication behavior

| Event | Required action and expected outcome |
| --- | --- |
| Graceful replacement | Close/drain ingress, deliver SIGTERM and wait for the actual API process to exit. Keep SQL, issuer, pepper and clock directory. Wait until trusted wall time exceeds the saved ceiling, then start exactly one owner. Unexpired SQL sessions/keys/grants and one-use/revocation records remain effective. |
| Restart too soon | `CLOCK_RESTART_QUARANTINED` can occur within the prior100ms durable ceiling. Wait using trusted host time and retry; do not edit state. |
| Abrupt crash | Stop ingress, stop the supervisor restart loop and prove every former process/host owner cannot write. Preserve evidence, then manually move **only** stale `owner.lock` to a private incident directory. Keep `authority.bin` and all SQL bindings. Restart one owner only after trusted time and state are verified. No PID-only or automatic stale-lock removal. |
| Clock fault/missing or mismatched state | Deny and investigate. Missing file plus existing SQL binding, file without binding, corrupt/replaced file and UUID mismatch do not bootstrap. Never delete/recreate the file or binding to bypass refusal. |
| Pepper or issuer change | Both change the namespace. Reusing the old clock directory fails binding checks. Plan offline quarantine, a new secret and new empty private directory, then reauthenticate/reissue. Old HMAC-bound cookies, credentials, grants, codes/proofs and DNS tokens are invalid. |
| SQL/clock backup restore | Follow section8; old valid state with the old pepper can revive later-revoked authority. Checksums do not detect a valid old backup. |

Hosted admin sessions and buyer grants last15minutes; admin/action and buyer challenges2minutes, login transactions5minutes and codes1minute. API credential expiry is selected between1minute and90days. No refresh-token mechanism exists. Hosted cookies are Secure/HttpOnly/SameSiteStrict with `/v1` path. Preserved unexpired authority still needs current account/app/policy, callback and licensing checks. A connected wallet icon is not authentication.

The customer-hosted SDK/demo and supplied consumer example sessions are process-local: their own restart denies and requires fresh login. Do not confuse them with the hosted API's SQL persistence. A lost admin wallet has no implemented recovery/delegation flow.

The clock persists a100ms ceiling before returning actual wall time; it never future-dates licensing proof. Backward/frozen/slow wall time, accumulated negative NTP slew, storage faults or three uncertain sampling attempts latch authorization unavailable. About1ms rounding allowance is not an operator-adjustable grace period. Synchronous disk stalls block Node and cannot be interrupted by the7second handler timer. Final guards deny stale decisions, but a COMMIT already sent may complete despite a lost acknowledgement: inspect state before a new signed action. There is no hard response-time SLA, transparent failover or replica guarantee. Accept long-duration NTP/suspend/storage behavior on the selected VM before a pilot.

## 8. Back up and restore with a new authentication epoch

Approve RPO/RTO and retention before scheduling backups. A provider snapshot/PITR promise, successful dump or archive listing is not a demonstrated restore. Encrypt backups, restrict access, preserve source/artifact/schema identity and checksum privately, and measure a complete isolated drill. Back up operator role/grant definitions, approved certificate/configuration identities and secret-manager recovery separately. A single-database dump does not contain PostgreSQL roles, VM settings, secret-manager custody or a safe reusable authentication epoch.

The provider commands below are **prepared, not executed on staging**. Local Windows/native evidence includes portable dump/restore, packaged quarantine, old-authority denial and fresh authorization; retain the separate final18.6 results in the release record. That is not selected-provider/Linux recovery evidence. Use approved PostgreSQL18.6 client tooling outside the slim application image, which is not assumed to contain `psql`, `pg_dump` or `pg_restore`. Private libpq service aliases resolve host/database/user/TLS settings from the approved service file and password mechanism. `pact_staging_backup` means the authorized source; `pact_staging_restore` must mean the newly provisioned isolated destination as migration authority. Do not put a password or DSN in command arguments. Service names are not secrets, but the associated files are private. See [PostgreSQL service files](https://www.postgresql.org/docs/18/libpq-pgservice.html).

```sh
pg_dump --dbname=service=pact_staging_backup --format=custom \
  --no-owner --no-acl --file=/private/backup/pact-approved.dump
sha256sum /private/backup/pact-approved.dump
pg_restore --list /private/backup/pact-approved.dump
```

Review warnings and the source identity. `--list` checks the table of contents only. A [custom-format dump](https://www.postgresql.org/docs/18/app-pgdump.html) is a consistent single-database snapshot, not the entire operational recovery plan. The earlier standard native test used a stopped database clone; the new portable local drill closes that file-format gap without establishing provider, PITR or Linux operational recovery.

For recovery, stop/drain **all API and authentication ingress/processes**, provision an explicitly new empty isolated database owned by the migrator, and bind the private restore alias to it. Do not use `--clean` or `--create` against an existing target. Restore only an approved trusted archive; restore executes its SQL. With migration authority:

This kit fixes the runtime endpoint to database `pact_hosted` on same-host loopback55432. Restore rehearsal therefore uses a separate isolated cluster/VM with that database name (or a separately reviewed temporary endpoint). Keep the original cluster preserved and ingress closed. Accept quarantine/rekey/recovery on the isolated target before owner-controlled promotion under the fixed endpoint; do not point the normal runtime wrapper at an arbitrarily renamed restore database or replace a running cluster's files.

```sh
pg_restore --dbname=service=pact_staging_restore --no-owner --no-acl \
  --exit-on-error --single-transaction /private/backup/pact-approved.dump
psql 'service=pact_staging_restore' --set=ON_ERROR_STOP=1 \
  --file=services/pact-api/operations/restore-quarantine.sql
```

The restore options are described in [PostgreSQL18 pg_restore](https://www.postgresql.org/docs/18/app-pgrestore.html). This is an operator path, not an automatic product task. Quarantine SQL is an offline operation, not migration007: it pauses apps/increments policy epochs, revokes restored keys/sessions/grants, consumes proofs and codes and resets nonlocal callback verification. It preserves apps, resource history, audit evidence and old clock bindings. Lock/statement timeout failure rolls back; investigate rather than removing its safeguards.

Verify all six migration checksums, reapply section5's runtime grants because `--no-acl` excludes grants, and inspect restored capacity counts. If the backup predates an approved migration, explicitly inspect/apply the missing migration while still offline, then verify/quarantine before any listener. Use a **new secret-manager pepper and a new empty private clock directory**. Never copy the old authority into it or restore the old pepper onto ingress. Retain old clock/backup evidence privately; do not erase old SQL bindings. Start one runtime owner only after trusted host time and the new configuration are accepted.

Prove old key, cookie, grant, code and pending proof deny, including with an otherwise valid fresh key where needed to isolate the test. Reauthenticate the actual owner wallet, review retained resource history, reprove callbacks, create new short-lived credentials, deliberately reactivate the app and obtain a fresh buyer grant. Verify fresh license denial/allowance through the actual independent backend. Keep ingress closed until this passes. Record actual restore duration and last recoverable point against the accepted RTO/RPO.

## 9. Owner acceptance and opening staging

1. Review the exact final kit/source/artifact identity, the four required checks and separate actual Linux container evidence. No previous CI result approves a new kit automatically.
2. Approve the new VM/provider/domain/database/secret/backup choices and verify the old public project is isolated.
3. Complete TLS, roles, six migrations, runtime grants and one-owner clock startup with ingress closed.
4. Complete HTTPS/routing/redaction, liveness/readiness, negative authorization, DB/RPC failure, admission and time/volume tests.
5. Complete graceful restart, crash lock custody and isolated backup/quarantine/rekey recovery; accept measured RPO/RTO and availability limits.
6. Approve a separate consumer's exact HTTPS callback and server-only credential/session handling. Supplied example process-local storage is an explicit pilot limitation.
7. Have the human owners execute [Phantom acceptance](PHANTOM_ACCEPTANCE.md), with message approval separate from any Devnet transaction authorization. Record only sanitized outcomes/public transaction evidence under the approved privacy policy.
8. Record discrepancies and owner go/no-go before opening the isolated staging origin. A1–3 developer pilot, invitations, publication, broader rollout and any transaction remain separately authorized actions.

Rollback closes the hosted gateway and preserves database, clock and purchase evidence, returning users to the existing customer-hosted SDK option if approved. It cannot reverse finalized transactions or retrieve already-delivered content. No Mainnet, commercial SLA, copyright-transfer guarantee, public SSO or wallet custody is established by this preparation.
