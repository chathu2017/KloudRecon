# 0005 — RLS policy shape: NULLIF, per-user tables, nullable org_id

**Status:** accepted · Phase 1

- Policies use `NULLIF(current_setting('app.org_id', true), '')::uuid`. After a transaction
  ends, a custom setting reverts to `''`, and `''::uuid` raises an error; `NULLIF` makes an empty
  setting simply match nothing.
- A third setting, `app.user_id`, is set per request. `notifications` are visible by `user_id`
  only (so org members cannot read each other's notifications), and `events` by `org_id` or
  `user_id`.
- Platform Owners have `users.org_id = NULL`. Their rows, and platform-level audit/notification
  rows, are only reachable through `system_context`, which is used only in explicit system paths
  (auth lookup, onboarding, invitation acceptance, owner console, worker).
- All settings use `set_config(..., is_local => true)`, so they cannot leak across pooled
  connections. A test covers this.
