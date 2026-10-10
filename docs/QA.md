# Independent QA - 2026-10-10

## Current Phase 2 verdict

PASS for the authorized local scope. No unresolved critical local acceptance failures remain. This is functional and adversarial testing, not an audit or production security claim. No deployment, real wallet signing, wallet approvals or broadcasts were performed. The wallet is not configured; its public address, balance, nonce and signer-specific preflight remain pending.

- Independent Foundry run: **23 passed, 0 failed, 0 skipped**, including four deployment-chain tests and four 256-case fuzz tests.
- Final configured fixture run: **48 passed, 0 failed, 2 deliberate missing-address scenario skips**, covering desktop Chromium and emulated Pixel 7 Chromium. The two skipped scenarios were then executed against a separate missing-address build: **2 passed, 0 failed**. Total final acceptance executions: 50 passing (38 configured browser checks, two setup browser checks, ten helper checks across the two projects).
- Independent final TypeScript check and normal production build exited 0. Restored build uses no contract address and the normal public Base Sepolia RPC. HTTP `/` on port 3001 returned 200 with setup pending; no synthetic contract address appeared in HTML and no fixture address/RPC string appeared in static bundles.
- QA servers stopped. An unrelated existing port 3000 process belongs to the separate Hacklanta project and was left untouched.
- Read-only artifact reproduction independently matched exported ABI, source/ABI SHA256, creation/runtime byte lengths, SHA256 and Keccak256, compiler and Cancun settings. `git diff b7c78ae -- contracts/src/PactLicensing.sol` was empty. Reviewed the deployment package; operator wallet preparation commands were not executed.

## Phase 2 reproduce

From `C:\Hackathon\PACT\web` (dependencies installed, Chromium installed with `npx.cmd playwright install chromium`; Playwright pinned to 1.64.0):

```powershell
npm.cmd run test:browser
$env:PACT_QA_MODE = 'setup'
npm.cmd run test:browser -- --grep 'missing contract'
Remove-Item Env:PACT_QA_MODE
npm.cmd run typecheck

# Restore a normal setup-pending build after fixture builds.
$env:NEXT_PUBLIC_PACT_CONTRACT_ADDRESS = ''
$env:NEXT_PUBLIC_RPC_URL = 'https://sepolia.base.org'
npm.cmd run build
node tests/artifact-check.mjs
```

The test server helper builds and runs a production server on **127.0.0.1:3001**. Fixture mode compiles a synthetic address and localhost RPC; tests intercept RPC responses and inject a test-only EIP-1193 provider. No private keys or signing implementations exist in these fixtures. Every configured browser test checks that no POST request leaves the localhost fixture destinations, with external POSTs aborted. Restore the normal build after running fixtures; they are not a testnet transaction or deployed-contract substitute.

From `C:\Hackathon\PACT\contracts`, independent commands executed with exit 0:

```powershell
.\scripts\setup.ps1
.\.tools\foundry-v1.8.5\forge.exe test -vv
```

Setup verified all five executable hashes and both exact, clean dependency commits. Deployment tests allow local chain 31337 and Base Sepolia 84532, reject Base mainnet 8453 and 256 unsupported-chain fuzz cases. Independent artifact verifier reads only local build, ABI and source files, using Node crypto and viem rather than the Backend evidence-generation script.

## Phase 2 exercised scenarios

Actual Chromium checks cover desktop/mobile layout and keyboard activation; setup-disabled controls; wrong wallet network, network switching and disconnect; exact-byte metadata hash plus schema/price/duration and human approval; approval reset; 64 KiB UTF-8 boundary and oversized input; approved seller creation with event-derived offer ID; exact purchase value; simulation failure with no wallet submission; rejection; reverted receipt; transaction attribution after account changes; pre-sign account-change cancellation; and receipt timeout retaining the hash with `Confirmation unknown` and no automatic retry. The 120-second receipt deadline was advanced with Playwright clock control, not a real two-minute transaction wait.

Snapshot checks cover one block pinned across bytecode/count/validity/expiry reads, wrong RPC chain, missing bytecode, unknown IDs, inconsistent values, five-second unresolved-read timeout, exact eight-second freshness boundary, twelve-second unchanged-block closure, hanging/error RPC recovery, offline closure/reconnect, wallet A-to-B-to-A cache isolation, chain-based expiry with `Date.now()` skewed to zero, and public lookup attribution/clearing. Frozen-block access stayed closed after approximately 12.8-12.9 seconds. Closed-gate assertions require a sustained closed state so a brief React render transition cannot pass the test. Background/resume is a controlled DOM visibility transition; actual OS suspension remains a manual acceptance check.

Expiry uses chain timestamp plus elapsed monotonic time, replacing the historical Phase 1 local wall-clock behavior. The sample remains explicitly client-side demo gating and does not secure server content or remotely disable copied content.

## Failures found and resolved

1. First desktop discovery run: 16 passed, four failed, one setup skip. Two failures were strict selectors matching Next's route-announcer alert as well as the app alert; one oversized ASCII input was silently clipped by HTML character `maxLength`, so the test now adds a UTF-8 byte without adding a character; one assertion expected detailed timeout text while the gate correctly displayed its generic failure state. These were test-harness corrections. Durable closed-state assertions were also added.
2. Subsequent full run: 45 passed, one failed, two setup skips. The mobile 64 KiB unbroken terms preview caused real horizontal layout expansion and made the approval checkbox unclickable. Frontend added wrapping, grid minimum-width constraints and a scrollable preview. The isolated mobile regression then passed, including no-overflow and real checkbox interaction. Final full run passed 48 checks and the separate setup run passed two.

The prior mobile failure's trace and error context are preserved in ignored `web/test-results/regressions/max-metadata-mobile/`. Final reports live under ignored `web/playwright-report/fixture/` and `web/playwright-report/setup/`.

Representative screenshots, visually inspected for clipping/overlap, are:

- `web/test-results/fixture/browser-Mocked-local-brows-f7388--and-no-horizontal-overflow-desktop-chromium/mocked-local-tools.png`
- `web/test-results/fixture/browser-Mocked-local-brows-f7388--and-no-horizontal-overflow-mobile-chromium/mocked-local-tools.png`
- `web/test-results/setup/browser-Missing-deployment-2eb68-ler-buyer-verifier-controls-desktop-chromium/mocked-local-missing-contract.png`
- `web/test-results/setup/browser-Missing-deployment-2eb68-ler-buyer-verifier-controls-mobile-chromium/mocked-local-missing-contract.png`

## Remaining external acceptance

Explicit deployment approval and operator wallet prerequisites remain open. A confirmed Base Sepolia deployment with bytecode/source verification, distinct seller/buyer browser-wallet transactions, live purchase/withdrawal/expiry/repurchase evidence and explorer links are still required for the end-to-end MVP definition of done. Synthetic browser success does not satisfy those gates. Manual actual-wallet and OS-background/resume checks remain separate from controlled fixtures.

## Historical Phase 1 evidence - superseded where Phase 2 applies

The following records preserve the Phase 1 state and commands. In particular, browser unavailability, untested interactive UI and local-wall-clock expiry below are historical observations; current approved Playwright validation and chain/monotonic expiry are documented above.

### Phase 1 contract gate

PASS for local contract behavior in the frozen MVP scope. This is independent functional/adversarial testing, not an audit or production security claim. No testnet deployment was performed or authorized by QA.

Reviewed `AGENTS.md`, startup prompt, QA profile, MVP specification, and contract source. Production contract source was not modified by QA. The contract uses OpenZeppelin ReentrancyGuard on withdrawals and clears pending credit before the external payment call; failed payment reverts restore state. Offer price, duration and hash have no mutation path. License validity does not depend on the offer's later active flag.

### Phase 1 reproduce

From `C:\Hackathon\PACT\contracts`, PowerShell:

```powershell
.\.tools\foundry-v1.8.5\forge.exe test --match-contract PactIndependentQA -vv
.\.tools\foundry-v1.8.5\forge.exe test -vv
```

Observed actual output, exit code 0 for both commands, Solidity 0.8.24:

```text
Ran 7 tests for test/qa/PactIndependentQA.t.sol:PactIndependentQA
Suite result: ok. 7 passed; 0 failed; 0 skipped

Ran 12 tests for test/PactLicensing.t.sol:PactLicensingTest
Suite result: ok. 12 passed; 0 failed; 0 skipped

Ran 2 test suites: 19 tests passed, 0 failed, 0 skipped (19 total tests)
```

Independent tests verify exact expiry boundary and repurchase accounting; withdrawal rejection restores credit and permits a later successful retry; nested withdrawal fails with the exact OpenZeppelin reentrancy error while the outer payment completes; multiple seller credit and buyer entitlement isolation; deactivation preserves existing entitlements and blocks new sales; unknown offer IDs cannot mutate state; and incorrect payment leaves expiry, credit and contract balance unchanged. Two independent fuzz tests each ran 256 cases. Backend's separate accounting fuzz test also ran 256 cases in the complete run.

### Phase 1 remaining gates and limits

- Explicit user approval is still required before testnet deployment.
- Deployment script, a deployed bytecode/address, and Base Sepolia end-to-end transactions are not validated by this local contract gate.
- Frontend wallet/network mismatch, transaction failure states, actual chain reads and gated access still require independent validation once UI exists.
- Sellers must use a receiving wallet capable of accepting native ETH. A wallet that always rejects payment cannot withdraw to an alternate address in v1; rollback preserves its pending credit.
- Terms hashes commit data supplied by the caller; the contract cannot prove rights, human approval, legal enforceability or identity. Do not supply personal or legal text on chain or claim ownership transfer.
- Test helper contracts are adversarial local fixtures only, outside deployable source.

### Phase 1 frontend local validation

Independent checks on the finalized web files:

```powershell
cd C:\Hackathon\PACT\web
npm.cmd run typecheck
npm.cmd run build
npm.cmd run start -- --hostname 127.0.0.1 --port 3000
Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:3000'
```

Typecheck exited 0. Production build exited 0 with Next.js 16.4.0, successful compilation, TypeScript validation, and static `/` plus `/_not-found` routes. Production server reported ready in 371 ms. HTTP GET `/` returned 200, 10,587 HTML characters; all 13 referenced JavaScript assets returned 200. HTML contained the PACT title, correct contract environment variable notice, contract setup pending status, wallet button, seller/verifier tabs, empty offer state, and closed `License required` gate. These are HTTP/SSR checks, not interactive browser checks.

Source review confirmed generated ABI use; actual RPC chain ID must equal 84532 before contract actions; configured address must be valid/nonzero and have bytecode; wallet writes require Base Sepolia; seller duration/price bounds; exact off-chain metadata UTF-8 hash plus schema/price/duration matching and buyer approval before purchase; approval reset when inputs change; exact offer price supplied; simulation before signing; successful receipt required before confirmation; created offer ID decoded from contract event; independent on-chain validity and expiry reads; failed reads close the sample gate; expiry timer cleanup; and error/status presentation. Source review also confirmed responsive breakpoints and labeled controls, but their rendered appearance and keyboard interaction have not been visually tested.

An early RPC-chain guard gap, missing created-offer ID, and inconsistent environment notice were reported to Frontend and corrected before this successful independent build. No UI files were edited by QA. Backend's formatting-only QA fixture change was acknowledged and reviewed without finding behavior changes.

Browser automation is unavailable in this environment: `cua.getState()` returned `apps: [], browsers: []`; `cua.createBrowserTab('iab', 'about:blank', {visible:false})` returned `Browser is not available: iab`. No browser rendering, interactive wallet connection, wallet rejection, live expiry rendering, chain read failure interaction, or testnet purchase was claimed. Local build/HTTP/source validation passes; these browser and approved-deployment end-to-end checks remain open.

The sample download is explicitly client-side demo gating, not protected server content. Its expiry timer uses the user's local clock alongside chain-provided validity/expiry and periodic reads; it is not a security enforcement boundary.
