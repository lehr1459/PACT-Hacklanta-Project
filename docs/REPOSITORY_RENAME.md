# PACT Hacklanta Project — repository rename

Canonical checkout: `C:\Hackathon\PACT Hacklanta Project`.

The local repository/project display name is **PACT Hacklanta Project**. Git reports the new root, while branch `fix/offer-refresh-stability`, HEAD `b0dece31e841d3c203a6af920b4f58ba2ff61044`, commit history and release tags are preserved. There is no configured Git remote; no GitHub repository was renamed or created. If a GitHub repository is connected later, the intended URL-safe name is `PACT-Hacklanta-Project`.

Windows processes hold the old checkout root and an example-app directory open. The old `C:\Hackathon\PACT` path therefore remains a compatibility view: directories already moved use junctions; locked directory trees/files use links to the same file data. Do not delete the old tree recursively: its junctions refer to this checkout. Open the canonical folder for future development. Archived deployment packages, hashes, reports and compiled bytecode were preserved without rewriting historical paths.

The relocation exposed PowerShell traversal of an example SDK dependency junction. The original SDK data was located in the moved tree and restored to `packages/pact-sdk`; all **217 tracked files matched the pre-rename hashes before any source edit**. Nothing was reset, stashed, pushed, deployed or removed. A pre-existing dangling historical QA dependency link was preserved as evidence; it is not used by current application or validation tooling.

## Scope

Updated repository naming, local paths, quoted PowerShell commands, integration-wizard install/prerequisite paths and matching test expectations. The private frontend package description names this project; package IDs remain `pact-web`, `@pact/sdk` and `pact-independent-demo`. SDK APIs, templates, exports, blockchain bytecode/source, UI branding/design, license behavior, environment values and public URLs are unchanged.

There are no GitHub Actions workflows in this repository. Agent profiles remain available. `web/vercel.json` already uses relative paths and needs no modification. The existing Vercel project remains `pact-hacklanta-demo`, scope `lehr98-9390`, public URL `https://pact-hacklanta-demo.vercel.app/`; no account, project or deployment rename was performed. Saturday Lights paths and files remain unchanged.

## Files changed by this task

- `AGENTS.md`
- `README.md`
- `docs/DECISIONS.md`
- `docs/DEPLOYMENT_PACKAGE.md`
- `docs/EMBEDDED_CHECKOUT.md`
- `docs/HACKLANTA_FINAL_READINESS.md`
- `docs/HANDOFF.md`
- `docs/INTEGRATION_WIZARD.md`
- `docs/OFFER_REFRESH_STABILITY.md`
- `docs/ONE_LINK_PURCHASING.md`
- `docs/QA.md`
- `docs/SDK_DEMO.md`
- `docs/SOLANA_DEPLOYMENT_PACKAGE.md`
- `docs/SOLANA_LIVE_DEMO.md`
- `docs/STATUS.md`
- `docs/UI_PRODUCTION_RELEASE.md`
- `docs/UI_REDESIGN.md`
- `examples/pact-checkout-vanilla/README.md`
- `examples/pact-demo-app/README.md`
- `prompts/START_HERE.md`
- `web/README.md`
- `web/components/integration-wizard.tsx` — local path text only
- `web/lib/integration/generator.ts` — quoted local installation/prerequisite paths only
- `web/package.json` — description only
- `web/tests/integration/wizard.spec.ts` — path assertion only
- `docs/REPOSITORY_RENAME.md` — this report

Local unversioned Git metadata changed: `.git/description`. Relocation itself moves the existing files without changing their contents. Existing Saturday-related documentation additions and untracked files present before this task are retained and are not attributed to this rename.

Ignored relocation/validation evidence and helper scripts are under `.deployment-candidates/repository-rename/`; machine-readable `baseline.json`, `changes.json`, `move-receipts.json` and `sdk-relocation-recovery.json` preserve inventory and byte verification.

## Verification

Independent QA completed in an isolated source copy under the canonical repository path, including its spaces. Existing dependencies were reused; no dependency versions or lockfiles changed.

- SDK build, SDK TypeScript checks, all 57 SDK tests and actual SDK export imports passed.
- Web TypeScript checks and the final production build passed. Production route smoke checks returned HTTP 200 for the homepage, seller, integration wizard and Base fallback.
- Integration wizard: 8 synthetic browser tests and 2 actual read-only Devnet browser tests passed. Updated PowerShell examples: 24 command lines parsed successfully, with space-containing paths kept as single arguments. Deployment commands were not executed.
- Generated Next.js and React consumers compiled. The initial 44-case browser run had 43 passes and one `page.goto` failure with `ERR_NO_BUFFER_SPACE` before any wallet connection or license assertion. The original failure log and trace were retained. After the test processes closed, the unchanged hung-refresh case passed across both frameworks and viewports (4 passes). Together these runs cover all 44 distinct cases; the initial command still correctly records exit 1.
- Local Solana program tests: 23 passed. Local Base contract tests: 23 passed, including the existing 256-run fuzz check. No blockchain transactions were initiated.
- Git integrity and whitespace checks passed. The branch, commit, four release tags and empty remote configuration are unchanged. All 192 protected tracked files remain byte-identical to the working baseline; the remaining 25 existing-file edits are the explicitly inventoried naming/path updates.

Detailed independent QA receipts are in `.deployment-candidates/repository-rename/qa-evidence/`, including `results.json`, `followup-results.json`, `routes.json` and the preserved initial browser failure. Root preservation and local program receipts are beside that directory. Independent final review passed with no blocker: protected hashes, actual tested source bytes, Git state, scope and all reported test outcomes were reconciled. Local rename validation is complete. No push or deployment was performed.

```powershell
Set-Location 'C:\Hackathon\PACT Hacklanta Project'
git remote -v
git fsck --full
```

`git remote -v` is empty; no remote URL was invented. Git's existing unreachable/dangling objects do not indicate corruption and were not pruned.
