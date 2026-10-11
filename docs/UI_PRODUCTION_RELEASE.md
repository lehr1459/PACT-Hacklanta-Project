# PACT enterprise redesign production release

The operator authorized publication of the reviewed redesign to the existing personal Vercel project. Lead executed one deployment; Backend, Frontend, QA and Reviewer remained read-only. No Saturday Lights publication/source, Solana program, wallet configuration, SDK behavior or licensing logic was changed. No wallet request, signature or blockchain transaction occurred.

## Published source and target

- Public URL: https://pact-hacklanta-demo.vercel.app/.
- Deployment: `dpl_6SXVEhtU4CHLp2UAq5Mj1NbbyUZh`, production **READY**.
- Source commit: `3953f3b8ca5bb4523ea9be4c37081c31051ddfb3`.
- Project: `pact-hacklanta-demo` / `prj_mwDbCMt3esLN5tmnzUKoQlv5HEjk`.
- Personal scope: `lehr98-9390`; existing Hobby namespace ID `team_CAgQOqct6ECLtcEXYOvNX11R`. No project/team was created.
- Unique deployment URL: https://pact-hacklanta-demo-kim00vkhp-lehr98-9390.vercel.app/. Its normal Vercel authentication protection remains enabled; the canonical public URL is anonymously accessible.
- API metadata `pactCommit` and `pactSourcePackageSha256` match the reviewed commit and source manifest. Canonical alias inspection resolves the new deployment ID.

## Fresh packaging and build

The new isolated directory is `.deployment-candidates/ui-production-20261010-232407`. Its `pact` upload contains 39 public inputs extracted directly from Git. Thirty-seven exactly match committed bytes; only SDK/web lockfiles differ. The reviewed additions are SDK `bufferutil@4.1.0`, SDK nested `rpc-websockets/node_modules/utf-8-validate@6.0.6`, and web `bufferutil@4.1.0`. Every existing package entry, version, manifest and top-level lock field remains unchanged. Original source locks were not edited. Backend independently verified new registry URLs and SHA-512 integrity values.

Source-manifest SHA-256: `5b1446bc5ec4a22fda1c45d4046ea1ba8bffe61671af3bf7f90aa7dea12429b9`. This digest covers the public source inventory including repaired locks; it is not an archive or deployed bytecode hash.

Six clean local gates passed: npm 12.2.0 SDK `ci`, SDK build/typecheck, npm 12.2.0 web `ci`, actual Devnet production build, and web TypeScript. All 39 source hashes remained unchanged afterward. Upload dry-run passed exactly 40 files / 540,637 bytes, including `.vercelignore`; no environment/private/signing files, dependencies, Git metadata or generated outputs were uploaded. A retained initial dry-run included an empty SDK `dist` directory; tightening the ignore rule excluded that empty directory too, without changing any source.

Hosted Linux logs confirm SDK-first clean installs/build, Next.js 16.4 compilation, TypeScript and five static pages passed. Vercel reports build completion in 43 seconds and approximately 51 seconds to Ready. Hosted Vercel reused its previous build cache; this was a source deployment and the new compiled CSS was independently verified against the clean local build.

## Independent verification

| Owner | Result |
| --- | --- |
| Lead | Exact project/personal scope, commit metadata, alias, retained rollback; six public route GETs and 23 unique static assets HTTP 200. Deployment-specific error-log scan returned zero entries. |
| Backend | Package/source preservation PASS; only three reviewed lock additions, registry integrity checks PASS. |
| Frontend | 25 route/width checks at 320, 390, 768, 1024 and 1440 pixels; zero page errors, failed resources or overflow; controls at least 44 pixels. Twenty production PNGs exactly match approved local screenshots. Focus, program links and offer handoff PASS. |
| QA | 30 production workflow/state checks at the same widths, including actual read-only expired buyer and missing seller entitlement verification. Zero page/console/network errors, overflow or prohibited requests; recorded application assets HTTP 200. |
| Reviewer | Final hosted reconciliation APPROVED/PASS. Independent package/provenance review; anonymous root/wizard/Base and both hosted compiled CSS assets match the clean package. No current website blocker. |

The earlier full local acceptance evidence remains 387 acceptance plus 46 local chain checks for each baseline/final version; it was reconciled to this source, not re-executed or counted as new production tests. Existing 13 lint errors/one warning and dependency advisories remain unchanged. SDK audit lists four moderate findings; web lists 13 high and 11 moderate. This release does not constitute production-security or full accessibility certification. Release-time request logs were scanned; external monitoring/drains were not assessed or configured.

Raw evidence is retained locally: the isolated directory holds manifest, clean build results/logs, final upload inventory, single-attempt journal/response, production provenance, hosted build proof, HTTP/assets and runtime-log scan. Independent browser evidence is in `web/test-results/ui-redesign/production-frontend` and `production-release/PUBLIC_QA.md`. Initial tooling-only failures remain documented. Original 3003–3007 servers were not rebuilt or restarted.

## Rollback preserved

Previous deployment `dpl_7j8igjsYx9SjsrrKZsXBx79FJcQF` remains **READY** at https://pact-hacklanta-demo-mr7zcxyp8-lehr98-9390.vercel.app/. Source rollback checkpoint `4123cc12f64f48def857f0d60c8d54d671daabd5` and all four release tags remain intact. No rollback or deletion was executed.

Operator recovery command, only if rollback is required:

```powershell
Set-Location 'C:\Hackathon\PACT\.deployment-candidates\ui-production-20261010-232407\pact'
npx --yes vercel@63.1.2 rollback dpl_7j8igjsYx9SjsrrKZsXBx79FJcQF --scope lehr98-9390 --yes
```

## Remaining manual Phantom checks

1. Open the canonical public PACT URL in a top-level Chrome tab with Phantom configured for Devnet. Verify connect/disconnect, rejected requests and account switching using distinct seller/buyer profiles; do not use the upgrade-authority wallet.
2. Real signing, purchase and active access were not tested by this deployment. Only after separate transaction authorization, use the original seller metadata matching the existing offer, verify the displayed 0.001 Devnet SOL / 180-second terms, perform one purchase and record finalized confirmation/Explorer evidence.
3. Verify fresh buyer Studio unlock, distinct seller denial, wallet-change invalidation and expiry. If confirmation is unknown, inspect its retained signature before considering any retry.

No current automated website-release blocker was found. Real Phantom permissions/ownership, live purchase/unlock/expiry, actual browser zoom and comprehensive assistive-technology/accessibility verification remain manual limits. Saturday Lights remains on its previous working deployment.
