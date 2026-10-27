# Compatibility and migration

The original `@pact/sdk` exports, `createPactClient({rpcUrl}).getLicenseStatus({offer,wallet})`, `verifyLicense`, `requireLicense`, freshness checks, checkout adapter and vanilla widget remain supported. New functionality lives at `./v1`, `./server` and `./react`; existing integrations need not migrate.

The marketplace's seller, buyer, One-Link Purchasing, manual metadata fallback, public verification, Studio gating, Devnet/Phantom handling and offer refresh stability remain intact. The integration wizard keeps its existing generated templates and adds developer-platform guidance. Base Sepolia remains isolated and unchanged.

Saturday Lights is inspected read-only as a compatibility reference. Its current root-SDK imports and external purchase workflow remain valid; its source, vendored SDK and deployment are not changed. Existing Prism and vanilla checkout examples are preserved. The new Canvas Lab application is separate.

The new API public result deliberately includes `walletControlProven:false` and `authorized:false`. Do not replace existing freshness enforcement with a cached API boolean. To protect a server action, host same-origin wallet authentication and verify authoritative entitlement for every action. The integration wizard alone does not protect an application.

No package publication or production migration happens automatically. New deployment requires operator approval and, for authentication across multiple instances, a shared atomic store and distributed rate limiting. Keep the current production rollback deployment and existing release tags.
