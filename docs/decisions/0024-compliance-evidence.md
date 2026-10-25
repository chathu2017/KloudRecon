# 0024 — Compliance results and evidence export

**Status:** accepted · Phase 3, step 8

- Control IDs only; every title shown is our own short description (`frameworks.yaml`). Pages
  and exports say "mapped to" and carry a disclaimer that this is not an audit or certification.
- Per control: passed / failed **checks** (resource × rule evaluations of the mapped rules;
  accepted risks count as passing). A control is `failed` if any check fails, `passed` if all
  pass, `not_applicable` without resources in scope, `not_assessed` without automated checks.
  The framework percentage is the share of passed checks; the strict "controls fully passing"
  percentage is shown next to it.
- All seven frameworks are computed every scan; the plan's `frameworks` limit decides which ones
  an organization can open (chosen in Settings → Compliance; default the first N).
- Evidence export is a ZIP: README, summary CSV/PDF and one CSV + PDF per control with the
  checks and the failing resources with observed values. PDFs come from a small built-in writer
  (`reports/minipdf.py`) so exports work without a browser; Phase 5's branded reports use
  Playwright.
