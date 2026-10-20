# Developer platform

PACT provides Solana Devnet licensing and embedded checkout. The API-first developer platform is the new primary integration: register apps and resources in `/integrate/developer`, authenticate wallet grants through your backend and check licensing through the hosted REST contract. Start with the [integration guide](hosted/INTEGRATION_GUIDE.md), [local setup](hosted/LOCAL_TESTING.md), [OpenAPI](../../services/pact-api/openapi.json) and [implementation evidence](hosted/IMPLEMENTATION_REPORT.md). The feature is implemented locally; new remote CI/container execution, hosting and real-wallet acceptance are still separate gates. The older public deployment is unchanged.

Customer-hosted SDK enforcement remains an alternative. The guides below describe that preserved model. Start with the [developer guide](../development/DEVELOPER_GUIDE.md) and [quickstart](quickstart.md). SDK `0.2.0` remains a reviewed local tarball, unpublished to npm.

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

Public lookup does not authenticate a wallet or authorize an operation. In the customer-hosted model, protected access requires one persistent customer-hosted Node process on the application's own origin, explicit wallet proof and fresh server entitlement checks. The separate hosted model uses its own persistent PostgreSQL service, limited private-pilot protocol and backend API enforcement; it does not turn the old SDK session into cross-site SSO. Base Sepolia remains an isolated fallback. No publication, deployment or real wallet action follows from installing or testing either model.
