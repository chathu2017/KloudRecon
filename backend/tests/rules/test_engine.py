"""Rules engine building blocks: condition language, KQL subset, remediation, harness."""

from __future__ import annotations

from datetime import UTC, datetime

import pytest

from kloudrecon.rules import expr, kql, remediation
from kloudrecon.rules.context import EvalContext
from kloudrecon.rules.engine import evaluate_rule, load_catalog
from kloudrecon.rules.frameworks import expand, load
from kloudrecon.rules.model import Rule
from kloudrecon.rules.testing import Case, make_resource, run_case

NOW = datetime(2026, 9, 1, tzinfo=UTC)


def _ev(target: dict[str, object], facts: dict[str, object] | None = None) -> expr.Evaluator:
    return expr.Evaluator(target, lambda n: (facts or {}).get(n, expr.MISSING), NOW)


def test_paths_and_wildcards() -> None:
    t = {"properties": {"rules": [{"port": "22"}, {"port": "443"}], "Mixed": {"Case": 1}}}
    assert expr.get_values(t, "properties.rules[*].port") == ["22", "443"]
    assert expr.get_value(t, "properties.rules[1].port") == "443"
    assert expr.get_value(t, "properties.mixed.case") == 1
    assert expr.get_value(t, "properties.nope") is expr.MISSING
    ev = _ev(t)
    assert ev.test({"path": "properties.rules[*].port", "equals": "22"})
    assert not ev.test({"path": "properties.rules[*].port", "not_equals": "22"})
    assert ev.test({"path": "properties.rules[*].port", "not_in": ["80"]})


@pytest.mark.parametrize(
    ("cond", "expected"),
    [
        ({"path": "a", "equals": "TLS1_2"}, True),
        ({"path": "a", "equals": "tls1_2"}, True),
        ({"path": "b", "equals": False}, True),
        ({"path": "b", "equals": "false"}, True),
        ({"path": "missing", "not_equals": "x"}, True),
        ({"path": "missing", "equals": "x"}, False),
        ({"path": "a", "version_lt": "1.2"}, False),
        ({"path": "v", "version_lt": "1.2"}, True),
        ({"path": "n", "gt": 5}, True),
        ({"path": "n", "lt": "x"}, False),
        ({"path": "l", "empty": True}, True),
        ({"path": "l", "not_empty": True}, False),
        ({"path": "a", "matches": "^tls"}, True),
        ({"path": "d", "older_than_days": 90}, True),
        ({"path": "missing", "falsy": True}, True),
        ({"path": "s", "truthy": True}, False),
        ({"path": "tags", "contains": "ENV"}, True),
        ({"all": [{"path": "n", "gt": 1}, {"not": {"path": "b", "truthy": True}}]}, True),
        ({"any": [{"path": "n", "lt": 1}, {"path": "a", "in": ["x", "TLS1_2"]}]}, True),
    ],
)
def test_operators(cond: dict[str, object], expected: bool) -> None:
    t = {
        "a": "TLS1_2",
        "b": False,
        "v": "1.0",
        "n": 10,
        "l": [],
        "s": "Disabled",
        "d": "2025-01-01T00:00:00Z",
        "tags": {"env": "prod"},
    }
    expr.validate(cond)
    assert _ev(t).test(cond) is expected


def test_ctx_facts() -> None:
    ev = _ev({}, {"production": True, "sql": {"firewallRules": [{"name": "x"}]}})
    assert ev.test({"path": "ctx.production", "truthy": True})
    assert ev.test({"path": "ctx.sql.firewallRules[*].name", "equals": "x"})
    assert ev.test({"path": "ctx.unknown", "missing": True})


@pytest.mark.parametrize(
    "bad",
    [
        {},
        {"all": []},
        {"path": "a"},
        {"path": "a", "equals": 1, "in": [1]},
        {"path": "a", "bogus": 1},
        {"path": "a", "in": "x"},
        {"path": "a", "matches": "("},
        {"all": [{"path": "a", "equals": 1}], "any": []},
    ],
)
def test_invalid_conditions(bad: dict[str, object]) -> None:
    with pytest.raises(expr.ConditionError):
        expr.validate(bad)


ROWS = [
    {
        "id": "/s/1",
        "name": "stpublic",
        "type": "microsoft.storage/storageaccounts",
        "tags": {"env": "prod"},
        "properties": {"allowBlobPublicAccess": True, "minimumTlsVersion": "TLS1_0", "n": 3},
    },
    {
        "id": "/s/2",
        "name": "stprivate",
        "type": "microsoft.storage/storageaccounts",
        "tags": {},
        "properties": {"allowBlobPublicAccess": False, "minimumTlsVersion": "TLS1_2", "n": 1},
    },
    {"id": "/v/1", "name": "vm1", "type": "microsoft.compute/virtualmachines", "properties": {}},
]


@pytest.mark.parametrize(
    ("query", "ids"),
    [
        (
            "resources | where type =~ 'Microsoft.Storage/storageAccounts' | project id",
            ["/s/1", "/s/2"],
        ),
        ("resources | where properties.allowBlobPublicAccess == true | project id", ["/s/1"]),
        ("resources | where tobool(properties.allowBlobPublicAccess) | project id", ["/s/1"]),
        (
            "resources | where properties.minimumTlsVersion != 'TLS1_2' "
            "and type contains 'storage'",
            ["/s/1"],
        ),
        ("resources | where tags['env'] =~ 'PROD' or name == 'vm1'", ["/s/1", "/v/1"]),
        ("resources | where name in~ ('STPRIVATE', 'x')", ["/s/2"]),
        ("resources | where name !in ('stprivate') | where type has 'storageAccounts'", ["/s/1"]),
        ("resources | where toint(properties.n) >= 2", ["/s/1"]),
        ("resources | where isnull(properties.n)", ["/v/1"]),
        ("resources | where name startswith 'st' | take 1", ["/s/1"]),
        ("resources | where not(name endswith 'vm1') and isnotempty(tags)", ["/s/1"]),
        (
            "Resources | where properties['minimumTlsVersion'] !~ 'tls1_2' | project id, n = name",
            ["/s/1", "/v/1"],
        ),
    ],
)
def test_kql_subset(query: str, ids: list[str]) -> None:
    assert [r["id"] for r in kql.run(query, ROWS)] == ids


@pytest.mark.parametrize(
    ("query", "message"),
    [
        ("securityresources | where 1 == 1", "must start with `resources`"),
        ("resources | summarize count()", "not supported"),
        ("resources | where name == ", "Unexpected"),
        ("resources | where foo(name)", "not supported"),
        ("resources | project name", "must return the `id`"),
        ("resources | where name == 'x' ;", "Unexpected character"),
    ],
)
def test_kql_errors(query: str, message: str) -> None:
    with pytest.raises(kql.KqlError, match=message):
        kql.parse(query)


RULE = Rule.model_validate(
    {
        "id": "test-storage-tls",
        "title": "Storage requires old TLS",
        "description": "Test rule.",
        "area": "storage",
        "category": "Data protection",
        "pillar": "security",
        "severity": "high",
        "resource_types": ["Microsoft.Storage/storageAccounts"],
        "fail_if": {"path": "properties.minimumTlsVersion", "not_equals": "TLS1_2"},
        "remediation": {"portal": ["Open {name} in {rg}."]},
        "fix": {
            "set": {"properties.minimumTlsVersion": "TLS1_2"},
            "terraform": {
                "resource": "azurerm_storage_account",
                "set": {"min_tls_version": '"TLS1_2"'},
            },
        },
        "policy": {"name": "Storage accounts require TLS 1.2", "effect": "Deny"},
        "themes": ["encryption_in_transit"],
        "frameworks": {"cis": ["3.15"]},
    }
)


def test_engine_evaluates_and_collects_evidence() -> None:
    ctx = EvalContext(resources=[dict(r) for r in ROWS], now=NOW)
    out = evaluate_rule(RULE, ctx)
    assert out.evaluated == 2
    assert [h.resource_name for h in out.hits] == ["stpublic"]
    assert out.hits[0].evidence == {"properties.minimumTlsVersion": "TLS1_0"}


def test_kql_rule_and_precomputed_results() -> None:
    rule = RULE.model_copy(
        update={
            "engine": "kql",
            "kql": "resources | where properties.allowBlobPublicAccess == true | project id",
        }
    )
    ctx = EvalContext(resources=[dict(r) for r in ROWS], now=NOW)
    assert [h.resource_name for h in evaluate_rule(rule, ctx).hits] == ["stpublic"]
    ctx.kql_results[rule.id] = {"/s/2"}
    assert [h.resource_name for h in evaluate_rule(rule, ctx).hits] == ["stprivate"]


def test_broken_rule_is_isolated() -> None:
    rule = RULE.model_copy(update={"fail_if": {"path": "name", "matches": "("}})
    out = evaluate_rule(rule, EvalContext(resources=[dict(r) for r in ROWS], now=NOW))
    assert out.error
    assert not out.hits


def test_remediation_formats_are_generated() -> None:
    target = make_resource("microsoft.storage/storageaccounts", {"name": "stx"})
    rendered = remediation.render(RULE, target)
    assert rendered["portal"] == ["Open stx in rg-test."]
    assert "az resource update --ids" in rendered["cli"]
    assert "minimumTlsVersion=TLS1_2" in rendered["cli"]
    assert "$r.Properties.minimumTlsVersion" in rendered["powershell"]
    assert "Microsoft.Storage/storageAccounts@" in rendered["bicep"]
    assert "minimumTlsVersion: 'TLS1_2'" in rendered["bicep"]
    assert 'min_tls_version = "TLS1_2"' in rendered["terraform"]
    policy = rendered["policy"]["definition"]["properties"]
    assert policy["parameters"]["effect"]["defaultValue"] == "Deny"
    cond = policy["policyRule"]["if"]["allOf"]
    assert cond[1] == {
        "field": "Microsoft.Storage/storageAccounts/minimumTlsVersion",
        "notEquals": "TLS1_2",
    }
    assert remediation.missing_formats(RULE) == []


def test_framework_expansion_uses_ids_with_own_titles() -> None:
    mapping = expand(["encryption_in_transit"], {"cis": ["3.15"]})
    assert mapping["cis"] == ["3.15"]
    assert "SC-8" in mapping["nist80053"]
    data = load()
    for fw, ids in mapping.items():
        for cid in ids:
            assert data.control_title(fw, cid) != cid
    with pytest.raises(ValueError, match="unknown theme"):
        expand(["nope"], {})


def test_harness_reports_failures() -> None:
    ok = Case("test-storage-tls", "fail", 0, {"properties": {"minimumTlsVersion": "TLS1_0"}})
    assert run_case(RULE, ok) is None
    wrong = Case("test-storage-tls", "pass", 0, {"properties": {"minimumTlsVersion": "TLS1_0"}})
    assert "expected no finding" in (run_case(RULE, wrong) or "")
    unmatched = Case("test-storage-tls", "pass", 0, {"type": "microsoft.web/sites"})
    assert "nothing was evaluated" in (run_case(RULE, unmatched) or "")


def test_catalog_loads() -> None:
    catalog = load_catalog()
    for rule_id, rule in catalog.rules.items():
        assert rule.id == rule_id
        assert catalog.mappings[rule_id]
