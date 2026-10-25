"""Scan engine: pipeline, stages 1-6, changes, partial/failed status, locking, API rules."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any

import psycopg
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from kloudrecon.core.config import get_settings
from kloudrecon.core.db import session_scope
from kloudrecon.core.rls import enable_system
from kloudrecon.domain.models import Connection, Organization, ResourceChange
from kloudrecon.jobs.queue import JobDeferred
from kloudrecon.services import demo, scans
from kloudrecon.services.azure.demo.world import world_at
from kloudrecon.services.scan import pipeline
from kloudrecon.services.scan.pipeline import run_scan
from kloudrecon.worker.main import Worker
from tests.conftest import auth_headers, use_azure_fixture

pytestmark = pytest.mark.usefixtures("seeded")

TENANT = "22222222-bbbb-4ccc-8ddd-000000000000"
CLIENT = "33333333-cccc-4ddd-8eee-000000000000"
T1 = datetime(2026, 9, 15, tzinfo=UTC)
T2 = datetime(2026, 9, 21, tzinfo=UTC)


def create_connection(client: TestClient) -> tuple[dict[str, str], str]:
    use_azure_fixture("valid_all_green")
    admin = auth_headers(client, "admin@acme.test")
    resp = client.post(
        "/api/v1/connections",
        json={
            "name": "Prod",
            "tenant_id": TENANT,
            "client_id": CLIENT,
            "client_secret": "kr~Scan-Test.Secret_Value~01",
        },
        headers=admin,
    )
    assert resp.status_code == 201, resp.text
    return admin, resp.json()["connection"]["id"]


def rows(conn: psycopg.Connection[tuple[object, ...]], sql: str, *args: object) -> list[Any]:
    return conn.execute(sql, args).fetchall()  # type: ignore[arg-type]


def queued_scan(conn: psycopg.Connection[tuple[object, ...]], connection_id: str) -> uuid.UUID:
    found = rows(
        conn,
        "SELECT id FROM scans WHERE connection_id = %s AND status = 'queued' "
        "ORDER BY sequence DESC LIMIT 1",
        connection_id,
    )
    assert found, "no queued scan"
    return uuid.UUID(str(found[0][0]))


def new_scan(connection_id: str, trigger: str = "manual") -> uuid.UUID:
    with session_scope() as s:
        enable_system(s)
        conn = s.get(Connection, uuid.UUID(connection_id))
        assert conn is not None
        return scans.enqueue_scan(s, conn, trigger).id


def test_validation_queues_the_first_scan(
    client: TestClient, admin_conn: psycopg.Connection[tuple[object, ...]]
) -> None:
    _, conn_id = create_connection(client)
    scan = rows(
        admin_conn, "SELECT trigger, status, job_id FROM scans WHERE connection_id = %s", conn_id
    )
    assert [(r[0], r[1]) for r in scan] == [("first", "queued")]
    job = rows(admin_conn, "SELECT type, payload FROM jobs WHERE id = %s", scan[0][2])
    assert job[0][0] == "scan.full"


def test_rest_scan_stages_and_snapshot_changes(
    client: TestClient, admin_conn: psycopg.Connection[tuple[object, ...]]
) -> None:
    admin, conn_id = create_connection(client)
    first = queued_scan(admin_conn, conn_id)
    use_azure_fixture("scan_v1")
    assert run_scan(first, as_of=T1) == "succeeded"

    stages = rows(
        admin_conn,
        "SELECT stage, status FROM scan_stage_logs WHERE scan_id = %s ORDER BY position",
        first,
    )
    assert [s[0] for s in stages] == [
        "authenticate",
        "discover",
        "inventory",
        "relationships",
        "rbac",
        "changes",
        "defender",
        "advisor",
        "policy",
        "config",
        "identity",
        "cost",
        "forecast",
        "metrics",
        "reservations",
        "quotas",
        "rules",
        "assessment",
        "security_graph",
        "risk",
        "diagram",
        "finalize",
    ]
    assert {s[1] for s in stages} == {"succeeded"}
    assert rows(admin_conn, "SELECT count(*) FROM resources WHERE scan_id = %s", first)[0][0] == 5
    edges = {
        (r[0].rsplit("/", 1)[-1], r[1].rsplit("/", 1)[-1], r[2])
        for r in rows(
            admin_conn,
            "SELECT source_arm_id, target_arm_id, edge_type FROM resource_edges WHERE scan_id = %s",
            first,
        )
    }
    assert ("vm-app01", "nic-vm-app01", "nic") in edges
    assert ("nic-vm-app01", "vnet-app", "in_subnet") in edges
    assert ("vnet-app", "nsg-app", "subnet_nsg") in edges
    assert ("osdisk-vm-app01", "vm-app01", "managed_by") in edges
    rbac = rows(
        admin_conn,
        "SELECT role_name, is_privileged FROM rbac_assignments WHERE scan_id = %s",
        first,
    )
    assert rbac == [("Owner", True)]
    baseline = rows(
        admin_conn,
        "SELECT source, change_type, caller FROM resource_changes WHERE scan_id = %s "
        "ORDER BY caller",
        first,
    )
    # the /read event is ignored; two write events become activity rows
    assert sorted(baseline) == sorted(
        [
            ("activity_log", "modified", "33333333-cccc-4ddd-8eee-000000000000"),
            ("activity_log", "modified", "dana@contoso.example"),
        ]
    )
    detail = client.get(f"/api/v1/scans/{first}", headers=admin).json()
    assert detail["status"] == "succeeded"
    assert detail["stats"]["resources"] == 5
    assert detail["stats"]["changes"]["baseline"] is True

    second = new_scan(conn_id)
    use_azure_fixture("scan_v2")
    assert run_scan(second, as_of=T2) == "succeeded"
    with session_scope() as s:
        enable_system(s)
        changes = s.scalars(select(ResourceChange).where(ResourceChange.scan_id == second)).all()
    by = {(c.resource_name, c.change_type, c.source): c for c in changes}
    pip = by[("pip-vm-app01", "created", "snapshot")]
    assert pip.caller == "lee@contoso.example"
    assert pip.risky
    nsg = by[("nsg-app", "deleted", "snapshot")]
    assert nsg.caller == "sam@contoso.example"
    assert nsg.risk_reason == "Network security group deleted"
    vm = by[("vm-app01", "modified", "snapshot")]
    assert vm.caller == "lee@contoso.example"
    assert [f["path"] for f in vm.diff["fields"]] == ["properties.hardwareProfile.vmSize"]
    assert vm.diff["fields"][0]["after"] == "Standard_D4s_v5"
    assert ("vnet-app", "modified", "snapshot") in by
    role = [c for c in changes if c.source == "activity_log"]
    assert len(role) == 1
    assert role[0].risk_reason == "Role assignment created"
    # overlapping Activity Log events were not stored twice
    dup = rows(admin_conn, "SELECT count(*) FROM resource_changes WHERE event_id = 'evt-1'")
    assert dup[0][0] == 1
    stats = client.get(f"/api/v1/scans/{second}", headers=admin).json()["stats"]["changes"]
    assert stats["created"] == 1
    assert stats["deleted"] == 1
    assert stats["risky"] >= 3


def test_optional_stage_failure_makes_scan_partial(
    client: TestClient, admin_conn: psycopg.Connection[tuple[object, ...]]
) -> None:
    _, conn_id = create_connection(client)
    scan_id = queued_scan(admin_conn, conn_id)
    use_azure_fixture("scan_activity_forbidden")
    assert run_scan(scan_id, as_of=T1) == "partial"
    status = rows(
        admin_conn,
        "SELECT status, message FROM scan_stage_logs WHERE scan_id = %s AND stage = 'changes'",
        scan_id,
    )
    assert status[0][0] == "failed"
    assert "could not be read" in status[0][1]


def test_expired_secret_fails_scan_and_invalidates_connection(
    client: TestClient, admin_conn: psycopg.Connection[tuple[object, ...]]
) -> None:
    _, conn_id = create_connection(client)
    scan_id = queued_scan(admin_conn, conn_id)
    use_azure_fixture("expired_secret")
    assert run_scan(scan_id) == "failed"
    stages = dict(
        rows(admin_conn, "SELECT stage, status FROM scan_stage_logs WHERE scan_id = %s", scan_id)
    )
    assert stages["authenticate"] == "failed"
    assert stages["inventory"] == "skipped"
    err = rows(admin_conn, "SELECT error FROM scans WHERE id = %s", scan_id)[0][0]
    assert "has expired" in err["message"]
    status = rows(admin_conn, "SELECT status FROM connections WHERE id = %s", conn_id)[0][0]
    assert status == "invalid"


def test_timeout_fails_the_scan(
    client: TestClient,
    admin_conn: psycopg.Connection[tuple[object, ...]],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _, conn_id = create_connection(client)
    scan_id = queued_scan(admin_conn, conn_id)
    use_azure_fixture("scan_v1")
    monkeypatch.setattr(pipeline, "SCAN_TIMEOUT_SECONDS", -1)
    assert run_scan(scan_id) == "failed"
    err = rows(admin_conn, "SELECT error FROM scans WHERE id = %s", scan_id)[0][0]
    assert "60-minute" in err["message"]


def test_one_scan_per_connection_lock_defers(
    client: TestClient, admin_conn: psycopg.Connection[tuple[object, ...]]
) -> None:
    _, conn_id = create_connection(client)
    scan_id = queued_scan(admin_conn, conn_id)
    admin_conn.execute("SELECT pg_advisory_lock(hashtextextended(%s, 0))", (f"kr-scan:{conn_id}",))
    try:
        with pytest.raises(JobDeferred):
            run_scan(scan_id)
    finally:
        admin_conn.execute(
            "SELECT pg_advisory_unlock(hashtextextended(%s, 0))", (f"kr-scan:{conn_id}",)
        )


def test_worker_runs_scan_job_and_defer_keeps_attempts(
    client: TestClient, admin_conn: psycopg.Connection[tuple[object, ...]]
) -> None:
    _, conn_id = create_connection(client)
    scan_id = queued_scan(admin_conn, conn_id)
    worker = Worker(get_settings())
    admin_conn.execute("SELECT pg_advisory_lock(hashtextextended(%s, 0))", (f"kr-scan:{conn_id}",))
    job = worker._claim()
    assert job is not None
    worker._execute(job)
    admin_conn.execute(
        "SELECT pg_advisory_unlock(hashtextextended(%s, 0))", (f"kr-scan:{conn_id}",)
    )
    deferred = rows(admin_conn, "SELECT status, attempts FROM jobs WHERE id = %s", job.id)[0]
    assert deferred == ("queued", 0)
    admin_conn.execute("UPDATE jobs SET run_after = now()")
    use_azure_fixture("scan_v1")
    job = worker._claim()
    assert job is not None
    worker._execute(job)
    assert rows(admin_conn, "SELECT status FROM scans WHERE id = %s", scan_id)[0][0] == "succeeded"
    assert rows(admin_conn, "SELECT status FROM jobs WHERE id = %s", job.id)[0][0] == "succeeded"


def _demo_org() -> uuid.UUID:
    from kloudrecon.services.seed import seed_demo

    with session_scope() as s:
        seed_demo(s)
        enable_system(s)
        org = s.scalar(select(Organization).where(Organization.name == "Contoso Demo"))
        assert org is not None
        demo.ensure_demo_connection(s, org.id)
        return org.id


def test_demo_tenant_scans_without_azure(
    admin_conn: psycopg.Connection[tuple[object, ...]],
) -> None:
    org_id = _demo_org()
    conn_id = str(rows(admin_conn, "SELECT id FROM connections WHERE org_id = %s", org_id)[0][0])
    first = new_scan(conn_id, "seed")
    assert run_scan(first, as_of=T1) == "succeeded"
    count = rows(admin_conn, "SELECT count(*) FROM resources WHERE scan_id = %s", first)[0][0]
    assert count == len(world_at(0).resources)
    assert count > 550
    privileged = rows(
        admin_conn,
        "SELECT count(*) FROM rbac_assignments WHERE scan_id = %s AND is_privileged",
        first,
    )[0][0]
    assert privileged >= 8
    named = rows(
        admin_conn,
        "SELECT principal_name FROM rbac_assignments WHERE scan_id = %s AND principal_name LIKE %s",
        first,
        "vm-prod-jumpbox01%",
    )
    assert named  # managed identity names resolved from the inventory
    second = new_scan(conn_id, "seed")
    assert run_scan(second, as_of=T2) == "succeeded"
    kinds = dict(
        rows(
            admin_conn,
            "SELECT change_type, count(*) FROM resource_changes WHERE scan_id = %s "
            "AND source = 'snapshot' GROUP BY change_type",
            second,
        )
    )
    assert kinds.get("created", 0) >= 3  # new feature VM + NIC + disk
    assert kinds.get("modified", 0) >= 2
    callers = rows(
        admin_conn,
        "SELECT count(*) FROM resource_changes WHERE scan_id = %s AND caller IS NOT NULL",
        second,
    )[0][0]
    assert callers >= 3


def test_scan_now_rules(
    client: TestClient, admin_conn: psycopg.Connection[tuple[object, ...]]
) -> None:
    admin, conn_id = create_connection(client)
    # first scan is still queued → Scan now conflicts
    resp = client.post("/api/v1/scans", json={"connection_id": conn_id}, headers=admin)
    assert resp.status_code == 409
    assert resp.json()["error"]["code"] == "scan_in_progress"
    use_azure_fixture("scan_v1")
    run_scan(queued_scan(admin_conn, conn_id), as_of=T1)
    resp = client.post("/api/v1/scans", json={"connection_id": conn_id}, headers=admin)
    assert resp.status_code == 202, resp.text
    assert resp.json()["status"] == "queued"
    assert resp.json()["trigger"] == "manual"
    run_scan(uuid.UUID(resp.json()["id"]), as_of=T2)
    again = client.post("/api/v1/scans", json={"connection_id": conn_id}, headers=admin)
    assert again.status_code == 429
    assert again.json()["error"]["code"] == "scan_too_soon"
    listed = client.get("/api/v1/scans", headers=admin).json()
    assert [s["trigger"] for s in listed] == ["manual", "first"]
    assert listed[0]["connection_name"] == "Prod"


def test_viewers_cannot_scan(
    client: TestClient, admin_conn: psycopg.Connection[tuple[object, ...]]
) -> None:
    _, conn_id = create_connection(client)
    admin_conn.execute(
        "INSERT INTO users (org_id, external_oid, email, name, org_role, status) "
        "SELECT org_id, 'dev:vic@acme.test', 'vic@acme.test', 'Vic', 'viewer', 'active' "
        "FROM users WHERE email = 'admin@acme.test'"
    )
    viewer = auth_headers(client, "vic@acme.test")
    resp = client.post("/api/v1/scans", json={"connection_id": conn_id}, headers=viewer)
    assert resp.status_code == 403
    assert client.get("/api/v1/scans", headers=viewer).status_code == 200


def test_scans_are_tenant_isolated(
    client: TestClient, admin_conn: psycopg.Connection[tuple[object, ...]]
) -> None:
    _, conn_id = create_connection(client)
    scan_id = queued_scan(admin_conn, conn_id)
    _demo_org()
    admin_conn.execute(
        "INSERT INTO users (org_id, external_oid, email, name, org_role, status) "
        "SELECT id, 'dev:demo@contoso.test', 'demo@contoso.test', 'Demo', 'admin', 'active' "
        "FROM organizations WHERE name = 'Contoso Demo'"
    )
    other = auth_headers(client, "demo@contoso.test")
    assert client.get(f"/api/v1/scans/{scan_id}", headers=other).status_code == 404
    assert client.get("/api/v1/scans", headers=other).json() == []
    resp = client.post("/api/v1/scans", json={"connection_id": conn_id}, headers=other)
    assert resp.status_code == 404
