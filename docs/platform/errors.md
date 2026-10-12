# Errors and safe recovery

HTTP errors are typed JSON; `@pact/sdk/v1` throws `PactApiError` with `code`, `message` and `status`. Never authorize access on an exception.

| Code | Action |
| --- | --- |
| `INVALID_INPUT`, `BODY_TOO_LARGE` | Correct address, schema, canonical decimal values or payload size; never paste signing secrets. |
| `WRONG_NETWORK` | Use the reviewed program and Devnet RPC. Do not switch to Mainnet. |
| `INVALID_ACCOUNT`, `STALE` | Close access; verify account identity/RPC freshness. A prior positive is insufficient. |
| `RPC_ERROR`, `TIMEOUT`, `BUSY` | Close access; retry a read when service recovers. Do not automatically retry a purchase. |
| `METADATA_UNAVAILABLE` | Obtain exact seller metadata through a complete buyer link/download or manual recovery. Hashes cannot recover it. |
| `OFFER_INACTIVE`, `ALREADY_LICENSED` | Use an available offer or the existing entitlement. Expiration permits a separately authorized later purchase. |
| `AUTH_REQUIRED`, `AUTH_INVALID` | Connect the intended wallet and deliberately request a new challenge; old/failed challenges cannot be reused. |
| `AUTH_UNAVAILABLE` | Use explicitly enabled single-process local mode; serverless/multi-instance auth is unsupported. |
| `FORBIDDEN` | Match configured origin and cookie prefix exactly; use same-origin authentication. |
| `LICENSE_REQUIRED` | No fresh active entitlement authorizes this operation. Public validity alone does not prove wallet control. |
| `RATE_LIMITED` | Wait for the bounded process budget to recover; a shared production limiter is not installed. |
| `NOT_CONFIGURED`, `NOT_FOUND`, `INTERNAL_ERROR` | Check server policy/path/method; keep access closed and inspect nonsecret diagnostics. |

Wallet rejection remains a normal checkout result. Pending, unknown or finalized-unverified results do not unlock access. Preserve the original signature and use the existing Check pending transaction control. `not-found` is not a safe retry guarantee.

If local React shows Invalid hook call, build SDK first and reinstall the package copy using the example's `install-links=true`; do not junction the SDK's development React into the application. If authentication fails, use the exact `localhost` origin configured in `PACT_APP_ORIGIN`, not an alternate IP/port.
