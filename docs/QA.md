# Independent QA - 2026-10-10

## Contract gate

PASS for local contract behavior in the frozen MVP scope. This is independent functional/adversarial testing, not an audit or production security claim. No testnet deployment was performed or authorized by QA.

Reviewed `AGENTS.md`, startup prompt, QA profile, MVP specification, and contract source. Production contract source was not modified by QA. The contract uses OpenZeppelin ReentrancyGuard on withdrawals and clears pending credit before the external payment call; failed payment reverts restore state. Offer price, duration and hash have no mutation path. License validity does not depend on the offer's later active flag.

## Reproduce

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

## Remaining gates and limits

- Explicit user approval is still required before testnet deployment.
- Deployment script, a deployed bytecode/address, and Base Sepolia end-to-end transactions are not validated by this local contract gate.
- Frontend wallet/network mismatch, transaction failure states, actual chain reads and gated access still require independent validation once UI exists.
- Sellers must use a receiving wallet capable of accepting native ETH. A wallet that always rejects payment cannot withdraw to an alternate address in v1; rollback preserves its pending credit.
- Terms hashes commit data supplied by the caller; the contract cannot prove rights, human approval, legal enforceability or identity. Do not supply personal or legal text on chain or claim ownership transfer.
- Test helper contracts are adversarial local fixtures only, outside deployable source.

## Frontend local validation

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
