# PACT MVP specification — frozen v0.1

## Product
Digital software-license offers with fixed price (native test ETH), license duration (seconds), and content/terms hash. No file hosting needed for core proof; gated sample web content is sufficient.

## Actors
- Seller: creates immutable offer and withdraws proceeds.
- Buyer: purchases license; can view entitlement and expiry.
- Verifier: any user/app can query license validity by wallet and offer.

## On-chain state
- Offer: seller, priceWei, durationSeconds, termsHash, active.
- License: expiration timestamp per offer and buyer.
- Pending withdrawal balances per seller.

## Rules
- price > 0, duration > 0, termsHash != 0x0.
- purchase must pay exact price.
- Cannot repurchase while current license is active; repurchase after expiration is permitted.
- Seller can deactivate future sales; existing licenses remain valid.
- Purchase credits seller balance and sets expiry atomically; separate withdrawal sends proceeds.
- No NFT, transfer, renewal, revocation or dispute flow in v1.

## Threats and limits
Blockchain cannot verify copyright ownership, authenticity of an uploaded asset, identity, or offline software access. Do not promise legal enforceability. Time is based on chain timestamp. Demo app checks chain; a copied asset cannot be remotely disabled unless integrated with entitlement checks.

## Definition of done
Tests pass; deployed contract address/chain ID recorded; seller/buyer flow verified on Base Sepolia; UI verification actually reads chain; end-to-end demo documented.
