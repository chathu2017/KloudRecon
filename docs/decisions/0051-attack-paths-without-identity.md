# 0051 — Attack paths that need no managed identity

Date: 2026-10-04

## Context

Attack paths were only "Internet → exposed workload → its managed identity → a role → sensitive
target" (decision 0023). A tenant whose exposed VMs have no managed identity got "No attack paths.
Nice." while two VMs had SSH open to the internet and a SQL server had a public endpoint. The
owner rightly called that misleading.

## Decision

Two more kinds of path in `security/graph.py`, scored with the same formula
(100 × √(exposure × exploitability × privilege × sensitivity), reported from 40):

- **Remote access** (`kind: remote`). A VM with a management port (SSH, RDP, WinRM, Telnet) or all
  ports open to the internet → control of the machine. If private endpoints or delegated database
  subnets in the same or a directly peered VNet lead to sensitive resources, the path continues
  through the virtual network to the most sensitive one and lists the rest (and same-subnet VMs)
  as also reachable. Exposure 1.0, privilege 0.8, sensitivity 0.7 for the machine (+0.05
  production) or 0.9 × the best private target when higher.
- **Exposed data** (`kind: data`). A sensitive data service (Key Vault, SQL, Cosmos DB, PostgreSQL,
  MySQL, Storage, Redis) reachable from the internet **and** weakly protected: anonymous access
  allowed, an allow-all firewall, or a failing rule in `WEAK_DATA_RULES` (for example the SQL
  "allow Azure services" firewall rule or password sign-in). A public endpoint that is otherwise
  well protected stays a finding, not a path. Privilege is 1.0 when no credential is needed, else
  0.6.

Identity paths are unchanged. Each stored path carries `path.kind` and `factors.kind`; the chain
is whatever nodes the kind needs (new node kind `network`), so the page, the diagram overlay, the
AI facts and reports read it without schema changes.

The page shows the kind on each path, advice per kind under "How to break it", and no longer says
"Nice." when resources are exposed but nothing scores high enough: it says how many are exposed
and links to Exposure.

## Consequences

- The demo tenant goes from 3 to 9 paths (3 identity, 1 remote, 5 exposed data).
- Existing scans keep their stored paths; the new kinds appear after the next scan (restart the
  worker first so it loads the new code).
- More paths means "new attack path" alerts on the next scan and a higher attack-path share in
  resource risk scores.
