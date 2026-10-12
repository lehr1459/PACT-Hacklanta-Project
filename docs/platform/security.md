# Security model and limits

The chain records immutable offer parameters and buyer-bound license expiry, not legal ownership or copyright transfer. Exact public metadata is committed by hash; PACT does not recover it from that hash, authenticate the seller's legal claims or provide a public registry.

Three separate checks exist: public entitlement lookup, wallet-control authentication and server authorization of a configured operation. Public addresses, browser callbacks and validity booleans cannot prove identity. A valid signed challenge creates a short-lived opaque session; each protected request then checks a fresh, correctly owned/bound entitlement against the fixed Devnet program and coherent chain Clock.

Only the operator/customer wallet signs. The API prepares unsigned transactions and reads status; no server signing/broadcast endpoint or wallet custody exists. The React checkout delegates transaction security, explicit consent, signature/message checks, finalization, pending protection and read-only recovery to the established SDK.

Authentication implements these controls within its documented **single persistent Node process** model: random expiring one-use challenges, exact origin/network/program/wallet/binding, native Ed25519 verification and HttpOnly SameSite cookies. It is disabled by default and refuses known serverless runtimes. Multiple instances/workers, persistence, account recovery, distributed rate limiting and shared replay prevention are deferred. This platform is not ready for distributed production authentication until those requirements are implemented and reviewed.

Chain reads are bounded, account/PDA/owner/discriminator and context checks fail closed, and prior positive authorization is not used on failure. Root SDK freshness remains eight seconds from read start and twelve seconds without slot progress, with chain-clock expiration enforced. The HTTP client rechecks positive snapshots on receipt; transport time consumes the freshness budget. Every protected operation starts a fresh read; long operations must recheck at their commit boundary. The configured RPC provider remains a trust boundary; these account checks are not a cryptographic proof of RPC honesty or independently verified consensus.

Frontend hiding is only UX. It cannot secure already downloaded content or stop a modified client from bypassing a local gate. Protect confidential data and premium operations on the application's backend. Returned content can be copied; expiration cannot retract it. Secure origin hosting, dependency review, infrastructure hardening and application-specific policy remain developer responsibilities.

SDK server modules are Node-only and excluded from browser entrypoints. React is optional; no database, authentication provider, new chain capability or production signing credentials are introduced. All automated wallet interactions are synthetic; real Phantom approvals/purchases remain separately authorized manual checks.
