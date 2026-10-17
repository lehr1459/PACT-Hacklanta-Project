# Developer platform

PACT provides Solana Devnet licensing, embedded checkout and customer-hosted resource enforcement. Start with the [developer guide](../development/DEVELOPER_GUIDE.md) and [quickstart](quickstart.md). The SDK candidate is `0.2.0`, supplied as a reviewed local tarball; it is not published to npm.

| Guide | Covers |
| --- | --- |
| [SDK](sdk.md) | Installation and public export boundaries |
| [API reference](api-reference.md) / [OpenAPI](openapi.json) | REST contracts |
| [Embedded checkout](embedded-checkout.md) | React and vanilla browser checkout |
| [Wallet authentication](wallet-authentication.md) | Challenge proofs and opaque sessions |
| [Backend enforcement](backend-enforcement.md) | Customer-owned resource policies |
| [Independent example](example.md) | Canvas Lab's same-origin application |
| [Errors](errors.md) | Failures and safe purchase recovery |
| [Security](security.md) | Supported topology and trust limits |

Public lookup does not authenticate a wallet or authorize an operation. Protected access requires one persistent customer-hosted Node process on the application's own origin, explicit wallet proof and fresh server entitlement checks. Base Sepolia remains an isolated fallback. No publication, deployment or real wallet action follows from installing or testing the package.
