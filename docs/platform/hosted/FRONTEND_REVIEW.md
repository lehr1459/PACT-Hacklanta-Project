# Hosted console frontend reconnaissance

Independent frontend inspection, 2026-10-19. Phase 5 preparation only; no UI implementation before the Phase 4 reviewed contract gate. This records repository evidence and a proposed implementation contract, not actual wallet/device or hosted acceptance.

## Evidence inspected

- Root and `web/AGENTS.md`, hosted master plan, ADR, architecture review and `services/pact-api/CONTRACT.md` (Phases 1–2).
- `/integrate/page.tsx`, `integration-wizard.tsx`, scoped integration CSS, existing developer-platform panel, Solana providers and wallet UI, root layout, Next configuration and integration/browser fixture coverage.
- Installed Next 16.4 docs for layouts/pages and server/client boundaries. Relevant constraints: page defaults to Server Component; interactive wallet/API state stays behind a client boundary; providers stay deep; server-only values cannot enter client props/imports. CSS guide path is `01-app/01-getting-started/11-css.md`.
- Existing `/integrate` renders the generator directly. It deliberately needs no registration/wallet, has public offer preparation and clearly synthetic UI previews. Existing browser tests navigate to that exact route and assert its fields and buyer/seller roundtrip.
- `SolanaProviders` is not global. It has Phantom/Solflare adapters with `autoConnect=false`. Existing `SolanaWallet` connects only on explicit click and has no hosted message-signing behavior.
- The existing hosted contract exposes real app, callback, resource, credential, usage and audit routes. Keys require signed sensitive actions; absent usage is genuinely empty. Phase 3 connect and Phase 4 access/readiness contracts were not implemented at inspection.

No environment secret file was read. No root build, wallet prompt, external mutation, transaction or deployment was attempted.

## Route and file ownership proposal

Root owns the fixed same-origin `/v1` gateway, server-only upstream config, CSP/security headers, shared manifests/configuration and CI. Frontend owns a new `web/components/hosted-console/` directory, hosted-scoped CSS, `/connect` page, and `/integrate` page composition. Avoid changes to existing generator, chain providers, SDK and marketplace code except a narrow composition/link adjustment agreed with root.

Root accepted routing decision: add a hosted primary choice card at `/integrate` linking the functional console at `/integrate/developer`; self-hosted links to `/integrate#self-hosted`, a wrapper around the unchanged wizard. Keep all original generator controls, logic and deep links on `/integrate`. No alias or generator relocation is needed. `/connect` shares the public PACT origin. Frontend may change `web/app/integrate/page.tsx` only additively, plus its new console/connect routes/components/styles; root owns gateway/configuration and global providers/styles remain untouched.

Suggested modules: `api.ts` (same-origin envelope validation/CSRF/error mapping), `wallet-proof.ts` (exact message signing), `console.tsx` (session/apps/navigation), `application.tsx` (detail selection), distinct callbacks/resources/credentials/integration/usage-audit/settings panels, and `connect.tsx`. Share presentational copy blocks and typed request helpers without one monolithic component. Admin-secret reveal is a separate short-lived in-memory view, never an input to snippets.

## Functional UX and exact authority

1. Landing explains hosted REST as recommended, self-hosted SDK as alternative, no source upload, Devnet scope, customer backend enforcement and custom private-pilot login limitations. Explicit admin login button connects Phantom and signs a newly issued exact challenge; no mount-time connect/sign effect. Display proven session wallet separately from currently connected wallet. A mismatch blocks sensitive actions and requests intentional reauthentication.
2. Apps list loads the actual owner-scoped registry, including authenticated empty state, loading, session expiry and retryable errors. Create app saves a server draft with name/description/framework. App ID is public. Never imply an active backend route is protected merely because an app exists.
3. Callback panel shows exact URI/origin and actual pending/verified/revoked state with expiry. Create/reverify/renew/revoke each gets a new action challenge for the exact payload. Show DNS token once after creation/renewal, fixed TXT label and expiration; do not claim a pending token is verified. Local loopback is explicitly development only.
4. Resources panel accepts canonical offer address and immutable resource key; a fresh `resource.bind` proof plus server verified seller read establishes binding. An offer selector may list already saved resources, but cannot invent an offer-discovery endpoint. Link to existing seller studio for new offers; do not claim an address read proves seller control. Edits use server `expectedVersion`; conflicts require reload/review. Explain policy updates invalidate existing grants. Disable works during RPC outage; history is real version data.
5. Credential panel requests server-only `access:check`/`connect:write` scopes, name, explicit expiry and new signed proof. One-time secret reveal has copy/manual-copy fallback and Dismiss. Before leaving, explain it cannot be redisplayed. Dismiss/logout/unmount clears component state. Metadata lists prefix/scopes/expiry/last-used/revocation. Rotation has explicit overlap seconds and expiry; revoke is deliberate and action-signed, available when paused. Never put actual secret in generated snippets, browser storage, URL, analytics or auto-copied output.
6. Framework panel uses saved framework and public app/resource/callback values only. Samples use environment placeholders and backend enforcement; React calls its own backend. Surface executable examples/docs when Phase 6 supplies them; do not use fictitious commands or claim snippets have been installed. Copy is a local action with honest feedback.
7. Test console distinguishes (a) synthetic UI examples, (b) live read-only service readiness and saved configuration inspection, and (c) actual end-to-end customer-backend results. The PACT browser must never call key endpoints with an app secret or a wallet grant. A key-validation badge requires a verified backend receipt; it cannot derive from key metadata. No fake entitlement/allow success. The Phase 4 contract must define readiness before this panel is wired.
8. Usage and audit load actual owner-scoped routes, render bounded records, empty state, UTC/local labeled timestamps and safe request IDs. No made-up alerts, latency or success ratios. Settings signed updates include framework/name/status; pause warning explains server access denial. No account deletion, recovery, email validation or grant-management UI without an actual reviewed endpoint.
9. PACT connect shows real application identity, requested purpose, exact issuer, Devnet, selected wallet and challenge expiration. Separate Connect, Sign in, Cancel controls. Message signing is explicitly not a payment. Cancel/reject/unsupported wallet/stale transaction/expiry/callback failure never produce success. Exact backend-issued callback destination alone may navigate after verification. Never accept callback override from query parameters.

## Accessibility and async requirements

Use native forms/labels/fieldsets and buttons; minimum 44px interactive targets; scoped visible focus including forced colors. Announce loading/complete with `role=status`, failures with `role=alert`, focus first invalid field and newly navigated panel heading. Every signed action has busy/in-flight protection and cancellation behavior. Disable actions while their exact signed payload is pending; wallet/address/app change invalidates the outstanding operation. Ignore stale reads using abort/generation ownership. Distinguish wallet rejection from unexpected service failure without rendering provider exception text.

Use ordinary navigation links/buttons with `aria-current` or fully implement tab keyboard semantics. Mobile panels stack, long opaque IDs wrap, code blocks scroll inside their own bounds. Verify 320px and desktop, keyboard, reduced motion/forced colors and browser accessibility tree. Real screen-reader/mobile wallet support remains owner acceptance, not a synthetic browser claim.

## Required review and verification

- Browser tests against real local service and disposable deterministic wallet fixture, explicitly labeled synthetic: register admin/app; exact callback proof; seller binding; once-secret reveal; rotate/revoke; app pause; resources/version conflict; usage/audit; session expiry; cross-app visibility; refused/missing wallet and clipboard fallback.
- Real connect transaction created by a test backend: displayed app/purpose; explicit wallet click; rejection/cancel/expired; successful code navigation to exact callback; customer backend exchange/enforcement tested outside the browser. Browser never receives backend key/grant.
- Assert no signature prompt before click and no transaction-signing/broadcast method. No secret persistence in local/session storage, logs, query strings, generated snippets or list responses. Administrator once-secret response/reveal is the intentional exception.
- Typecheck and production build from a clean validation checkout with approved local fixture environment. Keep root `.env.local` unread and avoid writing root `.next`. Existing generator, marketplace/buyer checkout and navigation browser suites remain regression gates.

## Open dependencies and uncertainty

Frontend implementation is intentionally waiting for Phase 4 gate. The actual final connect route/body/cancel/callback/error envelopes, readiness body, access decision shape and same-origin gateway must be read after backend contract freeze. No honest browser-only test can prove key validity or buyer entitlement; root must provide a backend demo or clearly limit test console scope. Full framework examples arrive in Phase 6. Operator metrics, alerts, email/recovery, account deletion and mobile deep links have no verified public implementation at inspection and must not be represented as active features.

Owner approval remains required for hosting/DNS, operating/incident ownership, privacy/terms, real-wallet/device acceptance and rollout. Track Node review 2026-10-21 and dependency exception 2026-11-15.
