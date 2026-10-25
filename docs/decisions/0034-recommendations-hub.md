# 0034 — Recommendations hub: priority formula and workflow storage

**Context.** Plan 9.8 asks for one backlog from rules, Advisor, Defender, Policy, rightsizing,
waste and commitments, prioritized by "impact × confidence ÷ effort", with a Kanban workflow.

**Decision.**
- The hub is computed on request from existing data (`services/recommendations.py`); no copy of
  findings is stored. Sources: open/in-progress/accepted-risk findings plus findings resolved in
  the last 30 days (the "Done" column), rightsizing rows, waste items that are not findings
  (log retention, storage tiering) and commitment recommendations.
- **Impact** (0–100) = the larger of the risk score and a savings impact
  `25 × log10(1 + monthly saving)` (≈50 at $99/month, 75 at $999, capped at 100), plus a quarter of
  the smaller when an item has both. Cost-pillar findings count at most 20 risk points, so their
  money drives them.
- **Confidence**: rules, toxic combinations, Defender and Policy = high (1.0); Advisor and custom
  rules = medium (0.75); rightsizing = its own confidence; waste and commitments = medium.
- **Effort**: low 1.0, medium 1.5, high 2.5 (rule effort, else medium). Rightsizing and
  commitments are medium; waste clean-ups are low.
- **Bands**: P1 ≥ 60, P2 ≥ 35, P3 ≥ 15, else P4.
- 1-year and 3-year options of the same commitment are alternatives: the hub keeps the larger
  saving. The headline counts the best saving per resource, so overlapping recommendations on
  one VM are not added twice.
- **Workflow**: findings keep their own workflow (status, assignee, due date, comments, risk
  exceptions). Hub status maps open→open, in progress→in progress, done→resolved; "dismissed"
  for a finding is refused with a pointer to the exception workflow. Other sources store their
  workflow in `recommendation_states` / `recommendation_comments` keyed by a stable hub ref
  (`rs-`, `w-`, `c-` + 16 hex of SHA-1 of the source ref; `f-<uuid>` for findings).
- Marking a savings recommendation **done** starts measuring it in the savings tracker.
- Tickets ("Copy as ticket") are generated server-side in Jira wiki markup or Azure DevOps
  Markdown, with remediation steps from the rule catalog. CSV cells that start with `= + - @` are
  prefixed with `'` (formula injection).
