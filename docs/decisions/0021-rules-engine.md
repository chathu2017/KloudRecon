# 0021 — Rules engine and catalog format (Phase 3)

**Status:** accepted · Phase 3, step 1

- Package `kloudrecon.rules` (plan Section 4): `engine.py`, `model.py`, `expr.py` (condition
  language), `kql.py` (Resource Graph KQL subset), `remediation.py`, `frameworks.py`,
  `catalog/*.yaml` (one file per area) and `python/` (complex checks as Python functions).
- **Declarative conditions** are a small, safe, structured language (no `eval`):
  `where` (applicability) and `fail_if`, built from `all` / `any` / `not` and leaf tests on a
  dotted path (`properties.networkAcls.defaultAction`, `[*]` for "any list item"): `equals`,
  `not_equals`, `in`, `not_in`, `exists`, `missing`, `truthy`, `falsy`, `contains`, `matches`,
  `lt`/`lte`/`gt`/`gte`, `version_lt`, `empty`/`not_empty`, `length_gt`. Paths may start with
  `ctx.` to read scan context (production flag, org settings, related data). Evidence = the values
  of the paths a rule lists (or the paths its condition read).
- Built-in YAML rules use this language (it runs on the stored snapshot, so the time machine and
  fixture tests work without Azure). A rule *may* instead carry `kql`; customer custom rules
  always do. KQL runs on Azure Resource Graph for real connections; for the demo tenant and for
  fixture tests a local evaluator (`kql.py`) handles the subset `resources | where … | project id
  | limit n` with the common operators and functions. Unsupported syntax is rejected at
  validation time with a clear message.
- **Python rules** (`rules/python/*.py`) register with `@python_rule(id=…, …)`; they receive the
  same `EvalContext` (resources by type, edges, RBAC, Defender pricings, diagnostic settings,
  Entra snapshot, exposure results, org settings) and yield hits. Their metadata (titles,
  remediation, mappings) lives in the same YAML files with `engine: python`, so every rule has a
  single catalog entry.
- **Remediation**: `portal` steps are written per rule. `cli`, `powershell`, `bicep` and
  `terraform` are written per rule or generated from a `fix.set` block (ARM property → value);
  placeholders `{name}`, `{rg}`, `{subscription}`, `{id}`, `{location}` are filled per finding.
  The **Azure Policy suggestion** is a custom definition generated from the rule (alias =
  `<ResourceType>/<property path>`), or written explicitly for non-property checks.
- **Framework mappings** carry control IDs only. Rules list `themes` (e.g. `encryption_in_transit`)
  that expand to control IDs in the seven frameworks (`frameworks.yaml`), plus explicit per-rule
  IDs (mostly CIS numbers, based on the CIS Microsoft Azure Foundations v2.x numbering, best
  effort — review when a new benchmark version ships). Every rule also maps to a Well-Architected
  checklist code (`waf`), so cost/performance rules have a mapping too. Control titles shown in
  the UI are our own short descriptions.
- **Tests**: fixtures live in `backend/tests/rules/fixtures/<area>.yaml` (`pass` and `fail`
  cases per rule; a case is a small scan context: resources + optional context data).
  `tests/rules/test_catalog.py` runs every case, and `python -m kloudrecon.cli rules-check`
  (also a CI step) fails when a rule lacks a pass case, a fail case, a framework mapping, a
  remediation or a policy suggestion.
- Severity weights for scoring: critical 90, high 70, medium 45, low 20, info 0 (plan Section 11).
