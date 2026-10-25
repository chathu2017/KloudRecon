# 0018 — Scan notifications, daily schedule and secret reminders

**Status:** accepted · Phase 2

- **Daily scan:** one organization-wide setting (`organizations.settings.daily_scan_enabled`,
  `scan_hour_utc`, default on at 02:00 UTC), edited on any connection page by admins
  (`PUT /org/settings/scans`). The 5-minute scheduler tick queues one `scheduled` scan per
  connection when the UTC hour matches, skipping connections scanned in the last 6 hours or
  already scanning. The demo connection is scheduled like any other, so the public demo stays
  fresh.
- **Who is notified:** failures → owners/admins + requester; first scan → owners/admins +
  requester; manual scan → requester (in-app only); risky changes → owners/admins. Email follows
  user preferences `email_scans` and `email_security` (default on).
- **Secret reminders:** 30/14/7/1 days before expiry and once after it expired, in-app + email to
  owners/admins. Sent thresholds are stored on the connection; if the scheduler starts late only
  the nearest reminder is sent. Replacing the secret or changing the expiry resets them.
- **Retention:** scans older than 90 days are deleted (with their snapshot rows), keeping each
  connection's newest 3; change history rows survive with `scan_id` NULL.
- **UI:** a top-bar control shows freshness, live progress and Scan now; the progress drawer shows
  the stage checklist from `GET /scans/{id}`, refreshed by `scan.progress` SSE events (queries
  also poll every 10 s while a scan is active, as a fallback).
