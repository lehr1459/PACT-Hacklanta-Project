# Enterprise UI redesign — local review

The approved midnight navy/light workspace redesign is implemented locally on `ui/enterprise-redesign`. Independent QA passed; the final review and preservation results are recorded below. No production deployment, push, publishing, real wallet approval, or blockchain transaction is part of this task.

## Rollback and protected releases

- Original commit: `9a4783e75e222682551660ab21aab89e90540546`.
- Reviewed source checkpoint before presentation edits: `4123cc12f64f48def857f0d60c8d54d671daabd5`.
- Existing release tags remain unchanged: `phase1-local-baseline`, `phase2-local-ready`, `pre-solana-migration`, `solana-local-ready`.
- Protected PACT production deployment: `dpl_7j8igjsYx9SjsrrKZsXBx79FJcQF`, https://pact-hacklanta-demo.vercel.app/.
- Protected Saturday demo deployment: `appgdep_6acaf0b8479881918c3e437ca5f48c69`, https://saturday-lights-pact-demo.lehr-exe.chatgpt.site/.
- Original Saturday Lights source and https://kalshi-38-live.lehr-exe.chatgpt.site/ remain unchanged.

The ignored baseline manifest records 181 public tracked source hashes, four tag references, serving SDK bundles, the compiled Solana artifact, and a separate inventory of 2,241 original Saturday files. No credentials, signer files, private environment files, dependency directories, caches, or new build outputs are added to either source checkpoint. The previously validated, tracked Solana artifact and evidence remain preserved.

## Implementation and preservation

Product changes are restricted to `web/app/globals.css` and `web/app/integrate/integrate.css`. All TSX, hooks, providers, configurations, validation, transaction construction, entitlement expiry/freshness rules, generated integration content, clipboard fallback, SDK APIs, examples, checkout, Solana and Solidity remain unchanged.

Shared tokens use midnight `#0B1220`, off-white workspaces, white panels, slate text and restrained blue `#2563EB`. Existing Manrope/DM Sans fonts and system fallbacks are retained. Header, product introduction, forms, purchase review, wallet controls, transaction feedback, verification, Studio, integration preview/code and Base fallback share the same system. Workflows stack below 960 pixels; controls, focus indicators, reduced motion, long identifiers and scrollable code receive consistent treatment.

No runtime dependencies or application manifest/lockfile changes were added. QA-only ESLint `9.39.5` and `eslint-config-next` `16.4.0` are installed in an ignored isolated tooling directory. Their fresh baseline reports 13 existing errors and one warning; the redesign must introduce no new diagnostics. Existing hook/navigation diagnostics are retained rather than changing protected behavior.

Modified-file inventory:

- Presentation: `web/app/globals.css`, `web/app/integrate/integrate.css`.
- Coordination: `docs/DECISIONS.md`, `docs/STATUS.md`, `docs/HANDOFF.md`.
- Reports: `docs/UI_REDESIGN.md`, `docs/UI_REDESIGN_QA.md`.
- Local validation tools: `qa/ui-redesign/prepare-baseline.mjs`, `prepare-final.mjs`, `prepare-preview.mjs`, `run-acceptance.mjs`, `preservation.mjs`, `compare-lint.mjs`, `contrast.mjs`, `manual-contrast.mjs`, `visual-audit.mjs`, `states-audit.mjs`, `transaction-captures.mjs`, `summarize.mjs`.

Ignored screenshots, logs, dependency copies and lint tooling are local review artifacts, not release source or publishing changes. Pre-existing untracked environment examples and generated SDK/root test output remain unstaged.

## Validation evidence

Independent results, exact commands, baseline/final differences, screen widths, accessibility checks and limitations are recorded in [UI_REDESIGN_QA.md](UI_REDESIGN_QA.md). Raw logs and PNGs are local ignored evidence in `web/test-results/ui-redesign/{baseline,final}`. Assertions and security expectations are preserved.

| Gate | Fresh baseline | Frozen redesign |
| --- | --- | --- |
| SDK, Solana, Base, wizard, generated consumers, checkout, examples, Saturday | 387 passed | 387 passed |
| Compiled Solana program / Foundry | 23 / 23 passed | 23 / 23 passed |
| Next production build and TypeScript | Passed | Passed |
| Isolated lint | 13 existing errors, 1 warning | Identical; zero new diagnostics |
| Matching five-width captures | 71 | 71 |
| Page/resource errors or horizontal overflow | None | None |

Final visual and independent security review passed. Text/placeholder/gradient sampling found no below-threshold values across 2,872 computed samples; translucent hero backgrounds received separate conservative manual checks. Visible 3-pixel focus rings have 4.78:1 light-workspace and 6.86:1 navy contrast. Keyboard traversal and reduced motion passed. These are scoped checks, not complete accessibility certification.

Selected screenshot comparisons:

- [Desktop before](../web/test-results/ui-redesign/baseline/visual/1440-buy.png) / [desktop after](../web/test-results/ui-redesign/final/visual/1440-buy.png).
- [Mobile before](../web/test-results/ui-redesign/baseline/visual/390-buy.png) / [mobile after](../web/test-results/ui-redesign/final/visual/390-buy.png).
- [Generated wizard output, synthetic fixture](../web/test-results/ui-redesign/final/transactions/1440-wizard-generated-synthetic.png).
- [Unknown transaction, synthetic fixture](../web/test-results/ui-redesign/final/transactions/390-unknown-synthetic.png).

The browser fixtures exercise synthetic wallet and entitlement behavior; public Devnet reads are separately labelled. They do not establish real Phantom permission dialogs, signing, actual purchase success, or production-grade client gating. CSS zoom/reflow is an approximation of browser zoom, and automated contrast sampling is supplemented by visual review rather than a full accessibility certification.

## Local preview

Final preview: http://localhost:3007/. Existing demos on ports 3003–3006 retain their original serving outputs and processes. The redesign builds from a separate public-source copy, never the production preview's `.next` directory.

To rebuild/restart the isolated redesign manually, first stop only an existing redesign process on 3007 using its own terminal, then run:

```powershell
Set-Location 'C:\Hackathon\PACT Hacklanta Project'
node qa\ui-redesign\prepare-preview.mjs
Set-Location .deployment-candidates\ui-redesign\preview\web
$env:NEXT_PUBLIC_PACT_SOLANA_PROGRAM_ID = 'EiiiWWsW2kkqP6nugHz6iBADvhnW5xnibAtZ82ZExVqy'
$env:NEXT_PUBLIC_SOLANA_RPC_URL = 'https://api.devnet.solana.com'
$env:NEXT_TELEMETRY_DISABLED = '1'
node node_modules\next\dist\bin\next build
node node_modules\next\dist\bin\next start --hostname 127.0.0.1 --port 3007
```

Inspect `/`, `/?section=seller`, `/?section=verify`, `/integrate`, and `/base`. Real Phantom permissions and a live license purchase remain separate manual checks requiring explicit operator authorization. Do not approve a transaction during this local visual review.

## Completion

READY for local UI review. Independent QA passed every acceptance gate; Backend and final Reviewer found no runtime or scope regressions. Final preservation checks pass all 181 baseline comparisons, three serving artifacts, four tags and 2,241 original Saturday file hashes. All TSX, SDK, libraries, programs and configuration remain byte-identical. Original preview processes on 3003–3006 retain their PIDs; all five redesign URLs on 3007 return HTTP 200. The actual Devnet program/artifact and active offer were independently checked read-only; the genuine buyer entitlement is expired and the seller entitlement is missing.

The reviewed redesign checkpoint is the final commit on `ui/enterprise-redesign`, reported with its exact hash in the operator handoff. Rollback source remains `4123cc12f64f48def857f0d60c8d54d671daabd5`; no release tag moved. The remaining verification limits are real Phantom dialogs/account UX, live purchases, true browser zoom and full accessibility certification. No current local acceptance blocker remains. Deployment requires separate operator authorization after reviewing the local result; both public deployments stay on their protected versions.
