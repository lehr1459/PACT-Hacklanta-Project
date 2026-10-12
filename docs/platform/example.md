# Independent Developer Platform example

`examples/pact-platform-app` is a standalone Next.js application named Canvas Lab. It has its own page, React embedded checkout, same-origin REST handler, wallet authentication and server-protected operation. It imports the reusable SDK; it does not import PACT marketplace components. Existing Prism and vanilla checkout examples remain unchanged.

From PowerShell:

```powershell
Set-Location 'C:\Hackathon\PACT Hacklanta Project'
npm --prefix packages/pact-sdk ci
npm --prefix packages/pact-sdk run build
npm --prefix examples/pact-platform-app ci
npm --prefix examples/pact-platform-app run build
npm --prefix examples/pact-platform-app run start
```

Open `http://localhost:3008` (use this exact origin rather than `127.0.0.1`, because challenges are origin-bound). A port change requires updating the launch port and `PACT_APP_ORIGIN` together. Public offer, RPC and exact public metadata may be configured using the example's environment template. Never put wallet secrets in configuration. Keep `SOLANA_RPC_URL` consistent with the public Devnet RPC; the backend independently checks the genesis hash.

The example's `.npmrc` uses `install-links=true` so its local SDK dependency is installed as a package copy, with React supplied by the application. This avoids a second React instance from the SDK's development dependencies. Rebuild and reinstall the local SDK after changing SDK source; do not replace the consumer copy with a junction. A raw SSR rendering check verified the packed React component renders without browser globals or hook errors.

Default public offer: `7EdfowQEZyVyyp7bYdQyzmprZtVU9mVba8cysHm2Ardh`. Default metadata:

```json
{"schema":"pact-solana-license-v1","title":"TEST","terms":"TEST","priceLamports":"1000000","durationSeconds":"180"}
```

These defaults are checked against the actual offer commitment at runtime. No valid entitlement or purchase success is assumed. A seller may have deactivated the offer or Devnet may be unavailable.

Manual Phantom verification, requiring explicit operator authorization for real wallet operations:

1. Set Phantom to Solana Devnet. Open the exact configured origin. Connect your buyer wallet in the embedded checkout.
2. Confirm the on-chain offer, hash-matched terms, 0.001 SOL price and 180-second duration. For a different offer, update both public configuration and exact metadata. Buyer needs price plus transaction fee and entitlement-account rent.
3. Click Authenticate wallet. Review the challenge domain, Devnet, wallet, nonce and expiry in Phantom. Signing this message proves wallet control; it is not a purchase and does not prove entitlement.
4. With no license, Run protected operation must be denied by the backend. A client-submitted address or valid boolean cannot authorize it.
5. Separately authorize the purchase only when ready. Accept matching terms and press Purchase license. Review Phantom's purchase transaction and approve manually. Wait for finalized settlement plus fresh entitlement verification. Do not retry an unknown signature; use its recovery control.
6. After authenticating wallet control, Run protected operation returns a protected payload only if the backend verifies the current license. Every click is a new server check. The response clears from the UI at eight seconds from the request start or the entitlement expiry, whichever comes first. Transport time consumes this budget; a response arriving after the deadline is rejected rather than displayed.
7. Switch accounts, disconnect, hide the page, go offline or wait for expiry. Access closes; a new wallet must authenticate its own identity. Expired or failed chain verification must deny subsequent protected operations.

No transaction or message is requested on page load. Automated tests use synthetic providers only. This example makes no claim that already delivered content can be retracted or that license issuance transfers copyright.

Authentication is intentionally single-process and local: challenge/session state is in process memory. Restarts invalidate sessions. Do not deploy this example on multiple instances/serverless without an atomic shared store and security review. The winning PACT Vercel deployment and Saturday Lights remain untouched.
