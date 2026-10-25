# 0026 — Reliability, retirements, governance settings and custom rules

**Status:** accepted · Phase 3, step 10

- Retirement catalog: `rules/catalog/retirements.yaml` seeds the platform table
  `retirement_catalog` (inserted when missing, so owner edits are kept); `match` uses the rule
  condition language. Entries not re-verified against their source show a "verify" badge.
  Advisor recommendations that mention retirement or end of support are merged into the tracker.
  The owner API (`/owner/retirements`) ships now; the owner console editor page comes with the
  owner console completion in Phase 5 (plan step 5.7).
- Governance settings live in `organizations.settings.governance` (required tags, naming
  patterns per type, allowed regions and VM sizes, production detection). Defaults: tags
  env/owner/costCenter; production = env/environment tag in prod/production/prd/live, the
  subscription's production flag, or a resource group name pattern. Security SLA days live in
  `settings.security`, active frameworks in `settings.compliance`.
- Custom rules need the plan feature `custom_rules` (Pro/Enterprise). Queries must fit the
  supported KQL subset (validated on save) and return `id`. "Validate" runs the query on Azure
  for real connections, or locally on the latest inventory for the demo tenant. Each scan runs
  enabled rules; results become findings with source `custom`; errors are stored on the rule.
