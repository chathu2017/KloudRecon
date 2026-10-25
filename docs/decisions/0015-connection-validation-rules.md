# 0015 — Connection validation: status rules, budget and secret naming

**Status:** accepted · Phase 2

- Checks (plan 7.4): sign in, subscriptions in scope, effective permissions, Resource Graph,
  Cost Management (7 days), Defender secure score, Graph permissions (Identity tier),
  reservations (Commitments tier).
- `invalid` when sign-in, subscriptions, read permission or Resource Graph fails.
  `partially_valid` when any other check warns/fails, including **write access detected** (the
  app works, but we warn to remove the extra role). `valid` otherwise. A scan is queued for
  `valid` and `partially_valid`.
- Budget 24 s. Permissions are checked on the first 5 subscriptions, cost on the first 3; the scan
  checks the rest. Checks that do not fit the budget are `skip` with a clear message.
- A connection is saved even when validation fails, so the customer can fix one field
  (Replace secret / edit IDs) and validate again without re-entering everything.
- The secret lives in the SecretStore under `kr-conn-<connection id>` with the expiry date. It is a
  pydantic `SecretStr` in requests, never part of any response model, event, job, audit entry or
  log. A value that looks like a GUID is rejected up front ("you copied the secret ID").
- The check key for sign-in is `sign_in` (a key named `token` would be masked by log redaction).
