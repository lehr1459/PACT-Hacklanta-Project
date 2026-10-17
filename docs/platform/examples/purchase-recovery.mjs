import {createCheckoutClient} from '@pact/sdk/checkout';
import {PACT_PROGRAM_ID} from '@pact/sdk';

// Creating these actions does not connect, sign or submit.
// Call connect/purchase only from deliberate user controls in a browser.
export function createPurchaseActions({offer, rpcUrl, walletAdapter, onState, fetch, now}) {
  const client = createCheckoutClient({programId: PACT_PROGRAM_ID, rpcUrl,
    walletAdapter, onState, fetch, now});
  return {
    connect: () => client.connect(),
    purchase: ({metadataJson, termsAccepted}) =>
      client.purchaseLicense({offer, metadataJson, termsAccepted}),
    pending: () => client.getPendingPurchase({offer}),
    // Read-only recovery checks the original signature; it never resends.
    recover: () => client.getPendingPurchase({offer})
      ? client.recoverPurchase({offer}) : Promise.resolve(null),
    destroy: () => client.destroy(),
  };
}

