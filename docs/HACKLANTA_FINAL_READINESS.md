# Hacklanta final MVP release and demo checkpoint

This package prepares the operator-reported, locally proven **PACT marketplace → Phantom Devnet purchase → Saturday Lights SDK verification → football slip** flow. It does not substitute the new embedded checkout or claim a hosted real-wallet demonstration. Stop before project creation, source push, publication, wallet approval or purchase until the operator approves the specific next action.

## Hosting decision and protected original

Use a **new Vercel project** for PACT, proposed name `pact-hacklanta-demo`, and a **new Sites Worker project** for Saturday, proposed slug `saturday-lights-pact-demo`. The Vercel scope and final domains remain operator decisions; proposed names/domains are not verified available or live.

Saturday's existing Sites project is `appgprj_6ab80811a9988191b55627a22b14bed2`, public version 5 at https://kalshi-38-live.lehr-exe.chatgpt.site. Read-only inspection returned HTTP 200 and the original Saturday title; that publication does not contain the new PACT gate. **Do not overwrite it, reuse its project ID, copy its reaction data or change its audience.** The dedicated candidate retains the existing `DB` declaration/schema for its own reaction storage and no R2 binding. No account IDs, Wrangler configuration or authenticated Wrangler setup exist locally; the existing Sites route is faster than introducing another host.

PACT is Next.js 16.4 / React 19.3 on Node 24.11.1. Its source must be uploaded from the clean monorepo root, with Root Directory `web` and **Include source files outside Root Directory** enabled. Set Node `24.x`, framework `Next.js`, install command below and build command `npm run build`:

```text
npm --prefix ../packages/pact-sdk ci && npm --prefix ../packages/pact-sdk run build && npm ci
```

SDK compilation cannot depend on the current workstation's untracked `dist`. The candidate includes the original ABI and public Solana wire specification needed by sibling imports. [Official Vercel monorepo guidance](https://vercel.com/docs/monorepos), [project linking](https://vercel.com/docs/cli/link).

## Build-time public configuration

| Target | Setting | Exact value |
| --- | --- | --- |
| PACT, Production and Preview | `NEXT_PUBLIC_PACT_SOLANA_PROGRAM_ID` | `EiiiWWsW2kkqP6nugHz6iBADvhnW5xnibAtZ82ZExVqy` |
| PACT, Production and Preview | `NEXT_PUBLIC_SOLANA_RPC_URL` | `https://api.devnet.solana.com` |
| Saturday build process | `PACT_PURCHASE_URL` | Verified public PACT origin + `/?offer=7EdfowQEZyVyyp7bYdQyzmprZtVU9mVba8cysHm2Ardh` |

No secret is needed. Keep historical Base configuration isolated; this release does not create a Base deployment or alter the Solana program. Public values are embedded during builds; setting Saturday's runtime environment after building will not update its link.

The preparation helper accepts only a clean HTTPS origin, rejects inline-script delimiters/credentials/query/fragment/local hosts, and constructs the offer link itself. It copies public allowlisted source into `.deployment-candidates`, strips the original Saturday project ID, and records SHA256 inputs. It cannot publish. An unregistered candidate deliberately lacks `project_id` and is not a deployment archive.

QA reproduced an existing late-connect race: disconnect/account change while Phantom's connection promise is pending could restore the previous app identity. `deployment/fence-saturday-connect.mjs` applies a minimal cancellation epoch to the **candidate only**. Connect events invalidate cached access; only a successful epoch-checked connection response establishes a new identity. Account changes/disconnects invalidate pending connections, including a late connect event followed by a late response. Original Saturday source and its serving build remain untouched. No SDK verification implementation is duplicated.

## Fresh public chain evidence

Backend independently sampled finalized Devnet state on **2026-10-11 01:39:48 UTC**, slot **509739075**. Genesis matches `EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG`. The executable program's 35,784 bytes match local SHA256 `d13828b060327ef9f702b076b8681e4b9e1e8c04f961191d1df17b2babf52a62`; upgrade authority remains `CVN3suQneZtAb1RMuHf3BVYYEtAuNqNdSoiDQagQ7xzh`. No redeployment is needed.

Existing offer `7EdfowQEZyVyyp7bYdQyzmprZtVU9mVba8cysHm2Ardh` is active, costs exactly **1,000,000 lamports (0.001 test SOL)**, and lasts **180 seconds from purchase**. Seller: `HXmEkejco1WDhYx3j94388JUSkqL6cCyf3BxxUdQZuz2`. Terms hash: `0xf9300ddb0b3dc043942d78fbe7c25b12c227b9dd1ac58373f401bda1d3b7b35a`.

Buyer `GNqRCZsgYUAJtetw5PJZvgpkz663XoiQTfNajDxyJ2kS` has a genuine but **expired** entitlement at `4Fy2xybQjZisNkkwrupvAkmBABmNPrcJxAhNmE4Sj4a6`, expiry unix `1791681696`. Seller's entitlement is absent. Neither wallet currently demonstrates active access for this offer. This corroborates prior purchase/expiry state; it is not a new purchase by an agent.

Independent history reads at **01:46:58 UTC** verified the [latest prior finalized purchase](https://explorer.solana.com/tx/45ocSZ1mvEKk1p68EzVvA1NnWLjko3sa3fGReK6NxbCLEaPhCWmu1dibvxq6zfGL1YfMEcFQpgCxxmGGpCjQDrBG?cluster=devnet), slot `509733749`, success (`err:null`), fee 5,000. Its PACT accounts bind this buyer/offer/seller/entitlement; inner System transfer and balance deltas show seller **+1,000,000**, buyer **−1,005,000**, license rent unchanged. Transaction block time `1791681516` plus 180 equals current recorded expiry `1791681696`. This gives a truthful read-only fallback proof of past settlement and current expiry without another purchase. ProgramData address is `4oeQ43DP6oUXparT8cYT3niBgdJCaFitj61mVXQfy9cX`.

Current read-only quote: offer rent 1,148,080 lamports; license rent 1,061,720; unsigned single-signature purchase fee 5,000. The existing buyer's funded entitlement is reused, making its minimum purchase debit **1,005,000 lamports / 0.001005 SOL** at this quote. A new buyer needs **2,066,720 lamports / 0.00206672 SOL**, including initial rent. Allow at least 0.01 Devnet SOL per browser wallet for changing fees/rent. Buyer sampled balance 1.494918280 SOL; seller 7.302607118 SOL. Fees are separate from the exact seller payment. Use no deployment-authority wallet in the browser.

**Required operator input:** the original exact seller metadata JSON. It must match the terms hash, price and duration; do not reconstruct/reformat it or invent terms from the hash. Reuse this existing offer rather than create another one. The fixed Saturday offer cannot follow a newly created offer without a separately reviewed configuration change.

## Exact next commands — execute only after target approval

First approve the new Vercel project/scope and new public Sites slug. Approval must allow the new Site's source push and publication, but does not authorize any blockchain transaction. Creation/publishing will not touch Saturday's original project.

PACT operator authentication uses the browser login; never paste an account token or wallet key into chat. CLI **63.1.2** was verified with read-only npm metadata, not installed or executed here. These are future operator commands:

```powershell
Set-Location 'C:\Hackathon\PACT'
$approvedPactOrigin = Read-Host 'Approved PACT HTTPS origin, without path or query'
$bundle = & '.\deployment\prepare-hacklanta.ps1' -PactPublicUrl $approvedPactOrigin | ConvertFrom-Json
Set-Location $bundle.pactSource
npx --yes vercel@63.1.2 login
$vercelScope = Read-Host 'Approved Vercel scope slug'
npx --yes vercel@63.1.2 project create 'pact-hacklanta-demo' --scope $vercelScope
npx --yes vercel@63.1.2 link --project 'pact-hacklanta-demo' --scope $vercelScope
npx --yes vercel@63.1.2 project inspect --non-interactive --scope $vercelScope
```

Create the project once. If it already exists, inspect ownership and reuse only the expressly approved dedicated target. Stop on a link/ownership mismatch. In that project's dashboard configure Root Directory `web`, outside-root source access, Node `24.x`, the install/build commands above, and the two public environment values for Production and Preview. This is a public demo target; ensure anonymous judges can open its production URL without an account challenge. Confirm settings, then the approved release command is:

```powershell
# Still at $bundle.pactSource (the clean monorepo root), not web.
npx --yes vercel@63.1.2 deploy --prod --scope $vercelScope
```

Do not use guessed `.vercel.app` addresses as release evidence. Record the returned URL, check anonymous HTTPS root/offer/verification/wizard/Base pages and assets, displayed program/Devnet, and the actual-origin read-only RPC preflight. If the verified URL differs from the originally proposed origin, rebuild Saturday with the returned verified URL. [Project creation/inspection](https://vercel.com/docs/cli/project), [deployment command](https://vercel.com/docs/cli/deploy).

For Saturday use the existing authenticated Sites account. **After approval only**, the primary owner invokes these native operations; no Wrangler installation or Cloudflare token is required:

1. `create_site({creation_intent:"user_requested", slug:"saturday-lights-pact-demo", title:"Saturday Lights — PACT Hacklanta Demo"})` once. Retain its opaque returned ID and source credential in session memory; never invent an ID or print the credential.
2. `update_site_access({project_id:<returned ID>, access_mode:"public"})` for this new approved demo target only. Re-read ownership/audience.
3. Prepare a new copy using the actual PACT origin and returned new ID, then source-helper **open** with the returned credential through hidden stdin. Keep its full returned opening object and `checkout_path`. If that supposedly new project's remote already contains source, stop and reopen into an empty separate checkout; reconcile retained source without forcing or overwriting history.

```powershell
Set-Location 'C:\Hackathon\PACT'
# Set these public values from verified platform responses; no original Site ID.
$bundle = & '.\deployment\prepare-hacklanta.ps1' -PactPublicUrl $verifiedPactOrigin -SaturdayProjectId $newSiteProjectId | ConvertFrom-Json
Set-Location $bundle.saturdaySource
$env:PACT_PURCHASE_URL = $bundle.purchaseUrl
# The owning agent starts this in a writable retained session, feeds credential
# JSON through hidden stdin, and uses the returned checkout_path thereafter.
node 'C:\Users\Lehr\.codex\plugins\cache\openai-curated-remote\sites\1.0.1\scripts\site-workflow.mjs' --project-id $newSiteProjectId
```

4. In the helper's returned checkout run `npm ci`, `npm run build`, `npm run validate` with the same `PACT_PURCHASE_URL`. Inspect built `dist/.openai/hosting.json`: new exact ID, `d1:"DB"`, no original ID. Recheck the actual PACT offer link, cancellation fence, source/artifact hashes, Worker default `fetch`, and independent tests.
5. Run the same source helper for packaging with `{credential:<session credential>, source:<complete opening result>, commands:[], archivePath:<absolute new tar path>}` through hidden stdin. It commits/pushes only the new Site checkout and returns verified `project_id`, `commit_sha`, `archive`.
6. `save_site_version({project_id:<returned>, commit_sha:<returned>, archive:<returned>})`, then `deploy_site_version({project_id:<same>, version_id:<saved id>})`. Poll only nonterminal deployments. Record terminal success and literal production URL before calling it live. Check anonymous top-level browser access, own DB/schema, scores, configuration/link and read-only entitlement behavior.

Sites source synchronization requires the authorized new source push before saving a version; no push/save/deploy was performed during preparation. The original target and audience remain protected. The [Sites skill](C:/Users/Lehr/.codex/plugins/cache/openai-curated-remote/sites/1.0.1/skills/sites/SKILL.md) documents the exact source/packaging protocol.

## Manual demo checklist — one separately authorized purchase

1. Prepare Chrome with Phantom in **Devnet**, two stable distinct operator-owned profiles: seller/unlicensed and buyer. Wait for connect to finish before switching. Open top-level HTTPS tabs, not iframe previews; Phantom requires HTTPS or localhost and does not inject in iframes. [Phantom provider requirements](https://docs.phantom.com/solana/detecting-the-provider).
2. Unlicensed seller on Saturday: connect, try starting/selecting a football slip, see license-required and marketplace link. Purchase link must open actual public PACT, with the same offer selected. Existing/shared slips are intentionally public.
3. Buyer on PACT: confirm exact offer, seller, 0.001 SOL, 180 seconds and original metadata/hash. Confirm no active entitlement and adequate Devnet funds. Only after separate explicit authorization, approve **one** Purchase license action. No offer creation, renewal, transfer or deactivation is implicit. Wait for finalized plus fresh validated entitlement; record Explorer signature and expiry.
4. Keep the buyer's PACT tab and Saturday tab ready. Connect buyer on Saturday, verify freshly and create/approve one football slip immediately. Show PACT Studio unlocked and actual buyer-bound entitlement. Do not wait until the last seconds of the license.
5. In the seller/unlicensed profile, recheck the same offer and attempt slip creation: blocked. In the buyer profile switch to the unlicensed account, wait for account change and retry: blocked; return to buyer for a fresh read while still active. Rejecting a connection/signature is a manual extension check, not automated signing evidence.
6. Leave a visible timer until the exact on-chain expiry (180 seconds after purchase), then attempt a fresh new slip and verify on PACT: blocked/expired. No expiry transaction or repeat purchase is needed. For a 90-second pitch, show the active portion live and a clearly labelled recording of the same purchase's later expiry, or offer a follow-up read after the pitch. Never present a synthetic preview as chain evidence.
7. If confirmation is unknown, inspect the retained signature/Devnet Explorer before anything else. No blind retry. If feeds/RPC/network fail, keep the gate closed and use the already recorded evidence/local fallback rather than buying again. Save public signature, expiry/slot, screenshots and timestamps; no wallet credentials.

## Local fallback

The proven marketplace and unchanged Saturday preview remain `http://localhost:3003/` and `http://localhost:3005/`. Do not use the new checkout at 3006 in this release demo. Servers are already running after final QA restoration; do not start duplicates. If stopped, use separate PowerShell terminals:

```powershell
# Terminal 1: existing final PACT production build; no rebuild of a serving .next.
Set-Location 'C:\Hackathon\PACT\web'
npm run start -- --hostname 127.0.0.1 --port 3003
```

```powershell
# Terminal 2: unchanged Saturday working build and original local purchase link.
Set-Location 'C:\Hackathon\saturday-lights'
$env:PORT = '3005'
node scripts/serve-local.mjs
```

Use the printed Saturday URL if its available-port fallback selects another port. The original local source retains the identified pending-connect limitation: finish/cancel connection completely before changing accounts; use separate stable profiles. The candidate's connection hardening does not alter this fallback. Previously approved slips and recorded real finalized purchase/expiry evidence can be shown without another transaction. Do not describe the expired wallet as currently licensed.

## 90-second pitch

**0–15s:** “PACT gives indie software a wallet-bound license. Saturday Lights is an independent football app using the reusable SDK.” Show the unlicensed profile blocked.

**15–35s:** Show the existing offer: 0.001 Devnet SOL, 180 seconds, terms hash. “The operator approves a wallet purchase; the program settles payment directly to the seller and atomically records an entitlement.” Use the separately authorized transaction, or its clearly labelled recording.

**35–65s:** Show finalized Explorer and fresh buyer verification, then switch to Saturday and make one licensed slip. “The app checks the connected wallet against the on-chain entitlement before each gated action.”

**65–80s:** Show another wallet blocked. Explain the same purchase expires automatically; show its labelled 180-second expiry recording or state when the live timer will expire.

**80–90s:** “No NFT and no license transfer. We preserve an independent app's existing UI. This is a Devnet MVP; client-side gates demonstrate integration, while production backends need wallet authentication and server authorization.”

## Remaining checkpoint

Fresh local gates: SDK **57**, Solana **154 + 2 setup + 2 public reads**, Base **48 + 2 setup**, wizard **8 + 2 public reads**, generated consumers **44**, Prism **22 + 2 public reads**, checkout **28 + 4 public reads**, staged Saturday **12** (8 cancellation, 2 basic workflow, 2 full football-slip UI). SDK-first clean candidate Next production build/TypeScript and Saturday build/validation pass. Lead independently reran local SBF **23** and preserved Foundry **23** tests, including fuzz cases. These automated wallet/transaction cases are synthetic; the explicitly public reads never submit transactions.

The candidate's unchanged Next configuration initially rejected dependency junctions outside its filesystem root. Copying existing installed dependencies physically into the candidate resolved the harness issue; no configuration was weakened and no dependency was changed. The clean source/output build is verified locally, but a fresh Vercel-hosted `npm ci` and hosted extension interaction remain future checks.

Reviewed staged Saturday gate SHA256: `2ab19a50cc588e50fb2a643e533e138fa9fa95e8ecc31cd5d3af11dde621b106`; original remains `74783d886524efb2f091d444aa5ecfce720d7447724066168a9c42715645d147`. Candidate Worker SHA256 `cf43ccbbbba76db4d65be0d99ede6bb7ea3d85422922c58a5038a9ff72dadf50` binds the candidate-only purchase URL and patched source. Rebuilding with actual approved URL/new Site ID will require a fresh manifest/artifact review. Original **90 PACT / 2,241 Saturday** protected hashes and all four Git tags match; local and deployed program bytes match. Read-only current Saturday scores endpoint returned **58 events, partial:false, HTTP 200** at `2026-10-11T01:48:58.949Z`.

Fresh production dependency audit: web has **13 high / 11 moderate / 0 critical** advisory entries, with the high entries in transitive Solana mobile-wallet / React Native / Metro / pattern-matching tooling. SDK and Saturday each have **4 moderate / 0 high / 0 critical** entries. Audit counts do not establish whether every package is reachable in desktop browser execution. No forced upgrade was applied and this is not a production security clearance; full advisory JSON is retained with QA evidence.

Local automated evidence is recorded in `HACKLANTA_FINAL_QA.md`. Independent Security/Reviewer source/evidence reconciliation **PASS**; Lead's final post-restoration checks confirmed all protected hashes/tags and six local HTTP previews. PACT 3003 is restored in production mode with actual public Devnet configuration; the original 3004/3005/3006 processes are unchanged. **Local preparation READY; public release BLOCKED at target approval.** Public release requires the operator's exact Vercel scope/project and new public Sites target approval, Vercel authentication, and verified returned URLs/IDs. The staging URL remains a candidate only. Real hosted Phantom permission/signing, settlement/unlock/expiry requires separate operator transaction authorization. Keep exact seller metadata available. No hosted PACT/PACT-enabled Saturday deployment or new blockchain transaction is claimed by this preparation task.
