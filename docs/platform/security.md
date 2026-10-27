# Security model and limits

PACT records fixed offer parameters and buyer-bound license expiry on Solana Devnet. Entitlement is not copyright ownership, legal title, identity verification or a representation that the seller holds the rights offered. Exact public metadata is hash-committed and retained off-chain; PACT supplies no hosted metadata/acceptance registry.

Public lookup, wallet proof and server authorization are separate. A browser address, callback or valid boolean cannot authenticate or authorize a resource. The server derives the wallet from an opaque session, selects the offer from its own resource policy and obtains fresh chain state before preparation and again before delivery/commit.

The supported topology is one persistent customer-hosted Node process, one origin and one handler instance, explicitly configured with `authMode:'single-process'`. Known serverless/worker/cluster markers disable auth. Their absence does not prove one instance; the operator guarantees topology. Restarts invalidate sessions. Distributed replay/session/rate state, SSO and database persistence are deferred.

The handler verifies random expiring one-use challenges, exact message/identity/origin/binding and native Ed25519 signatures. Cookies are HttpOnly, SameSite Strict and Secure on HTTPS. Keep clock synchronization, TLS termination, proxy origin handling and private asset paths under application control.

Freshness is bounded from read start, not receipt: eight seconds of read age and twelve seconds without required progress, with chain expiry enforced. Server reads also enforce chain/server clock alignment within sixty seconds and expiry later than the server Unix second. That skew bound does not extend an expired license. RPC errors, malformed identities, queue overload, stalled progress and time regression deny access. The RPC provider remains trusted infrastructure; account checks are not independent consensus verification.

Request/chain concurrency, queue lengths, body sizes and deadlines are bounded. Work that ignores abort retains its capacity until settlement. These are per-process controls, not a distributed abuse guarantee. `prepare` must be side-effect-free and bounded; synchronous commit is a trusted host contract, not a transaction manager for arbitrary external effects.

Checkout validates exact metadata and reviewed transaction bytes and requires user approval. Servers prepare unsigned transactions and never hold wallet credentials or expose a signing/broadcast endpoint. Recovery reads existing signatures without automatic sends. Real wallet dialogs, current runtime advisories, application policy and infrastructure need separate review.

Frontend hiding is UX. Protect every confidential resource/action on the backend and prevent static/cache/alternate-route bypasses. Delivered bytes can be copied and persist after expiry; this is not DRM. Local test passes are not a production audit. See [authorization](../development/AUTHORIZATION.md), [dependency exceptions](../security/dependencies.md) and [release assurance](../development/SOLANA_RELEASE.md).
