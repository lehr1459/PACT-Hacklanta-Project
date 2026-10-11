# Decisions

- Offer stability fix is local on `fix/offer-refresh-stability`, rollback `117b793`. Before edits, three 60-second production-preview observations each reproduced 15 offer-subtree removals at the four-second poll cadence, without recurring navigation or page errors. New query data briefly failed progress-reference/clock synchronization, hiding the snapshot. Reconcile accepted progress and clock before child commit; preserve all existing freshness, slot, session, expiry, error, wallet and transaction predicates. Same-slot reads never renew progress time; backward slots remain rejected. No cached offer authorizes purchase.

- One-link purchasing uses the existing offer query parameter plus a `pact=v1` / base64url metadata fragment. Preserve exact committed UTF-8 bytes and all existing purchase guards; reject links above 2,048 characters or 1 KiB public metadata without truncation. Manual JSON remains the fallback. Feature branch `feat/one-link-purchasing`, rollback `26fc35e`; local work only.

- Offer/input feedback follow-up stays local: suppress premature validation hints while editing, reserve ordinary feedback and seller-link space, and keep genuine RPC alerts readable. Solana Flow 02 reads `Purchase with SOL`; Devnet/test-currency disclosures remain. Preserve hooks, control handlers, licensing guards, SDK/program/configuration and production deployment.

- Operator explicitly approved publishing reviewed enterprise UI commit `3953f3b` to the existing personal Vercel project only. Lead executed one release from fresh isolated Git-extracted source after Backend/Reviewer package approval and six clean SDK-first gates. Production `dpl_6SXVEhtU4CHLp2UAq5Mj1NbbyUZh` preserves previous READY deployment and rollback `4123cc12`.
- Reuse exactly the reviewed three optional npm lock entries in upload-only locks; preserve every existing package version, original lock, wallet/network configuration, SDK/licensing behavior, Solana program and Saturday deployment. Hosted UI verification remains separate from any real Phantom transaction authorization. Evidence: `docs/UI_PRODUCTION_RELEASE.md`.

## Enterprise UI redesign — authorized local work

- Midnight navy header/product surfaces, light workflow panels, slate/blue tokens, existing fonts and plain CSS. No runtime UI dependencies or new product features.
- Preserve runtime handlers, hooks, validation, transaction construction, entitlement rules, generated SDK content, wallet behavior, public interfaces and destinations. Frontend owns presentation; Backend reviews preservation; QA owns isolated acceptance/visual evidence.
- Branch `ui/enterprise-redesign` has rollback source checkpoint `4123cc12f64f48def857f0d60c8d54d671daabd5`, preserving original commit `9a4783e75e222682551660ab21aab89e90540546` and all four release tags. Only reviewed public source is staged.
- Keep local demos 3003–3006 and public deployments untouched. All builds run in isolated copies; QA owns 3007 until generated-consumer testing releases it for the final UI preview.
- No publication, push, real wallet approval, signing, simulation/broadcast, or program change. Deployment needs separate approval after local QA.

- Hacklanta final release preparation uses the proven marketplace purchase link and existing Saturday read-only SDK gate. New Vercel PACT / new Sites Saturday targets require explicit operator approval; original Saturday public project and local sources remain protected. No program deployment or new SDK/UI feature is part of this release.
- Clean deployment copies contain public allowlisted web/SDK/ABI/wire sources, no signer/environment files. Vercel builds SDK first with sibling source access. Saturday's original project ID is stripped; only a platform-returned new ID may be supplied after approval. Candidate URLs are not deployment evidence.
- QA found an original late-connect cancellation race; a minimal connection epoch fence is applied only to the isolated Saturday candidate. Strict HTTPS-origin input validation prevents inline-script injection through deployment configuration without changing the original app's build/source.
- Reuse the existing active 0.001 SOL / 180-second offer and original metadata for one separately authorized purchase. Show active access immediately and timed/read-only expiry or labelled recorded proof; no repeated purchases, offer changes, transfers or authority-wallet use is implicit.

- Embedded checkout Phase 1 adds opt-in SDK checkout/widget exports while preserving the root read-only API and existing marketplace handlers. Reuse reviewed purchase logic with parity tests; no program change or external publication.
- Inline vanilla Shadow DOM widget, browser ESM/IIFE, explicit reviewed program/RPC/offer and exact host metadata plus paste fallback. Title is off-chain metadata matched to on-chain hash. No iframe, synthetic production success or backend authentication.
- Checkout honors existing marketplace purchase locks and unresolved legacy journals. New baseline recovery fields live in a separate versioned record; legacy records are never silently overwritten/migrated/cleared. Expired prior licenses do not by themselves prove an ambiguous transaction failed.
- Standalone example uses port 3006 with loopback available-port fallback through 3016; Saturday Lights 3005 remains read-only. Automated local READY does not claim a real Phantom purchase; that requires separate operator authorization.
- Embedded checkout review fixes bind raw account capture to the exact read/session/account identities and abort lifetime; protect different journal incarnations; preserve observed confirmation; deliver synchronous inactive state on reentrant teardown; and keep unresolved purchases or invalid journals locked until finalized recovery. Existing no-pending entitlements retain the root SDK's fresh confirmed-read policy.

- Integration wizard targets Next.js App Router and React TSX only. It generates local configuration, a Phantom-connected SDK consumer and an assistant prompt; it does not register or protect an application automatically.
- Integration configuration fixes Solana Devnet, the reviewed program and official public RPC. SDK-only public offer validation precedes generation. Locked/valid/expired previews are explicitly simulated, with no fabricated chain outcome.
- SDK remains unpublished: installation uses the built local package or an operator-supplied tarball. Preserve the existing SDK/example, marketplace transaction flows, deployed program and checkpoints; no additional backend/authentication platform.
- Integration wizard local release gate requires compilation of the actual generated code, independent synthetic/browser regressions, public Devnet offer validation, restored actual-config build and Security/Reviewer reconciliation. All passed; real Phantom dialog/ownership evidence and production server enforcement remain separate, explicitly unclaimed gates.

## Developer SDK and independent app

- Add standalone `@pact/sdk` under `packages/pact-sdk`, compiled exports and declarations with only Solana web3/Buffer runtime dependencies. Preserve marketplace sources and on-chain wire protocol; a standalone SDK must not import application internals.
- Retain target `{ offer, wallet }` calls as client methods so one explicit read-only client owns Devnet RPC and freshness policy. Fixed actual program, coherent offer/license/Clock/program snapshots and bounded fail-closed reads; no transaction APIs.
- Independent Next.js app under `examples/pact-demo-app` uses the SDK package through public exports and Phantom connection-only identity. Typed public addresses remain verification inputs in Node, never server authentication or proof of wallet control. No root workspace migration or external deployment is needed.
- Local mocked transitions are separate from public Devnet read evidence and pending real wallet/purchase checks. The 180-second live licence cannot truthfully expire inside a 60-90 second uncut demo; use a labeled time cut or labeled synthetic replay.

- Purchase handling fix: distinguish constructed, wallet-signed, RPC-accepted and on-chain states; a local signature is not evidence of acceptance. Preserve sanitized public errors; SDK error class alone is not proof of preflight rejection.
- Purchase handling fix: retain blockhash/last-valid height; reconcile expiry with chain height and historical status, never downgrade observed confirmation to expired. Retry only bounded public reads, never transaction submission.
- Purchase handling fix: protect unresolved purchases across repeated events, wallet switches and reloads with public-only attempt identity/validity records. Preserve immutable verified wire; never persist signed bytes or access operator credentials.
- Purchase handling fix: original purchase response is unavailable. Correct proven frontend defects without claiming recovery of the historical cause; live retry remains a separate operator authorization.

- Phantom mismatch investigation: predeclare 200,000 CU and zero CU price before simulation/review/signing to avoid Phantom's documented automatic fee enhancement of unsigned messages without a budget. Preserve exact byte equality; never allowlist wallet edits after signing.
- Phantom mismatch investigation: capture and canonical-validate copied signed wire immediately, then submit that exact copy after network/identity checks. Do not reserialize a mutable provider object across an asynchronous wait. Diagnostics expose changed field categories only.
- Phantom mismatch investigation: the original wallet response was not captured. Documented behavior and local reproduction establish a compatibility mechanism, without claiming a recovered historical byte diff. Real retry/signing is not authorized by this investigation.

- Current live frontend integration: use the finalized Devnet program `EiiiWWsW2kkqP6nugHz6iBADvhnW5xnibAtZ82ZExVqy` through ignored public-only `web/.env.local`. Keep the example program ID empty and test fixtures explicitly isolated; preserve Base fallback and frozen program artifact.
- Current live frontend integration: normal transaction completion requires finalized status; confirmed status is displayed while finalization is pending. A known signed signature is retained before submission so transport ambiguity never implies a safe retry. No automatic transaction resubmission.
- Current live frontend integration: frontend account decoding accepts only the canonical derived license PDA with an empty, nonexecutable System account as uninitialized, matching the deployed program's prefunding behavior; foreign/nonempty accounts fail closed.
- Current live frontend integration: automated synthetic wallet/RPC tests and actual public read-only Devnet checks are permitted. Real seller/buyer signatures and transaction execution remain outside this task and require separate authorization.
- Current live frontend integration: wallet controls use identical disabled server/first-client markup, then reveal adapter availability after hydration. Wallet adapters report Unsupported on the server and detected states in the browser; rendering those initial options directly caused the independently observed React #418 error. No hydration errors are suppressed.

- 2026-10-10: Operator pivots current MVP to Solana Devnet. Base Sepolia implementation/tags remain isolated fallback; no live deployment/signing/broadcast authorized.
- 2026-10-10: Minimal Solana program uses immutable seller offers and buyer-bound entitlement PDAs, no tokens/NFTs/transfers. Purchase atomically transfers the program-defined lamport price directly to the offer seller and records expiry. Direct settlement replaces Base's escrow withdrawals in the Solana experience.

- 2026-10-10: Operator approved Phase 2 local implementation only. Stop before broadcast/deployment and signing requests.
- 2026-10-10: Entitlement trust is bounded: same-block reads, 4-second polling, 5-second request timeout, 8-second freshness, 12-second block-progress limit; hidden/offline/error/identity changes close access. Metadata limit is shared 64 KiB UTF-8.
- 2026-10-10: Planned encrypted keystore is operator-controlled outside the repo; local browser tests use explicitly synthetic RPC/wallet fixtures, with actual testnet wallet evidence remaining a later gate.

- 2026-10-10: New PACT workspace separate from Hacklanta agent project.
- 2026-10-10: Digital licensing only; fixed license contract; native Base Sepolia test ETH.
- 2026-10-10: Seller proceeds use withdrawal pattern; no immediate external seller call in purchase.
- 2026-10-10: Senior Dev excluded from default delegation.
- 2026-10-10: Contract validity checks; no NFT ownership claims.
- 2026-10-10: Phase 1 proceeds with the bundled contract as the fixed design baseline. Dependency versions and actual local test results must be recorded before frontend integration; no testnet deployment without explicit user approval.
- 2026-10-10: Use project-local Foundry v1.8.5, Solidity 0.8.24, OpenZeppelin v5.4.0, and forge-std v1.9.7; verify release checksum and dependency commits via reproducible setup. Compiled ABI lives at `contracts/abi/PactLicensing.json`.
- 2026-10-10: Frontend requires exact off-chain metadata hash, matching price/duration, and buyer approval before purchase. It verifies RPC chain ID 84532 and contract code, simulates writes, and claims success only after a successful receipt. Missing deployment address stays an explicit setup state.
