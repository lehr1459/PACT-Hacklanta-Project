# Hacklanta public MVP deployment

Deployment completed 2026-10-11 UTC after explicit operator authorization. This publishes the tested marketplace-to-Phantom-to-independent-app MVP. No embedded checkout replacement, SDK publication, blockchain transaction, wallet approval, program upgrade, or unrelated repository push occurred.

## Public targets and provenance

| Target | Verified public URL | Deployment |
| --- | --- | --- |
| PACT | https://pact-hacklanta-demo.vercel.app/ | Vercel `dpl_7j8igjsYx9SjsrrKZsXBx79FJcQF`, production READY |
| Saturday Lights PACT demo | https://saturday-lights-pact-demo.lehr-exe.chatgpt.site | Sites version 1, `appgdep_6acaf0b8479881918c3e437ca5f48c69`, succeeded |

PACT uses project `pact-hacklanta-demo` / `prj_mwDbCMt3esLN5tmnzUKoQlv5HEjk`. Authenticated CLI discovered personal scope `lehr98-9390`; the existing personal Hobby namespace is represented internally by Vercel as `team_CAgQOqct6ECLtcEXYOvNX11R`. Its creator and confirmed OWNER match authenticated user `p5730IAgbasBSwvVdmgO2S5p`. No team was created or separate organization selected. [Vercel account model](https://vercel.com/changelog/2024-01-account-changes).

Vercel root is `web`, Node `24.x`, Next.js, outside-root source access enabled. Production/Preview public configuration is deployed program `EiiiWWsW2kkqP6nugHz6iBADvhnW5xnibAtZ82ZExVqy` and RPC `https://api.devnet.solana.com`. SDK-first install remains `npm --prefix ../packages/pact-sdk ci && npm --prefix ../packages/pact-sdk run build && npm ci`; build is `npm run build`.

Saturday project is the newly registered `appgprj_6acaedf2d08c819185e972af5f096ccf`, owner-public. Pushed source commit is `b92b9a5cae00c7226115e626c96a3d751f16dfc5`. Saved version ID is `appgprj_6acaedf2d08c819185e972af5f096ccf~appgver_f89e2446f8488191b64f951e1e7222ab`. The build embeds the verified purchase URL:

```text
https://pact-hacklanta-demo.vercel.app/?offer=7EdfowQEZyVyyp7bYdQyzmprZtVU9mVba8cysHm2Ardh
```

The original Saturday Site remains public version 5 at https://kalshi-38-live.lehr-exe.chatgpt.site, project `appgprj_6ab80811a9988191b55627a22b14bed2`. No original source, data, access policy, or deployment was changed.

## Build and packaging evidence

Only isolated copies under `.deployment-candidates/20261010-213948-8755f031` were uploaded. Private environment files, node_modules, build caches, Git metadata, and signers were excluded. The local Vercel link created ignored authentication state; its contents were never read or uploaded. Sites repository credentials remained in session memory and were passed through hidden stdin.

The first Vercel build (`dpl_9RodweH6jeeisQo4sdg5mdxgMsaS`) stopped at `npm ci` before publication because its stricter installer detected incomplete optional dependency entries. Local npm 11.6.2 accepted the original locks; npm 12.2.0 reproduced the rejection. Candidate-only repairs add SDK `bufferutil@4.1.0` and nested `rpc-websockets/node_modules/utf-8-validate@6.0.6`, and web `bufferutil@4.1.0`. Every original package entry and top-level lock field remains unchanged; no pinned version changed. Independent reviewer confirmed this diff. Original SDK/web locks are preserved, so a future fresh upload must retain this reviewed packaging repair.

After repair: clean SDK/web installs, SDK compilation and TypeScript, web TypeScript and local Next production build passed. Hosted Linux clean installs and Next production build then passed in 36 seconds, including TypeScript and all static routes. No dependency force-upgrade or peer-validation bypass was used. Existing audit findings remain: SDK 4 moderate; web 13 high and 11 moderate (previously reviewed transitive mobile-wallet/React Native tooling). This is a Devnet MVP, not a production-security clearance.

Saturday `npm ci`, `npm run build`, and `npm run validate` passed with actual `PACT_PURCHASE_URL`. Manifest has only the new project ID, its own `d1:"DB"`, and `r2:null`. Worker exports default.fetch and the validated PACT gate. Gate SHA256 is `2ab19a50cc588e50fb2a643e533e138fa9fa95e8ecc31cd5d3af11dde621b106`; Worker SHA256 is `cf43ccbbbba76db4d65be0d99ede6bb7ea3d85422922c58a5038a9ff72dadf50`, matching the previously tested candidate. Windows packaging used existing Git Bash and `TAR_OPTIONS=--force-local`; no WSL installation or source change was needed. The helper verified the remote source commit before packaging. Local compressed archive SHA256 is `88aead5ae59c53659d3202c63d84e735f62af0aa2200e6c182b73addfecf9439`; Sites' normalized saved archive content hash is `4a0db3b2c43f140869fe18d43509793aa95ea5139b595f81ff67bca802009344`.

Protected-file checks: 90 PACT and 2,241 original Saturday SHA256 comparisons, zero mismatches. All four existing Git tags remain present. Program source/artifact and local fallback workflows were preserved. Earlier local acceptance evidence remains in `HACKLANTA_FINAL_QA.md` (387 acceptance checks and 46 local contract tests); configuration publication does not constitute a new real-wallet purchase.

## Public verification

Both exact public origins return anonymous HTTP 200. New Saturday `/api/scores` also returns HTTP 200. Independent PACT desktop/mobile browser checks passed: exact offer prefill; Phantom controls and safely disabled connection without extension; disconnected Studio remains locked; buyer's existing expired entitlement and seller's missing entitlement are verified through real Devnet reads; integration wizard and isolated Base route load. Fourteen RPC requests were exclusively getGenesisHash/getMultipleAccounts. No page errors, console errors, failed resources, or HTTP errors were observed. Evidence: `web/test-results/hacklanta-public/pact-public.json` and screenshots.

Independent Saturday desktop/mobile browser checks passed: 58 real football games, two upcoming games/four selectable teams, filter navigation, unlicensed pick stays unselected, Connect Phantom control is present, and the exact public purchase link opens verified PACT with the correct offer and closed Studio. Offline checks keep gated picks blocked; no slip/reaction mutation occurred. There was no page crash, HTTP error, or horizontal overflow. Actual network limitation: seven direct ESPN browser requests per profile failed CORS; the existing same-origin Worker fallback restored the live feed. Independent GET `/api/scores?week=20261005` returned HTTP 200, 58 events, `partial:false`, at 02:14:28 UTC. QA also deliberately blocked a Cloudflare challenge POST under its no-POST policy; that recorded failure is distinct from the ESPN CORS behavior. Do not describe Saturday's browser network/console as error-free. Evidence: `web/test-results/hacklanta-public/saturday-public.json`, `saturday-public-feed.json`, and desktop/mobile screenshots.

Public functional QA and final independent reviewer reconciliation PASS. Reviewer independently fetched PACT root/exact-offer/integrate/Base, new Saturday, and original Saturday anonymously: all HTTP 200. New Saturday's two application-owned inline scripts byte-match the reviewed candidate; its hosting-added dynamic Cloudflare challenge explains the whole-page difference. Program configuration and exact external purchase URL match, with no localhost purchase target or mocked chain claim. Original publication lacks the new gate and remains preserved. No material website-deployment blocker remains; real hosted Phantom interaction, purchase, active unlock, and expiry are separately authorized manual gates.

## Remaining live Phantom checklist

1. Open top-level Chrome tabs at the public Saturday URL and the exact PACT offer link above. Use Phantom on Devnet with distinct stable seller/unlicensed and buyer profiles. Do not use the upgrade-authority wallet.
2. Before purchase, manually verify wallet connect/disconnect, rejection, account switching, and the unlicensed Saturday gate. Automated browsers do not have an authenticated Phantom extension.
3. Have the original exact seller metadata JSON available on the new PACT origin. Localhost browser storage does not migrate to the public domain. Its terms hash must be `0xf9300ddb0b3dc043942d78fbe7c25b12c227b9dd1ac58373f401bda1d3b7b35a`; price is 0.001 Devnet SOL and duration 180 seconds. Do not reconstruct terms from a hash or create another offer.
4. The existing buyer's prior license has expired. Allow at least 0.01 Devnet SOL for fees/rent. Prior read-only quote was 0.001005 SOL total for the existing funded entitlement, 0.00206672 SOL for a new buyer; the seller receives exactly 0.001 SOL. Wallet identity, balance, and current quote must be checked before a purchase.
5. Only after separate transaction authorization, the operator performs one Purchase license approval, waits for finalized confirmation plus fresh entitlement verification, and records the Explorer signature and expiry. No purchase is authorized by this website deployment task.
6. During the 180-second validity window, verify Studio unlocks and Saturday permits the buyer's licensed slip action. Verify the distinct unlicensed wallet is blocked; switch accounts and recheck. After expiry, fresh actions must be blocked without another transaction.
7. If confirmation is unknown, inspect the retained signature before considering any retry. Do not repeat a purchase blindly. RPC/feed failure must keep gated actions closed.

Active hosted unlock and real Phantom permission/signing behavior remain manual verification. Existing/shared slips are public by design. Client-side gating demonstrates SDK integration; production backends require authenticated wallet identity and server-side authorization.
