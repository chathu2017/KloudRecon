# 0027 — Cost import grain, partitions and the scan stages 11–15

**Status:** accepted · Phase 4, step 1

- **Grain.** The Cost Management Query API allows two groupings, so the cost stage asks for
  `ResourceId × MeterCategory` per day, once for `ActualCost` and once for `AmortizedCost`, per
  subscription and per calendar month. Resource group, location, type and tags come from the
  scan's inventory (or are parsed from the ARM ID for resources that no longer exist). The
  explorer's **service** is derived from the resource type ("Azure Kubernetes Service",
  "Storage"...), falling back to the meter category for charges without a resource
  (reservation purchases, support, Marketplace). Root-cause drill-downs therefore go
  service → resource → meter category (for example Storage → stexport → Bandwidth).
- **History.** `cost_daily` is a time series per connection, not per scan. The first scan imports
  13 calendar months; later scans re-pull from 7 days before the newest stored day, because
  late charges keep arriving. A subscription's rows are replaced only when that subscription was
  read successfully. Subscriptions whose validation found no cost access are skipped.
- **Partitions.** `cost_daily` is RANGE-partitioned by month with a DEFAULT partition.
  The application role cannot run DDL, so partitions are created by
  `kr_ensure_cost_partitions(from, to)` and dropped by `kr_drop_cost_partitions_before(cutoff)`.
  Both are SECURITY DEFINER functions owned by the migration role, with `EXECUTE` granted only to
  `kloudrecon_app`. They switch `app.system` on while they move rows out of the default
  partition (`FORCE ROW LEVEL SECURITY` also binds the owner) and restore the caller's value.
  Every partition gets RLS enabled, forced, and the tenant policy.
- **Writes.** COPY is not allowed on RLS tables, and psycopg `executemany` sends one statement
  per row. Large per-scan writes therefore use `core.db.bulk_insert`, one
  `INSERT … SELECT FROM jsonb_to_recordset(:rows)` per 20,000 rows. RLS still applies. A 13-month
  demo import (~127,000 rows) takes about 20 s locally.
- **Per-resource cost.** `resources.monthly_cost` is the last 30 days of **amortized** cost, so
  reserved VMs show what they really consume. The same numbers feed "cost of risk" and the
  inventory column.
- **Stages.** Order: … identity → cost (11) → forecast, budgets & anomalies (12) → metrics &
  rightsizing (13) → reservations & commitments (14) → quotas (15) → rules. All are optional.
  Budgets and quotas moved out of the Phase 3 `config` stage into stages 12 and 15. The artifacts
  `budgets` and `quotas` feed the rules engine, and older scans still read budgets from the
  `config` artifact. Quotas now include `Microsoft.Network` usages for regions with network
  resources.
- **Demo.** Egress is billed as its own `Bandwidth` meter category. The second anomaly is an
  export spike on `stcontosodataexport`'s Bandwidth meter. Budgets are measured month-to-date as
  of the scan (not the demo anchor). The demo serves the Cost Management Forecast API and network
  usages. Utilization profiles create rightsizing candidates (oversized build VMs, idle App
  Service plans, SQL databases, the dev AKS cluster).
