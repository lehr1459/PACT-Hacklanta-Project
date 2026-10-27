# Local release snapshots

The archive tool prepares a customer-reviewable local snapshot. It does not deploy, publish, approve external distribution or configure a production host. No owner-approved hosted origin or custody arrangement is available. Every archive and smoke receipt therefore says `deployable:false`.

Use the pinned Node/npm in `scripts/validation/runtime.json`. The current target is Node24.22.1/npm11.19.1 after the October22 security patch review; next internal review is November5, earlier on a new advisory or before hosting. The pin is not security clearance. Existing dependency exceptions expire November 15, 2026. A failed or expired gate cannot be waived by a passing archive check.

Prepare a clean committed candidate, build the SDK, and supply an explicit **local marketplace** environment: the reviewed Devnet program, official public Devnet RPC, loopback origin with a fixed port, disabled auth/policy, no default offer, metadata or Base contract. Build the marketplace with that environment. The actual saved Next config must record the current revision and true source-clean, environment-file-absent and public-environment-safe flags.

Obtain a current two-build SDK release receipt bound to its twelve passing packed consumer checks. Preserve the independent observed Solana rebuild/provenance and historical Devnet identity receipt. Current local SBF SHA256 starts `408580c1`; the observed deployed historical artifact starts `d13828b0`. They are different. Packaging local SBF does not upgrade Devnet.

Create an ignored input index. Replace the example paths with actual retained receipts; the SDK release and current validation receipts must belong to the candidate revision.

```json
{
  "schemaVersion": 1,
  "sdkRelease": "web/test-results/sdk-release/candidate-REPLACE/sdk-release.json",
  "consumerReport": "web/test-results/validation/all-node/packed-consumer/report.json",
  "solanaProvenance": "web/test-results/REPLACE/provenance.json",
  "historicalDeployment": "docs/development/evidence/devnet-historical-2026-10-17.json",
  "validation": [
    {"name": "all-node", "path": "web/test-results/validation/all-node/results.json"}
  ]
}
```

```sh
node scripts/release/archive.mjs create --inputs web/test-results/archive-inputs.json --output web/test-results/archive-candidate
node scripts/release/archive.mjs verify --archive web/test-results/archive-candidate/pact-local-COMMIT.zip
node scripts/release/archive.mjs smoke --archive web/test-results/archive-candidate/pact-local-COMMIT.zip --output web/test-results/archive-smoke
```

Outputs must be new files beneath ignored `web/test-results`. Failed receipts remain available; use a new output directory for a retry. Creation checks Git cleanliness before/after, current SDK and validation revisions, committed SBF inputs, exact SDK package bytes, saved Next binding/revision/BUILD_ID, and required evidence. Validation summaries omit command environments, paths and arbitrary logs. Original evidence hashes remain in the manifest.

The sorted ZIP has fixed regular-file modes/timestamps and no symlinks, traversal, duplicate paths or installed dependencies. The CLI limits compressed archives and individual files to 50 MB, expanded data to 250 MB and entries to 4,000. Obvious credential/keypair/signer filenames and key-container extensions are rejected before reading; this is an allowlisted snapshot, not a general secret-content scanner. Two encodings of the captured files must be byte-identical. This establishes deterministic packaging of **one saved Next snapshot**, not reproducibility of two independent Next builds. SDK and SBF have separate actual rebuild evidence.

The manifest binds every included file by size/SHA256. It includes the SDK tarball and matching runtime files/lock, marketplace package/lock, a start-only portable config, Next runtime/static/public files, SBF evidence, historical identity, runtime policy, sanitized validation and these runbooks. Verification independently requires the current revision/runtime, clean validation environment, complete install/build/type/browser/policy coverage, zero exits for passing commands, and an explicit optional external-checkout decision. Removing validation evidence or relabeling failed/skipped required gates fails verification. It contains no environment files, wallet material, dependency trees, cache, test fixture source or database migration. `migrations:[]` describes this repository; no database has been introduced.

The verifier checks internal consistency, not a publisher signature. Obtain the outer ZIP SHA256 and source revision from a trusted release owner separately; a self-contained manifest cannot establish authorship. Preserve that outer receipt with the archive. npm trusted publishing, external distribution permission and a license grant are not implied. The SDK remains private and no LICENSE file currently grants downstream rights; owner approval is required before external sharing.

The smoke command extracts into a fresh OS temporary directory, installs locked production SDK dependencies before web dependencies with install scripts disabled, then starts only the extracted Next build. It checks the public page, liveness, readiness and closed protected route. Readiness may perform read-only Devnet RPC; it signs and broadcasts nothing. An occupied bound port fails. A successful receipt must show relocation observed through these actual checks. Node/npm and registry access remain external prerequisites; dependencies are not vendored.

For manual inspection, verify the ZIP hash, extract to a fresh directory preserving `packages/pact-sdk` and `web`, run `npm ci --omit=dev --ignore-scripts` first in the SDK and then web directories, and use the exact saved local binding as process environment before `next start`. Do not run `next build` inside the saved snapshot or substitute another SDK. The generated config rejects build mode. Never copy a user's environment file into the archive.

Actual final archive hashes/startup results belong in the release evidence, not fabricated example values here. See [rollout gates](ROLLOUT.md) for collected versus still-required evidence.
