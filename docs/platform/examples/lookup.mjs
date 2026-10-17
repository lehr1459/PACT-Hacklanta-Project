import {createPactClient, isLicenseStatusFresh} from '@pact/sdk';

// Public state for a supplied address. This does not prove wallet control.
export async function lookupLicense({offer, wallet, rpcUrl, fetch, now = Date.now}) {
  const client = createPactClient({rpcUrl, fetch, now});
  const status = await client.getLicenseStatus({offer, wallet});
  return {status, fresh: isLicenseStatusFresh(status, now()),
    walletControlProven: false, authorized: false};
}

