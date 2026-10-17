# Developer quickstart

For a new application, obtain the reviewed `pact-sdk-0.2.0.tgz` and hash through the release owner, then install it in your application:

```sh
npm install /absolute/path/to/pact-sdk-0.2.0.tgz
```

The SDK is not published to npm. External sharing requires the owner's licensing approval. See the [developer guide](../development/DEVELOPER_GUIDE.md) for build, runtime and package verification details.

## Public lookup

```js
import {createPactClient, isLicenseStatusFresh} from '@pact/sdk';
const pact = createPactClient({rpcUrl: 'https://api.devnet.solana.com'});
const status = await pact.getLicenseStatus({offer: offerAddress, wallet: walletAddress});
const active = isLicenseStatusFresh(status, Date.now());
```

Supply canonical public addresses for your offer and wallet. This is a network read, so invoke it deliberately. `active` is public entitlement state; it does not authenticate the caller or protect a resource. The complete [lookup module](examples/lookup.mjs) is exercised against the packed artifact.

## Run the repository example

From your checkout root:

```powershell
$env:PACT_ENV_PROFILE='local'
$env:PACT_APP_ORIGIN='http://localhost:3008'
npm --prefix packages/pact-sdk ci
npm --prefix packages/pact-sdk run build
npm --prefix examples/pact-platform-app ci
npm --prefix examples/pact-platform-app run build
npm --prefix examples/pact-platform-app run start
```

Open `http://localhost:3008` exactly. Keep the same explicit local profile and public/origin/policy settings at build and start. Canvas Lab hosts its own same-origin `/api/pact` handler; a separate PACT marketplace process is unnecessary. Its source dependency is for repository development; third-party consumers use the tarball above. This local demo is not approved hosted configuration; see [environment profiles](../operations/ENVIRONMENTS.md).

Next, follow [embedded checkout](embedded-checkout.md), [wallet proof](wallet-authentication.md) and [backend enforcement](backend-enforcement.md). Copying a checkout button does not protect confidential data. Preserve exact seller metadata and never put wallet secrets in application configuration.
