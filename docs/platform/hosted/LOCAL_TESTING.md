# Local hosted-platform testing

Use the dedicated `codex/api-first-integrations` branch and the reviewed runtime in `scripts/validation/runtime.json`. These commands do not deploy, publish, push, approve a wallet prompt or submit a transaction. The old public deployment is unchanged. Runtime security review is due **2026-10-21**; dependency exceptions expire **2026-11-15**.

## Start the local console

Use a fresh checkout with no active `.env*` files. Do not copy workstation credentials into it. Install the SDK first because the hosted service and web application consume its existing private local package:

```text
npm --prefix packages/pact-sdk ci
npm --prefix packages/pact-sdk run build
npm --prefix services/pact-api ci
npm --prefix web ci
```

In terminal one, run:

```text
npm --prefix services/pact-api run dev
```

This creates an ignored disposable local SQL database and verifier pepper, listens on `127.0.0.1:4100`, and expects the browser-visible issuer `http://localhost:3000`. It does not print the pepper or load an environment file. It uses PGlite for local exploration; PostgreSQL remains required for hosted operation and independent multi-client acceptance. Without an explicitly configured local RPC fixture, offer/licensing reads use Devnet read-only RPC and require network availability. No purchase or wallet prompt is automatic.

In terminal two, set only the fixed internal gateway target and start the web application. PowerShell:

```powershell
$env:PACT_HOSTED_API_INTERNAL_URL = 'http://127.0.0.1:4100'
$env:PACT_APP_ORIGIN = 'http://localhost:3000'
$env:NEXT_PUBLIC_PACT_SOLANA_PROGRAM_ID = 'EiiiWWsW2kkqP6nugHz6iBADvhnW5xnibAtZ82ZExVqy'
npm --prefix web run dev -- --hostname localhost --port 3000
```

POSIX shell:

```sh
PACT_HOSTED_API_INTERNAL_URL=http://127.0.0.1:4100 \
PACT_APP_ORIGIN=http://localhost:3000 \
NEXT_PUBLIC_PACT_SOLANA_PROGRAM_ID=EiiiWWsW2kkqP6nugHz6iBADvhnW5xnibAtZ82ZExVqy \
npm --prefix web run dev -- --hostname localhost --port 3000
```

Open `http://localhost:3000/integrate/developer`. Use that exact hostname: `localhost` and `127.0.0.1` are different issuers/origins. The original customer-hosted generator remains at `/integrate#self-hosted`. The new hosted console requires explicit wallet message approval for administrator login and sensitive actions. A message proof is not a purchase. Registering an application or creating an API key does not prove that its backend enforces licensing.

Only loopback HTTP callbacks are permitted in local/test profiles. Hosted operation requires exact HTTPS callbacks, DNS proof, PostgreSQL/TLS and the separately approved topology. Never route a public deployment to this local fixture or place an app API secret in `NEXT_PUBLIC_*`, a React component, a URL or browser storage.

## Run deterministic checks

```text
npm --prefix services/pact-api test
node --test --test-concurrency=1 scripts/hosted-qa/gateway.test.mjs
```

The service suite uses disposable native Ed25519 message keypairs and local SQL. It does not sign blockchain transactions. Independent native PostgreSQL/HTTP/SDK checks and production-browser instructions are in [the QA harness guide](../../../scripts/hosted-qa/README.md). The PostgreSQL safety guard permits only the dedicated loopback `pact_hosted_qa` database. Never supply a live database URL.

Production browser validation must run in a separate clean checkout with `PACT_HOSTED_QA_CLEAN=1`; the guarded build driver refuses active environment files by existence only. Do not run that build over a workstation `.env.local` or reuse another developer's `.next` directory. The final implementation report distinguishes targeted local checks, clean committed-checkout checks and remote CI receipts.

The API contract is [services/pact-api/CONTRACT.md](../../../services/pact-api/CONTRACT.md). External staging, actual Phantom/device acceptance and a Devnet pilot remain [owner-controlled gates](STAGING_AND_PILOT.md).
