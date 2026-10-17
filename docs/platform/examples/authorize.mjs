// Node server only. Never import this module in a browser bundle.
import {createPactApiHandler} from '@pact/sdk/server';

export function createLicensedHandler({origin, offer, rpcUrl, loadPrivateAsset,
  prepareOperation, fetch, now}) {
  return createPactApiHandler({
    prefix: '/api/pact', origin, rpcUrl, authMode: 'single-process', fetch, now,
    resources: {
      asset: {offer, method: 'GET', prepare: async context => ({
        body: await loadPrivateAsset(context), contentType: 'text/plain; charset=utf-8',
      })},
      operation: {offer, method: 'POST', prepare: prepareOperation},
    },
  });
}
// Mount ONE handler for the lifetime of ONE persistent Node process.
// prepareOperation must be side-effect-free and respect context.signal.
// Its optional commit must be synchronous, atomic, nonthrowing and return undefined.
// Resource POSTs have no request body; the server selects offer and policy.

