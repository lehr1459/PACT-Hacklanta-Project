# Devnet testing and evidence

Automated checkout and authentication tests use synthetic providers/RPC fixtures and memory-only disposable Ed25519 message proofs. They do not broadcast to Devnet, request a real wallet approval or prove a real purchase. Local program tests execute the reviewed binary in the established local emulator; no program upgrade occurs.

Read-only Devnet checks may query the genesis hash and program/offer/entitlement accounts. They must be recorded separately from deterministic fixture results. The required program is `EiiiWWsW2kkqP6nugHz6iBADvhnW5xnibAtZ82ZExVqy`, Devnet genesis `EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG` and public RPC `https://api.devnet.solana.com`.

Build SDK before running consumers. Use the QA report's exact commands and counts, not historical test claims. Focused security coverage includes forged/replayed/expired/domain/session-bound proofs, invalid metadata and accounts, unsigned transaction instruction parity, public-lookup versus authenticated access, expiry and RPC failure closure. Browser checks include responsive layouts, wallet rejection/account changes, no automatic approvals, callback-driven React renders and timed quote stability.

For real Chrome/Phantom testing follow [the example walkthrough](example.md). Connecting, message signing and transaction signing are distinct operator actions. A buyer must be distinct from the seller for a payment demonstration. Fund only Devnet wallets; required balance is price plus network fee plus entitlement-account rent, with live amounts read at the time of the separately authorized attempt. No test currency has monetary value.

Before any real purchase, verify the exact offer is active, metadata commitment matches, the buyer has no active entitlement and the current pending journal is clear. Review the wallet's transaction manually. Preserve its signature; finalized payment plus independently verified entitlement is the required chain evidence. This implementation run performs none of those real-wallet actions.
