# PACT

PACT (Programmable Agreements, Contracts & Transfers) is a programmable digital-licensing platform under active product development. Sellers publish offers, buyers acquire wallet-bound entitlements, and applications verify those entitlements before granting access.

Solana Devnet is the primary development environment. The validated Base Sepolia implementation remains isolated at `/base` and in `contracts/`. An entitlement records the licensing facts implemented by PACT; it does not itself establish copyright ownership or a copyright transfer. Agreements and personal information stay off-chain.

## Repository map

| Directory | Purpose |
| --- | --- |
| `web/` | Next.js marketplace: seller, buyer, verification, Studio integration and versioned REST routes |
| `packages/pact-sdk/` | Public verification, checkout, widget, React and server APIs |
| `services/pact-api/` | Private API-first developer service, PostgreSQL migrations and hosted contracts |
| `packages/pact-hosted-client/` | Private backend-only typed REST adapter |
| `examples/pact-hosted-*` | Enforcing Express/Next backends and REST diagnostics |
| `solana/` | Rust program, wire specification, pinned tooling and local bytecode tests |
| `contracts/` | Preserved Base Sepolia contract, ABI, evidence, tooling and tests |
| `examples/pact-demo-app/` | Independent read-only SDK license gate |
| `examples/pact-checkout-vanilla/` | Framework-independent embedded checkout |
| `examples/pact-platform-app/` | React checkout and authenticated backend enforcement |
| `qa/` | Independent acceptance suites and historical reproduction tooling |
| `deployment/` | Operator-controlled release preparation tools |
| `docs/` | Current guides and historical implementation evidence |

See the [architecture and cleanup audit](docs/POST_MVP_CLEANUP.md), [technical debt register](docs/TECHNICAL_DEBT.md) and [documentation index](docs/README.md).

## Local startup

Use the pinned Node/npm in [the runtime policy](scripts/validation/runtime.json) and committed npm lockfiles. Run from your actual checkout root; no fixed Windows directory is required. Build the SDK before its consumers.

```powershell
$env:PACT_ENV_PROFILE='local'
$env:PACT_APP_ORIGIN='http://localhost:3003'
npm --prefix packages/pact-sdk ci
npm --prefix packages/pact-sdk run build
npm --prefix web ci
npm --prefix web run dev -- --hostname 127.0.0.1 --port 3003
```

Open `http://localhost:3003/`, `/integrate`, or `/base`. Public configuration is documented in [web/.env.example](web/.env.example) and the [web guide](web/README.md). Missing program or contract configuration disables the corresponding chain actions. Root `.env.example` is historical Base configuration; Next.js reads configuration from `web/`. Preserve existing local environment files and never add wallet credentials.

With that same explicit environment, `npm --prefix web run build` creates the local production application; `npm --prefix web run start -- --port 3003` serves it. Build/start require a profile and matching public/origin/policy settings. This local configuration is not approval to host it. Public environment values are embedded at build time. See [environment profiles](docs/operations/ENVIRONMENTS.md) for strict preview/hosted requirements and [release snapshots](docs/operations/RELEASE.md) for clean artifact preparation. Windows compatibility checkouts with a linked `contracts/` directory use a narrowly scoped additional Turbopack root; ordinary clones use the repository root.

## Integration

The new API-first integration uses `/integrate/developer` to register applications, verify callbacks and seller-owned offers, manage credentials and inspect usage. Application backends authenticate wallet grants and ask the PACT REST API before granting access. Start with the [hosted integration guide](docs/platform/hosted/INTEGRATION_GUIDE.md), [local setup](docs/platform/hosted/LOCAL_TESTING.md), [hosted OpenAPI](services/pact-api/openapi.json) and [implementation evidence](docs/platform/hosted/IMPLEMENTATION_REPORT.md). This is locally implemented private-pilot software; the older public site is unchanged. New remote CI/container execution and owner-approved staging/real-wallet acceptance remain open gates.

Customer-hosted SDK integration remains an alternative at `/integrate#self-hosted`. The following guides describe that preserved model.

Start with the [developer quickstart](docs/platform/quickstart.md), [SDK reference](packages/pact-sdk/README.md), [REST specification](docs/platform/openapi.json), [integration wizard](docs/INTEGRATION_WIZARD.md), or [embedded checkout guide](docs/EMBEDDED_CHECKOUT.md). The SDK is local and unpublished; install its actual local path or build and pack it for another machine.

The root SDK verification API remains compatible alongside opt-in `/checkout`, `/widget`, `/v1`, `/server` and `/react` entrypoints. Client-side gates demonstrate entitlement checks. Protected resources require wallet authentication and a fresh server-side entitlement check. Current authentication deliberately supports one persistent Node process and fails closed in known serverless environments; see [security limits](docs/platform/security.md).

The three independent examples exercise different supported APIs. Their demo offers and localhost ports are example configuration, not deployment discovery or proof of a valid current license.

## Validation

Build the SDK first. Run the fixture/browser commands below in a separate clean checkout with no active environment files; preserve your existing local files. Fixture profiles deliberately reject `.env.local` and other active environment files rather than reading workstation configuration. Run browser suites sequentially within `web/`: each rebuilds the same `.next` directory with different fixture configuration. Synthetic wallets/RPC do not establish real Phantom approval or live transaction success.

```powershell
node scripts/validation/run.mjs all-node --clean
# Windows only, with the documented pinned Python prerequisite:
node scripts/validation/run.mjs all-chain --clean
```

The runner installs the SDK first and validates all three apps, API/auth, generated integrations, packed consumers, browser modes and artifact/dependency policies. Select targeted lanes from the validation guide for ordinary development; do not run shared Next builds concurrently.

The API-first platform additionally requires the [complete hosted gate](scripts/hosted-qa/README.md#complete-hosted-acceptance-gate), including native PostgreSQL, both production browser suites, private consumers, all seven dependency graphs and production/container artifact checks. Existing foundation CI receipts do not validate the unpublished feature branch. Node security review is due **2026-10-21**; scoped SDK dependency exceptions expire **2026-11-15**.

Use [current validation](docs/development/VALIDATION.md) for the clean committed-checkout runner, setup/example/packed-consumer lanes and explicit skips; the [execution record](docs/development/EXECUTION.md) distinguishes observed results from pending external gates. No lint command is configured. See [Solana tooling](solana/README.md) for local SBF/LiteSVM validation and [Base tooling](contracts/SETUP.md) for pinned Foundry validation. Compiled Solana bytecode and exported Base ABI/evidence are required inputs.

Historical QA runners may require archived candidates or a separate Saturday Lights checkout. Do not execute their source-patching helpers as ordinary product tests. Retain meaningful acceptance tests until portable replacements cover them.

## Development boundaries

Follow [AGENTS.md](AGENTS.md). Local implementation and tests do not authorize deployment, publication, wallet approval, or transaction broadcasts. Preserve Solana program identifiers, PDAs, serialization and transaction semantics, and the Base fallback. Never commit wallet secrets or put personal licensing data on-chain.
