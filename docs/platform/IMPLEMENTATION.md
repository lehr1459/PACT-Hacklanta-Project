# Developer Platform v1 implementation and local release assessment

Local acceptance: **PASS**. Distributed/serverless authentication release: **BLOCKED** pending an atomic shared challenge/session store, shared rate limiting and a separate security review. Real Phantom message/signature/transaction flows remain manual and unverified. Nothing was pushed, published, deployed or broadcast during this run.

## Implemented

- Twelve REST paths under `/api/v1`, including verified offers, unsigned seller/buyer preparation, public license lookup, transaction status, wallet challenge/session lifecycle and a read-only protected operation.
- Additive typed `@pact/sdk/v1` client, Node-only `@pact/sdk/server` utilities and SSR-safe `@pact/sdk/react` wrapper. Existing root, checkout and widget contracts remain compatible.
- Exact-message domain/network/program/wallet/browser-bound native Ed25519 proof; expiring atomic one-use challenges and opaque HttpOnly sessions. Protected routes derive identity from the session and enforce a server-configured offer with fresh chain reads on every request.
- Independent Canvas Lab application with embedded checkout, explicit Phantom actions, wallet authentication and protected server content; desktop/mobile states, expiration, disconnect, rejection and RPC failure closure.
- Additive integration-wizard guidance; original generated snippets, buyer links, JSON fallback, seller/buyer/verification/Studio workflows and offer stability preserved.
- Developer guides and generated OpenAPI 3.1 specification. [Quickstart](quickstart.md), [SDK](sdk.md), [API](api-reference.md), [manual example walkthrough](example.md) and [changed-file inventory](CHANGED_FILES.md).

Metadata retrieval intentionally returns typed `METADATA_UNAVAILABLE` when the exact public JSON is not registered. No public registry is introduced. Developers supply the seller's exact metadata through configuration, complete buyer links or manual recovery; the hash cannot reconstruct it.

## Actual verification

| Independent QA group | Passed |
| --- | ---: |
| Preserved SDK | 57 |
| Preserved Solana/Base/wizard acceptance | 266 |
| Existing checkout/Prism/generated/Saturday compatibility | 112 |
| Local Solana program | 23 |
| Local Base program | 23 |
| New SDK v1 transport/API | 12 |
| New server/auth/API | 29 |
| New example desktop/mobile workflows | 12 |
| Delayed protected-response browser regression | 2 |
| **Independent total** | **536** |

Backend additionally ran four focused authentication tests successfully. SDK, PACT and example TypeScript/production builds passed. An npm-packed, extracted consumer imported root/v1/server/react/checkout exports; browser bundles exclude Node-only server utilities. Packed-consumer dependencies were reused locally, not a new registry installation. OpenAPI passed 12-path/16-schema/111-reference validation. Mode skips are excluded from pass counts.

See the independent [QA report](../../qa/platform-v1/REPORT.md) and actual receipts under `web/test-results/platform-v1/commands`. Initial failures are preserved separately: stale SDK dependency paths/React duplication, native browser fetch receiver, incorrect QA startup/origin, reset synthetic ledger slots and isolated Prism dependency resolution. These are not presented as passing runs. Native fetch invocation and stale HTTP-positive handling received focused regressions.

Frontend captured twelve screenshots at 1440, 390 and 320 pixels with zero overflow, console or hydration errors. Actual disconnected TEST checkout was observed for 60.064 seconds: 1,204 samples, zero offer disappearance, same component identity and one document navigation. Independent synthetic desktop/mobile tests also cover 60-second stability plus purchase → wallet proof → protected authorization → expiry. The response-delay test holds an HTTP response for 8.2 seconds and confirms access stays closed.

## Read-only chain and preservation evidence

Actual Devnet genesis: `EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG`. Program `EiiiWWsW2kkqP6nugHz6iBADvhnW5xnibAtZ82ZExVqy` was executable and owned by the upgradeable loader. TEST offer `7EdfowQEZyVyyp7bYdQyzmprZtVU9mVba8cysHm2Ardh` was active, priced at 1,000,000 lamports with 180-second licenses; its metadata matched the chain commitment. These are public reads, not purchase, wallet-control or payment evidence.

The current public Vercel deployment remains `dpl_AeyVsH68MJ784e5YePwziDGvbbr3`. Source preservation checks passed twelve protected source files, three original Saturday reference files and the reviewed program artifact. Program artifact SHA256: `d13828b060327ef9f702b076b8681e4b9e1e8c04f961191d1df17b2babf52a62`. Existing release tags were preserved. No Saturday source or deployment changed.

Evidence lives under `.deployment-candidates/platform-v1`: `baseline.json`, `preservation.json`, `production-preserved.json`, `devnet-read-only.json`, `live-read-only.json`, and `visual/REVIEW.md`, `report.json`, `stability.json` and PNGs. The old `C:\Hackathon\PACT` compatibility view was synchronized only for verified public files; unexpected/unrelated files were not overwritten. Canonical project remains `C:\Hackathon\PACT Hacklanta Project`.

## Local previews and operator boundary

- PACT: `http://localhost:3007/`, developer wizard `http://localhost:3007/integrate`.
- Independent Canvas Lab: `http://localhost:3008/`. Use this exact origin for authentication.
- Rollback checkpoint before product edits: `7f217d506245b02ae4818d3e0bf6d3ff9941edda`.
- Branch: `codex/developer-platform-v1`; final implementation checkpoint is recorded by the final Git commit.
- Pre-existing untracked `docs/SATURDAY_NFL_RELEASE.md` remains outside this task's commit.

SDK additions include an optional React peer and development React/Node type dependencies; no database/auth service, new UI framework, program capability or production credential is introduced. Existing validated lock metadata was refreshed for these additions. The PACT compiler now excludes only ignored generated QA reports/results, and Base Playwright discovery excludes the separately executed new Node API tests.

For a real demonstration, follow [the exact manual walkthrough](example.md): connect the intended Devnet buyer, review price/terms, explicitly authenticate by signing the domain-bound message, verify unlicensed denial, then separately authorize purchase/transaction approval, finalized entitlement, protected success, account change/disconnect and expiry. Buyer needs the quoted price plus fees and any new entitlement rent. No real wallet interaction has been executed here. Do not deploy this process-local auth on Vercel or multiple workers; retain production until a separately approved release meets its infrastructure prerequisites.
