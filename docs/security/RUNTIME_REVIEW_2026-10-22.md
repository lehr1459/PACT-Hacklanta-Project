# Runtime security review — October22,2026

Baseline: `d3a350a`, branch `codex/api-first-integrations`. This is release-validation maintenance, not a new product feature or hosting approval. The previous October21 review deadline has expired; its unchanged validator correctly rejects that policy on October22. A deadline-only extension is not the correction.

## Reviewed replacement

Use **Node24.22.1 / npm11.19.1**. The [official release](https://nodejs.org/en/blog/release/v24.22.1) and [October21 advisory](https://nodejs.org/en/blog/vulnerability/october-2026-security-releases) identify this as the Node24 security update. The Windows archive, extracted executable and Linux archive pins are taken from the official release checksum list. The Windows files were downloaded and their actual SHA256 values verified; the portable install is separate from the global workstation runtime. Bundled npm reports11.19.1, so no npm or application dependency upgrade is required.

| Input | SHA256 |
| --- | --- |
| Windows x64 ZIP | `d2046d28c2c3dcd211ac5145c0bf30e2047ef9dfb306693c8c6e2eccd8b95fa5` |
| Windows x64 node.exe | `d702daa815eabbff763c7d3808e235cf031cf2ca70211b56847bc72f51e240e5` |
| Linux x64 tar.xz, official published identity | `6c172a9ab6718f7b801fb5a7bd486af2ee5e32758086a04b84fcce2aa77095e6` |
| Official Docker `node:24.22.1-bookworm-slim` index | `55fb5f5a527ea2c5c4a95f963e48ef90aa38c7b346054fdc8ee9957a2b55d205` |

The anonymous official Docker registry response was saved and hashed: its actual index bytes match `Docker-Content-Digest`. Its Linuxamd64 child is `sha256:2dd9a4f758e173b65fee15388f7706af6fb01ef50cf7a2c0538711d67a6981ae`. Registry identity inspection is not a pulled/built/running container. Local Docker is unavailable; actual Linux container execution remains required.

## Applicability to PACT

- **DNS NUL truncation, CVE-2026-105482:** callback verification uses DNS. Canonical URL/ASCII validation restricts attacker inputs, but does not justify retaining the vulnerable runtime resolver.
- **TLS hostname validation, CVE-2026-105483 /106069 /106072:** HTTPS RPC/API connections and PostgreSQL `verify-full` depend on runtime TLS verification. Retain strict canonical endpoint validation and certificate verification; patch the underlying runtime.
- **Brotli decoder, CVE-2026-111497:** native fetch/Undici may decode compressed upstream responses before PACT consumes its bounded body. No explicit application Brotli import is needed for reachability; the128KiB application reader bound is not a decoder-memory-safety mitigation.
- **HTTP pooled-client stale response, CVE-2026-105481:** concerns client agent handling, not evidence of a new inbound Fastify defect. Core hosted fetch uses Undici; transitive HTTP clients and tooling still require the corrected runtime.
- **Snapshot random-cache duplication, CVE-2026-106074:** PACT uses cryptographic randomness but starts ordinary Node processes; no custom startup snapshot or single-executable build is supported or demonstrated. Preserve that boundary.
- **Permission-model realpath bypass, CVE-2026-106073:** the Node permission model is not PACT's security boundary. Filesystem ACLs, process ownership and explicit source/mount allowlists remain required.

The release also updates bundled networking/crypto libraries and trust roots. Application npm audits do not assess those runtime components. Independent security review confirmed the patch requirement and these applicability limits. Nothing here certifies the older public deployment's actual provider runtime; its owner must inspect that separately before an approved change.

## Review and evidence boundary

The new internal maximum review date is **2026-11-05**, fourteen days after this review; it is not an announced upstream release date. Reassess earlier for any new advisory or before external hosting. The validator's expiry behavior is unchanged. The separate dependency exceptions still expire **2026-11-15** and are not extended.

Runtime and artifact-policy checks initially pass6/6 with the new pin. Full clean-checkout API/native/browser, package and release checks are recorded separately in the release-preparation report after execution. New remote CI, Docker, provider/TLS/volume/time acceptance and human wallet/device testing remain distinct gates. No push, deployment, publication or transaction is authorized by this review.
