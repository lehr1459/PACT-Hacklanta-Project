# Final engineering security review — October 26, 2026

This independent engineering review starts at `31fd16023ccbed4f9f06f6d85aedc79ea7346728`, on `codex/api-first-integrations`. It is a code-merge review, not a hosted release approval, human security audit, or real-wallet acceptance record. The final acceptance matrix must bind the subsequent fixes and complete validation to the final committed revision and GitHub PR merge revision.

## Scope and initial evidence

Read `AGENTS.md`, the final user request, release/security/dependency records, hosting/clock/backup procedures, the complete changed-file inventory against `origin/main`, and security-critical implementation in API authentication, connect/code redemption, access checks, database/startup, private client, consumer backend, gateway, staging configuration and evidence export. This is not a claim of exhaustive manual inspection of every line in the full multi-phase changeset.

At initial inspection the local tree was clean; remote feature HEAD was `31fd160`, and remote `main` remained `7bad86992f996d9edbfff9d085483b8028e53f8a`. The full diff preserves the isolated Base contract source. Its Solana binary/evidence differences require the separate provenance review; a local security test cannot certify the deployed Devnet binary.

## Corrections required and independently checked

The fresh npm audit **failed** on the original API lockfile, despite the historical green CI. It reported one affected package, `fast-uri`, in two installed paths: Ajv's `3.1.8` and the Fastify Ajv compiler's `4.2.2`. Unique underlying advisories were two moderate findings and two low findings. This was an actual new gate failure, not permission to extend exceptions or reuse an old audit.

| Upstream advisory | Finding | Correction |
| --- | --- | --- |
| [GHSA-w74x-v6f9-j3xg](https://github.com/fastify/fast-uri/security/advisories/GHSA-w74x-v6f9-j3xg) | Percent-encoded scheme interpretation; moderate | `3.1.9` / `4.2.3` |
| [GHSA-wjr9-j795-jxcr](https://github.com/fastify/fast-uri/security/advisories/GHSA-wjr9-j795-jxcr) | Host canonicalization disagreement; moderate | Same patches |
| [GHSA-xhq7-xmqj-769h](https://github.com/fastify/fast-uri/security/advisories/GHSA-xhq7-xmqj-769h) | Relative-path equivalence; low | Same patches |
| [GHSA-333x-w4r6-6crp](https://github.com/fastify/fast-uri/security/advisories/GHSA-333x-w4r6-6crp) | Suffix reference scheme injection; low | Same patches |

PACT's callback/origin checks use Node's URL parser and explicit strict validation; the observed `fast-uri` callers are schema URI resolvers. This limits the demonstrated application exposure, but does not make the failing audit acceptable. Root applied the compatible upstream patches. Independent parsed-lock comparison verifies **exactly two changed package entries**, with only version, tarball URL and integrity changes. Both entries match the public npm registry's published metadata. No dependency manifest, other package node, exception, expiry or reachability assumption changed. Only the service graph fingerprint is rebound:

```text
122a0dccf977b4114964db154a41df0f87155745108e7d6a509da76191534635
```

A separate clean installation of the corrected lockfile, with dependency scripts disabled, followed by a live npm audit reports **zero findings** for the API graph. Ignored private evidence is `web/test-results/final-acceptance-20261026/security-evidence/service-audit-{before,after}.json`. The remaining original SDK/web advisory exceptions are separate; this API result does not clear their graphs.

The subsequent complete hosted gate at `903e2e64aa90a6252a72fa1a65722dcc2ba4e7c7` **failed** on a newly returned Express-graph finding: [body-parser GHSA-27r3-jxmh-p828 / CVE-2026-111181](https://github.com/expressjs/body-parser/security/advisories/GHSA-27r3-jxmh-p828), high severity. Upstream identifies an uncaught decompression error from trailing compressed-body bytes and fixes it in `2.4.0`. PACT's actual Express adapter deliberately reads bounded Web streams and installs no body-parser/Express JSON, raw, text or URL-encoded middleware. That limits the observed vulnerable path; it does not waive the new mandatory dependency failure or justify merging the failed candidate.

Root updated only the `body-parser` lock entry from `2.3.0` to compatible `2.4.0`, within Express `5.3.0`'s declared range. Independent comparison verifies the new registry tarball/integrity, exact dependency and engine metadata, and no other changed package entry. Required leaf ranges are satisfied by the already locked `content-type 2.1.0`, `iconv-lite 0.7.3` and `qs 6.16.1`; none is silently upgraded. Only the Express graph fingerprint changes to `afae2390df8e3617591fc22429a310b4bcb5682e1a7d302496501a8f5ba6b482`; no exception or expiry changes. An independent fresh installation followed by a live audit reports **zero findings**, and the actual Express HTTP authentication/licensing/logout/slow-body-admission regression test passes **1/1**, zero skips. These corrected-lock checks are performed in a separate `903e2e64` checkout with that lockfile applied, not relabeled as an unchanged clean-candidate run. Private `security-evidence/express-body-parser-{lock-review,audit-after}.json` retains the review.

All seven failed-run hosted audit reports were independently inspected: this was the only new failure; the API and four other new graphs reported zero findings, and the SDK retained its four accepted moderate findings with no policy failures. Final acceptance must rerun all graphs and the complete required CI against the subsequently corrected source SHA. Earlier security signoffs and successful predecessor tests do not approve the known failing `903e2e64` dependency gate.

Review of the new installed-developer demonstration and native Caddy topology identified harness cleanup/configuration issues. Root replaced predictable ambient npm configuration filenames with unique owned empty files, made failed consumer startup stop its owned child, bounded consumer shutdown, and reused the existing signal-aware process-stop helper in the topology harness. These changes preserve the product's existing authentication and licensing behavior. The Windows integrity-test ordering change retains the same checks while establishing the verified Python interpreter before archive-extraction tests.

## Independent checks actually executed

Using the verified portable Node `24.22.1` and bundled npm `11.19.1`, in a separate ordinary checkout without active environment files:

| Check | Result and source scope |
| --- | --- |
| Runtime/dependency policy, hosted receipt/export/redaction/artifact policy, fixed gateway, staging preflight/context and source archive tamper tests | **48/48 PASS**, zero skips, baseline `31fd160` |
| API tests, including auth, tenant, credential rotation, expiry, concurrent one-use consumption, schema, deadlines, clock/storage faults, retention and restart | **74/74 PASS**, zero skips, baseline `31fd160` |
| Corrected service lockfile comparison, registry metadata, policy fingerprint and unchanged exception comparison | **PASS**, exact corrected graph above |
| Fresh corrected service installation and live npm registry audit | **PASS**, zero reported findings |
| Corrected-lock API contract/compiler, connect and control-plane regressions | **17/17 PASS**, zero skips; independent checkout with the exact corrected lock subsequently committed as `cc73878` |
| Actionlint `1.7.12` on the workflow | **PASS**; optional shellcheck/pyflakes integrations unavailable and disabled, not claimed as executed |
| Tracked sensitive-path and concrete credential/private-key pattern inspection | No active environment, database backup, runtime clock record, wallet keypair, or matching full credential/private-key material found; pattern inspection is not an exhaustive secret-detection guarantee |

The first policy invocation in the dependency-free clone could not start two checks because `pg` and Playwright were absent. Those prerequisites were installed from the reviewed locks; the complete 48-case rerun passed. This prerequisite failure was not suppressed or represented as an application pass. Native PostgreSQL, complete browser/chain matrices, new demonstration/topology execution and final remote CI remain the root/QA acceptance evidence; they are not relabeled as tests personally executed by this reviewer.

## GitHub and deployment isolation

Read-only GitHub API checks on October 26 established:

- Exactly one active workflow, `.github/workflows/validation.yml`; no deployment workflow, repository hooks, deployments or environments. GitHub Pages is absent (`404`, also `has_pages:false`). Repository secret and variable inventories both have zero entries; no secret values were requested.
- Workflow events are ordinary `push`, `pull_request` and explicitly optional read-only dispatch. No privileged PR-target, workflow-run, deployment, schedule, publish, OIDC or secret-forwarding event. Top-level `contents:read`; no job elevates it. Every checkout disables persisted credentials. The scripts do not deploy the staging recipe or publish packages/images.
- All four required jobs run on push/PR: `node-and-browser`, `pinned-chain`, `hosted-api-and-browser`, `hosted-portable-windows`. PR checkout tests GitHub's proposed merge revision. Optional public reads remain optional. Superseded per-ref runs can be cancelled; require actual success at the final intended source/merge revision.
- Action commit pins independently match upstream checkout commit `11d5960a326750d5838078e36cf38b85af677262`, setup-node `v4.4.0`, setup-python `v5.6.0`, and upload-artifact `v4.6.2`. This establishes identity, not a complete bundled-dependency audit.
- Default workflow token permission is read; Actions cannot approve PR reviews. Repository-wide permitted actions remain `all` and SHA pinning is not globally enforced, although this workflow pins all actions. `main` and the feature branch are unprotected and rulesets are empty. The proposed protection/reviewer configuration is documentation, not an applied rule. No setting was changed.

The current accessible Vercel account still contains only `pact-hacklanta-demo`, project `prj_mwDbCMt3esLN5tmnzUKoQlv5HEjk`. Filtering projects by the exact PACT repository URL returns no project. Its latest production deployment remains READY, `dpl_AeyVsH68MJ784e5YePwziDGvbbr3`, from historical source `7bad86992f996d9edbfff9d085483b8028e53f8a`; its project update timestamp also remains unchanged. No deployment, domain, alias, environment, Git connection or provider setting was modified.

The connector's project detail omits Git-link/deploy-hook fields. Its separate outbound webhook-list endpoint returned **403**, so an exhaustive provider webhook inventory is **not verified**. It does not establish the presence of an incoming deploy hook. The user's explicit Vercel/Supabase no-repository-connection verification, the fresh repository mechanism audit, no matching accessible Vercel Git project, and unchanged production deployment are the available isolation evidence. They do not prove there is no inaccessible third-party automation. Recheck the visible deployment identity immediately before and after the authorized merge; ask for a specific human check if new contrary evidence makes that material.

## Runtime and dependency maintenance

Fresh primary-source review finds Node's latest security bulletin still October 21 and its advertised LTS `24.22.1`; Next's latest listed security update remains October 14, with patched `16.4.1`; PostgreSQL lists `18.6` as current for major 18. No new production-runtime patch requirement was identified by those sources. See [Node advisories](https://nodejs.org/en/blog/vulnerability), [Next security releases](https://nextjs.org/blog/security), and [PostgreSQL versions](https://www.postgresql.org/support/versioning/). This observation plus npm feeds is not general vulnerability freedom.

Python `3.13.5` is a deliberately retained **development-only** chain/golden-test pin, not a production server runtime. A new [Python `3.13.18` security release](https://www.python.org/downloads/release/python-31318/) dated October 25 addresses compromised eMudhra intermediate keys, Expat and other standard-library issues. Older tar-filter defects also exist. PACT verifies the fixed compiler archive SHA256 before Python tar extraction, and installs only hash-locked binary wheels using `pip --require-hashes --only-binary=:all:`. It does not process caller-supplied archives/XML or host a Python HTTP service. These controls substantially narrow the relevant paths; they do not patch Python's TLS/parser implementation or certify pip's entire implementation. Maintain this as explicit toolchain debt and review a supported replacement before expanding Python's input/network authority. No reachable high/critical product defect was established from the inspected use. Do not advertise the whole compiler/Python/browser/extension ecosystem as independently vulnerability-cleared.

The Node review cutoff remains **November 5, 2026 at 00:00 UTC** (November 4, 7 pm EST). Dependency exceptions remain **November 15 at 00:00 UTC** (November 14, 7 pm EST). Neither deadline is extended by this review.

## Merge and hosted acceptance disposition

The original new `fast-uri` gate failure is corrected at the reviewed lockfile level. Require the complete final clean-source matrix, corrected dependency gates and all four GitHub jobs at the proposed merge revision before the root authorizes the ordinary GitHub merge. This review does not substitute for an eligible human PR approval when a real repository rule requires it. No force-push, branch-rule bypass or provider change is authorized by the review.

The supported service remains one persistent API process/clock owner with a private durable volume, restricted PostgreSQL runtime role and separate migration authority. Restore must quarantine old bearer authority and use a fresh pepper/clock namespace before reauthentication; restoring old SQL, pepper and clock together can revive old authority. Backend ALLOW still requires exact app/key/grant/resource binding plus fresh hardened chain evidence and final expiry checks. No freshness ceiling, validation, wallet proof or fail-closed control was relaxed.

Provider-hosted HTTPS/domain/TLS renewal, long-duration time/storage behavior, offsite recovery/RPO/RTO, actual Devnet binary identity resolution, human Phantom/device acceptance and any real purchase remain explicit external gates. Synthetic RPC and ephemeral Ed25519 signatures cannot satisfy them. Code merge is not deployment, package publication, production replacement or commercial launch approval.
