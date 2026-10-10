# PACT web

The primary route `/` is **Solana Devnet**. The original Base Sepolia application is preserved at `/base`, with its original providers and EVM helpers scoped separately.

## Solana Devnet setup

Set `NEXT_PUBLIC_PACT_SOLANA_PROGRAM_ID` to the operator-approved deployed program address and `NEXT_PUBLIC_SOLANA_RPC_URL=https://api.devnet.solana.com` in `.env.local`, then restart/rebuild. Leave the program ID empty until deployment; the app displays setup pending and never substitutes a fixture address. The native Rust manual wire specification is `../solana/wire-spec.json`, not an Anchor-generated IDL.

The client uses official Phantom and Solflare wallet adapters. Choose a wallet provider, connect, and disconnect through the header. Missing Phantom is displayed with a manual installation link; there is no automatic redirect or reconnection. Client providers build safely under SSR; no wallet access occurs during server rendering. Rejected connections and approvals show errors. Wallet changes require a new identity-bound license snapshot.

The RPC genesis hash must match Devnet before writes. Extension network settings are not reliably exposed, so the UI asks the operator to select Devnet and does not pretend to inspect that setting. Transactions obtain a blockhash and simulate on the configured Devnet connection, request `signTransaction` only, then submit the unchanged signed message through the same verified RPC. The adapter's network-selecting `sendTransaction` is not used. No agent-run command signs or broadcasts.

Seller metadata uses schema `pact-solana-license-v1`, `priceLamports`, and `durationSeconds`; exact UTF-8 bytes are hashed with keccak256. Both seller and buyer enforce 64 KiB. SOL input supports at most nine decimal places with bigint conversion, never floating point. Maximum duration is 31,536,000 seconds. A random public u64 nonce derives the offer PDA; it is not key material. Buyer rent and network fees are additional to the exact offer price. **Payment settles directly to the seller atomically with entitlement issuance; there is no withdrawal step.**

Solana reads use one `getMultipleAccounts` context containing offer, buyer entitlement, Clock, and executable program. Owner, exact lengths/discriminators, embedded identities, canonical PDAs, bumps, executable loader, and Clock slot equality are checked. Snapshot freshness is 8 seconds, stalled slot limit 12 seconds, poll interval 4 seconds, and request timeout 5 seconds with no retries. Hidden/offline/error states close access; resume/identity changes require fresh reads. Expiry uses Clock unix seconds plus monotonic elapsed time. Public verification uses the same checks and clears on edits.

After a confirmed creation, the seller's offer address is displayed/selected and linked on the Devnet explorer. Share the address and exact metadata JSON with the buyer. A successful purchase unlocks the sample only after validated account reads. Deactivation preserves existing entitlements. Transaction messages retain the initiating sender; late confirmations do not select an offer for another wallet. Unconfirmed submissions time out after 120 seconds as **confirmation unknown**, preserving the explorer link with no automatic resubmission.

### Manual Chrome wallet checks

1. Without Phantom, confirm the missing-extension message and disabled connect control; install only through the explicit link.
2. With Phantom installed, select Phantom, connect and reject once, then connect successfully. Confirm public key and disconnect behavior.
3. Select Devnet in Phantom. With an approved program/RPC configuration, create and review metadata, buy from another wallet, and verify public access/expiry.
4. Change accounts during reads and while a transaction is pending. Check attribution and that another account's entitlement never opens access.
5. Reject signing; test wrong RPC genesis, RPC outage, hidden/offline resume, and stale access. These checks use only Devnet test SOL.

Automated fixture evidence does not establish real-wallet signing or a deployed Devnet transaction. Those remain operator-controlled evidence steps.

### Dependency audit limitation

The newly installed official wallet adapters introduce npm audit findings in transitive web3.js `jayson`/`uuid`/`stream-json` and wallet-adapter's mobile React Native/Metro dependency tree. The latter is intended for mobile tooling and is not part of this desktop browser workflow; exact runtime reachability has not been exhaustively audited. Other findings may affect web dependencies. No production security claim is made. Latest pinned compatible package versions do not have an automatic nonbreaking fix for all findings; do not force incompatible overrides without validation.

## Preserved Base Sepolia setup

Base Sepolia only (chain ID 84532). This app uses injected browser wallets through wagmi/viem. No credentials or wallet secrets belong in this project.

## Run both routes locally

```powershell
cd C:\Hackathon\PACT\web
npm ci
Copy-Item .env.example .env.local
# Primary / route: set NEXT_PUBLIC_PACT_SOLANA_PROGRAM_ID after approved Devnet deployment.
# Preserved /base route: set NEXT_PUBLIC_PACT_CONTRACT_ADDRESS after approved Base deployment.
npm run dev
```

Open http://localhost:3000 for the primary Solana Devnet interface, or http://localhost:3000/base for the preserved Base Sepolia interface. Without its respective program/contract address, each route renders a truthful setup state and disables on-chain actions. No program or contract is deployed by any web command. Restart after changing public configuration; production builds embed it.

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
