# 0017 — Scan pipeline shape (Phase 2)

**Status:** accepted · Phase 2

- Phase 2 runs 7 stages: authenticate, subscriptions & MGs, inventory, relationships, RBAC,
  changes, finalize. Later phases insert their stages before `finalize`; the progress drawer lists
  only stages that exist (no "coming soon" rows).
- RBAC and Changes are **optional**: if they fail the scan is `partial` and the reason is stored
  in `scans.error.partial`. If the Activity Log cannot be read, the snapshot diff is still saved and
  the Changes stage fails (so the customer sees that callers are missing).
- Each scan keeps its own inventory copy (`resources`, `resource_groups`, `resource_edges`,
  `rbac_assignments`); this is the time machine. `arm_id` is stored lower-case.
- Diffs compare a content hash that ignores volatile keys (etag, provisioningState, instance view /
  power state, timestamps). Field diffs match list items by `name` (NSG rules, subnets...).
- Activity Log: 90 days on the first scan; later scans read from the previous scan's start minus
  one hour. Events are de-duplicated by `eventDataId` (unique per connection). A snapshot change
  takes the caller of the newest matching event not stored before; other events become
  `activity_log` rows. Read operations and most `/action` operations are ignored.
- Relationships are derived from stored properties (no extra Azure calls). Subnet references
  point at the VNet with `attrs.subnet`.
- Locking: a session-level advisory lock per connection; if it is taken, or the organization
  already runs 2 scans, the job is **deferred** 60 s without using up an attempt
  (`JobDeferred`). Scan jobs have 2 attempts; a crash on the last attempt marks the scan failed.
- Stage code writes with `set_tenant(org_id)`, so RLS applies inside the worker too.
- Raw Resource Graph output is archived gzip-compressed to Blob
  `snapshots/<org>/<connection>/<scan>/inventory.json.gz`; if Blob is down the scan continues.
