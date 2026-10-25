# 0019 — Inventory scope, time machine, orphans and exports

**Status:** accepted · Phase 2

- "Latest" inventory = the newest finished scan (succeeded or partial) of **each** connection.
  Choosing a scan in the top-bar "as of" selector shows that one scan (the time machine); every
  data endpoint takes an optional `scan_id`.
- Lists use keyset pagination (`cursor` = last sort value + row id). The inventory table is
  virtualized with `@tanstack/react-virtual` (TanStack family, like TanStack Query) and loads
  pages of 200 as you scroll.
- Filters: text (name, type, resource group, ID), type, subscription, resource group, location,
  tag (`key` or `key=value`). The resource drawer is addressed by `?resource=<arm id>`, so any
  page (Changes, Compare, Ctrl/Cmd+K search) can open it.
- Cost (30 days), findings and risk columns arrive with Phases 3–4; the Phase 2 table shows what
  exists (SKU/size, tags) rather than empty columns.
- Orphaned/unused resources are pure rules over stored properties (unattached disks, unused
  public IPs/NICs/NSGs/route tables, empty load balancers and App Service plans, snapshots older
  than 90 days, deallocated VMs, empty availability sets, unlinked private DNS zones, empty
  resource groups). AKS-managed load balancers are excluded. Savings estimates come with FinOps.
- Export: CSV (UTF-8 with BOM for Excel) and XLSX via `openpyxl`, up to 100,000 rows, filtered
  like the table, audited as `inventory.exported`. Cells starting with `= + - @` are prefixed with
  `'` to prevent spreadsheet formula injection.
- Compare: two finished scans of the same connection; lists are capped at 500 added/removed and
  300 changed (with field diffs), flagged `truncated`.
