# Enterprise presentation redesign independent QA

Current local gate: PASS. Immutable baseline and exact final CSS each passed387 acceptance checks plus46 local chain checks. Both have71 matching before/after screenshots with zero page errors or document horizontal overflow. Public deployment and real wallet operations were not performed.

## Scope and baseline

Approved branch `ui/enterprise-redesign`, immutable checkpoint `4123cc12f64f48def857f0d60c8d54d671daabd5`. QA owns only `qa/ui-redesign/` harness files (except Lead's `prepare-preview.mjs` and Backend's `preservation.mjs`), this report and ignored isolated evidence. Product source/tests are not altered to fit acceptance. No deployment, push, install into product manifests, real Phantom approval/signing, RPC simulation/send, transaction or site mutation is performed by QA.

`prepare-baseline.mjs` extracted144 public tracked files directly via `git show`, excluded `.env`/signer/keypair/tool paths, physically copied installed public dependencies and recorded source hashes in `.deployment-candidates/ui-redesign/baseline/baseline-source-manifest.json`. Compiled SDK output was copied, then exact baseline SDK source was independently compiled and tested in a separate ignored child consumer. Staged Saturday source/artifact are copied from the separately validated fixed deployment candidate; original Saturday source stays untouched.

Original previews remain PACT3003/PID11388, Prism3004/PID9552, Saturday3005/PID33544 and checkout3006/PID29552. QA does not build their serving `.next`/dist or stop them. Isolated test ports are3001/3002/3007/3008/3009/3010/3011; temporary normal screenshot server3013 is stopped before any build of its isolated output. Lead reserves3014 for its isolated visual iteration.

## Executed immutable baseline evidence

- Actual-config isolated Next production build PASS.
- Five widths320/390/768/1024/1440 across Buyer, Seller studio, public Verify access, Integrate and Base:25 before screenshots, zero page errors and zero document horizontal overflow.
- Compiled-source SDK57/57 PASS, typecheck/build PASS, genuine child TAP count guard retained. Separate initial copied-output57 pass is historical additional execution, not double-counted. Original serving browser bundle hashes unchanged.
- QA-run local compiled SBF LiteSVM23/23 and Foundry23/23 PASS including256-run fuzz; artifact SHA256 `d13828b060327ef9f702b076b8681e4b9e1e8c04f961191d1df17b2babf52a62` matches checkpoint.
- Full baseline acceptance:387/387 PASS, plus46/46 local chain checks. Acceptance breakdown:SDK57; Solana154+setup2+live2; Base48+setup2; wizard8+live2; generated consumers44; Prism22+live2; checkout28+live4; staged Saturday12. Mode-specific skipped cases are excluded, and the copied-output SDK57 is not counted twice.
- Before captures:25 normal,26 synthetic access/error/reflow states and20 synthetic finalized/pending/unknown/generated-output states,71 total. Each capture has zero page errors and zero document horizontal overflow.

Before screenshots: `web/test-results/ui-redesign/baseline/visual/{width}-{buy,seller,verify,wizard,base}.png`, `baseline/states/{width}-{active-synthetic,approved-terms-synthetic,expired-synthetic,loading-locked-synthetic,rpc-error-locked-synthetic}.png` (plus1440px200-percent-css-reflow), `baseline/transactions/{width}-{finalized,pending,unknown,wizard-generated}-synthetic.png`. Each group has `audit.json`; baseline totals are independently reconciled in `baseline/summary.json`. Command logs/results: `web/test-results/ui-redesign/baseline/commands/`. Initial extraction/build logs are `web/test-results/ui-redesign-baseline-prepare.log` and `ui-redesign-baseline-initial-build.log`.

## Reproducible commands and output isolation

Run from PACT root:

```powershell
node qa/ui-redesign/prepare-baseline.mjs
node qa/ui-redesign/run-acceptance.mjs .deployment-candidates/ui-redesign/baseline sdk
node qa/ui-redesign/run-acceptance.mjs .deployment-candidates/ui-redesign/baseline chain
node qa/ui-redesign/run-acceptance.mjs .deployment-candidates/ui-redesign/baseline web
node qa/ui-redesign/run-acceptance.mjs .deployment-candidates/ui-redesign/baseline other
node qa/ui-redesign/visual-audit.mjs baseline http://127.0.0.1:3013
```

The web group serializes Solana154/setup2/live2, Base48/setup2, wizard8/live2 on3010 and final actual-config production build/typecheck. Other group executes checkout28/live4, isolated Prism22/live2, generated44 and staged Saturday12 sequentially. SDK/chain/other groups may run independently of web because outputs differ; SDK compilation must precede consumers or use its separate child consumer to avoid rewriting SDK assets during tests. All existing acceptance assertions remain unchanged. Mode-specific skipped tests are excluded from reported passed counts.

After Lead's explicit frontend freeze, `prepare-final.mjs` clones frozen baseline public inputs and creates actual local hardlink file entries to its physically copied dependencies inside the final workspace, then overlays only six approved presentation files. These are not external dependency symlinks and do not widen Turbopack's root. Product dependency inputs are untouched. The final groups use the same commands with `final` replacing `baseline`; no snapshot-update command is used.

## Final visual/accessibility acceptance

`visual-audit.mjs final` repeats25 normal pages at five widths. `states-audit.mjs final` uses explicitly synthetic public Phantom identity and strict mocked read-only RPCs for active entitlement, approved exact metadata, expired entitlement, pending loading and owner-error closure; signing methods fail immediately and must never be requested. `transaction-captures.mjs` executes the checkpoint's actual transaction fixtures with dummy64-byte provider signatures and every RPC fulfilled locally, producing20 pending/unknown/finalized/generated-output screenshots. Those dummy bytes involve no cryptographic keys or real wallet approval/signature/network transaction. Keyboard focus, reduced-motion preference, computed contrast candidates and an approximate CSS200% reflow capture supplement existing state tests. This CSS reflow is not a claim of real browser zoom or complete WCAG conformance. Contrast candidates need contextual/manual review, particularly gradient/transparent backgrounds and disabled controls.

Critical behavior remains independently gated by the preserved tests: wallet/account/session separation, metadata approval, immutable signed wire, journal recovery/incarnation/duplicate submission guards, honest transaction states, stale8s/frozen12s/timeout5s and hidden/offline closure, coherent account ownership/PDA/Clock context, wizard validation/edit races/copy fallback, actual generated SDK consumers, isolated Base, embedded widget callbacks/finalized purchase closure and Saturday external purchase workflow. Real extension permissions, live unlock/purchase and public redeployment remain outside this local redesign gate.

## Failure history and current final execution

No product behavior failure has been observed. The initial state harness omitted Phantom's installed-provider flag; adding the existing tested flag corrected the QA fixture. The separate transaction screenshot fixture initially needed a Node `createRequire` banner for its bundled CommonJS dependency, then a button locator preserving the visible arrow suffix. Those initial harness logs remain in baseline evidence. A PowerShell quoting attempt to edit the audit harness failed before writing; the subsequent native file edit succeeded.

Independent contrast review identified price captions below4.5:1, then additional placeholders and small labels on tinted/gradient backgrounds. Frontend corrected only the two authorized CSS files. A final focus-ring correction keeps its3px width/4px offset while using different light-panel/navy-header colors. Interim Solana output through case109 is preserved at `final/commands/solana-mock-interim-colors.log`; its already-exited test parent left an isolated QA server, which QA verified and stopped. This interrupted interim sequence is not a passed final gate. A complete final web sequence restarted on the exact comprehensive color/focus freeze.

Final unchanged non-web groups completed:SDK57, chain46, checkout32, Prism24, generated44 and Saturday12, all exit0. Final web acceptance completed Solana154/setup2/live2, Base48/setup2 and wizard8/live2, all exit0. Actual Devnet-config production build passed in8267ms and typecheck in6630ms. Exact command/cwd/public-environment/duration/exit evidence is in `web/test-results/ui-redesign/final/commands/results-{web,sdk,chain,other}.json`. Parsed log totals independently reconcile387 acceptance checks and46 chain checks in `final/summary.json`; copied-output repeats and the interrupted interim run are excluded.

Expanded `contrast.mjs` samples own text including spans/footer labels, pseudo-element opaque backgrounds, gradient endpoints and `::placeholder`. Translucent gradients or otherwise unresolved compositing are explicitly flagged for contextual review rather than silently treated as passing. Disabled controls are excluded from text-threshold checks. The final report will distinguish these computed/manual samples from a complete WCAG audit.

Lead supplemental checks: baseline-identical lint13 existing errors/1 warning (`.deployment-candidates/ui-redesign/lint-comparison.json`);24 keyboard Tab steps on each of five routes at390px/reduced motion on the final frozen preview, all page controls visible with3px focus (`keyboard-review-final.json`). Native BODY traversal between completed browser-chrome cycles is not an application failure. QA independently reproduced Backend's preservation verifier after the final CSS freeze:181 baseline comparisons,3 serving artifacts and2241 original Saturday hashes PASS (`final/preservation.log`); all TSX remain byte-identical.

The final isolated QA build repeated the full capture set:25 normal,26 synthetic access/loading/error/reflow and20 synthetic transaction/generated-output screenshots,71 total. Every capture has zero page errors and document horizontal overflow; normal pages also have zero HTTP resource errors. Expanded normal/state review collected2872 computed text/placeholder/gradient-endpoint samples, zero below the relevant text thresholds. The normal-text minimum is4.598676:1. Its102 translucent flags reduce to the same four distinct hero texts; conservative inspected dark-background bounds yield5.651486–10.991762:1. Light-panel focus is4.777063:1 and navy-header focus6.857471:1. All five routes at390px independently expose computed solid3px/offset4px rings with correct context colors. Evidence is `final/{visual,states}/audit.json`, `final/manual-contrast.json` and Lead's longer keyboard trace. The older basic scanner's `contrastCandidates` is retained as historical raw data; expanded contextual `contrastReview` is authoritative because the basic scanner did not account for pseudo-element backgrounds.

Final capture paths mirror baseline exactly under `web/test-results/ui-redesign/final/`: `visual/{width}-{buy,seller,verify,wizard,base}.png`, `states/{width}-{state}.png`, `transactions/{width}-{finalized,pending,unknown,wizard-generated}-synthetic.png`. Widths are320/390/768/1024/1440. QA visually inspected final390px Buyer and1440px generated wizard output: responsive layout, readable terms/state text, preserved controls and bounded code panes. All browsers emulate reduced motion; stylesheet transitions are restricted to `prefers-reduced-motion: no-preference`. The200% CSS reflow capture is an approximation and does not replace an actual browser zoom/assistive-technology audit.

Final actual-config HTTP sample at2026-10-11T02:58:40.160Z returned200, included the deployed Eiii program ID and excluded the synthetic US517 fixture program (`final/http-actual-config.json`). Normal and live browser reads permit only public `getGenesisHash`/`getMultipleAccounts`; actual buyer verification remains expired and seller missing as independently sampled by Backend. This does not prove wallet ownership, successful purchase or any new live unlock. Mocked transaction tests and screenshots use intercepted dummy provider responses and never reach the public transaction RPC.

The remaining limits are real extension permission/account UX, true browser200% zoom and complete accessibility certification, public redeployment and any live transaction test. Existing lint13 errors/1 warning remain exactly baseline-identical; they were not hidden or rewritten to satisfy this presentation-only gate. No current local acceptance blocker remains.
