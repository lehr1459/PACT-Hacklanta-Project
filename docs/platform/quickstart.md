# Developer quickstart

## Run PACT and the independent example

Open PowerShell in the repository and build the SDK first:

```powershell
Set-Location 'C:\Hackathon\PACT Hacklanta Project'
npm --prefix packages/pact-sdk ci
npm --prefix packages/pact-sdk run build
npm --prefix web ci
npm --prefix web run build
npm --prefix examples/pact-platform-app ci
npm --prefix examples/pact-platform-app run build
```

In one terminal, start the PACT preview (public APIs work with authentication disabled):

```powershell
Set-Location 'C:\Hackathon\PACT Hacklanta Project\web'
npm run start -- --hostname 127.0.0.1 --port 3007
```

In a second terminal, start the independent application:

```powershell
Set-Location 'C:\Hackathon\PACT Hacklanta Project'
npm --prefix examples/pact-platform-app run start
```

Open `http://localhost:3007/integrate` and `http://localhost:3008`. The example opts into single-process authentication locally and hosts its own `/api/pact` handler. Authentication cannot span independent server processes or origins.

## Read a license through the API

```ts
import {PactClient} from '@pact/sdk/v1';
const pact = new PactClient({network:'devnet',apiUrl:'http://localhost:3007'});
const offer = await pact.offers.get(offerAddress);
const license = await pact.licenses.verify({offerAddress,walletAddress});
console.log(offer.priceLamports, license.valid);
// license.walletControlProven and license.authorized are always false.
```

For an application's own backend, use the [server handler](backend-enforcement.md), [React checkout](embedded-checkout.md) and [wallet proof](wallet-authentication.md). Registering an application or embedding a button does not automatically protect it. Confidential data and protected actions must be enforced by that application's server.

Exact metadata travels from the seller through a complete buyer link or an explicitly supplied JSON string. It cannot be recovered from an offer address/hash alone. The default TEST example metadata must still pass the live commitment check.
