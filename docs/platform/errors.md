# Errors and recovery

The HTTP client throws `PactApiError` with `code`, `message` and `status`. Direct readers/checkout use `PactError` or a purchase result. Catch errors to show a safe diagnostic; never authorize on an exception.

| Code | Action |
| --- | --- |
| `INVALID_INPUT`, `BODY_TOO_LARGE` | Correct canonical addresses, decimal values, method or bounded payload. |
| `WRONG_NETWORK` | Verify Devnet and the reviewed program; do not switch networks as a workaround. |
| `INVALID_ACCOUNT`, `STALE` | Close access and check RPC/account identity, time and progress. |
| `RPC_ERROR`, `TIMEOUT`, `BUSY` | Retry a read deliberately after recovery; never blindly repeat a purchase. |
| `METADATA_UNAVAILABLE` | Obtain the seller's original exact JSON; hashes cannot recover it. |
| `OFFER_INACTIVE`, `ALREADY_LICENSED` | Inspect the offer/current entitlement; do not bypass policy. |
| `AUTH_REQUIRED`, `AUTH_INVALID` | Deliberately authenticate the intended wallet again; never reuse a failed challenge. |
| `AUTH_UNAVAILABLE` | Check explicit one-process configuration and supported topology. |
| `FORBIDDEN` | Match origin/cookie path and same-origin POST rules. |
| `LICENSE_REQUIRED` | No fresh active entitlement authorizes this resource. |
| `RATE_LIMITED` | Wait for the bounded per-process budget to recover. |
| `NOT_CONFIGURED`, `NOT_FOUND`, `INTERNAL_ERROR` | Check server-owned policy, route/method and safe diagnostics. |

A purchase result may be `licensed`, `already-licensed`, `rejected`, `failed`, `expired`, `unknown` or `finalized-unverified`. Finalization without a fresh matching entitlement does not unlock access. A confirmed transaction waiting for finalization remains protected.

Preserve the original signature and journal. Call `recoverPurchase` or Check pending transaction; no signing/resend occurs during recovery. A missing status, timeout, provider error or changed baseline cannot prove safe expiry. Legacy records without a baseline stay protected on expiry inference. Do not delete storage or invent a replacement blockhash to bypass this protection. A proven expired outcome permits a separate user decision, never an automatic retry.

If React reports an invalid hook call, ensure the application supplies a single React instance and installs the tarball rather than a junction into SDK development dependencies. For authentication, `localhost` and `127.0.0.1` are different origins. For server freshness failures, correct clock/RPC health; do not widen limits or reuse a stale positive result.
