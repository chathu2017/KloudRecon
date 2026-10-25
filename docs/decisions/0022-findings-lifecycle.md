# 0022 — Findings lifecycle and workflow (Phase 3)

**Status:** accepted · Phase 3, steps 3 and 9

- The plan's single `findings` table is split in two: `findings` holds one row per issue
  (connection + rule + resource) with its workflow state (status, assignee, due date, SLA,
  exception, comments), and `finding_occurrences` records which scans saw it (severity, risk and
  status at that scan). Workflow survives rescans; the time machine and trends read occurrences.
- Statuses: `open` → `in_progress` → `resolved`; `accepted_risk` only through an approved
  exception. A finding of a source that ran successfully but was not seen is resolved
  automatically ("fixed or removed"); a rule that errored does not resolve its findings. A
  resolved finding seen again reopens (`reopened_count`). Manual "resolved" is allowed and is
  confirmed (or reopened) by the next scan. System events are kept as comments.
- Exceptions need a reason and an expiry (at most 365 days) and cover one resource or the whole
  rule. Members request them (`pending`); Org Admins/Owners approve or reject, and their own
  requests are approved immediately (they are the approvers). Expired or revoked exceptions put
  findings back to `open`. Every decision is audited.
- SLA by severity (defaults critical 7, high 30, medium 90, low 180 days; editable in Settings →
  Security) sets `due_at` when a finding is first seen or reopens. MTTR = mean of
  `resolved_at − first_seen` per severity.
- Sources: `rule` (catalog), `custom` (KQL), `defender` (unhealthy assessments), `advisor`,
  `toxic` (combinations). Azure Policy non-compliance is summarised per subscription by the
  `gov-policy-noncompliant` rule rather than one finding per assignment.
- Finding lists use offset pagination (sorted by risk, heavily filtered, total shown), unlike the
  cursor-based inventory.
