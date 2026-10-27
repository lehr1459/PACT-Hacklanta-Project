# Environment profiles

PACT currently supports Solana Devnet and the isolated Base Sepolia fallback. Configuration validity does not establish deployment approval, legal permission, RPC trust, upgrade-authority custody or a supported hosting topology. The release archive is a **local, nondeployable snapshot**.

`@pact/sdk/server` exports `resolvePactEnvironment`, `publicEnvironmentBinding` and `PactEnvironmentError`. The resolver reads only the supplied object. It never loads an environment file or sends a request. Errors contain variable names and stable codes, not values. Keep provider URLs and metadata out of logs.

| Profile | Intended use | Defaults and restrictions |
| --- | --- | --- |
| `local` | Developer workstation | Official public testnet endpoints; loopback origins. Marketplace can show setup with a blank program. The platform example retains its explicitly synthetic offer and metadata defaults. |
| `test` | Isolated automated fixtures | Synthetic identities, loopback RPC and fixture programs permitted. Authentication defaults disabled. |
| `ci` | Clean deterministic validation | Same fixture allowance as test; active environment files forbidden by metadata checks. No hosting approval. |
| `preview` | Explicit externally configured preview | Critical fields required; no fixture flags/offers, local browser URLs or defaults. |
| `hosted` | Explicit customer configuration | Same strict configuration checks as preview; topology and owner approval still require external evidence. |

Build and start always require `PACT_ENV_PROFILE`. Development alone may default to local when no hosting marker is present. A test/CI build cannot be relabeled hosted at start. The resolver always reports `deployable:false`; human configuration and release approval remain separate.

| Variable | Meaning |
| --- | --- |
| `PACT_ENV_PROFILE` | One of the five values above. |
| `PACT_NETWORK` | `devnet`; no Mainnet option. |
| `NEXT_PUBLIC_PACT_SOLANA_PROGRAM_ID` | Browser program. Strict profiles require the reviewed `EiiiWWsW2kkqP6nugHz6iBADvhnW5xnibAtZ82ZExVqy`. |
| `NEXT_PUBLIC_SOLANA_RPC_URL` | Intentionally public browser RPC. Strict profiles require HTTPS origin-only, without credentials, path, query or fragment. |
| `NEXT_PUBLIC_PACT_OFFER` | Optional marketplace default; required for strict example profiles. Never use the synthetic TEST offer as hosted configuration. |
| `NEXT_PUBLIC_PACT_METADATA` | Intentionally public exact metadata text, at most 65,536 UTF-8 bytes. Binding stores only its SHA256. Do not parse/reserialize accepted text. |
| `NEXT_PUBLIC_PACT_MARKETPLACE_URL` | Demo purchase destination; strict demo requires an explicit HTTPS URL. |
| `NEXT_PUBLIC_PACT_CONTRACT_ADDRESS`, `NEXT_PUBLIC_RPC_URL` | Preserved optional Base Sepolia contract and public RPC. Chain remains fixed at 84532; conflicting legacy `NEXT_PUBLIC_CHAIN_ID` fails. |
| `PACT_APP_ORIGIN` | One canonical HTTPS or local HTTP origin, without trailing slash/path. Must match the browser origin and saved build. |
| `SOLANA_RPC_URL`, `SOLANA_RPC_FALLBACK_URL` | Server-only primary and optional distinct fallback. HTTPS private paths/query parameters and internal infrastructure are allowed; values never enter build bindings or receipts. |
| `PACT_AUTH_MODE` | `disabled` or `single-process`. Wallet connection alone does not prove control. |
| `PACT_PROCESS_MODEL` | `stateless` or `single-persistent-process`. Single-process auth requires the latter and a supported actual Node process. |
| `PACT_SERVER_POLICY` | `disabled` or `licensed-demo-v1`. Explicit in strict profiles. |
| `PACT_PROTECTED_OFFER` | Server-selected entitlement for the licensed demo policy. Platform purchase and protected offers must match. |

Strict profiles require network, program, browser RPC, application origin, server RPC, auth mode, process model and policy explicitly. They reject unknown `NEXT_PUBLIC_*` variables because Next embeds all of them. No URL field accepts raw whitespace/controls or remote HTTP. Private server RPCs are never suitable for a `NEXT_PUBLIC_*` field.

The known Solana TEST offer and Base browser fixture contract are rejected in strict profiles. Address syntax checks cannot establish that another contract is deployed, reviewed or authorized; Base fallback still checks actual chain/code before use.

`single-process` with policy `disabled` and no protected offer supports identity proof only. `licensed-demo-v1` requires single-process auth and a protected offer. Marketplace `/protected` is a demo response; the platform example also provides a private asset and a prepared server operation. Neither is DRM or a legal copyright transfer. Disabled authentication requires disabled policy and no protected offer.

Authentication is unavailable on known serverless/worker topologies. One declared process variable cannot prove that a host actually routes every request to one persistent process. Do not enable auth until an operator verifies that property. Sessions, budgets and challenge state are process-local and disappear at restart.

Next saves `PACT_BUILD_BINDING_JSON` and public source/cleanliness flags in its actual required-server-files manifest. Startup compares the saved binding with runtime settings. Public settings, origin, auth mode and policy cannot drift; private primary/fallback RPC values may rotate after validation. Never put private values in `next.config.env`. Type generation validates configuration without claiming a production build.

Use externally supplied process variables or your own local files. Templates are examples and tools never overwrite user files. Test/CI/preview/hosted checks refuse active `.env`, `.env.local`, production/development/test variants in the app or repository by existence only. Run clean release validation from a fresh committed checkout.

```sh
node scripts/validation/environment.mjs --application marketplace --phase build
node scripts/validation/environment.mjs --application marketplace --phase start
```

Set the environment before these commands; the CLI deliberately does not load a file. See [release snapshots](RELEASE.md) and [operating procedures](RUNBOOKS.md).
