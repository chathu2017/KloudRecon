# 0037 — Alerts: rules, channels, signed webhooks

**Context.** Plan 9.11: alert rules per org for new critical risk, attack path created, risky
change, cost anomaly, budget forecast exceeded, scan failed and secret expiring; channels in-app,
email, Microsoft Teams, Slack and a generic webhook signed with HMAC.

**Decision.**
- **Detectors** run when a scan finishes (`scan_notify.scan_finished` → `alerts.on_scan_finished`,
  in a savepoint so alert problems never fail a scan) and in the scheduler for expiring secrets
  (`schedule.send_secret_reminders`). Each produces `AlertEvent`s with a dedupe key
  (`scan:<id>`, `anomaly:<id>`, `budget:<id>:<month>`, `secret:<conn>:<date>:<threshold>`); a
  rule never sends the same key twice (checked in `alert_deliveries`).
- **No duplicate notices.** Risky changes, cost anomalies, failed scans and expiring secrets
  already send a standard in-app/email notice (Phases 2–4, governed by the user's notification
  preferences). Their default rules therefore start with no in-app/email channel and exist to
  route those events to Teams/Slack/webhooks. New critical risks, new attack paths and budget
  forecasts default to in-app + email for owners/admins. The UI says which events have a
  built-in notice.
- **Channels.** Teams (Adaptive Card, incoming webhook or Workflows URL), Slack (Block Kit),
  generic webhook (compact JSON). Integrations are a plan feature (`webhooks`, Pro+); in-app and
  email alerts work on every plan.
- **Secrets.** The webhook URL (it is a bearer credential) and the signing secret are stored in
  the SecretStore (Key Vault in production) as one JSON secret per integration; the DB keeps only
  the host for display. The signing secret (`whsec_…`) is shown once at creation.
- **Signature.** `X-KloudRecon-Signature: t=<unix>,v1=<hex HMAC-SHA256(secret, "<t>.<body>")>`
  plus `X-KloudRecon-Event` and `X-KloudRecon-Delivery` (idempotency). Receivers should reject
  timestamps older than 5 minutes; `alerts.verify_signature` is the reference implementation
  and `scripts/webhook_receiver.py` a local test endpoint.
- **SSRF.** https only (plain http to localhost only outside production), no credentials in the
  URL, the host must resolve to public addresses (checked on save and again before every
  delivery), redirects are not followed, Teams/Slack hosts are allow-listed, 10 s timeout.
- **Delivery.** Webhooks go through the worker (`notify.webhook`, queue retries with backoff).
  A failed attempt is committed as `retrying` before the job raises (so attempts and the last
  error survive the rollback) and becomes `failed` after the last attempt. "Send test" delivers
  synchronously from the API.
