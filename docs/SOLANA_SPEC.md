# PACT Solana MVP integration contract

Current target: Solana Devnet only. Existing Base source, tests and tags remain fallback. No agents deploy, generate/inspect signing keys, request wallet approval, or broadcast. Local SVM tests use synthetic public addresses and unsigned simulated signer flags; never wallet key material.

## Frozen behavior

- Offer PDA seeds: UTF-8 `offer`, seller's 32 public-key bytes, seller-chosen unique u64 nonce little endian.
- Offer fields: immutable seller, nonce, price in lamports, duration seconds, 32-byte terms hash, active flag. Positive price/duration and nonzero hash; maximum duration 31,536,000 seconds, checked arithmetic and bounded representable expiry.
- Entitlement PDA seeds: UTF-8 `license`, offer public-key bytes, buyer public-key bytes. Entitlement associates this buyer with this offer and records an expiry based on Solana Clock.
- Seller signs and pays offer rent. Buyer signs and pays entitlement rent and exact offer price. Program validates owners, seeds/bumps, account sizes, system program, seller destination, and signer/writable requirements before state changes/CPI.
- Purchase instruction derives payment from immutable price, transfers lamports directly to seller, and creates/updates buyer entitlement atomically. Any failure rolls back payment and entitlement. Buyer pays rent/network fees in addition to license price; UI must state this.
- Active duplicate purchase fails; at `Clock.unix_timestamp >= expiry` repurchase permitted. Existing licenses survive seller-only deactivation. No transfer/revocation/close/token/NFT paths.
- No legal text or personal data on chain. Human-approved metadata remains off chain; deterministic hash/price/duration validation in UI. Entitlement issuance does not establish copyright ownership.

## Verification

Account ownership and exact schema/discriminator, canonical PDAs, seller/buyer/offer identity, and Devnet genesis are checked. Verification reads offer, entitlement, Clock and executable program in one confirmed `getMultipleAccounts` context. Clock slot must equal the returned context slot, which must satisfy the requested minimum. Snapshots expire after 8 seconds without a fresh read or 12 seconds without slot progress; polling is every 4 seconds with a 5-second request timeout. Expiry uses chain time plus monotonic elapsed time. Wallet/offer changes, hidden/offline states and errors close access. Unsupported timestamps remain exact integers.

## Integration artifacts

Backend supplies versioned instruction/account encoding specification and public placeholder program ID for local fixtures only. The operator later supplies the actual program address after authorized deployment; production configuration is empty until then. Frontend does not claim the placeholder exists on Devnet. Development fixtures are isolated from production and explicitly synthetic.

UI retains PACT typography/layout, replaces Base labels with Solana Devnet and test SOL, adds correct public-key validation and explorer links, and labels direct seller settlement accurately. No withdrawal UI in the Solana flow because there is no escrow.
