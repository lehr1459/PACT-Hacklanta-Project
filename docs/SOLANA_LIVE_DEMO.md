# PACT Solana Devnet live demo

This is an operator-guided runbook. This frontend integration task authorizes local configuration, code fixes, automated tests, and public read-only Devnet checks. It does **not** authorize creating an offer, buying a license, deactivating an offer, requesting wallet signatures, transferring SOL, upgrading, or redeploying.

## Verified deployment

- Network: Solana Devnet, RPC `https://api.devnet.solana.com`.
- Expected genesis: `EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG`.
- Program: `EiiiWWsW2kkqP6nugHz6iBADvhnW5xnibAtZ82ZExVqy`.
- Initial deployment finalized at slot `509663811`; [deployment transaction](https://explorer.solana.com/tx/3vVwZpgyraMZqhAThbPddNexgAR2SJGJG2Y2cLEhXSx1dtfQ6vBmLzXmhUkvm9K83iV3PL5naa9K78X4hWYXqeDc?cluster=devnet).
- Executable bytecode: 35,784 bytes, SHA256 `d13828b060327ef9f702b076b8681e4b9e1e8c04f961191d1df17b2babf52a62`.
- Upgrade authority remains the dedicated CLI payer `CVN3suQneZtAb1RMuHf3BVYYEtAuNqNdSoiDQagQ7xzh`. It is not needed for frontend offer/purchase transactions.

Older deployment preparation documents describe historical pending signer/funding states. The finalized deployment and this live integration runbook supersede those states; Base fallback and existing Git tags remain preserved.

## Local frontend configuration

The ignored `web/.env.local` contains public configuration only:

```dotenv
NEXT_PUBLIC_PACT_SOLANA_PROGRAM_ID=EiiiWWsW2kkqP6nugHz6iBADvhnW5xnibAtZ82ZExVqy
NEXT_PUBLIC_SOLANA_RPC_URL=https://api.devnet.solana.com
```

Start the frontend from PowerShell if the PACT preview is not already running:

```powershell
Set-Location 'C:\Hackathon\PACT\web'
npm run dev -- --hostname 127.0.0.1 --port 3003
```

Open `http://localhost:3003/`. The program link must resolve to the exact program above with `cluster=devnet`, and the page must say Solana Devnet. `/base` remains the isolated fallback. Restart/rebuild after changing public configuration; Next.js embeds it in client bundles. No wallet or transaction should be initiated simply by opening the page.

## Seller and buyer prerequisites

Use two distinct operator-controlled browser wallet public keys, preferably separate Chrome profiles with Phantom installed. Select Devnet in Phantom. Keep the dedicated CLI payer/upgrade authority outside the browser demo; never paste or import its signing files into PACT.

Both wallets need Devnet test SOL. For a 0.001 SOL offer, 0.01 Devnet SOL per wallet provides a small rent/fee allowance. Read-only quotes during preparation were 0.00114808 SOL for the 98-byte offer and 0.00106172 SOL for the 81-byte license. Rent/fees can change: the seller pays offer rent and fees; the buyer pays exact price, initial license rent, and fees. Subsequent purchases after expiry can reuse the buyer-bound license account. No funding transfer is performed by this task.

Real Chrome extension availability, unlock/permission dialogs, account switching, signing rejection, confirmation, and settlement remain operator checks. Synthetic browser adapters are not proof of those interactions.

## First live purchase — only after separate authorization

The first buyer attempt returned an unrecorded signature with no observed payment/entitlement. The submission/confirmation fix now passes 154 regressions, two setup and two actual read-only browser checks, production build, TypeScript and independent review. Follow `docs/SOLANA_PURCHASE_HANDLING_FIX.md` for the current existing-offer retry checklist and separate authorization gate. Use the existing finalized offer rather than creating another offer. No purchase is authorized by the local fix. The numbered original full-demo sequence below is historical; for the first buyer retry use the existing-offer checklist in the fix report.

Offer retry after the reported Phantom message mismatch: follow `docs/PHANTOM_TRANSACTION_FIX.md`. The updated app declares compute limit/price before signing and keeps strict integrity checks. No repeat offer creation or purchase is authorized merely by completing the fix.

1. Authorize the specific seller create-offer and buyer purchase demo before requesting any signature. No deactivation, duplicate purchase, renewal, transfer, or upgrade is implicit in that authorization.
2. In the seller Chrome profile, open PACT and connect Phantom. Check the displayed seller address and Devnet. Choose **Seller studio**.
3. Use title `Studio toolkit`, price `0.001` test SOL, and duration `180` seconds. Review the terms and deterministic hash. Download the exact metadata JSON and keep its bytes unchanged. Approve the terms checkbox.
4. Click **Create offer** once. The app verifies Devnet and the executable program, fetches a blockhash, and simulates without signing before requesting Phantom approval. Review the transaction and approve only the intended Devnet create-offer. Wait for finalized status. Copy the full offer PDA and save its transaction Explorer link.
5. In the distinct buyer Chrome profile, open PACT, connect the buyer, and confirm its public key differs from the seller. Choose **Buy a license**, paste the offer PDA, and paste the exact seller metadata JSON. Confirm the price, duration, seller, and hash match. Approve the matching-terms checkbox.
6. Click **Purchase license** once. Review and approve only the intended Devnet purchase in Phantom. Wait for finalized status and save its Explorer link. If submission is ambiguous or finalization times out, inspect the displayed signature first; do not click again blindly.
7. Wait for a fresh coherent offer/license/Clock snapshot. Studio should unlock only for the connected buyer with an unexpired entitlement. The exact price settles directly to the seller in the purchase transaction; there is no withdrawal step.
8. In **Verify access**, enter the offer PDA and buyer public key. Verification must work without connecting a wallet. Record the displayed context slot and expiry. Obtain the license PDA from the PACT purchase instruction's fourth account in the transaction Explorer and have QA independently validate its buyer/offer binding and account bytes. Check the seller received the exact price, separating price from rents and transaction fees.
9. Disconnect/switch to the seller or another wallet and confirm the buyer's access does not follow it. Return to the buyer, wait for expiry, and confirm Studio locks without a new transaction. Preserve seller/buyer transaction signatures, account evidence, and screenshots for independent review.

The app closes access on missing/invalid entitlement, RPC/owner/identity failure, stale reads, stalled slot progress, offline/hidden pages, or expiry. The Studio is a client-side demonstration gate, not production content authorization or a legal ownership claim.

## Evidence boundaries and stop gate

Final independent integration acceptance passed: 46 configured synthetic regression executions (32 browser and 14 helper), 2 setup-mode browser checks, and 2 actual Devnet read-only desktop/mobile browser checks. TypeScript and the restored actual-config production build exited 0; all 4 pages generated. The actual deployed program link was present, the synthetic fixture address was absent, and both root and `/base` had zero browser page errors. The actual-network tests allow only public genesis/account/snapshot reads and reject transaction RPC methods.

QA found and retained evidence of an initial React #418 hydration failure before the fix. Wallet controls now render identical initial server/client markup and detect adapters only after hydration; tests keep error assertions enabled. See `docs/SOLANA_QA.md` for precise commands, evidence files, and the failure/fix history.

Configured local preview: `http://localhost:3003/`, independently verified HTTP 200 with the actual program link and no synthetic fixture ID. Desktop/mobile screenshots were visually reviewed. The preview binds to local loopback; no website deployment took place.

## Files changed for this integration

- Public local configuration: `web/.env.local` (ignored; two public values only).
- Implementation: `web/components/solana-app.tsx`, `web/components/solana-providers.tsx`, `web/components/solana-wallet.tsx`, `web/lib/solana/protocol.ts`, `web/lib/solana/rpc.ts`.
- Tests/configuration: `web/tests/solana/browser.spec.ts`, `protocol.spec.ts`, `setup.spec.ts`, `live-read.spec.ts`, `playwright.config.ts`, and `start-server.mjs`.
- Documentation: `web/README.md`, `docs/DECISIONS.md`, `docs/HANDOFF.md`, `docs/STATUS.md`, `docs/SOLANA_QA.md`, and this runbook.
- Tool-generated during preview startup: `web/AGENTS.md` (managed Next.js instructions) and `web/next-env.d.ts` (development type paths, matching the pre-existing generated diff). No manual changes to these files.

No Solidity, Solana program source/artifact, Base route, dependency manifest/lockfile, or existing Git tag was changed. This task leaves changes available for review; it does not create a new deployment or claim a real license purchase.

The integration uses real wallet-built Solana instructions and signed-byte submission to a genesis-verified Devnet endpoint. Automated transaction tests intercept RPC and use synthetic public signature bytes; public Devnet browser smoke tests allow reads only. No live create-offer or purchase has been executed by this integration task.

Readiness is for the separately authorized operator demo. Program deployment integrity is already verified; live settlement, wallet signing, entitlement issuance, and unlock/expiry evidence remain pending that demo. Existing dependency advisories remain documented in `web/README.md`; this is not a production security clearance.
