# 0039 — Owner console: health, announcements, flags, templates, read-only org view

**Context.** Plan 9.13 / Phase 5 step 7: system health (VM stats, DB size, queue depth, dead
jobs with retry, scan duration by stage, Azure throttling, AI errors), announcements banner,
feature flags, an email template editor limited to a safe subset, the retirement catalog editor
and an audited read-only view of a customer organization.

**Decision.**
- **Health** (`GET /owner/health`, Owner → Health) is computed on request: the API process
  host via `psutil` (CPU, memory, disks for `/` and `/var/lib/postgresql` when present), DB size,
  jobs by status and type, the 50 newest dead jobs (errors passed through the log redactor) with
  the existing retry endpoint, worker heartbeats (stale after 3 minutes), 7-day scan counts,
  average/P95 duration per stage from `scan_stage_logs`, Azure requests and 429s from
  `scans.stats.azure`, AI calls, errors and latency from `ai_usage`. Azure Monitor alerts on the
  worker heartbeat stay the paging mechanism (infra guide A12).
- **Announcements**, **feature flags** and **email template overrides** are platform tables
  (migration 0012, no RLS — only the owner writes them; like `plans`). Customers read active
  announcements (`GET /announcements`, dismissible per browser) and the flags that apply to
  their org (`GET /features`). A flag is on when enabled and its org list is empty or contains
  the org; unknown flags fall back to code defaults (`ai_chat`, `public_demo`). `ai_chat` gates
  the Ask KloudRecon chat (button and API).
- **Email templates (safe subset).** Layout, links and data stay in code. The owner can replace
  the subject and add an intro paragraph per template, as plain text (angle brackets refused)
  with two placeholders, `{org_name}` and `{app_url}`; the result is HTML-escaped. The preview
  renders sample data in a sandboxed iframe.
- **Read-only org view.** `POST /owner/orgs/{id}/view` returns a signed 30-minute grant (HMAC
  with the platform signing key, bound to the owner's user id) and writes `org.viewed_as_owner`
  to the audit log, visible in the customer's audit log too. The SPA keeps it in
  sessionStorage (one tab) and sends `X-KloudRecon-View-As`; the API then answers as a
  transient `viewer` of that organization (tenant set to it, RLS applies) and rejects every
  write with 403 `view_as_read_only`. A dark banner with "Exit view" is always visible.
- The retirement catalog editor uses the existing `/owner/retirements` API.
