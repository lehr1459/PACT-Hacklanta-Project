# Distribution and compatibility policy

0.2.0 is an unpublished candidate. The package is deliberately marked private to prevent accidental registry publication; local packing and isolated testing remain supported. No repository license file or owner-approved distribution grant has been supplied. This preparation makes no license or commercial representation. The owner must approve the actual license, rights to distribute and intended recipients before third-party sharing; do not invent an MIT or other grant.

## Supported integration

The root/checkout/widget APIs target the fixed PACT Solana Devnet program. Node 24 is the supported server major; the exact tested security pin is recorded in the repository's runtime policy. Node 20/22/25 are not validated targets. ESM exports can be imported dynamically by CommonJS. React is optional; the declared peer range is React 18/19, with specific consumer evidence recorded separately. Next.js 16.4 and locked Chromium are the initial framework/browser targets. Other browsers, native mobile wallets, serverless authentication and multi-worker authentication are not established by this release.

One persistent same-origin customer Node process owns server authentication and protected resources. Restart invalidates all challenges/sessions. Public lookup and browser UI never establish authorization. Authenticated operations need server policy and fresh chain state. The customer owns hosting, clock synchronization, data retention and operation atomicity. Content already delivered can be copied and cannot be retracted at expiry.

## Versioning

Before 1.0, increment the minor version for intentional HTTP contract tightening or incompatible behavior; use a patch for compatible corrections. Preserve exports where practical, document migration requirements, and test the packed artifact against the API and representative consumers. Additional response fields can be additive; accepting older incomplete data is not required when it defeats identity/freshness checks. Do not claim the REST `/v1` path alone guarantees compatibility across SDK releases. Keep the SDK/API compatibility pair and artifact hashes in each release manifest.

## Preparing a candidate

Use a fresh committed checkout and the pinned Node/npm runtime. Build from locked inputs, pack without publishing, validate the contents/exports/types and install the resulting tarball into clean Node, browser, React and Next consumers. The release script repeats independent package builds and compares every published byte and tarball hash. Keep the tarball, SHA-256, npm integrity, source revision, input manifest and verification receipts together. A local hash manifest is evidence of correspondence; it is not a cryptographic publisher signature or registry provenance attestation.

The package includes compiled ESM/declarations, browser bundles, README, this policy and changelog. It excludes tests, fixtures, environment files, private keys and workspace dependencies. Public SDK constants and sample data are public information. Review any package-content change and dependency/security exception before release.

## Future npm publication

HUMAN ACTION REQUIRED: approve distribution/license, package scope ownership, repository identity and the exact candidate artifact. Publication is not performed by this repository's validation jobs. An authorized maintainer must configure npm trusted publishing for the actual repository/workflow/environment and verify GitHub Actions OIDC support and npm provenance eligibility at that time. Do not add a long-lived npm token or guess account settings. Only after those approvals should a reviewed publication change remove `private`, declare correct package/repository metadata, grant narrowly scoped `id-token: write` to a dedicated publication job and use the approved npm provenance workflow. GitHub-hosted runners and public repository metadata must satisfy [npm's trusted-publishing requirements](https://docs.npmjs.com/trusted-publishers/) and [provenance prerequisites](https://docs.npmjs.com/generating-provenance-statements/); private-repository publication does not establish a generated provenance attestation. Verify registry bytes and attestation after publication. A prepared tarball is not proof that trusted publishing is configured.

Security findings, the announced October21 Node security update, exception deadlines, real wallet acceptance and hosted CI evidence must be resolved or explicitly accepted within the approved pilot policy before broader use. Mainnet/commercial release is a separate decision.
