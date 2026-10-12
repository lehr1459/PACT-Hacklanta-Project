# Wallet authentication

Connecting Phantom reveals an address; a public license lookup only reports entitlement state. Neither authenticates the user. PACT separately verifies an exact-message Ed25519 proof, then authorizes protected operations using fresh chain state.

```ts
import {PactClient} from '@pact/sdk/v1';
const pact = new PactClient({network:'devnet',apiUrl:'/api/pact'});
// Run only from a deliberate Authenticate button. Never on page load.
await pact.auth.authenticate({
  getPublicKey: () => provider.publicKey?.toBase58() ?? null,
  signMessage: async bytes => (await provider.signMessage(bytes,'utf8')).signature,
});
const session = await pact.auth.session();
```

The SDK checks challenge format, domain, Devnet genesis, program, current wallet, challenge ID, times and fixed purpose before requesting a message signature. It compares wallet identity before and after asynchronous steps. Application-level account-change, disconnect, hidden/offline and cancellation handlers must also clear UI state and log out; see the independent example. Signatures are public proof bytes, not wallet secrets. Do not log challenge/session cookies or persist a private key.

The server message is exactly eleven UTF-8 lines: protocol version, origin, network, genesis, program, wallet, random challenge ID, random browser-session binding, issued time, expiration and purpose. Challenge TTL defaults to two minutes; session TTL defaults to fifteen minutes. Verification uses Node native Ed25519 with the supplied wallet's public key and the exact stored message. The challenge is consumed synchronously before verification; replay and failed-proof reuse are rejected.

The browser-binding cookie must accompany proof. Successful verification rotates to a new opaque server session and invalidates the previous session. Cookies are HttpOnly, SameSite=Strict, origin checked and Secure on HTTPS. A caller cannot choose the authenticated wallet by submitting an address or signed message of its own.

This application-specific protocol is not a claim of full Wallet Standard SIWS implementation. It uses the existing Phantom message-signing capability and native cryptography rather than custom signature primitives. Official references: [Phantom integration](https://docs.phantom.com/solana/integrating-phantom), [Solana message authentication](https://solana.com/docs/frontend/messages-and-auth), [Node Ed25519 verification](https://nodejs.org/api/crypto.html#cryptoverifyalgorithm-data-key-signature-callback).

The store is atomic only inside one persistent Node process. Set `authMode:'single-process'` deliberately; defaults are disabled and known serverless environments are refused. Restarting logs everyone out. A separate application must host its own same-origin auth handler, not try to reuse PACT cookies cross-origin. Multiple workers, serverless and shared sessions require a shared atomic store and a separate security review.
