# Owner-controlled GitHub branch protections

Prepared October 23, 2026. No repository settings were changed.

Read-only GitHub API inspection found `main` and `codex/api-first-integrations` both `protected:false`, and no repository rulesets. The verified foundation is `878a55e273014e594241aa88829857435673656a`, [run 39895664596](https://github.com/lehr1459/PACT-Hacklanta-Project/actions/runs/39895664596). These are historical checks for that commit, not approval for subsequent preparation commits.

## Required check identities

Use these exact, unique job/check names from `.github/workflows/validation.yml`. Select **GitHub Actions** as their expected source (observed application ID **15368**), rather than accepting any source.

| Required check | Foundation result |
| --- | --- |
| `node-and-browser` | success |
| `pinned-chain` | success |
| `hosted-api-and-browser` | success |
| `hosted-portable-windows` | success |

`optional-public-reads` is deliberately optional and skipped on normal pushes. Do not require it. Do not select the workflow display name `Repository validation` instead of its four job names. Require actual **success** of all four on the exact release SHA during release review; GitHub itself may accept skipped/neutral checks as satisfying a branch rule.

## Proposed settings, to apply only after owner approval

In repository **Settings → Branches → Add branch protection rule**, first target `main` exactly:

1. Require a pull request before merging. Require one independent approving reviewer; dismiss stale approvals, require approval of the most recent push, and require resolved conversations. An additional eligible reviewer is an owner prerequisite; the author cannot approve their own PR. Do not enable required approvals without arranging that reviewer.
2. Require status checks before merging; add all four names above, each from GitHub Actions. Require branches to be up to date. A future merge queue would additionally need an explicitly reviewed `merge_group` trigger; this workflow does not currently provide one.
3. Apply rules to administrators / disallow bypassing. Disable force pushes and branch deletion. Do not enable an automatic merge, deployment requirement, publish action, or deployment automation.
4. Save only with authorization, then inspect the actual rule and verify the PR merge box rejects a candidate missing any required check. A screenshot of the form alone is insufficient.

For `codex/api-first-integrations`, use an exact separate rule requiring these same four checks and blocking force push/deletion. Decide whether future work must arrive through a short-lived PR branch before enabling its PR/reviewer requirement. GitHub required checks can prevent ordinary direct pushes to a protected destination before checks exist; do not create a deadlock or bypass rules to continue the old direct-push workflow. The feature branch is not permission to merge into `main`.

No signed-commit rule is proposed retroactively: that would require a separate owner signing/history decision. Never rewrite the validated foundation to satisfy an unreviewed rule.

After approval, read-only verification commands are:

```sh
gh api repos/lehr1459/PACT-Hacklanta-Project/branches/main/protection
gh api repos/lehr1459/PACT-Hacklanta-Project/branches/codex%2Fapi-first-integrations/protection
gh api repos/lehr1459/PACT-Hacklanta-Project/rulesets
gh api repos/lehr1459/PACT-Hacklanta-Project/commits/OWNER_APPROVED_FULL_SHA/check-runs
```

Record exact target, four contexts and source app, strict/up-to-date policy, review requirement, admin/bypass behavior and force/delete settings in the private release record. Recheck deployment hooks and provider connections before any later authorized push. Never infer deployment isolation solely from the absence of a Vercel Git link.

GitHub documents the scope, expected-source setting and strict check behavior in [About protected branches](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches).
