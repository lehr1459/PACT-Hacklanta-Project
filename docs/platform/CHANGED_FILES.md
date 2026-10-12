# Changed-file inventory

Changes relative to rollback checkpoint `7f217d506245b02ae4818d3e0bf6d3ff9941edda`. Pre-existing agent/profile edits and the short Explorer link were captured in that checkpoint, not changed as platform functionality. Ignored build/dependency/QA artifacts and unrelated Saturday release document are excluded.

## Public project documentation

- `README.md`

## SDK interfaces, server utilities, React wrapper and compatibility tests

- `packages/pact-sdk/package-lock.json`
- `packages/pact-sdk/package.json`
- `packages/pact-sdk/src/platform-types.ts`
- `packages/pact-sdk/src/react.ts`
- `packages/pact-sdk/src/server-auth.ts`
- `packages/pact-sdk/src/server-chain.ts`
- `packages/pact-sdk/src/server.ts`
- `packages/pact-sdk/src/v1.ts`
- `packages/pact-sdk/tests/platform-qa-v1.test.mjs`
- `packages/pact-sdk/tests/server-auth.test.mjs`

## REST wiring, additive wizard guidance and test configuration

- `web/app/api/v1/[...path]/route.ts`
- `web/components/developer-platform-panel.css`
- `web/components/developer-platform-panel.tsx`
- `web/components/integration-wizard.tsx`
- `web/lib/platform/api.ts`
- `web/package-lock.json`
- `web/playwright.config.ts`
- `web/tests/platform/api.test.mjs`
- `web/tests/platform/auth.test.mjs`
- `web/tests/platform/fixtures.mjs`
- `web/tsconfig.json`

## Independent application, configuration and synthetic browser fixtures

- `examples/pact-platform-app/.env.example`
- `examples/pact-platform-app/.gitignore`
- `examples/pact-platform-app/.npmrc`
- `examples/pact-platform-app/app/api/pact/[...path]/route.ts`
- `examples/pact-platform-app/app/globals.css`
- `examples/pact-platform-app/app/layout.tsx`
- `examples/pact-platform-app/app/page.tsx`
- `examples/pact-platform-app/app/platform-demo.tsx`
- `examples/pact-platform-app/next-env.d.ts`
- `examples/pact-platform-app/next.config.mjs`
- `examples/pact-platform-app/package-lock.json`
- `examples/pact-platform-app/package.json`
- `examples/pact-platform-app/tests/browser.spec.ts`
- `examples/pact-platform-app/tests/playwright.config.ts`
- `examples/pact-platform-app/tests/rpc-server.mjs`
- `examples/pact-platform-app/tests/start-server.mjs`
- `examples/pact-platform-app/tsconfig.json`

## Independent QA runners and report

- `qa/platform-v1/REPORT.md`
- `qa/platform-v1/after-fetch-fix.mjs`
- `qa/platform-v1/audit-openapi.mjs`
- `qa/platform-v1/chain-deps.mjs`
- `qa/platform-v1/fix-example-origin.mjs`
- `qa/platform-v1/fix-monotonic-fixture.mjs`
- `qa/platform-v1/fix-prism-isolation.mjs`
- `qa/platform-v1/fix-test-allowlist.mjs`
- `qa/platform-v1/overlay.mjs`
- `qa/platform-v1/prepare.mjs`
- `qa/platform-v1/run-focused.mjs`
- `qa/platform-v1/run.mjs`

## Developer documentation, OpenAPI and release inventory

- `docs/platform/ARCHITECTURE.md`
- `docs/platform/CHANGED_FILES.md`
- `docs/platform/IMPLEMENTATION.md`
- `docs/platform/README.md`
- `docs/platform/api-reference.md`
- `docs/platform/backend-enforcement.md`
- `docs/platform/compatibility.md`
- `docs/platform/devnet-testing.md`
- `docs/platform/embedded-checkout.md`
- `docs/platform/errors.md`
- `docs/platform/example.md`
- `docs/platform/generate-openapi.mjs`
- `docs/platform/openapi.json`
- `docs/platform/quickstart.md`
- `docs/platform/sdk.md`
- `docs/platform/security.md`
- `docs/platform/wallet-authentication.md`

## Coordination documents

- `docs/DECISIONS.md`
- `docs/HANDOFF.md`
- `docs/STATUS.md`

Total: 71 product/test/documentation files. Original SDK index/checkout/adapter/widget, licensing and wallet utilities, Solana/Base program sources and Saturday Lights source remain unchanged.
