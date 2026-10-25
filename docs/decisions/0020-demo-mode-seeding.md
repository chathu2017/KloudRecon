# 0020 — Demo Mode seeding

**Status:** accepted · Phase 2 (replaces the Phase 1 shell of decision 0004)

- `python -m kloudrecon.cli seed-demo` creates (idempotently) the **Contoso Demo** organization
  (Pro plan, `settings.demo=true`), a demo connection (no secret; `is_demo=true`; all three tiers
  valid) and **4 historical scans** 21, 14, 7 and 1 day(s) ago, run synchronously through the real
  scan pipeline against the synthetic tenant (decision 0013). `--reset` deletes and regenerates it.
  `scripts/dev.ps1`, `dev.sh` and `reset-db.ps1` run it after `seed-dev`.
- Outside production it also creates `demo@contoso.test` (Org Admin) and `viewer@contoso.test`
  (Viewer), both listed on the dev login page. In production no demo users are created; the public
  "View live demo" button (Phase 5) will use a read-only session into this org.
- After seeding, the demo behaves like a customer: Scan now and the daily schedule add epochs, so
  new changes keep appearing (bounded; the pattern repeats after 60 scans).
- The full Section 17 dataset lives behind the demo gateway and is checked by
  `tests/test_demo.py` and `kloudrecon.cli demo-summary`: ~590 resources (hub-spoke, AKS,
  App Services, SQL, Storage, Key Vault), misconfigurations and 3 attack-path scenarios,
  13 months of cost with seasonality + 2 anomalies, metrics for rightsizing, 90 days of Activity
  Log, Defender CVEs/alerts, Advisor, Policy, reservations, budgets, quotas and Entra ID data.
  Later phases read it through the same gateway methods they use for real tenants.
- Demo cost history is anchored at the first demo scan; the daily generator also produces days
  after the anchor, so cost pages stay filled as the demo ages.
