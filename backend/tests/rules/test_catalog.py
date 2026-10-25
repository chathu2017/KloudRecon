"""Every rule in the catalog: pass/fail fixtures, mappings, remediation (plan Section 10.1)."""

from __future__ import annotations

from pathlib import Path

import pytest

from kloudrecon.rules.engine import load_catalog
from kloudrecon.rules.testing import all_cases, check_catalog, load_fixtures, run_case

FIXTURES = Path(__file__).parent / "fixtures"
CASES = all_cases(load_fixtures(FIXTURES))


@pytest.mark.parametrize("case", CASES, ids=[c.label for c in CASES])
def test_fixture_case(case: object) -> None:
    catalog = load_catalog()
    rule = catalog.get(case.rule_id)  # type: ignore[attr-defined]
    assert rule is not None, f"fixture for unknown rule {case.rule_id}"  # type: ignore[attr-defined]
    assert run_case(rule, case) is None  # type: ignore[arg-type]


def test_catalog_is_complete() -> None:
    """The CI gate: tests, mappings, remediation in 5 formats, policy, minimum counts."""
    problems = check_catalog(
        FIXTURES, require_counts=False
    )  # counts gate enabled with the last batch
    assert problems == [], "\n".join(problems)
