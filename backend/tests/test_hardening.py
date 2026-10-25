"""Phase 5 hardening (decision 0040): organization deletion and purge, race-safe default alert
rules, unique rule names."""

from __future__ import annotations

import re
import threading
import time
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

import psycopg
import pytest
from fastapi.testclient import TestClient

from kloudrecon.core.db import session_scope
from kloudrecon.core.rls import set_tenant
from kloudrecon.services import alerts
from kloudrecon.services.infra import get_blob_store, get_secret_store
from tests.conftest import auth_headers, run_jobs
from tests.test_scans import create_connection

pytestmark = pytest.mark.usefixtures("seeded")


def q(conn: psycopg.Connection[tuple[object, ...]], sql: str, *args: object) -> list[Any]:
    return conn.execute(sql, args).fetchall()


def acme(conn: psycopg.Connection[tuple[object, ...]]) -> uuid.UUID:
    return uuid.UUID(str(q(conn, "SELECT org_id FROM users WHERE email = 'admin@acme.test'")[0][0]))


def invite_member(client: TestClient, admin: dict[str, str], email: str) -> dict[str, str]:
    resp = client.post(
        "/api/v1/team/invitations", json={"email": email, "role": "admin"}, headers=admin
    )
    token = re.search(r"/invite/(.+)$", resp.json()["invite_url"])
    assert token
    member = auth_headers(client, email)
    client.post(f"/api/v1/invitations/{token.group(1)}/accept", headers=member)
    return member


def test_org_owner_deletes_the_organization_and_the_worker_purges_it(
    client: TestClient, admin_conn: psycopg.Connection[tuple[object, ...]]
) -> None:
    admin, conn_id = create_connection(client)
    org = acme(admin_conn)
    (secret_name,) = q(admin_conn, "SELECT kv_secret_name FROM connections WHERE id = %s", conn_id)[
        0
    ]
    assert get_secret_store().get_secret(secret_name)
    get_blob_store().upload_bytes(
        "reports", f"{org}/test.pdf", b"%PDF-1.4", content_type="application/pdf"
    )
    other_admin = invite_member(client, admin, "second@acme.test")

    # only the owner, and only with the exact name
    assert (
        client.delete(
            "/api/v1/org", params={"confirm": "Acme Corp"}, headers=other_admin
        ).status_code
        == 403
    )
    wrong = client.delete("/api/v1/org", params={"confirm": "acme"}, headers=admin)
    assert wrong.status_code == 422
    # a read-only organization (trial ended) can still delete itself
    admin_conn.execute(
        "UPDATE organizations SET trial_ends_at = %s WHERE id = %s",
        (datetime.now(UTC) - timedelta(days=1), org),
    )
    resp = client.delete("/api/v1/org", params={"confirm": "Acme Corp"}, headers=admin)
    assert resp.status_code == 200, resp.text

    # secrets are gone at once and nobody can use the organization any more
    assert get_secret_store().get_secret(secret_name) is None
    assert q(admin_conn, "SELECT status FROM organizations WHERE id = %s", org) == [("suspended",)]
    assert client.get("/api/v1/overview", headers=admin).status_code == 403
    owners = q(
        admin_conn, "SELECT count(*) FROM notifications WHERE type = 'org.deletion_requested'"
    )
    assert owners == [(1,)]

    assert run_jobs("maintenance.org_purge") == 1
    assert q(admin_conn, "SELECT count(*) FROM organizations WHERE id = %s", org) == [(0,)]
    for table in ("connections", "users", "scans", "notifications", "audit_logs", "alert_rules"):
        sql = f"SELECT count(*) FROM {table} WHERE org_id = %s"  # noqa: S608 -- fixed list
        assert q(admin_conn, sql, org) == [(0,)], table
    assert [b.name for b in get_blob_store().list_blobs("reports", prefix=f"{org}/")] == []
    trail = q(
        admin_conn,
        "SELECT action FROM audit_logs WHERE org_id IS NULL AND target = %s ORDER BY created_at",
        f"org:{org}",
    )
    assert trail == [("org.deletion_requested",), ("org.purged",)]


def test_default_alert_rules_are_created_once_under_concurrency(
    admin_conn: psycopg.Connection[tuple[object, ...]],
) -> None:
    org = acme(admin_conn)
    errors: list[BaseException] = []
    first_inserted = threading.Event()

    def first() -> None:
        try:
            with session_scope() as s:
                set_tenant(s, org)
                alerts.ensure_default_rules(s, org)
                first_inserted.set()
                time.sleep(0.5)  # keep the transaction open while the second one runs
        except BaseException as exc:
            errors.append(exc)

    def second() -> None:
        try:
            first_inserted.wait(5)
            with session_scope() as s:
                set_tenant(s, org)
                alerts.ensure_default_rules(s, org)  # does not see the uncommitted rows
        except BaseException as exc:
            errors.append(exc)

    threads = [threading.Thread(target=first), threading.Thread(target=second)]
    for t in threads:
        t.start()
    for t in threads:
        t.join(10)
    assert errors == []
    count = q(admin_conn, "SELECT count(*) FROM alert_rules WHERE org_id = %s", org)
    assert count == [(len(alerts.DEFAULT_RULES),)]


def test_alert_rule_names_are_unique(client: TestClient) -> None:
    admin = auth_headers(client, "admin@acme.test")
    client.get("/api/v1/alerts/rules", headers=admin)
    resp = client.post(
        "/api/v1/alerts/rules",
        json={"name": "Critical risks", "event_type": "new_critical_risk"},
        headers=admin,
    )
    assert resp.status_code == 422
    assert "exists" in resp.json()["error"]["message"]


def test_cors_preflight_allows_the_view_as_header(client: TestClient) -> None:
    """Production calls the API cross-origin, so the custom header must pass the preflight."""
    resp = client.options(
        "/api/v1/me",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Headers": "authorization,x-kloudrecon-view-as",
        },
    )
    assert resp.status_code == 200
    allowed = resp.headers["access-control-allow-headers"].lower()
    assert "x-kloudrecon-view-as" in allowed


def test_rate_limit_returns_the_error_envelope(monkeypatch: pytest.MonkeyPatch) -> None:
    from kloudrecon.api.main import create_app
    from kloudrecon.core.config import get_settings

    monkeypatch.setattr(get_settings(), "rate_limit_default", "3/minute")
    with TestClient(create_app(start_listener=False)) as c:
        codes = [c.get("/api/v1/me").status_code for _ in range(4)]
        assert codes == [401, 401, 401, 429]
        resp = c.get("/api/v1/me")
        assert resp.json()["error"]["code"] == "rate_limited"
        assert int(resp.headers["retry-after"]) >= 1
        # health checks are never limited (availability test, deploy probe)
        assert c.get("/api/v1/health").status_code == 200


def test_client_ip_trusts_forwarded_for_only_from_the_local_proxy() -> None:
    from kloudrecon.core.ratelimit import client_ip

    fwd = [(b"x-forwarded-for", b"203.0.113.7, 10.0.0.1")]
    assert client_ip({"client": ("127.0.0.1", 1), "headers": fwd}) == "203.0.113.7"
    assert client_ip({"client": ("198.51.100.9", 1), "headers": fwd}) == "198.51.100.9"


def test_unexpected_errors_do_not_leak_details() -> None:
    from kloudrecon.api.main import create_app

    app = create_app(start_listener=False)

    @app.get("/api/v1/boom-test")
    def boom() -> None:
        raise RuntimeError("secret internals: password=hunter2 at /opt/kloudrecon/x.py")

    with TestClient(app, raise_server_exceptions=False) as c:
        resp = c.get("/api/v1/boom-test")
    assert resp.status_code == 500
    body = resp.text
    assert "hunter2" not in body
    assert "Traceback" not in body
    assert "/opt/kloudrecon" not in body
    assert resp.json()["error"]["code"]


def test_public_demo_session_is_read_only(
    client: TestClient, admin_conn: psycopg.Connection[tuple[object, ...]]
) -> None:
    assert client.get("/api/v1/public/demo").json() == {"available": False}  # no demo org yet
    assert client.post("/api/v1/public/demo/session").status_code == 404
    # a stand-in for the seeded demo viewer (seed-demo creates viewer@contoso.test)
    admin_conn.execute(
        "INSERT INTO users (org_id, external_oid, email, name, org_role, status) "
        "VALUES (%s, 'dev:viewer@contoso.test', 'viewer@contoso.test', 'Val', 'viewer', 'active')",
        (acme(admin_conn),),
    )
    assert client.get("/api/v1/public/demo").json() == {"available": True}
    session = client.post("/api/v1/public/demo/session").json()
    assert session["expires_in"] == 7200
    demo = {"Authorization": f"Bearer {session['access_token']}"}
    me = client.get("/api/v1/me", headers=demo).json()
    assert me["state"] == "active"
    assert me["user"]["org_role"] == "viewer"
    assert client.get("/api/v1/overview", headers=demo).status_code == 200
    resp = client.post("/api/v1/ai/chat/sessions", headers=demo)
    assert resp.status_code == 403
    assert resp.json()["error"]["code"] == "demo_read_only"
    assert client.patch("/api/v1/me", json={"name": "x"}, headers=demo).status_code == 403
    # a forged demo token (wrong key) is rejected
    forged = session["access_token"][:-4] + "abcd"
    assert (
        client.get("/api/v1/me", headers={"Authorization": f"Bearer {forged}"}).status_code == 401
    )
    # the owner can switch the public demo off
    owner = auth_headers(client, "owner@local.test")
    client.put(
        "/api/v1/owner/feature-flags", json={"key": "public_demo", "enabled": False}, headers=owner
    )
    assert client.get("/api/v1/public/demo").json() == {"available": False}
