# PACT Solana Devnet deployment package — authorization pending

No live deployment, wallet signing, wallet approval or transaction broadcast is authorized. No agents create or inspect wallet/program keypairs. Program tests load compiled SBF into an in-memory SVM with signature verification disabled and zero signatures; those are local execution evidence only.

## Preserved baseline and candidate

Pre-migration checkpoint: `182fbb9b53f0e9fc6f2eb073ff7f3ebab94db1a0`, tag `pre-solana-migration`. Existing `phase1-local-baseline` and `phase2-local-ready` remain preserved. Solidity and the `/base` fallback remain available.

The local migration candidate is frozen under tag `solana-local-ready` after acceptance; resolve its exact commit with `git rev-parse solana-local-ready`. Browser evidence is recorded in `docs/SOLANA_QA.md`. This package is not authorization to deploy.

## Compiled program and local program evidence

- Native Rust with Pinocchio `0.9.2` and `pinocchio-system 0.3.0`; not an Anchor CLI build. Authoritative native binary interface: `solana/wire-spec.json` (not a generated Anchor IDL).
- Official Anza platform tools `v1.57`, pinned checksums; direct bundled Cargo build for `sbpf-solana-solana` avoids CLI automatic keypair generation. No WSL, administrator restart, or remote compiler required.
- Deployable artifact: `C:\Hackathon\PACT Hacklanta Project\solana\artifacts\pact_licensing.so`, **35784 bytes**.
- Artifact SHA256: `d13828b060327ef9f702b076b8681e4b9e1e8c04f961191d1df17b2babf52a62`; independently reproduced by QA. Source/lockfile/tool/interface hashes: `solana/artifacts/evidence.json`.
- Actual local execution: **23 LiteSVM program tests passed** (9 Backend plus 14 independent QA). Loaded the compiled SBF, exercised CPI settlement and account mutation/rollback; signature verification disabled and zero signatures used, never signing keys. This is not mocked program logic, cryptographic signature validation, or live Devnet evidence.
- Independent Solana Playwright acceptance: **32 passed** (24 browser executions plus 8 helper executions across desktop/mobile). Includes Phantom connection/rejection/disconnection/account changes, missing extension and program setup, Devnet mismatch, fresh/expired/invalid snapshots, bounded metadata and transaction failure/identity handling. Synthetic providers and intercepted RPCs only; see QA for separate setup and Base regression results.
- Separate Solana unconfigured-production smoke: **2 passed**. Preserved Base Foundry: **23 passed**; Base configured browser/helper regression: **48 passed** plus 2 intentional setup skips, then **2 passed** in the separate setup run.
- Final restored default production build and TypeScript check exited 0; all 4 pages generated. No configured deployment addresses or synthetic fixture addresses remain in the normal build. QA listeners on 3001/3002 stopped; protected unrelated port 3000 was not changed.

## Network and public configuration

- Cluster: Solana **Devnet only**.
- RPC: `https://api.devnet.solana.com`.
- Expected genesis hash: `EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG`.
- Read-only RPC check succeeded on October 10, 2026: expected genesis hash; confirmed slot `509468612`. This proves endpoint identity/reachability, not a PACT deployment.
- `NEXT_PUBLIC_SOLANA_RPC_URL=https://api.devnet.solana.com`.
- `NEXT_PUBLIC_PACT_SOLANA_PROGRAM_ID=` stays empty until an authorized deployment returns the actual address. Public fixture ID in local tests is not deployed-address evidence.
- Operator-supplied public wallet / proposed deployer: `HXmEkejco1WDhYx3j94388JUSkqL6cCyf3BxxUdQZuz2`.
- Read-only confirmed Devnet balance: **0 lamports (0 SOL)** at slot `509472721` on October 10, 2026; cluster genesis verified first. Funding remains pending. This does not verify private signer ownership or authorize signing.
- Program address, signer configuration/control, upgrade authority and deployment signature: **PENDING**.

The public RPC is rate-limited and Devnet can reset; [official cluster documentation](https://solana.com/docs/references/clusters) describes these limits. Genesis mismatch, stale slot/Clock, malformed accounts, and RPC failures must close access rather than claim validity.

## Operator prerequisites

Operator prepares a supported Solana CLI environment, a private deployer signer, a private program-address signer, and two distinct Phantom/Solflare browser accounts for seller and buyer. All credentials remain solely operator-controlled outside this repository. Do not send keypair files, passwords or recovery phrases to agents. Program-address keys are needed by the operator for initial deployment; the compiled native program uses its runtime address and does not require embedding a signing key or recompiling for an operator-selected ID.

Follow [official Solana CLI installation](https://solana.com/docs/intro/installation) in an operator-controlled supported terminal (WSL2 on Windows if required); confirm `solana --version`. The pinned native platform tools used for the local SBF build are not a replacement for the deployment CLI. Create/import wallet credentials only in the operator's private wallet/terminal, keep recovery backups offline, and keep any signer files outside PACT. Obtain only the public deployer and program addresses there. In Chrome, use the official Phantom download link, prepare distinct seller/buyer accounts, and choose Devnet. Wallet creation and permission dialogs have not been executed by agents.

Fund the operator and demo wallets with free Devnet SOL via `https://faucet.solana.com/`. Buyer needs price plus entitlement rent and transaction fees; seller needs offer rent and fees. No real SOL purchase/bridge is required. Faucet availability is external; report failure rather than invent funded balances.

## Proposed operator-only commands — not executed

Use a private terminal after explicit authorization for deployment. Paths below are placeholders to operator-controlled signer files outside PACT; agents never access those files. Read-only commands may be run separately with only public addresses.

```powershell
$pactRpc = 'https://api.devnet.solana.com'
$pactPayer = '<operator-controlled signer path outside PACT>'
$pactProgramSigner = '<operator-controlled program-address signer path outside PACT>'
$pactPublicPayer = 'HXmEkejco1WDhYx3j94388JUSkqL6cCyf3BxxUdQZuz2'
$pactProgramAddress = '<public program address>'
$pactSbf = 'C:\Hackathon\PACT Hacklanta Project\solana\artifacts\pact_licensing.so'
$pactExpectedHash = 'd13828b060327ef9f702b076b8681e4b9e1e8c04f961191d1df17b2babf52a62'
if ((Get-FileHash -LiteralPath $pactSbf -Algorithm SHA256).Hash.ToLower() -ne $pactExpectedHash) {
  throw 'Artifact differs from the reviewed candidate. Stop.'
}

# Read-only public preflight; genesis must match the Devnet hash above.
solana genesis-hash --url $pactRpc
solana balance $pactPublicPayer --url $pactRpc

# OPERATOR ONLY after separate explicit deployment authorization.
solana program deploy $pactSbf --url $pactRpc `
  --keypair $pactPayer --program-id $pactProgramSigner

# Read-only post-deployment proof.
solana program show $pactProgramAddress --url $pactRpc
solana program dump $pactProgramAddress '<temporary public-bytecode output path>' --url $pactRpc
```

Retain operator control of upgrade authority; no authority-finalization, close, upgrade or mainnet operation is part of this MVP. Deployment may send multiple transactions; all require authorization and operator execution. CLI deployment instructions are documented by [Solana](https://solana.com/docs/programs/deploying). Neither a simulation nor an in-memory SVM-loaded program is a live deployment.

Compare fetched public bytecode with the approved SBF artifact, allowing only documented loader padding if present. Record program address, executable owner/loader, ProgramData metadata and upgrade authority, deployment signatures and `https://explorer.solana.com/address/<program>?cluster=devnet`. Do not claim explorer source verification merely from an executable address; source/build hash and local artifact evidence are separate.

## Future real Devnet demo gate

After authorized deployment, configure the actual program ID and rebuild the local web app. Do not deploy the website. Seller creates a 180-second offer priced at 0.001 Devnet SOL and saves exact approved metadata. Buyer uses a distinct wallet, verifies the metadata, purchases, and waits for successful confirmation. Record the buyer entitlement PDA, offer data and Clock context, direct seller settlement, unlocked Studio and automatic expiry/lock. Demonstrate duplicate rejection, public verification and repurchase after expiry. There is no Solana withdrawal step because seller settlement is direct.

Actual wallet connections, signing rejections, transaction confirmations, expiry and explorer evidence must be independently reviewed by QA. Local SVM execution and synthetic browser fixtures do not satisfy the real Devnet gate.

## Stop gate

Complete local implementation/tests and freeze the candidate. Present hashes, test results and remaining operator prerequisites. Stop and await explicit deployment authorization; request no signing or wallet approvals now.

Next operator action: privately prepare the deployment CLI and wallets, fund the supplied public wallet with free Devnet SOL, obtain the public program address, confirm the intended deployer account, and explicitly authorize the frozen candidate's Devnet deployment. Until that authorization, all deployment commands, signing prompts and transaction broadcasts remain pending. Real Chrome extension checks and real Devnet seller/buyer acceptance are separate evidence gates; automated browser providers are synthetic.

Current dependency limitation: `npm audit` reports 24 transitive findings (13 high, 11 moderate, zero critical). See `web/README.md` and independent QA for scope; a passing local build/browser suite is not dependency security clearance.
