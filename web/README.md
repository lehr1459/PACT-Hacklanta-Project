# PACT web

Base Sepolia only (chain ID 84532). This app uses injected browser wallets through wagmi/viem. No credentials or wallet secrets belong in this project.

## Run locally

```powershell
cd C:\Hackathon\PACT\web
npm ci
Copy-Item .env.example .env.local
# Set NEXT_PUBLIC_PACT_CONTRACT_ADDRESS to the explicitly approved Base Sepolia deployment.
npm run dev
```

Open http://localhost:3000. Without an address the page renders a truthful setup state and disables on-chain actions. No contract is deployed by any web command. Restart after changing public configuration; production builds embed it.

`npm run typecheck` checks TypeScript; `npm run build` creates the production app; `npm start` serves it. ABI is imported directly from `../contracts/abi/PactLicensing.json`, generated from the Foundry artifact. Run the Backend-owned `contracts/scripts/export-abi.ps1` after contract changes before building web.

## Demo flow after approved deployment

1. Connect a seller wallet on Base Sepolia. Switch network if prompted.
2. In Seller studio, review title, terms, positive test ETH price and duration in seconds. Approve the preview, download the exact metadata JSON, and create the offer. The UI hashes UTF-8 JSON with keccak256; preserve the exact downloaded bytes to reproduce the hash. Only hash/price/duration/seller are on chain.
3. The confirmed OfferCreated event is decoded to display and select the new offer ID. It is also available on BaseScan. Seller provides the off-chain metadata and agreement separately. Paste the exact JSON in the buyer form; it checks the hash, price, and duration. Review and approve the matching terms to enable purchase.
4. Connect the buyer wallet, purchase the exact price, and wait for a successful receipt. The studio sample unlocks only after the connected wallet’s entitlement is read from chain.
5. Verify any address in Verify access. Seller can withdraw credited proceeds separately or deactivate future sales. Existing licenses survive deactivation.

Reads poll offer state every 10 seconds and license snapshots every 4 seconds. Each license snapshot reads a block header and pins validity, expiry, offer existence, and code checks to that same block. It records offer, wallet, contract, chain, block number, and timestamp. License requests have a 5-second timeout and no retries; access closes on errors, after 8 seconds without a fresh snapshot, or after 12 seconds without chain progress. Hidden/offline pages close access. Resume, wallet, network, and offer changes require a new snapshot. Expiry uses bigint chain time plus monotonic elapsed time, not the computer wall clock. Public verification uses the same rules and clears when query inputs change.

Seller and buyer metadata share a 64 KiB UTF-8 byte limit. Hashing uses the exact preview/download bytes. Oversized JSON is rejected before creation and verification. Extremely large valid expirations are displayed as exact Unix seconds rather than invalid calendar dates.

Wallet writes are simulated; wallet account and chain are rechecked immediately before signing. Status and explorer links retain the initiating sender. A late receipt does not select a created offer for a different wallet. Successful receipt status is required; a 120-second receipt timeout is shown as **confirmation unknown**, with the hash and no automatic retry. Rejected, incorrect-network, RPC, and confirmed revert errors display without claiming success. Invalid/missing contract code is rejected.

This is a client-side gated demonstration, not production content protection. Copied content cannot be remotely revoked; UI code can be inspected. Entitlements do not establish copyright ownership or legal enforceability. Only test ETH is supported. Base Sepolia E2E cannot be completed until an approved contract address and user-controlled wallet are available.

## Automated validation

QA owns `tests/**` and the Playwright configuration. Browser fixtures intercept RPC and inject a mocked EIP-1193 provider for test wallets. Fixture evidence is labeled separately from operator-approved real-wallet evidence. Production code contains no test-success overrides. Pure snapshot/metadata helpers accept an injected source and monotonic clock for independent tests. Run the QA-owned package test scripts; the browser runner builds its explicitly configured fixture target on port 3001, so avoid concurrent builds against `.next`.
