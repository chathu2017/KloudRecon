# 0016 — Plan limits for connections, subscriptions and scans

**Status:** accepted · Phase 2

- `connections`: counts non-demo connections of the org; creating one more returns
  403 `plan_limit`.
- `subscriptions`: counts **enabled** subscriptions across the org. Newly discovered subscriptions
  beyond the limit are stored but disabled with reason "Plan limit reached"; enabling one checks
  the limit again.
- `scans_per_day`: counts manual "Scan now" requests in the last 24 h (first scans after
  validation and scheduled daily scans do not count). Independently, "Scan now" is limited to
  once per 15 minutes per connection (plan 8.2).
- Orgs without a plan get the Trial limits.
