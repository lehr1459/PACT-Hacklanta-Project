# Current-checkout validation

Use the repository root in a fresh committed checkout. Required automation is `scripts/validation/run.mjs`; historical `qa/` patch/overlay scripts are reproduction evidence, not the current validation entrypoint. The runner records revision, exact commands, timings, exit results and separate logs under ignored `web/test-results/validation/<lane>`.

## Toolchains and installation

Node **24.11.1**, npm **11.6.2**, and Chromium matching the locked Playwright are the initial supported engineering environment. Required JavaScript lanes run in Linux CI. The pinned Solana compiler and Foundry setup currently require Windows; the chain CI lane uses Python **3.13.5**. See `solana/toolchain.json`, `solana/requirements-lock.txt` and `contracts/dependencies.json` for immutable tool/dependency pins.

```text
node scripts/validation/run.mjs environment
node scripts/validation/run.mjs install
node web/node_modules/@playwright/test/cli.js install chromium
```

On Linux CI, install browser system dependencies with `install --with-deps chromium` instead. Installation deliberately builds the SDK before installing its local consumers. All four committed npm lockfiles are used with `npm ci`; do not replace them with a workspace migration or copy a workstation's `node_modules`.

## Required lanes

```text
node scripts/validation/run.mjs all-node
node scripts/validation/run.mjs all-chain
```

`all-node` includes installation. It runs SDK type/tests, API/auth and audit-policy tests; web/example types and production builds; production startup/routes; sequential Solana and Base mock/setup browsers; the integration wizard and actual generated consumer; checkout/widget and examples; isolated packed consumers; read-only dependency audits; and committed artifact integrity. Web browser configurations share a build directory and must run sequentially. Tests use synthetic wallets/RPC and never contact a wallet for approval or send a chain transaction.

`all-chain` verifies/downloads the pinned tools, compiles the Solana program, runs compiled local-runtime tests and Base Foundry tests, compares compiler settings/ABI/bytecode hashes, and rejects unexpected changes to approved artifact evidence. Local artifacts are not deployment attestations. The workflow does not deploy, publish or access signing credentials.

Individual lanes are listed by:

```text
node scripts/validation/run.mjs help
```

## Package isolation and protocol evidence

```text
node scripts/validation/packed-consumer.mjs
node scripts/validation/dependencies.mjs
```

The packed-consumer test builds and packs without publishing, installs extracted tarballs in OS temporary projects, and tests Node/JavaScript, strict TypeScript without React, React SSR, a real Next production build/server, hydrated browser verification, ESM/IIFE checkout assets and a rejected server-entry client import. It retains the artifact hash, package contents, independently resolved consumer locks, logs and results. No consumer uses a repository dependency junction.

Protocol fixtures in `packages/pact-sdk/tests/golden/` come from Python struct, solders and Foundry Keccak. SDK and marketplace tests consume the same independent constants; they do not regenerate expected bytes with the implementation being tested. A different valid static-account ordering is compared by complete resolved instruction semantics and privileges. See the fixture README before intentionally regenerating them.

See [dependency triage](../security/dependencies.md) for scoped, expiring exceptions and [recovery comparison](recovery-parity.md) for the state-machine parity requirements.

## Explicit optional external checks

```text
node scripts/validation/run.mjs live-read
node scripts/validation/run.mjs external-saturday
```

`live-read` uses existing public Devnet read allowlists. It is an explicit workflow-dispatch option, separate from required deterministic CI: RPC outages and mutable demonstration accounts are external evidence, never silently converted into success. No transaction method is permitted.

The Saturday compatibility lane requires an explicit `PACT_EXTERNAL_SATURDAY` checkout path. Without it, the optional lane records a skip. PACT bundles that external source read-only into its own ignored output; it never patches or installs into the external checkout. Ordinary PACT validation has no dependency on that repository.

## Interpreting results

Record failures and intentional skips by name and mode. Mock-mode skips for tests belonging to setup/live modes are expected; execute the required separate setup lane. An optional external skip is not evidence that the external integration passed. A local Windows replay does not establish Linux or hosted GitHub success. Public CI execution requires an authorized push/dispatch; the prepared workflow alone is not a hosted result.

Use clean CI checkouts without active `.env` files. Never inspect or overwrite a user's local configuration to make tests pass. The runner removes inherited fixture, public configuration and authentication flags and supplies explicit per-lane values; Next's own environment-file loading is another reason release validation must use a clean checkout. Phase 5 release/environment guards build on this requirement.

`--clean` makes the runner reject ambient active environment files by their existence without reading them; CI enables this check automatically. Use it for local clean-checkout release evidence as well. A targeted run against a developer's existing configuration remains useful but is not a clean-release result.
