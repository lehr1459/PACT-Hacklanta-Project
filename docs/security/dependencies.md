# Dependency security triage

Reviewed: 2026-10-16. Owner: Security and SDK maintainers. Next review: 2026-11-15, or before dependency changes, native-wallet support, new parser/UUID use, or commercial release, whichever occurs first.

This is an advisory and reachability assessment, not a production-security certification. No application dependency was blindly upgraded, downgraded, or overridden to reduce an audit count. Existing Base Sepolia isolation and Solana program semantics are preserved.

## Runtime review — October 17

The original Node24.11.1 runtime predates published security fixes in the official [January](https://nodejs.org/en/blog/vulnerability/december-2025-security-releases), [March](https://nodejs.org/en/blog/vulnerability/march-2026-security-releases) and [July](https://nodejs.org/en/blog/vulnerability/july-2026-security-releases) releases. PACT parses external JSON and serves HTTP; response limits do not prove immunity to runtime vulnerabilities. Node **24.22.0** with npm **11.19.1** is the compatible same-major replacement validation target. The portable Windows ZIP and node.exe were checked against official release SHA-256 values; the global workstation runtime was not changed. Exact pins/checksums are in `scripts/validation/runtime.json` and the [official release](https://nodejs.org/en/blog/release/v24.22.0).

An announced [HIGH-severity October21 Node security release](https://nodejs.org/en/blog/vulnerability/october-2026-security-releases) remains undisclosed as of October17. Version24.22.0 must not be called clearance for that issue. Recheck before hosting and by October21; the runtime policy makes missing, malformed and expired review dates fail release validation. Later published fixes require a reviewed pin update and relevant regression checks. Dev-only Python3.13.5 and npm's entire own dependency graph have not received an independent exhaustive security audit; hash pins and application npm audits do not imply one.

Phase4 SDK version/engine metadata changes rebind the four lockfile graph fingerprints. Independent comparison verified every third-party dependency node unchanged; no exception scope or November15 expiry was extended.

## Reproduce the npm gate

```text
node scripts/validation/dependencies.mjs
```

The command runs read-only registry audits, saves raw reports/assessments under ignored `web/test-results/validation/dependencies`, and applies the reviewed exceptions in `scripts/validation/dependency-exceptions.json`. It binds all four parsed lockfile graphs to reviewed SHA-256 fingerprints, checks affected installed package names/versions against those locks, resolves propagated findings to underlying advisories, and enforces exact exception versions and valid ISO expiry dates. Registry failure is a failure, not a clean result. Exception expiry/new advisories/version or reachability changes require review; an exception does not authorize changing a supported surface.

Full-development evidence is under ignored `web/test-results/validation/dependencies` for npm reports and assessments, and `web/test-results/full-development/baseline` for `osv-non-npm.json` and `sdk-server-dependency-reachability.json`. These generated files are local receipts; this document and the checked-in gate record the durable conclusions.

| npm project | High | Moderate | Total |
| --- | ---: | ---: | ---: |
| `web` | 13 | 11 | 24 |
| `packages/pact-sdk` | 0 | 4 | 4 |
| `examples/pact-platform-app` | 0 | 5 | 5 |
| `examples/pact-demo-app` | 0 | 0 | 0 |

These are affected-package counts including propagation, not 33 independent vulnerabilities. There are five underlying advisories. Prism links the SDK rather than installing its runtime graph in its lockfile; zero findings in Prism's own audit does not make the shared SDK dependency graph clean. SDK and platform audits cover that graph separately.

## npm inventory and surfaces

All four application/package manifests and lockfiles were inspected. Audited installed node versions matched their corresponding locked versions. All lockfiles use version 3.

| Surface | Direct dependencies and role |
| --- | --- |
| SDK browser/server | `@solana/web3.js` 1.99.0 for public keys/PDAs/transactions; `buffer` 6.0.3 for exact binary data; `@noble/hashes` 1.8.0 for Keccak. The optional React entrypoint has React peer `>=18 <20`. Server crypto/async hooks are Node built-ins. |
| Web browser | Local SDK; wallet-adapter base 0.9.28, Phantom 0.9.30, React 0.15.40, Solflare 0.6.34; web3 1.99.0; React Query 5.104.1; buffer 6.0.3; Next 16.4.0; React/React DOM 19.3.0. |
| Isolated Base fallback | `viem` 2.57.4 and `wagmi` 3.7.7. Solana metadata hashing also imports viem, so viem is not dead Base-only tooling. |
| Examples | Local SDK plus Next 16.4.0 and React/React DOM 19.3.0. Platform installs an SDK copy; Prism uses a local link. |
| Build/dev | TypeScript 5.9.3; esbuild 0.28.2 in the SDK; Playwright 1.64.0 in web/examples; Node types 24.10.0 and React/React DOM types 19.3.0 as applicable. SDK's dev React compiles/tests the optional React entrypoint. |

No direct dependencies are classified unused merely because a feature is optional or Base is a fallback. npm audit covers the resolved JavaScript graphs, including build/dev dependencies; it does not audit the Rust program, Python wheels, vendored Solidity, compiler binaries, or browser extensions.

## Meaningful npm advisories and scoped exceptions

The following exact versions are accepted temporarily only within the reviewed supported browser/Node paths. All exceptions have the owner/review deadline above and are represented individually in the machine-readable policy.

| Advisory and severity | Exact installed/locked path | Reachability and affected functionality | Remediation / exception |
| --- | --- | --- | --- |
| [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm), high | Web: `braces` 3.0.3 through `micromatch` 4.0.8, Metro/React Native 0.87.1 and mobile adapter 2.3.0 | Deeply nested attacker-controlled brace patterns can exhaust the stack. The dependency is in native/Metro tooling; Next does not invoke Metro. Installed adapter browser/Node exports select non-native implementations; `index.native.js` imports React Native. No PACT route accepts glob patterns for Metro. | Upstream reports no patched braces release. Do not claim that an arbitrary downgrade fixes it. Reassess before native builds, exposing pattern input, or changing exports/bundlers. |
| [GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq), moderate | SDK/platform `jayson` 4.3.0 -> `uuid` 8.3.2. Web has nested jayson UUID 8.3.2 and Solflare SDK 1.4.2 -> UUID 9.0.1 | Advisory concerns `v3`, `v5`, `v6` with caller-provided output buffers/offsets. Inspected jayson browser client/request generator and Solflare iframe adapter call only `v4()` without such buffers. UUID's affected code is loaded via its package entrypoint; the claim is that affected APIs are uncalled, not absent from the bundle. | Patched 11.1.1 retains CJS/ESM browser/Node exports, but overriding declared UUID 8/9 ranges crosses major versions. A narrowly scoped override requires clean consumer and wallet regressions first. Do not override globally: rpc-websockets already uses UUID 14.0.0. |
| [GHSA-528h-pc64-c93x](https://github.com/advisories/GHSA-528h-pc64-c93x), moderate | SDK/web/platform `jayson` 4.3.0 -> `stream-json` 1.9.1 | Quadratic path filters on nested input. No PACT code invokes these filters. web3's Node and browser entries both import `jayson/lib/client/browser`, not TCP/stream parsing. | Patched stream-json 3.5.0 addresses this advisory, but other listed advisories require 3.6.0. A major override changes module/import APIs and is unsafe without upstream compatibility work. |
| [GHSA-hqr4-qq8f-hg3x](https://github.com/advisories/GHSA-hqr4-qq8f-hg3x), moderate | Same stream-json 1.9.1 graph | JSONC parser/verifier repeatedly scans long chunked comments. PACT uses bounded native JSON parsing, not JSONC. The supported jayson browser path does not load stream-json. | Patched 3.6.0 is ESM with different paths. Keep the scoped exception rather than replacing legacy requires with an incompatible package. |
| [GHSA-mjw6-4jj6-33hc](https://github.com/advisories/GHSA-mjw6-4jj6-33hc), moderate | Same stream-json 1.9.1 graph | Assembler can replace parsed-object prototypes through special keys. jayson's TCP/stream utilities use StreamValues, but those utilities are outside current PACT imports. PACT's own parsing uses native `JSON.parse`. | Same 3.6.0 compatibility constraint. Reassess immediately if a TCP server, stream parser, or new package export makes Assembler reachable. |

`npm audit` also reports propagated findings against wallet adapters, mobile packages, web3, jayson, Solflare, Metro and React Native. They derive from the five advisories above. No separate advisory was reported against Next, Playwright, esbuild, TypeScript, viem, wagmi, buffer or Noble in these audit responses.

### Reachability evidence

- Both web3 `lib/index.cjs.js` and `lib/index.browser.esm.js` import `jayson/lib/client/browser`.
- That client and `jayson/lib/generateRequest.js` call UUID v4. `jayson/lib/utils.js` imports stream-json, but the browser client does not import utils.
- Importing the compiled SDK root and server entrypoints populated Node's actual module cache with the browser jayson client and UUID modules, with no stream-json, Metro or React Native modules. This is import-path evidence, not an exhaustive dynamic proof of every possible consumer.
- The existing self-contained checkout browser bundle contains the browser jayson path and no stream-json/Assembler/Metro implementation markers.
- Solflare SDK `lib/esm/adapters/iframe.js` uses UUID v4.
- Mobile adapter package exports distinguish browser, Node, and React Native. Only the native implementations inspected require React Native. Metro's watcher uses micromatch for build filesystem patterns.

Do not accept npm's suggested web3 3.1.0 migration or Solflare 0.6.3 downgrade automatically. Compatibility risk affects transaction and wallet behavior. Review each proposed change independently and run the packaged consumer, protocol, wallet/browser and Base fallback checks relevant to it.

## Rust, Python and Solidity advisory scope

Exact-version and commit queries were sent to the [OSV public API](https://google.github.io/osv.dev/api/) on 2026-10-16. All twelve returned no matching records. OSV aggregates advisory sources including RustSec and PyPA; no matches establish only the returned feed state, not absence of vulnerabilities or a source audit.

| Ecosystem / surface | Locked versions / identity | Result and limits |
| --- | --- | --- |
| Solana program and compile-time Rust | `pinocchio` 0.9.2; `pinocchio-system` 0.3.0; `pinocchio-pubkey` 0.3.0; `five8_const` 0.1.4; `five8_core` 0.1.2; `sha2-const-stable` 0.1.0 | All six registry packages in Cargo.lock queried by exact crates.io version: zero matches. The program directly imports pinocchio and pinocchio-system; the other crates support their public-key/constants/hash implementation. No dependency versions or program code changed. |
| Local test/golden tooling, not production server | `solders` 0.29.0; `jsonalias` 0.1.1; `typing_extensions` 4.16.0 | All three pinned Python requirements queried by exact PyPI version: zero matches. Requirements are hash locked; installed solders reports 0.29.0. LiteSVM/solders local tests do not prove real-wallet signing. |
| Base fallback runtime Solidity | OpenZeppelin Contracts 5.4.0, commit `c64a1edb67b6e3f4a15cca8909c9482ad33a02b0` | Exact npm identity `@openzeppelin/contracts@5.4.0` and pinned Git commit queried: zero matches. Actual dependency checkout matches the pin. PACT production Solidity imports only `contracts/utils/ReentrancyGuard.sol`; unrelated token/governance/upgradeable modules are not part of its source graph. ReentrancyGuard itself has no further Solidity imports. |
| Base test/deployment tooling | forge-std 1.9.7, commit `77041d2ce690e692d6e03cc812b57d1ddaa4d505` | Exact commit queried: zero matches. Actual checkout matches the pin. Test.sol is used only by tests; Script.sol only by the operator-controlled deployment script. Commit-query ecosystem coverage can be incomplete; this is not a guarantee of forge-std security. |

The Solidity dependency repositories include their own npm development manifests, but PACT neither installs nor executes OpenZeppelin's Hardhat/docs toolchain or forge-std's package-development tooling. Their Solidity source pins, rather than those unused npm development graphs, define PACT's dependency surface.

Foundry, Solana platform tools, LLVM/Rust compiler binaries, solc, Node, Python and browser versions require their own toolchain security maintenance. Existing executable/archive checksums and library commit checks establish identity/integrity, not vulnerability freedom. This triage did not perform a comprehensive binary/compiler vulnerability audit, audit Phantom/Solflare extensions, or claim that OSV indexes every compiler/library issue.

## Release consequences

The scoped uncalled-surface exceptions permit continued foundation validation while their exact assumptions hold. They do not clear a commercial/Mainnet release. Before such a release, the Security and SDK maintainers must re-audit current advisory feeds, verify reachability against the release artifacts, resolve reachable findings or record an explicit release risk decision, and validate any selected updates. New native integration, custom stream processing, UUID usage or wrapper-package updates invalidate the corresponding reachability assumption even if the vulnerable leaf version is unchanged.
