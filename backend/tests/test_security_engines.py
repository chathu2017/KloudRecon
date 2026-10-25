"""Exposure engine, security graph, toxic combinations, risk and scores (pure Python)."""

from __future__ import annotations

from datetime import UTC, datetime
from functools import lru_cache
from typing import Any

import pytest

from kloudrecon.rules.context import EvalContext
from kloudrecon.rules.testing import make_resource
from kloudrecon.security import entra as ent
from kloudrecon.security import risk
from kloudrecon.security.exposure import compute
from kloudrecon.security.graph import SecurityGraph, privilege
from kloudrecon.security.toxic import detect
from kloudrecon.services.azure.demo import signals
from kloudrecon.services.azure.demo.gateway import DemoAzureGateway
from kloudrecon.services.azure.demo.identity import Directory
from kloudrecon.services.azure.demo.world import SUBSCRIPTIONS, world_at
from kloudrecon.services.scan.relationships import managed_identity_names
from kloudrecon.services.scan.stages import _role_info, normalize

NOW = datetime(2026, 9, 20, tzinfo=UTC)


@pytest.fixture(scope="module", autouse=True)
def _database() -> None:  # pure tests: no DB setup needed
    return None


@pytest.fixture(autouse=True)
def _clean_tables() -> None:
    return None


def _rbac(w: Any) -> list[dict[str, Any]]:
    roles = _role_info(w.role_definitions)
    names = managed_identity_names(w.rows())
    out = []
    for a in w.role_assignments.values():
        p = a["properties"]
        guid = p["roleDefinitionId"].rsplit("/", 1)[-1].lower()
        name, custom, priv = roles[guid]
        scope = p["scope"].lower()
        out.append(
            {
                "assignment_id": a["id"].lower(),
                "principal_id": p["principalId"].lower(),
                "principal_type": p["principalType"],
                "principal_name": names.get(p["principalId"].lower()),
                "role_name": name,
                "role_def_id": guid,
                "scope": scope,
                "subscription_id": scope.split("/")[2]
                if scope.startswith("/subscriptions/")
                else None,
                "is_privileged": priv,
                "is_custom": custom,
            }
        )
    return out


@lru_cache(maxsize=1)
def demo() -> tuple[EvalContext, list[dict[str, Any]]]:
    w = world_at(3)
    plans = {
        s.id.lower(): {p["name"]: p["properties"]["pricingTier"] for p in signals.pricings(k)}
        for k, s in SUBSCRIPTIONS.items()
    }
    vulns = [
        {
            "arm_id": sa["properties"]["resourceDetails"]["id"].lower(),
            "cvss": sa["properties"]["additionalData"]["cvss"]["3.0"]["base"],
            "exploitable": sa["properties"]["additionalData"]["exploitable"],
        }
        for k in SUBSCRIPTIONS
        for sa in signals.sub_assessments(w, k)
    ]
    raw = Directory(w, NOW)
    entra = ent.normalize(
        {
            "users": raw.users,
            "registration": raw.registration,
            "groups": raw.groups,
            "applications": raw.apps,
            "service_principals": raw.service_principals,
            "role_assignments": raw.role_assignments,
            "role_definitions": raw.get("roleManagement/directory/roleDefinitions")["value"],
            "ca_policies": raw.ca_policies,
            "security_defaults": raw.get("policies/identitySecurityDefaultsEnforcementPolicy"),
            "authorization_policy": raw.get("policies/authorizationPolicy"),
            "organization": raw.get("organization")["value"],
        }
    )
    ctx = EvalContext(
        resources=[normalize(r) for r in w.rows()],
        rbac=_rbac(w),
        defender_plans=plans,
        sql=dict(w.extra.items()),
        entra=entra,
        now=NOW,
    )
    return ctx, vulns


def _names(items: dict[str, Any]) -> dict[str, Any]:
    return {i.resource["name"]: i for i in items.values()}


def test_exposure_on_demo_tenant() -> None:
    ctx, _ = demo()
    items = _names(compute(ctx))
    jump = items["vm-prod-jumpbox01"]
    assert jump.kind == "vm"
    assert jump.severity == "critical"
    assert [p["port"] for p in jump.ports] == [3389]
    assert "allow-rdp-anywhere" in jump.ports[0]["rule"]
    assert jump.path[0]["id"] == "internet"
    assert items["aks-contoso-dev"].kind == "aks-api"
    assert "aks-contoso-prod" not in items  # private cluster
    assert items["sql-contoso-dev"].notes == ["allow-all firewall"]
    assert "sql-contoso-prod" not in items  # public access disabled
    assert 80 in [p["port"] for p in items["app-contoso-legacy-portal"].ports]
    assert "vm-dev-build01" not in items  # no public IP
    assert items["agw-prod-eus"].kind == "gateway"


def _nic_vm(pip_sku: str, nsg_rules: list[dict[str, Any]] | None) -> EvalContext:
    sub = "00000000-0000-4000-8000-000000000001"
    base = f"/subscriptions/{sub}/resourcegroups/rg-test/providers"
    res = [
        make_resource(
            "microsoft.network/publicipaddresses",
            {"name": "pip1", "sku": {"name": pip_sku}, "properties": {"ipAddress": "203.0.113.7"}},
        ),
        make_resource(
            "microsoft.network/networkinterfaces",
            {
                "name": "nic1",
                "properties": {
                    "virtualMachine": {"id": f"{base}/microsoft.compute/virtualmachines/vm1"},
                    "ipConfigurations": [
                        {
                            "name": "ipconfig1",
                            "properties": {
                                "publicIPAddress": {
                                    "id": f"{base}/microsoft.network/publicipaddresses/pip1"
                                }
                            },
                        }
                    ],
                    **(
                        {
                            "networkSecurityGroup": {
                                "id": f"{base}/microsoft.network/networksecuritygroups/nsg1"
                            }
                        }
                        if nsg_rules is not None
                        else {}
                    ),
                },
            },
        ),
        make_resource("microsoft.compute/virtualmachines", {"name": "vm1"}),
    ]
    if nsg_rules is not None:
        res.append(
            make_resource(
                "microsoft.network/networksecuritygroups",
                {"name": "nsg1", "properties": {"securityRules": nsg_rules}},
            )
        )
    return EvalContext(resources=res)


def test_exposure_nsg_semantics() -> None:
    assert compute(_nic_vm("Standard", None)) == {}  # secure by default
    basic = compute(_nic_vm("Basic", None))
    assert next(iter(basic.values())).ports[0]["port"] == "*"
    deny_first = [
        {
            "name": "deny-ssh",
            "properties": {
                "priority": 100,
                "direction": "Inbound",
                "access": "Deny",
                "protocol": "Tcp",
                "sourceAddressPrefix": "*",
                "destinationPortRange": "22",
            },
        },
        {
            "name": "allow-all",
            "properties": {
                "priority": 200,
                "direction": "Inbound",
                "access": "Allow",
                "protocol": "*",
                "sourceAddressPrefix": "*",
                "destinationPortRange": "*",
            },
        },
    ]
    item = next(iter(compute(_nic_vm("Standard", deny_first)).values()))
    ports = [p["port"] for p in item.ports]
    assert 22 not in ports
    assert 3389 in ports
    assert "*" in ports
    corp_only = [
        {
            "name": "ssh-corp",
            "properties": {
                "priority": 100,
                "direction": "Inbound",
                "access": "Allow",
                "protocol": "Tcp",
                "sourceAddressPrefix": "10.0.0.0/8",
                "destinationPortRange": "22",
            },
        }
    ]
    assert compute(_nic_vm("Standard", corp_only)) == {}


def test_three_attack_paths_on_demo() -> None:
    ctx, vulns = demo()
    exp = compute(ctx)
    graph = SecurityGraph(ctx, exp, vulns)
    every = graph.attack_paths()
    paths = [p for p in every if p.kind == "identity"]
    titles = {p.entry["name"]: p for p in paths}
    assert set(titles) == {"vm-prod-jumpbox01", "aks-contoso-dev", "app-contoso-legacy-portal"}
    assert titles["vm-prod-jumpbox01"].target["name"] == "kv-contoso-prod-app"
    assert titles["vm-prod-jumpbox01"].assignment["role"] == "Contributor"
    assert titles["app-contoso-legacy-portal"].target["name"] == "stcontosocustdata"
    assert titles["aks-contoso-dev"].assignment["scope_label"] == "resource group rg-data-dev"
    assert any(r["name"] == "sql-contoso-dev" for r in titles["aks-contoso-dev"].reachable)
    for p in paths:
        assert p.score >= 40
        nodes = p.to_path()["nodes"]
        assert [n["kind"] for n in nodes] == ["internet", "resource", "identity", "role", "target"]
    # lower-scoring paths exist but stay below the threshold
    assert any(p.entry["name"] == "app-contoso-orders-api" for p in graph.attack_paths(min_score=0))


def test_paths_without_a_managed_identity() -> None:
    """Remote access to a VM and weakly protected data services are paths too (decision 0051)."""
    ctx, vulns = demo()
    failing = {
        "sql-firewall-azure-services": {r["id"] for r in ctx.by_type("microsoft.sql/servers")}
    }
    graph = SecurityGraph(ctx, compute(ctx), vulns, failing)
    paths = graph.attack_paths()
    assert len({p.key for p in paths}) == len(paths)
    remote = {p.entry["name"]: p for p in paths if p.kind == "remote"}
    jump = remote["vm-prod-jumpbox01"]
    kinds = [n["kind"] for n in jump.to_path()["nodes"]]
    assert kinds == ["internet", "resource", "network", "target"]
    assert jump.factors["exposure"] == 1.0
    assert "RDP" in jump.factors["exposure_detail"]
    assert jump.target["type"] in ("microsoft.keyvault/vaults", "microsoft.sql/servers")
    assert len(jump.to_path()["edges"]) == 3
    data = {p.entry["name"]: p for p in paths if p.kind == "data"}
    assert "stcontosodataexport" in data
    export = data["stcontosodataexport"]
    assert [n["kind"] for n in export.to_path()["nodes"]] == ["internet", "target"]
    assert export.factors["privilege_detail"] == "no credential needed"
    assert any("sql" in name for name in data)
    # a public endpoint that is otherwise well protected is a finding, not a path
    plain = SecurityGraph(ctx, compute(ctx), vulns)
    assert not any(
        p.kind == "data" and p.entry["type"] == "microsoft.keyvault/vaults"
        for p in plain.attack_paths(min_score=0)
    )
    for p in paths:
        assert p.score >= 40
        assert p.factors["kind"] == p.kind


def test_remote_access_path_without_private_targets() -> None:
    """A lone VM with SSH open still gives a path: control of the machine."""
    ssh = [
        {
            "name": "ssh",
            "properties": {
                "priority": 100,
                "direction": "Inbound",
                "access": "Allow",
                "protocol": "Tcp",
                "sourceAddressPrefix": "*",
                "destinationPortRange": "22",
            },
        }
    ]
    ctx = _nic_vm("Standard", ssh)
    paths = SecurityGraph(ctx, compute(ctx)).attack_paths()
    assert [p.kind for p in paths] == ["remote"]
    nodes = paths[0].to_path()["nodes"]
    assert [n["kind"] for n in nodes] == ["internet", "resource", "target"]
    assert nodes[-1]["label"].startswith("Control of ")
    assert paths[0].target["id"] == paths[0].entry["id"]


def test_blast_radius_and_privilege() -> None:
    ctx, vulns = demo()
    graph = SecurityGraph(ctx, compute(ctx), vulns)
    jump = next(r for r in ctx.resources if r["name"] == "vm-prod-jumpbox01")
    br = graph.blast_radius(jump["id"])
    assert br["exposed"] is True
    assert br["summary"]["reachable_sensitive"] > 5
    assert br["reachable"][0]["sensitivity"] >= 0.95
    assert privilege("Owner", "/subscriptions/x") == 1.0
    assert privilege("Contributor", "/subscriptions/x/resourcegroups/rg") == 0.75
    assert (
        privilege("Storage Blob Data Owner", "/subscriptions/x/resourcegroups/rg/providers/a/b/c")
        == 0.7
    )
    assert privilege("Reader", "/subscriptions/x") == 0.0


def test_toxic_combinations_on_demo() -> None:
    ctx, vulns = demo()
    exp = compute(ctx)
    failing = {
        "sql-firewall-allow-all": {
            r["id"] for r in ctx.resources if r["name"] == "sql-contoso-dev"
        },
        "sql-auditing-off": {r["id"] for r in ctx.resources if r["name"] == "sql-contoso-dev"},
        "app-https-only": {
            r["id"] for r in ctx.resources if r["name"] == "app-contoso-legacy-portal"
        },
        "kv-purge-protection": {r["id"] for r in ctx.resources if r["name"] == "kv-contoso-test"},
    }
    graph = SecurityGraph(ctx, exp, vulns, failing)
    hits = {(h.combo.id, h.resource["name"]) for h in detect(ctx, exp, graph, failing, vulns)}
    assert ("toxic-open-sql-no-audit", "sql-contoso-dev") in hits
    assert ("toxic-weak-app-data-identity", "app-contoso-legacy-portal") in hits
    assert ("toxic-public-vault-no-purge-protection", "kv-contoso-test") in hits
    assert ("toxic-exposed-vulnerable-privileged", "aks-contoso-dev") in hits
    assert any(c == "toxic-privileged-user-no-mfa" for c, _ in hits)


def test_finding_risk_adjustments() -> None:
    facts = risk.RiskFacts(
        exposed={"/a"}, on_path={"/a"}, production={"/a", "/b"}, private_endpoint={"/b"}
    )
    score, factors = risk.finding_risk("high", "security", "/A", facts)
    assert score == 70 + 15 + 10 + 5
    assert factors["internet_exposure"] == 15
    score_b, factors_b = risk.finding_risk("medium", "security", "/b", facts)
    assert score_b == 45 - 10 + 5
    assert factors_b["compensating_control"] == -10
    assert risk.finding_risk("critical", "security", "/a", facts)[0] == 100  # clamped
    assert risk.finding_risk("info", "security", "/a", facts)[0] == 0
    assert risk.finding_risk("low", "cost", "/a", facts)[0] == 25  # only production applies


def test_pillar_scores_and_grades() -> None:
    result = risk.pillar_scores(
        risk.ScoreInput(
            evaluated={"r1": ("security", "high", 10), "r2": ("reliability", "medium", 4)},
            open_findings=[("r1", "security", 70), ("r1", "security", 70)],
            savings=100.0,
            run_rate=1000.0,
        )
    )
    p = result["pillars"]
    assert p["security"] == 80  # 1 - 140/700
    assert p["reliability"] == 100
    assert p["cost"] == 80  # 100 - 100/1000*200
    assert p["governance"] is None
    expected = round((0.3 * 80 + 0.2 * 100 + 0.2 * 80) / 0.7)
    assert result["overall"] == expected
    assert [risk.grade(x) for x in (95, 80, 65, 45, 10)] == ["A", "B", "C", "D", "E"]


def test_compliance_rollup() -> None:
    mappings = {
        "r1": {"cis": ["3.1"], "nist80053": ["SC-8"]},
        "r2": {"cis": ["3.1"]},
        "r3": {"cis": ["3.7"]},
    }
    results = risk.compliance(
        mappings,
        evaluated={"r1": 10, "r2": 5, "r3": 0},
        failing={"r1": 2},
        frameworks=["cis", "nist80053"],
        all_controls={"cis": ["3.1", "3.7", "9.9"], "nist80053": ["SC-8"]},
    )
    by = {(r.framework, r.control_id): r for r in results}
    assert by[("cis", "3.1")].status == "failed"
    assert by[("cis", "3.1")].passed == 13
    assert by[("cis", "3.1")].failed == 2
    assert by[("cis", "3.7")].status == "not_applicable"
    assert by[("cis", "9.9")].status == "not_assessed"
    summary = risk.framework_summary(results)
    assert summary["cis"]["percent"] == round(100 * 13 / 15, 1)
    assert summary["nist80053"]["failed"] == 1


def test_entra_summary_on_demo() -> None:
    ctx, _ = demo()
    assert ctx.entra is not None
    s = ent.summarize(ctx.entra, NOW)
    assert s["global_admins"] == 6
    assert s["guests"] == 8
    assert s["admins_without_mfa"] >= 1
    assert s["ca_mfa_all_users"] is False  # report-only
    assert s["legacy_auth_blocked"] is True
    assert s["high_privilege_apps"] == 3
    assert s["credentials_expired"] >= 1


def test_demo_gateway_runs_custom_kql_locally() -> None:
    gw = DemoAzureGateway([NOW])
    subs = [s.id for s in SUBSCRIPTIONS.values()]
    rows = list(
        gw.resource_graph(
            "resources | where type =~ 'microsoft.storage/storageaccounts' "
            "and properties.allowBlobPublicAccess == true | project id, name",
            subs,
        )
    )
    names = {r["name"] for r in rows}
    assert "stcontosodataexport" in names
    assert "stcontosocustdata" not in names
    assert all(set(r) == {"id", "name"} for r in rows)
