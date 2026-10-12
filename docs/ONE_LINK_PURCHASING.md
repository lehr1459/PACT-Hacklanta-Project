# One-link license purchasing

Local feature branch: `feat/one-link-purchasing`. Rollback: `26fc35e680b8c089ba3a9c0457435814447ff1b7`, preserving validated input-feedback fixes and production records. Existing tags and deployments remain unchanged. No deployment, push, SDK publication or blockchain transaction is authorized by this feature.

## Metadata and link contract

Metadata remains `pact-solana-license-v1` JSON. Its on-chain commitment is Keccak over exact UTF-8 text, including whitespace and property order. Links never trim or parse/reserialize that text. Existing `parseMetadata`, `metadataHash`, `metadataMatches` and canonical public-key validation are reused unchanged.

Format: `https://PACT-ORIGIN/?offer=CANONICAL_PDA#pact=v1&metadata=UNPADDED_BASE64URL_UTF8_JSON`. The existing offer query parameter is preserved. The metadata fragment is excluded from normal HTTP requests/referrers, but remains visible to the page, browser history and recipients. Encoding is not encryption. Share intentionally public terms only, never credentials or personal information. Links cannot configure RPC, program, network or wallet.

Limits: 1,024 UTF-8 metadata bytes and 2,048 total URL characters. Oversized data is rejected without truncation; manual JSON retains its 64 KiB limit. Unsupported versions, missing/duplicate parameters, malformed percent/Base64/UTF-8, noncanonical encodings and invalid metadata fail closed. Structurally valid metadata remains untrusted until a fresh on-chain offer matches its exact hash, price and duration. Browser and Node use supported plain Base64 operations with explicit URL alphabet/padding conversion.

Seller sharing requires approved current metadata, a fresh active offer owned by the connected wallet, and exact matching. Clipboard operations are fenced against stale wallet/metadata state and overlapping requests. Loading a buyer link never auto-connects, approves terms, signs, simulates or sends. Existing wallet, transaction, freshness, expiry and authorization guards remain in force.

## Exact TEST metadata

The operator supplied these exact public bytes:

```json
{"schema":"pact-solana-license-v1","title":"TEST","terms":"TEST","priceLamports":"1000000","durationSeconds":"180"}
```

115 UTF-8 bytes; hash `0xf9300ddb0b3dc043942d78fbe7c25b12c227b9dd1ac58373f401bda1d3b7b35a`. Offer `7EdfowQEZyVyyp7bYdQyzmprZtVU9mVba8cysHm2Ardh`; program `EiiiWWsW2kkqP6nugHz6iBADvhnW5xnibAtZ82ZExVqy`; seller `HXmEkejco1WDhYx3j94388JUSkqL6cCyf3BxxUdQZuz2`. Public test terms, not a production agreement.

## Seller workflow

1. Connect the seller's Phantom wallet on Devnet. Use existing license creation, review and approve deterministic metadata, and create the offer through the unchanged transaction workflow. Live creation requires separate operator authorization.
2. Retain the exact metadata used at creation. After finalization and a fresh offer read, **Share Purchase Link** checks wallet ownership, active status and exact matching. For an existing offer, load its address and restore its original title, terms, price and duration, then approve those matching terms.
3. Select **Copy Buyer Link** and share it. The existing JSON download (**Download metadata preview**) and **Copy Metadata JSON** remain available. Clipboard failure selects exact text for manual copying.
4. Oversized data never creates a partial link. Share the existing offer-only link plus exact JSON through the manual workflow instead. Include only public license terms.

## Buyer workflow

1. Open the complete link. PACT selects purchase, fills offer and exact JSON, and fetches the offer through the existing Devnet implementation. No wallet permission or signature is requested.
2. Review the fresh verification result, price, duration, seller and plaintext terms. Loading, RPC failures, mismatches and inactive offers do not authorize purchasing. **Manual offer address** and **Manual metadata JSON** provide recovery. Offer-only links retain the manual workflow.
3. Connect the distinct buyer Phantom wallet on Devnet. Explicitly approve matching terms. Existing wallet, freshness, active-offer, entitlement and transaction guards determine whether **Purchase license** is enabled. Editing metadata or refreshing resets consent.
4. With separate operator authorization, use existing purchase and Phantom review. Amounts, transaction construction, confirmation, entitlement duration and Studio verification are unchanged. Local validation performs no real purchase.

## Safe local TEST link

Use this local-only example. Production does not include this feature yet; changing its origin does not make the new behavior deployed.

```text
http://localhost:3009/?offer=7EdfowQEZyVyyp7bYdQyzmprZtVU9mVba8cysHm2Ardh#pact=v1&metadata=eyJzY2hlbWEiOiJwYWN0LXNvbGFuYS1saWNlbnNlLXYxIiwidGl0bGUiOiJURVNUIiwidGVybXMiOiJURVNUIiwicHJpY2VMYW1wb3J0cyI6IjEwMDAwMDAiLCJkdXJhdGlvblNlY29uZHMiOiIxODAifQ
```

## Windows preview and reproduction

The isolated actual-config production preview is running at http://localhost:3009/ (PID 37544). Its `/`, `/integrate` and `/base` routes and all 23 referenced static assets pass HTTP smoke checks. The built application uses the deployed Eiii program and official Devnet RPC. Output lives at `.deployment-candidates/one-link/final/web`. To start the already-built candidate later in another terminal, use a free local port:

```powershell
Set-Location 'C:\Hackathon\PACT Hacklanta Project\.deployment-candidates\one-link\final\web'
$oneLinkPort = 3009
while (Get-NetTCPConnection -State Listen -LocalPort $oneLinkPort -ErrorAction SilentlyContinue) { $oneLinkPort++ }
Write-Host "PACT One-Link: http://localhost:$oneLinkPort/"
node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port $oneLinkPort
```

Use the selected port in local links. Do not rebuild while serving this candidate's `.next`. Existing previews 3003-3008 remain protected.

Reproduce from the PACT root with existing dependencies, no install. Stop only this feature's preview before rebuilding; leave other demos running. Run groups sequentially with QA ports free:

```powershell
Set-Location 'C:\Hackathon\PACT Hacklanta Project'
node qa/one-link/prepare.mjs baseline
node qa/one-link/prepare.mjs final
node qa/one-link/build.mjs
node qa/one-link/run-acceptance.mjs .deployment-candidates/one-link/final sdk
node qa/one-link/run-acceptance.mjs .deployment-candidates/one-link/final web
node qa/one-link/run-acceptance.mjs .deployment-candidates/one-link/final other
node qa/one-link/run-acceptance.mjs .deployment-candidates/one-link/final chain
node qa/one-link/preservation.mjs
```

The web group restores actual-config production output and TypeScript after mock/setup/read-only suites. No command deploys or performs a real wallet transaction. No dependency, manifest or lock changes are required.

## Limits and rollback

Chrome Phantom permission/rejection dialogs, signing, payment, unlock and timed expiry require separately authorized manual checks. Synthetic tests and public reads are not evidence of a new purchase. RPC availability and offer state can change. Client-side Studio gating is not backend authentication or a production security guarantee.

Keep the feature branch and working files. For a separate baseline checkout: `git worktree add --detach C:\Hackathon\PACT-one-link-rollback 26fc35e680b8c089ba3a9c0457435814447ff1b7`. This does not change public deployments. Any deployment needs separate explicit approval.

## File inventory and review

- Existing product files: `web/components/solana-app.tsx` (URL prefill, purchase review and seller sharing); `web/app/globals.css` (sharing/recovery layout).
- New product files: `web/lib/solana/purchase-link.ts` (strict exact-byte codec); `web/components/purchase-link-share.tsx` (clipboard controls and public-sharing guidance).
- New QA files: three `web/tests/solana/purchase-link-*.spec.ts` files and six scripts/configuration files in `qa/one-link`.
- Documentation: this runbook, `docs/ONE_LINK_QA.md`, and coordination records `docs/DECISIONS.md`, `docs/STATUS.md`, `docs/HANDOFF.md`.

No dependency added. SDK, integration wizard, Base fallback, program, wallet configuration, transaction construction and original Saturday Lights sources remain unchanged. Independent Backend/Reviewer source review and preservation evidence are separate from browser results. `web/test-results/one-link/preservation.json` records 132 protected sources, four tags, three artifacts and all 2,241 original Saturday file hashes passing.

Independent QA records actual baseline/final counts, failed-run history, responsive captures and verification limits in `docs/ONE_LINK_QA.md`. Fresh baseline passes 387 acceptance checks plus 46 local program/contract checks. Final validation passes 419 acceptance checks plus 46 local program/contract checks, SDK/web TypeScript, SDK build and restored actual-config production build. The standalone helper eight and focused browser 14 checks are supplemental, not double-counted. Failed intermediate runs remain recorded separately. Supplemental successful Copy Buyer Link checks pass at 390 and 1440 pixels: clipboard content exactly matches the displayed URL, success feedback is shown, and no page error or overflow occurs. This uses synthetic read-only provider/RPC fixtures. Final Reviewer independently reconciled source, safety, visual, test, build, preservation and preview evidence: PASS for local readiness. No unresolved local blocker remains; this is not deployment or live Phantom purchase approval.

Selected screenshots: `web/test-results/one-link/screenshots/actual-TEST-desktop.png` (actual read-only Devnet offer), `buyer-320.png` and `seller-1440.png` (synthetic UI fixtures). Full five-width galleries remain in the isolated candidate's `web/test-results/one-link` directory.
