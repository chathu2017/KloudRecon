"""Phase 3 end to end on the Contoso Demo: scan stages 7-18, findings lifecycle, workflow,
attack paths, exposure, identity, compliance evidence, reliability, governance, custom rules
and the Overview. The demo data is seeded once for this module (4 scans)."""

from __future__ import annotations

import io
import uuid
import zipfile
from collections.abc import Iterator
from datetime import UTC, datetime, timedelta
from typing import Any

import psycopg
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from kloudrecon.core.db import session_scope
from kloudrecon.core.rls import enable_system
from kloudrecon.domain.models import Connection, Scan, ScanStageLog
from tests.conftest import TABLES, _admin_dsn, auth_headers


@pytest.fixture(autouse=True)
def _clean_tables() -> None:  # data is shared across this module (see `demo`)
    return None


@pytest.fixture(scope="module")
def demo(_database: None) -> Iterator[dict[str, Any]]:
    from kloudrecon.services.demo import seed_demo_data
    from kloudrecon.services.seed import seed_dev

    with psycopg.connect(_admin_dsn(), autocommit=True) as conn:
        conn.execute(f"TRUNCATE {TABLES} RESTART IDENTITY CASCADE")
    with session_scope() as s:
        seed_dev(s)
    result = seed_demo_data(history_days=(3.0, 2.0, 1.0))
    assert result.statuses == ["succeeded"] * 3
    yield {
        "org_id": result.org_id,
        "connection_id": result.connection_id,
        "scans": result.created_scans,
    }
    with psycopg.connect(_admin_dsn(), autocommit=True) as conn:
        conn.execute(f"TRUNCATE {TABLES} RESTART IDENTITY CASCADE")


@pytest.fixture(scope="module")
def api(demo: dict[str, Any]) -> Iterator[TestClient]:
    from kloudrecon.api.main import create_app

    with TestClient(create_app(start_listener=False)) as c:
        yield c


def _admin(api: TestClient) -> dict[str, str]:
    return auth_headers(api, "demo@contoso.test")


def test_scan_runs_every_security_stage(demo: dict[str, Any]) -> None:
    with session_scope() as s:
        enable_system(s)
        logs = s.scalars(
            select(ScanStageLog).where(ScanStageLog.scan_id == demo["scans"][-1])
        ).all()
    by = {log.stage: log for log in logs}
    for stage in (
        "defender",
        "advisor",
        "policy",
        "config",
        "identity",
        "rules",
        "security_graph",
        "risk",
    ):
        assert by[stage].status == "succeeded", (stage, by[stage].message)
    assert "9 attack path" in (by["security_graph"].message or "")


def test_findings_summary_and_lifecycle(api: TestClient) -> None:
    h = _admin(api)
    summary = api.get("/api/v1/security/summary", headers=h).json()
    assert summary["attack_paths"] == 9
    assert summary["exposed"] > 20
    assert summary["open_by_severity"]["critical"] >= 1
    assert summary["secure_score"] is not None
    assert len(summary["trend"]) == 3
    assert summary["mttr_days"]["medium"] is not None or summary["mttr_days"]["high"] is not None
    # the demo fixes sttestcontosoqa at epoch 2: the finding resolved automatically
    fixed = api.get(
        "/api/v1/security/findings",
        params={"rule_id": "st-https-only", "status": ["resolved"]},
        headers=h,
    ).json()
    assert [f["resource_name"] for f in fixed["items"]] == ["sttestcontosoqa"]
    assert fixed["items"][0]["resolved_at"]
    still_open = api.get(
        "/api/v1/security/findings", params={"rule_id": "st-https-only"}, headers=h
    ).json()
    assert "sttestcontosoqa" not in {f["resource_name"] for f in still_open["items"]}


def test_finding_list_filters_facets_and_export(api: TestClient) -> None:
    h = _admin(api)
    page = api.get(
        "/api/v1/security/findings", params={"severity": ["critical"], "limit": 5}, headers=h
    ).json()
    assert page["total"] >= 1
    assert all(f["severity"] == "critical" for f in page["items"])
    risk_sorted = [f["risk_score"] for f in page["items"]]
    assert risk_sorted == sorted(risk_sorted, reverse=True)
    q = api.get("/api/v1/security/findings", params={"q": "jumpbox"}, headers=h).json()
    assert any("jumpbox" in f["resource_name"] for f in q["items"])
    ctl = api.get(
        "/api/v1/security/findings", params={"framework": "cis", "control": "6.1"}, headers=h
    ).json()
    assert {f["rule_id"] for f in ctl["items"]} & {
        "net-nsg-rdp-internet",
        "net-vm-management-exposed",
    }
    facets = api.get("/api/v1/security/findings/facets", headers=h).json()
    assert {"rule", "defender", "advisor", "toxic"} <= set(facets["source"])
    csv = api.get("/api/v1/security/findings/export", params={"severity": ["high"]}, headers=h)
    assert csv.status_code == 200
    assert csv.text.splitlines()[0].lstrip("﻿").startswith("Title,Severity,Risk")


def _find(api: TestClient, h: dict[str, str], rule: str, name: str) -> dict[str, Any]:
    items = api.get(
        "/api/v1/security/findings", params={"rule_id": rule, "limit": 200}, headers=h
    ).json()["items"]
    return next(f for f in items if f["resource_name"] == name)


def test_finding_detail_has_remediation_in_five_formats(api: TestClient) -> None:
    h = _admin(api)
    f = _find(api, h, "st-public-blob-access", "stcontosodataexport")
    d = api.get(f"/api/v1/security/findings/{f['id']}", headers=h).json()
    rem = d["remediation"]
    assert rem["portal"]
    for key in ("cli", "powershell", "bicep", "terraform"):
        assert rem[key], key
    assert "stcontosodataexport" in rem["cli"]
    assert (
        rem["policy"]["definition"]["properties"]["policyRule"]["then"]["effect"]
        == "[parameters('effect')]"
    )
    frameworks = {m["framework"]: m for m in d["rule"]["frameworks"]}
    assert "cis" in frameworks
    assert all(c["title"] != c["id"] for c in frameworks["cis"]["controls"])
    assert d["history"]
    assert d["portal_url"].startswith("https://portal.azure.com")
    assert d["risk_factors"]["base"] == 70
    # toxic combinations explain their steps instead of a single-rule remediation
    t = api.get("/api/v1/security/findings", params={"source": ["toxic"]}, headers=h).json()[
        "items"
    ][0]
    td = api.get(f"/api/v1/security/findings/{t['id']}", headers=h).json()
    assert td["steps"]
    assert td["remediation"] is None


def test_workflow_assign_comment_exception(api: TestClient) -> None:
    admin = _admin(api)
    viewer = auth_headers(api, "viewer@contoso.test")
    me = api.get("/api/v1/me", headers=admin).json()
    f = _find(api, admin, "kv-rbac-disabled", "kv-contoso-prod-data")
    fid = f["id"]
    # viewers are read-only
    assert (
        api.patch(
            f"/api/v1/security/findings/{fid}", json={"status": "in_progress"}, headers=viewer
        ).status_code
        == 403
    )
    r = api.patch(
        f"/api/v1/security/findings/{fid}",
        json={
            "status": "in_progress",
            "assignee_id": me["user"]["id"],
            "due_at": (datetime.now(UTC) + timedelta(days=10)).isoformat(),
        },
        headers=admin,
    )
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["status"] == "in_progress"
    assert d["assignee_name"]
    assert any("assigned to" in c["body"].lower() for c in d["comments"])
    c = api.post(
        f"/api/v1/security/findings/{fid}/comments",
        json={"body": "Migrating to RBAC next sprint."},
        headers=admin,
    )
    assert c.status_code == 201
    # an admin's exception is approved at once and accepts the risk
    e = api.post(
        f"/api/v1/security/findings/{fid}/exceptions",
        json={
            "reason": "Legacy app needs access policies until Q1.",
            "expires_at": (datetime.now(UTC) + timedelta(days=60)).isoformat(),
        },
        headers=admin,
    )
    assert e.status_code == 201, e.text
    assert e.json()["status"] == "approved"
    assert (
        api.get(f"/api/v1/security/findings/{fid}", headers=admin).json()["status"]
        == "accepted_risk"
    )
    too_long = api.post(
        f"/api/v1/security/findings/{fid}/exceptions",
        json={
            "reason": "Forever and ever please.",
            "expires_at": (datetime.now(UTC) + timedelta(days=900)).isoformat(),
        },
        headers=admin,
    )
    assert too_long.status_code == 422
    exc_id = e.json()["id"]
    listed = api.get("/api/v1/security/exceptions", headers=admin).json()
    assert any(x["id"] == exc_id and x["rule_title"] for x in listed)
    assert api.delete(f"/api/v1/security/exceptions/{exc_id}", headers=admin).status_code == 200
    assert api.get(f"/api/v1/security/findings/{fid}", headers=admin).json()["status"] == "open"


def test_member_exception_needs_approval(api: TestClient, demo: dict[str, Any]) -> None:
    admin = _admin(api)
    owner = auth_headers(api, "owner@local.test")
    # add a member to the demo org through an invitation
    inv = api.post(
        "/api/v1/team/invitations",
        json={"email": "member@contoso.test", "role": "member"},
        headers=admin,
    )
    assert inv.status_code in (200, 201), inv.text
    del owner
    token = inv.json().get("token") or inv.json().get("invite_url", "").rsplit("/", 1)[-1]
    member = auth_headers(api, "member@contoso.test")
    accepted = api.post(f"/api/v1/invitations/{token}/accept", headers=member)
    assert accepted.status_code in (200, 201), accepted.text
    f = _find(api, admin, "redis-non-ssl-port", "redis-contoso-sessions")
    e = api.post(
        f"/api/v1/security/findings/{f['id']}/exceptions",
        json={
            "reason": "Legacy client library until migration.",
            "expires_at": (datetime.now(UTC) + timedelta(days=30)).isoformat(),
        },
        headers=member,
    )
    assert e.status_code == 201, e.text
    assert e.json()["status"] == "pending"
    assert (
        api.post(
            f"/api/v1/security/exceptions/{e.json()['id']}/decision",
            json={"decision": "approve"},
            headers=member,
        ).status_code
        == 403
    )
    ok = api.post(
        f"/api/v1/security/exceptions/{e.json()['id']}/decision",
        json={"decision": "approve", "note": "OK until migration"},
        headers=admin,
    )
    assert ok.status_code == 200
    assert (
        api.get(f"/api/v1/security/findings/{f['id']}", headers=admin).json()["status"]
        == "accepted_risk"
    )


def test_attack_paths_exposure_blast_radius(api: TestClient) -> None:
    h = _admin(api)
    paths = api.get("/api/v1/security/attack-paths", headers=h).json()
    assert len(paths) == 9
    assert {p["path"]["kind"] for p in paths} == {"identity", "remote", "data"}
    entries = {p["path"]["nodes"][1]["label"] for p in paths if p["path"]["kind"] == "identity"}
    assert entries == {"vm-prod-jumpbox01", "aks-contoso-dev", "app-contoso-legacy-portal"}
    one = api.get(f"/api/v1/security/attack-paths/{paths[0]['id']}", headers=h).json()
    assert one["factors"]["exposure"] > 0
    exp = api.get("/api/v1/security/exposure", headers=h).json()
    jump = next(i for i in exp["items"] if i["resource_name"] == "vm-prod-jumpbox01")
    assert jump["severity"] == "critical"
    assert jump["ports"][0]["port"] == 3389
    assert any(p["port"] == 443 for p in exp["by_port"])
    br = api.get(
        "/api/v1/security/blast-radius", params={"arm_id": jump["arm_id"]}, headers=h
    ).json()
    assert br["exposed"] is True
    assert br["summary"]["reachable_sensitive"] > 5
    assert br["attack_paths"]
    assert br["findings"]


def test_identity_vulnerabilities_threats_coverage(api: TestClient) -> None:
    h = _admin(api)
    ident = api.get("/api/v1/security/identity", headers=h).json()
    assert ident["entra_available"] is True
    assert ident["ciem"]["privileged_assignments"] >= 5
    assert ident["ciem"]["suggestions"]
    assert ident["entra"]["summary"]["global_admins"] == 6
    assert any(a["guest"] for a in ident["entra"]["admins"])
    vulns = api.get("/api/v1/security/vulnerabilities", headers=h).json()
    assert vulns["defender_enabled"] is True
    assert vulns["summary"]["exploitable"] > 0
    assert vulns["by_cve"][0]["exploitable"] is True
    # the basic assessment needs no Defender plan (decision 0052)
    basic = vulns["basic"]
    assert basic["patch_data"] is True
    assert basic["summary"]["machines"] == len(basic["machines"]) > 10
    assert basic["summary"]["never_assessed"] > 0
    jump = next(m for m in basic["machines"] if m["name"] == "vm-prod-jumpbox01")
    assert (jump["critical"], jump["security"], jump["assessed"]) == (2, 3, "current")
    assert jump["exposed"] is True
    assert jump["management_open"] is True
    assert jump["level"] == "critical"
    assert jump["patches"][0]["classification"] == "Critical"
    assert basic["machines"][0]["priority"] >= basic["machines"][-1]["priority"]
    assert all(x["status"] in ("ended", "due_90_days", "due_1_year") for x in basic["lifecycle"])
    threats = api.get("/api/v1/security/threats", headers=h).json()
    assert {t["source"] for t in threats} >= {"defender"}
    cov = api.get("/api/v1/security/coverage", headers=h).json()
    assert len(cov["defender"]) == 4
    assert cov["diagnostics"]["total"] > 0
    assert cov["backup"]["production_total"] > 0


def test_compliance_frameworks_and_evidence_zip(api: TestClient) -> None:
    h = _admin(api)
    fws = api.get("/api/v1/compliance/frameworks", headers=h).json()
    assert {f["key"] for f in fws} == {
        "cis",
        "mcsb",
        "iso27001",
        "nist80053",
        "pcidss",
        "soc2",
        "hipaa",
    }
    cis = api.get("/api/v1/compliance/frameworks/cis", headers=h).json()
    assert "certif" not in cis["disclaimer"].replace("not an audit or certification", "")
    ctl = next(c for c in cis["controls"] if c["control_id"] == "6.1")
    assert ctl["status"] == "failed"
    assert ctl["title"]
    assert ctl["title"] != "6.1"
    detail = api.get("/api/v1/compliance/frameworks/cis/controls/6.1", headers=h).json()
    assert detail["failing"]
    z = api.get("/api/v1/compliance/frameworks/cis/evidence", headers=h)
    assert z.status_code == 200
    zf = zipfile.ZipFile(io.BytesIO(z.content))
    names = zf.namelist()
    assert {"README.txt", "summary.csv", "summary.pdf"} <= set(names)
    assert "controls/6.1.csv" in names
    assert "controls/6.1.pdf" in names
    pdf = zf.read("controls/6.1.pdf")
    assert pdf.startswith(b"%PDF-1.4")
    assert pdf.rstrip().endswith(b"%%EOF")
    assert b"vm-prod-jumpbox01" in zf.read("controls/6.1.csv") or b"nsg-prod-jumpbox" in zf.read(
        "controls/6.1.csv"
    )
    assert "mapped" in zf.read("README.txt").decode()


def test_reliability_governance_and_settings(api: TestClient) -> None:
    h = _admin(api)
    rel = api.get("/api/v1/reliability", headers=h).json()
    assert rel["well_architected"]["reliability"] is not None
    assert rel["top_findings"]
    ret = api.get("/api/v1/reliability/retirements", headers=h).json()
    assert any(r["entry"]["key"] == "postgresql-13" for r in ret)
    assert any(r["source"] == "advisor" for r in ret)
    quotas = api.get("/api/v1/reliability/quotas", headers=h).json()
    assert quotas[0]["percent"] >= quotas[-1]["percent"]
    gov = api.get("/api/v1/governance", headers=h).json()
    assert gov["policy_total"] > 0
    assert gov["tags"]["coverage"]
    assert gov["hygiene"]["empty_resource_groups"]
    bad = api.put(
        "/api/v1/settings/governance",
        json={"naming": [{"resource_type": "microsoft.storage/storageaccounts", "pattern": "("}]},
        headers=h,
    )
    assert bad.status_code == 422
    good = api.put(
        "/api/v1/settings/governance",
        json={
            "required_tags": ["env", "owner"],
            "allowed_regions": ["eastus", "westeurope"],
            "naming": [{"resource_type": "microsoft.storage/storageaccounts", "pattern": "^st"}],
        },
        headers=h,
    )
    assert good.status_code == 200
    assert good.json()["required_tags"] == ["env", "owner"]
    sec = api.put("/api/v1/settings/security", json={"sla_days": {"critical": 3}}, headers=h)
    assert sec.json()["sla_days"]["critical"] == 3
    hist = api.get("/api/v1/scores/history", headers=h).json()
    assert len(hist) == 3
    assert hist[-1]["grade"] in {"A", "B", "C", "D", "E"}


def test_custom_rules_validate_and_crud(api: TestClient) -> None:
    h = _admin(api)
    bad = api.post(
        "/api/v1/custom-rules/validate", json={"kql": "resources | summarize count()"}, headers=h
    ).json()
    assert bad["valid"] is False
    ok = api.post(
        "/api/v1/custom-rules/validate",
        json={
            "kql": "resources | where type =~ 'microsoft.storage/storageaccounts' "
            "and tags['env'] =~ 'dev' | project id, name"
        },
        headers=h,
    ).json()
    assert ok["valid"] is True
    assert ok["ran_on"] == "local"
    assert ok["count"] > 0
    created = api.post(
        "/api/v1/custom-rules",
        json={
            "name": "Dev storage must not allow public blobs",
            "kql": "resources | where type =~ 'microsoft.storage/storageaccounts' "
            "and tags['env'] =~ 'dev' and tobool(properties.allowBlobPublicAccess) | project id",
            "severity": "high",
            "remediation": "Disable anonymous blob access.",
        },
        headers=h,
    )
    assert created.status_code == 201, created.text
    assert (
        api.post(
            "/api/v1/custom-rules",
            json={"name": "Broken rule x", "kql": "resources | join x"},
            headers=h,
        ).status_code
        == 422
    )
    rules = api.get("/api/v1/custom-rules", headers=h).json()
    assert [r["name"] for r in rules] == ["Dev storage must not allow public blobs"]


def test_rescan_keeps_workflow_and_runs_custom_rules(api: TestClient, demo: dict[str, Any]) -> None:
    from kloudrecon.services import scans
    from kloudrecon.services.scan.pipeline import run_scan

    h = _admin(api)
    with session_scope() as s:
        enable_system(s)
        conn = s.get(Connection, demo["connection_id"])
        assert conn is not None
        scan = scans.enqueue_scan(s, conn, "seed", with_job=False)
        scan_id = scan.id
    assert run_scan(scan_id, as_of=datetime.now(UTC) - timedelta(hours=1)) == "succeeded"
    custom = api.get("/api/v1/security/findings", params={"source": ["custom"]}, headers=h).json()
    assert custom["total"] >= 2
    assert {f["resource_name"] for f in custom["items"]} >= {"stdevcontosoapps"}
    # the approved member exception still covers the Redis finding after the rescan
    f = _find_any(api, h, "redis-non-ssl-port", "redis-contoso-sessions")
    assert f["status"] == "accepted_risk"
    # kv-contoso-dev got purge protection at epoch 3: resolved automatically
    kv = api.get(
        "/api/v1/security/findings",
        params={"rule_id": "kv-purge-protection", "status": ["resolved"]},
        headers=h,
    ).json()
    assert "kv-contoso-dev" in {x["resource_name"] for x in kv["items"]}
    # time machine: the first scan still shows the old findings
    with session_scope() as s:
        enable_system(s)
        first = s.scalars(
            select(Scan).where(Scan.connection_id == demo["connection_id"]).order_by(Scan.sequence)
        ).first()
        assert first is not None
        first_id = first.id
    old = api.get(
        "/api/v1/security/findings",
        params={"scan_id": str(first_id), "rule_id": "st-https-only"},
        headers=h,
    ).json()
    assert "sttestcontosoqa" in {x["resource_name"] for x in old["items"]}


def _find_any(api: TestClient, h: dict[str, str], rule: str, name: str) -> dict[str, Any]:
    items = api.get(
        "/api/v1/security/findings",
        params={
            "rule_id": rule,
            "status": ["open", "in_progress", "accepted_risk", "resolved"],
            "limit": 200,
        },
        headers=h,
    ).json()["items"]
    return next(f for f in items if f["resource_name"] == name)


def test_overview_security_block(api: TestClient) -> None:
    h = _admin(api)
    ov = api.get("/api/v1/overview", headers=h).json()
    sec = ov["security"]
    assert sec["score"]["grade"] in {"A", "B", "C", "D", "E"}
    assert len(sec["top_risks"]) == 10
    assert sec["compliance"]["percent"] is not None
    assert sec["attack_paths"] == 9
    assert any("attack path" in a["title"] for a in ov["attention"])


def test_other_org_cannot_see_demo_findings(api: TestClient) -> None:
    h = _admin(api)
    fid = api.get("/api/v1/security/findings", params={"limit": 1}, headers=h).json()["items"][0][
        "id"
    ]
    acme = auth_headers(api, "admin@acme.test")
    assert api.get("/api/v1/security/findings", headers=acme).json()["total"] == 0
    assert api.get(f"/api/v1/security/findings/{fid}", headers=acme).status_code == 404
    assert api.get("/api/v1/security/attack-paths", headers=acme).json() == []
    assert (
        api.patch(
            f"/api/v1/security/findings/{fid}", json={"status": "in_progress"}, headers=acme
        ).status_code
        == 404
    )
    assert api.get(f"/api/v1/security/findings/{uuid.uuid4()}", headers=h).status_code == 404
