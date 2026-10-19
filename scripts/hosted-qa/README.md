# Independent hosted API acceptance

Run from the repository root with the pinned Node runtime and installed hosted-service dependencies:

```text
node --test scripts/hosted-qa/phase1.test.mjs
node --test --test-concurrency=1 scripts/hosted-qa/phase1.test.mjs scripts/hosted-qa/phase2.test.mjs
```

The harness uses native PostgreSQL, actual loopback HTTP requests and disposable Ed25519 wallets. It does not import production signing, base58 or canonicalization helpers. It creates a separate `pact_hosted_qa` database and new random principals each run; it does not truncate an existing schema or stop the database service. Repeated runs retain test records in the disposable cluster.

By default it connects to the ignored local QA PostgreSQL fixture on port 55439 using explicitly synthetic test credentials. CI may supply `PACT_QA_DATABASE_URL` with its local PostgreSQL connection string. The safety guard requires exact host `127.0.0.1` and database `/pact_hosted_qa`; the supplied test database user must be allowed to create that database if absent. Never supply a production database.

Phase 1 covers two-admin tenant isolation, CSRF/origin and browser bindings, exact action/payload/session proofs, replay and concurrent consumption, concurrent partial updates, callback canonicalization/DNS renewal/revocation, key metadata and verifier storage, rotation overlap/revocation, process/connection restart, database unavailability, application quota races and rotation quota limits. Credential tests exercise the actual backend-only `/v1/credentials/validate` HTTP endpoint; supplemental scope checks call the exported verifier. Subsequent phases must also verify actual key-authenticated licensing HTTP access routes.

These deterministic tests establish local behavior. They do not establish GitHub CI success, real-wallet acceptance, public hosting or a production security audit.

Phase 2 adds manually encoded Solana account fixtures served by an actual loopback HTTP RPC. The service uses the existing hardened SDK reader, preserving genesis/program/owner/PDA/Clock validation. Tests exercise signed seller ownership, invalid chain evidence, tenant/input restrictions, immutable keys, version history, epoch progression, concurrent version conflicts and emergency disable. The fixture permits only read RPC methods; it cannot submit a transaction. Hosted grants do not exist in this phase, so their epoch invalidation is tested later.
