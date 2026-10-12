# PACT low-code integration wizard

## Scope and user workflow

PACT's integration workspace is at `http://localhost:3003/integrate`. It supports Next.js App Router and React applications using TypeScript/TSX, with Phantom's injected Solana browser provider. This does not claim arbitrary desktop, native mobile or no-code platform compatibility.

1. Open **Integrate your app** from the marketplace.
2. Enter an application name and choose Next.js or React. Names are descriptive local labels, not app registration.
3. Paste an existing offer PDA, use the explicitly labelled known demo offer, or navigate to the existing Seller studio to create an offer under the operator's separate transaction authorization. The marketplace link carries its selected offer back to the wizard.
4. Select **Validate offer and generate integration**. The existing SDK validates a coherent Devnet offer/program snapshot using a fixed public lookup address. This reads public accounts only; it neither authenticates a seller nor asserts a customer's entitlement.
5. Copy the install command, `pact-config.ts`, `PactLicenseGate.tsx`, and AI coding-assistant prompt. Follow the displayed SDK build/install and application checklist.
6. Wrap the application's existing premium interface with the generated component and test it. A customer's actual connected Phantom public key supplies the verification identity.

The locked/valid/expired preview is explicitly synthetic and does not grant real access. The wizard does not install code into another application, create a registration, request wallet permission, or perform any blockchain transaction.

## Fixed integration contract

- Network: Solana Devnet.
- Program: `EiiiWWsW2kkqP6nugHz6iBADvhnW5xnibAtZ82ZExVqy`.
- RPC: `https://api.devnet.solana.com`.
- Known demo offer: `7EdfowQEZyVyyp7bYdQyzmprZtVU9mVba8cysHm2Ardh`.
- SDK import: `@pact/sdk`; public client API `createPactClient().getLicenseStatus({offer, wallet})` and `isLicenseStatusFresh`.

The generator imports network/program constants from the actual SDK. Configuration is not an editable chain selector. Generated code checks network/program agreement; the SDK verifies Devnet genesis, executable program, offer/entitlement identities and expiry. No entitlement decoder, PDA algorithm or transaction construction is duplicated in the wizard or generated component.

Generated verification uses a persistent SDK client per identity/visibility session, sequential reads every four seconds and a separate 250 ms freshness check. Wallet changes, explicit null account events, disconnects, offline/hidden pages, stale/error results and expiration close access. Stale asynchronous responses cannot reopen a later session. Browser APIs are accessed in effects and handlers, with a locked initial server render.

## Installation and generated example

The SDK is unpublished. Do not substitute a registry `npm install @pact/sdk` command. Build the existing local package first:

```powershell
Set-Location 'C:\Hackathon\PACT Hacklanta Project'
npm --prefix packages/pact-sdk ci
npm --prefix packages/pact-sdk run build
```

From the target application's directory:

```powershell
npm install "C:/Hackathon/PACT Hacklanta Project/packages/pact-sdk"
```

The target must already be a React/Next.js TypeScript application with its normal React/types/build setup. For another machine, run `npm pack` in the built SDK package, copy the generated `pact-sdk-0.1.0.tgz`, then install that file's actual local path. Nothing is published by these commands.

Save the wizard's configuration and complete generated component in the same directory. Integrate it with existing application code:

```tsx
import PactLicenseGate from './PactLicenseGate';
import PremiumTools from './PremiumTools';

export default function Application() {
  return <PactLicenseGate><PremiumTools /></PactLicenseGate>;
}
```

The full generated component handles Phantom connection/rejection/disconnection and SDK polling. The small wrapper above does not replace that component. Next.js output includes the client directive. The assistant prompt preserves existing UI and unrelated code, treats the application name as data, fixes the selected public configuration, forbids secrets/transactions/deployment, and requires verification of the resulting integration.

## Security and operational limits

Generating instructions does not automatically protect an application. Client-side hiding is a demonstration; a modified browser can expose shipped content or spoof its wallet provider. Do not send confidential Server Component children, APIs or files before server authorization.

Protected server resources require independently authenticated wallet ownership and a fresh server-side license check for that identity. A supplied public wallet string alone does not authenticate a requester. This task adds no database, authentication platform or server authentication flow, and requests no message/transaction signatures.

Offer validation checks structure and network, not seller control, legal ownership or future sale availability. The current SDK does not expose offer activation status; developers should confirm purchase availability in the existing marketplace. Devnet account validation also trusts the configured RPC's honesty and the upgradeable program's authority.

The SDK's previously recorded four moderate dependency advisory entries remain a limitation; this wizard is not a production security certification. Chrome's real Phantom permission/rejection/account-switch dialogs require manual operator verification. Mobile layouts are tested; native mobile wallet support is not claimed.

## Acceptance and preservation

Local acceptance PASS: 27 SDK regressions; genuine TypeScript/production compilation of the actual emitted Next.js and React TSX components; 44 generated-component runtime checks; eight synthetic wizard checks (two generator helpers and six browser executions); two actual Devnet wizard browser checks; 154 preserved Solana regressions; two setup checks; and two preserved actual Devnet read-only browser checks. Final actual-config TypeScript and production build passed, with five static pages generated including `/integrate`. Full commands and preserved first-run evidence are in `docs/INTEGRATION_WIZARD_QA.md`.

Security/Reviewer independently reconciled the final source, generated-file hashes, QA logs and read-only boundaries: PASS. READY for local developer integration testing, with the manual wallet and production-security limits above.

The React component is compiled and executed through an independent React client wrapper in a Next.js production consumer. This validates the emitted TSX and React behavior; it is not a claim that every React bundler or a standalone Vite build was tested. Synthetic consumer accounts/providers are explicit test fixtures, not real wallet-control or active-license evidence.

Actual wizard tests use no wallet/provider injection and permit only `getGenesisHash` and `getMultipleAccounts` to the official Devnet endpoint. Independent public SDK lookup at `2026-10-10T23:20:03.385Z`, context `509703985`, confirms the known offer and fixed program with the public System lookup identity; its missing entitlement does not describe a buyer's access. Lead independently reproduced structural validation at context `509702204` and reviewed desktop/mobile synthetic and actual-network screenshots.

All 61 protected task-start file hashes match, including the existing SDK, independent Prism application, Solidity, Solana program source/artifact and Base fallback. All four existing Git tags remain. Program artifact SHA256 is `d13828b060327ef9f702b076b8681e4b9e1e8c04f961191d1df17b2babf52a62`. Existing uncommitted work is retained. Changes to the marketplace are limited to integration navigation and the explicit seller URL handoff; existing transaction logic is not changed.

Implementation files: `web/lib/integration/generator.ts`, `template.ts`, `web/components/integration-wizard.tsx`, `web/app/integrate/page.tsx`, scoped `integrate.css`; web manifest/lock add the local SDK dependency. QA owns `web/tests/integration/**` and the necessary test-collection exclusion. Lead owns this runbook and coordination updates.

## Local startup

The final actual-config production preview is restored on port 3003 (PID `11020`); root, `/integrate` and `/base` return HTTP 200, root/wizard contain the actual program with no synthetic fixture ID, and server stderr is empty. Independent Prism remains on port 3004 (PID `9552`), HTTP 200. Preview logs are `C:\Users\Lehr\AppData\Local\Temp\pact-wizard-preview-20261010-232511.out.log` and `.err.log`.

Start PACT from a separate terminal only if port 3003 is not already running:

```powershell
Set-Location 'C:\Hackathon\PACT Hacklanta Project'
npm --prefix web run dev -- --hostname 127.0.0.1 --port 3003
```

Open `http://localhost:3003/integrate`; the existing independent example remains at `http://localhost:3004/`. Do not start a second listener on the same port or rebuild the same application's `.next` directory while its production preview is serving.

Official references: [Phantom connection/account events](https://docs.phantom.com/solana/establishing-a-connection), [React effect lifecycle](https://react.dev/reference/react/useEffect), [npm local package installation](https://docs.npmjs.com/cli/v11/commands/npm-install/). Installed Next.js 16.4 client/server and page guides were also read locally.
