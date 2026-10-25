# 0038 — Plans, PlanGuard, billing providers, trial expiry and grace period

**Context.** Plan Section 18 / Phase 5 step 6: plan limits enforced server-side, a billing
provider abstraction (`manual` default, Stripe/Paddle adapters), trial expiry, a 7-day grace
period on failed payment then read-only mode, and owner metrics (MRR, conversion, churn, AI cost).

**Decision.**
- **Billing state is computed, not stored** (`services/billing.py::state_of`): `trial`
  (trial_ends_at in the future), `trial_expired`, `active`, `grace` (payment failed less than
  `BILLING_GRACE_DAYS` ago), `payment_overdue`, `canceled` (provider subscription ended and its
  paid period is over). The last three and `trial_expired` are **read-only**.
- **Trials.** Approval assigns a plan plus optional trial days (Section 1.4), so a trial is "any
  plan with `trial_ends_at` set". A trial is converted when the owner clears the trial end date
  (manual billing: the customer is invoiced) or a provider subscription becomes active.
  Reminders 7/3/1 days before the end and once at the end (in-app + email to owners/admins,
  the platform owner is told too); extending a trial resets them.
- **Read-only (PlanGuard).** The access gate (`require_active_user`) rejects every write
  (POST/PUT/PATCH) of a read-only org with 403 `org_read_only`, except `/api/v1/billing/*`.
  Reads and DELETEs stay allowed: customers can always see and delete their data. The
  scheduler skips daily scans, scheduled reports and the AI digest for read-only orgs. Nothing
  is deleted. Plan limits (connections, subscriptions, scans/day, AI messages, frameworks) and
  features (custom rules, white-label, scheduled reports, webhooks) keep their existing checks;
  orgs without a plan get complete Trial defaults (the AI quota was missing).
- **Providers** (`services/billing_providers.py`): REST through httpx, no SDKs. `manual` has no
  checkout (customers send an upgrade request that notifies the platform owner); Stripe uses
  Checkout Sessions + the Billing Portal; Paddle Billing uses transactions + customer portal
  sessions. Plans map to provider prices through `plans.provider_prices`
  (`{"stripe": "price_…", "paddle": "pri_…"}`, editable in the owner plan editor).
- **Webhooks** `POST /api/v1/public/billing/{stripe|paddle}/webhook`: public path because the
  signature is the authorization (Stripe `t=,v1=` HMAC over `t.body`; Paddle `ts=;h1=` HMAC
  over `ts:body`), 5-minute replay window, stored once per provider event id
  (`billing_events`, RLS like every table with `org_id`; written in a system path) so provider
  retries are no-ops. Events are matched to the
  org by `org_id` metadata/custom data, then by subscription or customer id.
- **Secrets.** Provider API keys and webhook secrets live in the SecretStore (Key Vault in
  production), set with `python -m kloudrecon.cli billing-secret <name>` (hidden prompt); the env
  file only selects the provider.
- **Metrics** (`GET /api/v1/owner/metrics`, Owner → Business): MRR = sum of the monthly price of
  paying, non-read-only orgs (an owner can set `settings.billing.mrr` for custom Enterprise
  deals); conversion = trials converted / trials started in 90 days; churn = cancellations in 30
  days / (paying + churned); AI cost from `ai_usage`. Every plan change is recorded in
  `plan_changes` (approval, owner edit, provider event, trial expiry) for these numbers.
