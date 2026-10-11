# Phantom transaction-message compatibility investigation

## Scope and evidence

The operator reported offer creation stopping with `The wallet changed the transaction message. Nothing was submitted.` This investigation permits local code/tests and public read-only Devnet checks only. No real wallet connection, approval, signing, simulation, broadcast, funding, deployment, or upgrade is performed.

The original failed wallet response was not recorded. Its exact historical byte changes cannot be independently recovered from that error text alone. The compatibility mechanism below is established by official documentation, installed source, and a safe local reproduction; it is not a claim that the original extension response was captured.

## Documented compatibility mechanism

PACT previously constructed an unsigned v0 message containing only the PACT instruction. [Phantom documents](https://docs.phantom.com/developer-powertools/solana-priority-fees) automatic priority-fee enhancement at signing for qualifying unsigned transactions without existing Compute Budget instructions. PACT's previous small message met those conditions.

Backend reproduced this behavior locally with synthetic public addresses and dummy signature bytes: adding a compute limit and price preserved the fee payer, blockhash, PACT program/data and decoded account permissions, but changed the serialized message from 237 to 289 bytes. The readonly unsigned-account count changed from 2 to 3, a Compute Budget program key was added, the instruction count changed from 1 to 3, and compiled account/program indexes shifted. The existing exact-byte guard correctly rejected that different message.

Installed `@solana/wallet-adapter-phantom` delegates `signTransaction` to the provider; it does not itself rewrite fields. Installed web3.js versioned simulation only serializes the transaction. Canonical v0 serialize/deserialize roundtrips preserve message bytes, and serialization produces a fresh byte array. Thus source/local evidence does not support a serialization alias bug or an application-generated blockhash/payer mutation as the reproduced cause.

## Fix and integrity invariants

- Declare `ComputeBudgetProgram.setComputeUnitLimit({units:200000})` and `setComputeUnitPrice({microLamports:0})` before simulation and review. This opts out of the documented automatic enhancement and adds no priority fee.
- Capture a separate copy of reviewed message bytes. Use wallet-adapter `signTransaction` with a canonical transaction copy, retaining verification before submission; do not switch to sign-and-send.
- Immediately copy the returned signed wire, decode it with the trusted SDK, validate canonical encoding, and compare the entire message byte-for-byte with the reviewed snapshot. Fee payer, blockhash, account ordering/permissions, program IDs, PACT amounts/terms/nonce/duration, compute budget/price, versions, and lookups remain protected.
- Derive the public signature from the captured canonical wire. After fresh Devnet and wallet/offer identity checks, submit exactly that captured wire copy. Do not reserialize a mutable wallet object after an asynchronous wait.
- A mismatch reports only changed field categories and submits nothing. It never permits wallet-added instructions or silently changes expected fees. Unknown submissions retain a signature and never automatically retry.

Actual compiled SBF execution in local LiteSVM with signature verification disabled consumed 7,567 CU for create, 15,243 CU for purchase, and 3,494 CU for deactivate with the explicit budget. All succeeded below 200,000 CU. This is local execution, not real wallet or Devnet transaction evidence.

## Files for this fix

- `web/lib/solana/transaction.ts`: reviewed transaction construction, strict diagnostics and captured-wire integrity.
- `web/components/solana-app.tsx`: canonical signing handoff and captured-wire submission.
- `web/README.md`: signing compatibility and evidence boundaries.
- QA-owned Solana helper/browser regression tests and `docs/SOLANA_QA.md`.
- This report and current `docs/STATUS.md`, `docs/HANDOFF.md`, `docs/DECISIONS.md`, and live runbook notes.

The existing uncommitted integration work is preserved. Program source/artifact, Solidity, Base behavior, UI styling, public deployment configuration, and dependencies are unchanged by this fix.

## Final independent acceptance

QA passed 96 configured executions (44 browser and 52 helper, with four intentional separate-mode skips), two missing-configuration checks, and two actual Devnet read-only desktop/mobile checks. Production build and TypeScript both exited 0; all four static pages generated. Tests reject malicious message/wire changes, noncanonical encoding, and late provider-object mutation without weakening the guard. Security/Reviewer independently reconciled the source and final evidence: scoped PASS.

Final public forensic sample: `2026-10-10T21:45:15.485Z`, finalized context slot `509680157`. The expected Devnet genesis and executable program were verified. Successful account enumeration found zero program-owned accounts, hence no offers/licenses. Program signature history returned only the initial deployment, with no entries after baseline slot `509674735`. No offer transaction was found in that finalized history; this cannot rule out an off-chain approval, pending or dropped submission.

Evidence and exact commands are in `docs/SOLANA_QA.md`. Public-only ignored evidence includes `web/test-results/solana-live/phantom-final-public-forensics.json`, `phantom-final-production-build.log`, `phantom-final-typecheck.log`, desktop/mobile screenshots and the Playwright reports. Local preview was restored at `http://localhost:3003/`: HTTP 200, actual program ID present, fixture ID absent, no server stderr. The reviewed artifact SHA256 remains `d13828b060327ef9f702b076b8681e4b9e1e8c04f961191d1df17b2babf52a62`.

The local compatibility fix is ready for a separately authorized single-offer retry. Actual Chrome Phantom approval and historical response diagnosis remain unverified; no live wallet operation was performed to obtain that evidence.

## Safe operator retry — separate authorization required

1. Check the current read-only program-account/history results for an existing offer. If the old attempt has a signature, check it before retrying; absence of a finalized account cannot rule out a pending or dropped submission.
2. After the updated local preview is restored, hard-refresh `http://localhost:3003/`. Confirm the actual program `EiiiWWsW2kkqP6nugHz6iBADvhnW5xnibAtZ82ZExVqy`, Devnet, the intended seller public address, and sufficient test SOL. No CLI authority credentials are needed.
3. Set price `0.001` SOL and duration `180` seconds in Seller studio. Review the terms/hash, download the exact metadata, and approve the terms checkbox. Do not click Create offer until separately authorized.
4. Once exactly one offer creation is explicitly authorized, click Create offer once and review the Phantom request. PACT's priority price is zero; ordinary transaction fees and offer rent still apply. Reject an unexpected transaction or account/network mismatch.
5. Approve only that intended offer creation, wait for finalized status, and save its signature and offer PDA. Do not initiate a purchase as part of this retry.
6. If message validation still fails, report the displayed changed-field categories without approving another attempt. If confirmation is unknown, inspect the retained signature first; no blind retry.

Real Phantom retry/signing remains an operator gate. This investigation stops before any live transaction.
