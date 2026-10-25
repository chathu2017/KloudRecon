# 0012 — Endpoints reachable before approval

**Status:** accepted · Phase 1

Plan Section 6 allows `/me`, `/onboarding` and `/health` before approval. KloudRecon also allows,
for any signed-in identity with a profile:

- `/notifications*` and `/events/stream` — account-level, scoped to the user by RLS. The
  "under review" page listens on the stream so it switches to the app the moment the owner
  approves.
- `/invitations/{token}` and `/invitations/{token}/accept` — needed before joining an org.
- `/auth/*` (dev login, auth config) and `/public/plans` (pricing page).

Everything else is a data endpoint behind `require_active_user` (active user **and** active org).
`tests/test_access_gate.py` enumerates every route from the OpenAPI document, so a new endpoint is
checked automatically: pending, rejected, suspended and profile-less identities get 403, anonymous
callers 401, and every `/owner/*` route rejects customers.
