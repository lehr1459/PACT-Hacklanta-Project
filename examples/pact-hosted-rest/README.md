# REST / cURL diagnostic

Requires pinned Node24.22 and curl8.x. No npm dependencies or publication. Load your key through your server secret manager/private environment; do not put values in commands, shell history, output captures or browser code. `.env.example` is documentation, not an automatically loaded file.

```text
node curl.mjs validate
node curl.mjs access
node --test tests/curl.test.mjs
```

The helper runs actual curl with private config on stdin: `curl -q --config -`. The key and grant never enter process arguments or temporary files. Redirects, curlrc, environment proxies and verbose output are disabled; response size and time are bounded. Output contains a fixed diagnostic observation, **never application authorization**. HTTP200 alone is insufficient: a protected backend must validate all ALLOW bindings and original freshness. Use the working [Express](../pact-hosted-express) or [Next.js](../pact-hosted-next) integrations and the [guide](../../docs/platform/hosted/INTEGRATION_GUIDE.md).

The REST wire equivalent is POST `/v1/access/check`, JSON `{walletGrant,resourceKey}`, with `Authorization: Bearer <private server key>`. Wallet, offer, app, program and chain are derived by PACT, not supplied as selectors. A React frontend calls its own protected backend. Developer admin proofs and buyer wallet approval remain explicit PACT-origin interactions; this tool cannot sign or buy a license.
