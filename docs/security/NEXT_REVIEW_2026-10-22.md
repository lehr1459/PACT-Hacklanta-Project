# Next.js release-blocker correction — October 22, 2026

The new-runtime hosted replay at `1ee25fe` passes 74 API tests, then correctly fails its live dependency gate on Next.js 16.4.0. Preserve that failed source/run receipt. All three Next advisories were published upstream October 14 and entered the GitHub Advisory Database October 22; earlier audit receipts are historical feed observations, not current clearance. This is maintenance of existing applications during release validation, not a product feature.

The [official Next security release](https://nextjs.org/blog/nextjs-security-update-october-14-2026) identifies **16.4.1** as the first patched 16.x version. Pin that exact patch in `web`, `pact-demo-app`, `pact-platform-app` and `pact-hosted-next`. npm's fix suggestion 16.4.2 is not the minimum-version determination; no minor/major or blind `audit fix` is used.

| Advisory | Scope reviewed | Correction |
| --- | --- | --- |
| [GHSA-2464-fhr4-w9xw](https://github.com/vercel/next.js/security/advisories/GHSA-2464-fhr4-w9xw), critical | Image processing on glibc Linux. PACT uses Next image optimization; local-only PNG callers do not justify waiving a framework surface. | Next.js 16.4.1; sharp remains 0.35.5, already satisfying the separate image workaround. |
| [GHSA-p3m5-59mp-jv5r](https://github.com/vercel/next.js/security/advisories/GHSA-p3m5-59mp-jv5r), high | App Router Server Action denial of service. No checked-in `use server`/Server Action caller found. | Upgrade; no exception or synthetic exploit needed. |
| [GHSA-673q-mjm6-r5xr](https://github.com/vercel/next.js/security/advisories/GHSA-673q-mjm6-r5xr), critical | Cache Components typed-array transport. No `use cache`/cacheComponents caller found; upstream recommends upgrading regardless. | Next.js 16.4.1 updates the vendored RSC transport. |

Independent security inspection distinguishes plain `react`/`react-dom` 19.3.0 from the affected standalone `react-server-dom-*` packages in the [upstream React advisory](https://github.com/react/react/security/advisories/GHSA-xqc2-xf4c-x3h3). No standalone RSC lock entry exists here. Retain the plain React/DOM versions while patching Next's compiled transport; this is not a blanket claim about arbitrary React deployments.

## Bounded dependency change

Pinned npm 11.19.1 generated package-lock-only updates with install scripts disabled, an empty private npm configuration and the public registry. Root dependency installations and `.env.local` were untouched. Independent backend review compared all four before/after graphs and registry metadata:

- Exactly 10 version changes per app: Next, `@next/env`, eight platform SWC binaries, all 16.4.0→16.4.1. All 40 changed entries match official npm tarball/integrity and declared package/platform metadata.
- The independent generated-consumer fixture also pins Next.js 16.4.1, so integration QA does not reinstall the vulnerable framework behind the patched application manifests.
- Zero package paths added/removed. Every unrelated package retains its version, resolved URL and integrity. Sharp and plain React/DOM versions remain unchanged.
- npm refreshes peer flags and Linux SWC libc metadata. The demo's external SDK record now accurately reflects its already unchanged manifest; no SDK source, manifest, lock or exported interface changes. Retain npm-generated metadata rather than inventing a hand-trimmed lock.
- Rebind only the three original Next graph hashes and hosted Next hash after this review. Exception arrays, advisory scopes, SDK graph/source fingerprints and **November 15** expiry stay byte-equivalent after JSON parsing. No critical exception is added and no gate is weakened.

Original before-lock copies, package-update logs and structured lock diff are ignored evidence under `web/test-results/release-preparation-20261022/next-patch`. The final current audit/build/browser results belong in [release preparation](../platform/hosted/RELEASE_PREPARATION_2026-10-22.md); source/registry review alone does not establish installed runtime acceptance. Require all four production builds/typechecks, hosted API/BFF/browser acceptance and the full preserved marketplace/SDK/demo/platform browser regression matrix. Linux container and new remote CI remain required separately.

The older public deployment is not patched by this local commit. Its owner must inspect actual artifact/runtime exposure and separately approve any release; nothing in this review deploys or authorizes that change. No transactions, wallet approvals, package publication or Saturday Lights modifications occur.
