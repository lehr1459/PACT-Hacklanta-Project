# Changelog

## 0.2.0 — release candidate

This pre-1.0 minor release preserves the root, checkout, widget, v1, server and React exports. It deliberately tightens HTTP response validation: an older server returning incomplete responses can now fail validation. Upgrade the SDK and matching API together and verify the supported integration before rollout.

- Bounded concurrent server reads retain shared slot/Clock history and fail closed on stale, backwards or frozen snapshots. Cancellation does not recycle workers while ignored transport work remains outstanding.
- Customer-owned resource policies authenticate the wallet and check current entitlement before preparation and again before delivery or synchronous commit. Public lookup remains non-authorizing.
- Marketplace recovery captures exact entitlement baselines and preserves ambiguous/sticky-confirmed purchase protection across compatible journals.
- The v1 HTTP contract validates identity, canonical integers, context/freshness and response relationships at runtime, including negative states. Unsigned preparations are checked against the expected program, instruction semantics and exact metadata commitment.
- Offer HTTP responses include nonce for PDA verification; prepared offers include fresh snapshot context; transaction status includes contextSlot in declarations and OpenAPI.
- SDK release preparation uses clean committed source, an approved runtime, LF output, repeated isolated builds and exact package comparison. Node 24.22.0/npm 11.19.1 are the current validation target, subject to the dated security review in the runtime policy.

No npm publication, program upgrade, new payment asset, transfer, refund, active renewal or protocol migration is part of this candidate. See DISTRIBUTION.md for unresolved owner decisions and publication boundaries.

## 0.1.0

Initial local SDK and additive developer-platform exports. Historical test/deployment reports do not constitute release approval for 0.2.0.
