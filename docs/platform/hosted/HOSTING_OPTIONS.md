# Portable staging infrastructure options

Prepared October 23, 2026. These are planning estimates, not purchases, reservations or account configuration. No provider or domain has been selected. Use an entirely separate VM/project, IP, DNS hostname, PostgreSQL database/roles, secrets, certificates and monitoring from the existing PACT public deployment. Do not connect the old Vercel project, change its domain, or attach PACT to Supabase as a shortcut.

## Capacity and provider recommendation

Target **Linux x86-64**, a maintained distribution with Docker Engine and Compose v2, persistent SSD storage, reliable wall clock/NTP, and outbound HTTPS. This is a single-host development/pilot topology, not high availability. An initial **2 vCPU, 4 GB RAM, 80 GB SSD** VM is a reasonable low-traffic rehearsal estimate; **4 vCPU, 8 GB RAM** is preferred when compiling Next.js on that VM and retaining local database backups/images. Measure build memory, request latency, SQL/clock fsync latency and free storage before the pilot. The four runtime limits total approximately 3 GB before the OS, Docker and build processes. Build sequentially/offline from public ingress, or use a separate private build machine if 4 GB is insufficient; do not add replicas to solve memory pressure.

| Option | Published reference price | Planning implication |
| --- | --- | --- |
| DigitalOcean Basic, regular CPU | 2 vCPU / 4 GiB / 80 GiB: **US$24/month**; 4 vCPU / 8 GiB / 160 GiB: **US$48/month** | Recommended for straightforward setup and a predictable initial budget. Daily percentage backups add 30%, weekly 20%. |
| Hetzner cost-optimized x86 CX | EU CX23: **€5.49/month**, CX33: **€8.49/month**, excluding IPv4 and VAT in the June 2026 adjustment | Lower VM cost; owner must confirm current regional capacity, CPU architecture, exact disk/RAM, IPv4, backups, taxes and support needs at checkout. Do not select ARM CAX for this x86-64 validation recipe. |

Prices were checked against [DigitalOcean Droplets](https://www.digitalocean.com/pricing/droplets), [DigitalOcean backups](https://www.digitalocean.com/pricing/backups), and [Hetzner's June 2026 price adjustment](https://docs.hetzner.com/general/infrastructure-and-availability/price-adjustment/). Verify again before purchase; region, tax and plan availability change.

For the DigitalOcean 4 GB example, daily VM backups yield **$31.20/month** for compute plus that backup option. Reserve an additional **$5–15/month** as an estimate for encrypted off-host logical backups/monitoring and **$10–25/year** for a domain if one is needed. A practical planning budget is roughly **$40–55/month** before paid RPC usage, tax or operator time. The 8 GB example is **$62.40/month** with daily VM backups, before those extras. Extra-cost estimates are budgeting assumptions, not provider quotations. A subdomain of an owner-controlled domain may avoid another registration. Public Devnet RPC has no availability promise for this pilot; approve endpoint quotas and a distinct fallback or budget for a suitable provider.

VM snapshots are supplemental. They do not replace PostgreSQL logical recovery, off-host encryption or the PACT restore quarantine/rekey procedure. Hetzner explicitly [excludes attached Volumes from VM backups/snapshots](https://docs.hetzner.com/cloud/servers/backups-snapshots/overview/). Check volume coverage with any provider. Never restore a VM snapshot directly behind live authentication ingress with old pepper/clock credentials.

## Required decisions before provisioning

Owner approves provider/account/region, monthly ceiling, SSH administrator, on-call/recovery contact and a distinct staging hostname. Select data residency, privacy/retention terms, backup encryption/key custody and expiration, and an initial recovery objective. Proposed rehearsal targets are daily logical backups (**RPO ≤24 hours**) and a measured isolated restore rehearsal (**RTO target ≤4 hours**); neither is an achieved service promise. Purchase/provisioning, public ingress and any real-wallet transactions require separate explicit authorization.

Use PostgreSQL **18.4** for the version already validated by this branch. The included Compose service supports loopback TLS on the same VM. A managed PostgreSQL alternative requires a new reviewed topology/configuration and actual certificate, role and recovery verification; do not silently replace it with Supabase or disable certificate validation. The [owner setup checklist](STAGING_OWNER_SETUP.md) defines certificates, roles, migrations, backups, logs, health and restart custody. [Phantom acceptance](PHANTOM_ACCEPTANCE.md) remains manual and separately authorized.
