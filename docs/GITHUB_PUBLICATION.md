# PACT Hacklanta Project — GitHub source publication

Target: `https://github.com/lehr1459/PACT-Hacklanta-Project`.

The operator authorized placing the current PACT application on GitHub. This is a new, private repository under the authenticated personal account `lehr1459`; the separate `hacklanta-agent-project` repository is preserved. Public visibility is not assumed. The local branch remains `fix/offer-refresh-stability`; its reviewed working-source checkpoint is published as remote `main`. The four existing release tags are included without changing their targets.

## Publication scope

Include the existing versioned application, SDK source, independent examples, tests, contract/program source, reviewed versioned program artifact, public configuration templates, documentation and the validated repository-name/path updates. Exclude dependency folders, build/cache output, generated SDK bundles, local test reports, Vercel account links, private environment files, wallet/signing credentials and Codex snapshot refs. SDK bundles remain reproducible from `packages/pact-sdk/build.mjs`; packages are not published to npm.

The additional `examples/pact-demo-app/.env.example` contains public Devnet configuration only. The unrelated, previously untracked Saturday NFL release document remains local. Existing tracked documentation is preserved as part of this source snapshot; Saturday Lights source and hosting are not modified.

## Validation and limits

The source snapshot's SDK, wizard, local program, TypeScript and production-build validation is recorded in [the rename report](REPOSITORY_RENAME.md). That report preserves an initial generated-consumer browser resource failure and the unchanged successful follow-up. Publishing source does not establish real Phantom wallet transaction evidence or production deployment readiness.

Independent publication review checks the exact pushed ancestry and release tags for private/signer filenames and credential patterns in public source. Local private inputs are not read. Known dummy credential URLs are negative-test fixtures, not live credentials. Only current source ancestry and four explicit release tags are pushed; no mirror or all-ref upload is used.

Build the SDK before installing/building consumers, as shown in the root README and `web/vercel.json`. Existing source lockfiles are retained; previously reviewed hosted/native optional-dependency lock repairs exist in isolated release packaging. A successful build using existing dependencies is not a promise that an arbitrary fresh clone's `npm ci` or automatic hosted build passes. Review [release packaging notes](UI_PRODUCTION_RELEASE.md) before preparing another deployment. No automatic GitHub deployment integration is configured by this publication.

## Local Git commands

```powershell
Set-Location 'C:\Hackathon\PACT Hacklanta Project'
git remote -v
git fetch origin
git log -1 origin/main
git fsck --full
```

The origin URL is `https://github.com/lehr1459/PACT-Hacklanta-Project.git`. Authenticate with GitHub's normal browser/credential-manager flow; never paste tokens or wallet credentials into source, chat or commands.
