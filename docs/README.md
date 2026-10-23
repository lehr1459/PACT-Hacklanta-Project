# Documentation guide

Use the root [README](../README.md) for current startup and repository boundaries. Earlier milestone reports remain historical evidence; their deployment status, machine paths, preview PIDs and test counts must not be treated as current observations.

| Current reference | Purpose |
| --- | --- |
| [Architecture and cleanup audit](POST_MVP_CLEANUP.md) | Subsystem map, preservation decisions, baseline and validation |
| [Technical debt](TECHNICAL_DEBT.md) | Prioritized follow-up work |
| [Initial release contract](product/RELEASE_CONTRACT.md) | Supported hosting model, licensing semantics and exclusions |
| [Current validation](development/VALIDATION.md) / [execution record](development/EXECUTION.md) | Portable phase gates, exact commands and observed results |
| [Dependency security triage](security/dependencies.md) | Advisory reachability, scoped exceptions and review deadlines |
| [Developer Platform](platform/README.md) / [quickstart](platform/quickstart.md) | SDK v1, REST and backend integration |
| [API-first integration](platform/hosted/INTEGRATION_GUIDE.md) / [local testing](platform/hosted/LOCAL_TESTING.md) | Developer console, hosted REST, wallet grants and enforcing consumer examples |
| [API-first evidence](platform/hosted/IMPLEMENTATION_REPORT.md) / [staging and pilot gates](platform/hosted/STAGING_AND_PILOT.md) | Per-phase commits, independent reviews, exact local results and unexecuted owner gates |
| [October22 release preparation](platform/hosted/RELEASE_PREPARATION_2026-10-22.md) / [Node](security/RUNTIME_REVIEW_2026-10-22.md) / [Next](security/NEXT_REVIEW_2026-10-22.md) reviews | Runtime/framework security corrections, workflow/Docker inspection, fresh replay and exact owner-controlled release steps |
| [SDK API](../packages/pact-sdk/README.md) | Public exports and consumer examples |
| [Web guide](../web/README.md) | Configuration, chain behavior and manual wallet testing |
| [Solana wire specification](../solana/wire-spec.json) / [program guide](../solana/README.md) | Binary interface, pinned build and local program tests |
| [Solana release assurance](development/SOLANA_RELEASE.md) | Source/artifact provenance, read-only deployment identity and upgrade governance |
| [Base setup](../contracts/SETUP.md) | Preserved fallback tooling and artifact verification |
| [One-link purchasing](ONE_LINK_PURCHASING.md) | Exact metadata buyer links |
| [Embedded checkout](EMBEDDED_CHECKOUT.md) | Purchase lifecycle and recovery |
| [Integration wizard](INTEGRATION_WIZARD.md) | Generated local SDK integration |
| [Security limits](platform/security.md) | Authentication and entitlement enforcement limitations |
| [Developer guide](development/DEVELOPER_GUIDE.md) | Portable SDK installation, lookup/auth/purchase/recovery boundaries |
| [Environment profiles](operations/ENVIRONMENTS.md) / [release snapshots](operations/RELEASE.md) | Saved build bindings, local archive creation and relocated validation |
| [Operating procedures](operations/RUNBOOKS.md) / [rollout gates](operations/ROLLOUT.md) | Diagnostics, incident ownership, rollback and staged evidence |
| [Wallet and accessibility acceptance](development/WALLET_ACCEPTANCE.md) | Automated scope and exact remaining human checks |

`STATUS.md`, `HANDOFF.md`, `DECISIONS.md`, `MVP_SPEC.md`, `BACKEND_PHASE2.md`, `HACKLANTA_*`, `*_QA.md`, release/readiness reports, `platform/CHANGED_FILES.md`, and `qa/platform-v1/REPORT.md` contain historical milestones or cumulative records. Keep them for design rationale and test evidence; use current source and fresh validation for present behavior. Deployment packages are operator runbooks, not authorization to deploy.

The five applied platform-v1 source-repair scripts were removed during post-MVP cleanup. Their historical paths in `platform/CHANGED_FILES.md` describe the original implementation, not tools to rerun. Corrected source and meaningful tests remain.
