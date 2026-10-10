# Base Sepolia deployment package — approval pending

## Authorization

Local Phase 2 implementation is authorized. No blockchain broadcasts, contract deployments, website deployments, signing-secret access, or wallet approval requests are authorized. All broadcast commands below are operator-only proposals and have not been executed.

Phase 1 baseline: `b7c78aec1fff1f334153f6cfb2151f3293656026`, verified tag `phase1-local-baseline`. Frozen local Phase 2 candidate: Git tag `phase2-local-ready`; resolve its exact commit with `git rev-parse phase2-local-ready`. This tag contains the code, tests, evidence, and this package and must not be moved after approval.

## Local acceptance verdict

Independent QA PASS for the local scope: **23 Foundry tests**, **48 selected fixture/helper Playwright executions** (38 browser scenarios and 10 helper executions across desktop/mobile Chromium), and **2 separate missing-address browser executions** passed. Fixture/setup modes intentionally exclude the other mode's tests; no required case remains skipped across the two runs. TypeScript, production build, and restored default HTTP setup checks passed. Contract source is unchanged; runtime/ABI hashes were independently recalculated. No unresolved critical finding in this bounded review; not a production security audit.

The default production build was restored after fixture testing: setup pending, no synthetic contract address, no fixture URL strings in static bundles. QA servers were stopped. Exact reproduction and first-run failures/corrections are in `docs/QA.md`.

## Immutable deployment inputs

- Network: Base Sepolia only, chain ID `84532`.
- RPC: `https://sepolia.base.org` (read-only chain-ID and simulation checks required immediately before broadcast).
- Contract: `contracts/src/PactLicensing.sol:PactLicensing`; no constructor arguments.
- Compiler: Solidity `0.8.24`, optimizer enabled with `200` runs, Cancun EVM.
- Foundry: `v1.8.5`; dependency pins in `contracts/dependencies.json`.
- Operator keystore account name: `pact-test-deployer`, outside this repository. Password entered only by operator in their own terminal; no agent opens keystore files or password material.
- Public deployer address: **PENDING**, per operator instruction. Wallet creation/funding, balance, nonce, and signer-specific simulation are **PENDING**. No deployed address exists.

## Artifact and read-only reference evidence

- Creation bytecode: 2495 bytes; Keccak256 `0x7b7a3e8112c22fbd1cdb83a07135cc3a7fa71660e33cdbef96a01646abd370c5`.
- Runtime bytecode: 2462 bytes; Keccak256 `0xb16f005072746f54fb5c0eb746ad7c81bbb91f6546f85899fb56f2e408c6fd69`.
- Machine-readable hashes/settings: `contracts/abi/PactLicensing.evidence.json`; source is unchanged from Phase 1.
- Backend's signer-free placeholder simulation: 790159 estimated gas, 0.011 gwei estimated max fee, 0.000008691749 test ETH. This is a historical reference estimate, not an operator preflight, final fee, broadcast, or deployment. Actual fees including network-specific costs must be reviewed at deployment time.

## Operator-only wallet preparation — not executed by agents

Run these in your own private PowerShell terminal. These commands create an encrypted wallet locally; they do not broadcast blockchain transactions. Installed Foundry v1.8.5 help was checked for the explicit directory/account syntax. Do not run bare `cast wallet new`: that form prints a private key.

```powershell
$cast = 'C:\Hackathon\PACT\contracts\.tools\foundry-v1.8.5\cast.exe'
$pactKeystoreDir = Join-Path $env:USERPROFILE '.foundry\keystores'
New-Item -ItemType Directory -Force -Path $pactKeystoreDir | Out-Null
$pactKeystoreFile = Join-Path $pactKeystoreDir 'pact-test-deployer'
if (Test-Path -LiteralPath $pactKeystoreFile) {
    throw 'Account already exists: stop and use the existing wallet; do not overwrite it.'
}
& $cast wallet new $pactKeystoreDir pact-test-deployer
if ($LASTEXITCODE -ne 0) { throw 'Encrypted wallet creation failed' }

# Operator enters the password at the hidden prompt; output is the public address.
& $cast wallet address --account pact-test-deployer
```

Choose and retain the password privately; omit password flags/environment variables and do not paste terminal contents containing secrets into chat. Do not open, upload, or commit the encrypted keystore. Keep a private backup outside the PACT repository. Only the public `0x` address is shared for preflight.

Funding steps (operator only):

1. Open [Coinbase Developer Platform's faucet](https://portal.cdp.coinbase.com/products/faucet), sign in if required, select **Base Sepolia** and **ETH**, and enter the public address. Request only free test tokens. This route is linked from [Coinbase's demo documentation](https://docs.cdp.coinbase.com/wallets/demos/demo-app-tutorial).
2. If unavailable, [Alchemy's Base Sepolia faucet](https://www.alchemy.com/faucets/base-sepolia) is another option, but its documented eligibility includes mainnet balance/activity and can reject a fresh dedicated wallet. Do not buy or bridge real ETH to satisfy faucet eligibility. If no free faucet accepts the address, report funding as blocked.
3. Once a faucet provides a transaction hash, check its successful receipt on `https://sepolia.basescan.org/tx/<hash>`. Verify funds with read-only commands:

```powershell
& $cast chain-id --rpc-url https://sepolia.base.org
# Chain ID must be 84532; replace with your public address.
& $cast balance '<PUBLIC_DEPLOYER_ADDRESS>' --ether --rpc-url https://sepolia.base.org
```

The operator also prepares two distinct browser-wallet accounts and obtains Base Sepolia test ETH for their gas and the buyer's 0.001 test ETH purchase/repurchase. The deployer keystore need not be imported into a browser wallet. No wallet transaction approval is requested by this preparation guide. Test ETH has no monetary value; [Base documents free testnet funding](https://docs.base.org/get-started/get-funds).

## Proposed commands — not executed

Run from `C:\Hackathon\PACT\contracts` in an operator-controlled PowerShell terminal. Do not run the broadcast command until the operator explicitly approves the final candidate and command.

```powershell
$forge = './.tools/foundry-v1.8.5/forge.exe'
$cast = './.tools/foundry-v1.8.5/cast.exe'
$rpc = 'https://sepolia.base.org'
$sender = '<operator public deployer address>'

# Read-only preflight: chain must be 84532, balance must cover current estimate.
& $cast chain-id --rpc-url $rpc
& $cast balance $sender --rpc-url $rpc
& $cast nonce $sender --rpc-url $rpc

# Simulation only, no signer account or broadcast flag.
& $forge script script/Deploy.s.sol:Deploy --rpc-url $rpc --sender $sender

# OPERATOR ONLY: separate explicit deployment authorization required.
& $forge script script/Deploy.s.sol:Deploy --rpc-url $rpc `
  --sender $sender --account pact-test-deployer `
  --broadcast --confirmations 2

# Use only the address from the confirmed deployment receipt.
$deployed = '<confirmed deployed address>'
& $cast code $deployed --rpc-url $rpc
& $cast call $deployed 'nextOfferId()(uint256)' --rpc-url $rpc

# Operator privately configures ETHERSCAN_API_KEY; do not print it.
& $forge verify-contract $deployed src/PactLicensing.sol:PactLicensing `
  --chain 84532 --rpc-url $rpc --compiler-version 0.8.24 `
  --num-of-optimizations 200 --evm-version cancun `
  --verifier etherscan --watch
```

If API verification is unavailable, generate Standard JSON with `forge verify-contract ... --show-standard-json-input` using the same settings and have the operator submit through BaseScan. Do not redeploy automatically on verification failure. Two confirmations are a demo receipt policy, not a finality guarantee.

## Post-deployment checks — future gate

Match deployed runtime bytecode against the approved artifact, check receipt success and chain ID, confirm initial `nextOfferId` is zero before creating offers, and record source verification at `https://sepolia.basescan.org/address/<address>#code`. Simulation addresses are never deployed-address evidence.

Set only public web configuration in `web/.env.local`:

```text
NEXT_PUBLIC_RPC_URL=https://sepolia.base.org
NEXT_PUBLIC_PACT_CONTRACT_ADDRESS=<confirmed deployed address>
```

Rebuild/restart the local web app. Do not deploy the website. Real browser-wallet transactions remain separately gated by operator authorization.

## Operator prerequisites and next action

Operator needs a funded Base Sepolia test-wallet keystore, its public address, two distinct seller/buyer browser accounts with test ETH, an injected browser wallet, and source-verification access. Agents never request or inspect signing secrets. Public RPC/faucet availability and current fees must be rechecked before signing.

Local QA is complete. **Exact next operator action:** in your own terminal, follow the wallet-preparation section above, privately retain the encrypted keystore/password, obtain free Base Sepolia test ETH, and later supply only the public address. Until then address/balance/nonce/signer preflight remain PENDING as requested. Review this candidate/hashes/evidence before issuing explicit deployment authorization. No agent wallet signing or transaction approval is being requested now.

## Evidence distinctions

Automated Playwright RPC/wallet fixtures are synthetic local tests and do not prove a mined transaction. Contract tests and script simulations execute only in a local EVM. Actual contract address, deployment/purchase/withdrawal receipts, explorer links, and operator-led wallet E2E remain outstanding until separately authorized and performed.
