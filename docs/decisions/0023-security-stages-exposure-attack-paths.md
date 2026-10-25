# 0023 — Security scan stages, exposure engine and attack paths

**Status:** accepted · Phase 3, steps 3-6

- New optional stages after Changes: Defender & vulnerabilities, Advisor, Policy, **Service
  configuration**, Microsoft Entra ID (skipped when the Identity tier is off), Rules, Security
  graph, Risk & scores. Each stage replaces its rows for the scan and stores what later pages
  need in `scan_artifacts` (per scan, so every page supports "as of").
- "Service configuration" is an extra stage not listed in plan Section 8.3. With the Reader role
  it reads what Resource Graph does not return: SQL firewall rules and auditing, diagnostic
  settings for key resource types (capped at 600 calls per scan), Activity Log export, resource
  locks, Azure Backup protected items, budgets, compute quotas (plan stage 15, needed now for
  the quotas page) and Key Vault key/secret **metadata** (names, expiry, rotation; never values).
- Exposure engine: NIC public IPs with subnet then NIC NSG in priority order including the
  default rules (both must allow); Standard public IPs are closed without an NSG, Basic ones are
  open; public load balancers (to backend VMs), Application Gateway listeners, Azure Firewall
  DNAT, and PaaS public endpoints. Sources count as internet unless RFC 1918 / CGNAT / loopback /
  link-local (documentation ranges count as internet).
- Attack paths: entry points are internet-exposed compute (VMs, web/function apps, public AKS API
  servers, container apps); path = entry → managed identity → role assignment → most sensitive
  target in scope (others listed as "also reachable"). Score = 100 × √(exposure ×
  exploitability × privilege × sensitivity), factors documented in `security/graph.py`. Only
  paths scoring ≥ 40 are reported: well-configured apps with narrow data roles (about 35 in the
  demo) stay out of the list but still show in their blast radius.
- Toxic combinations are six predefined patterns (exposed + exploitable CVE + privileged
  identity, public storage without logs, open SQL without auditing, weak public app with a data
  identity, public vault without purge protection, privileged user without MFA and no MFA
  policy), stored as findings with source `toxic`.
- The demo tenant was extended: diagnostic settings, contacts, locks, SQL auditing, Key Vault
  metadata, backup items, a hub flow log, hardened production storage and disks, real Graph
  permission IDs, credential start dates, and one-time fixes at epochs 2 and 3 so findings
  resolve on rescan. The three scenario attack paths score about 90 / 82 / 53.
