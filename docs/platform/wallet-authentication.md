# Wallet authentication

Connecting a wallet reveals an address. Looking up that address reports public entitlement. Neither proves control to your server. Authentication separately verifies an exact-message Ed25519 proof and creates a short-lived opaque session.

Run this only from a deliberate Authenticate control in a browser:

```js
import {PactClient} from '@pact/sdk/v1';
const pact = new PactClient({network: 'devnet', apiUrl: '/api/pact'});
await pact.auth.authenticate({
  getPublicKey: () => provider.publicKey?.toBase58() ?? null,
  signMessage: async bytes => (await provider.signMessage(bytes, 'utf8')).signature,
});
const session = await pact.auth.session();
```

`provider` is the intended connected wallet's message-signing provider. Wallet owners approve their own prompts. This message is not a purchase and sends no chain transaction. The SDK checks exact challenge origin, Devnet genesis, program, wallet, random IDs, purpose and times; it checks identity again across asynchronous steps.

The server's eleven-line UTF-8 challenge has a two-minute default TTL. It is bound to a random browser cookie and consumed synchronously before proof verification, including failed proofs. Successful verification rotates the opaque session, invalidating its predecessor; default session TTL is fifteen minutes. Cookies are HttpOnly, SameSite Strict and Secure on HTTPS. Do not expose internal session/binding IDs or log cookies.

On account change, disconnect, hidden/offline state or cancellation, clear pending UI results, abort client work and log out. The server cannot observe extension account changes until the client reports them. A previous request cannot regain authorization merely because the same wallet signs in again; the original session incarnation is rechecked.

Use the exact configured origin, including hostname and port. This protocol uses Phantom's message capability; it does not claim complete Wallet Standard SIWS support. Each application hosts its own same-origin handler. Cross-origin cookies, SSO, serverless, multiple processes and persistent sessions are outside the supported model. Explicitly enable `single-process` only on one persistent Node instance.

Authentication proves wallet control. Each [protected resource](backend-enforcement.md) still requires fresh server entitlement. The executable [authorization example](examples/authorize.mjs) is smoke-tested with disposable local message proofs, not real wallet prompts.
