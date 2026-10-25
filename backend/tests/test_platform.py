"""Owner console, part 2 (decision 0039): health, announcements, feature flags, email template
overrides and the audited read-only view of a customer organization."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

import psycopg
import pytest
from fastapi.testclient import TestClient

from kloudrecon.core.db import session_scope
from kloudrecon.core.rls import enable_system
from kloudrecon.services import platform
from tests.conftest import auth_headers

pytestmark = pytest.mark.usefixtures("seeded")

VIEW = "X-KloudRecon-View-As"


def q(conn: psycopg.Connection[tuple[object, ...]], sql: str, *args: object) -> list[Any]:
    return conn.execute(sql, args).fetchall()


def acme(conn: psycopg.Connection[tuple[object, ...]]) -> str:
    return str(q(conn, "SELECT org_id FROM users WHERE email = 'admin@acme.test'")[0][0])


def test_health_reports_host_queue_and_dead_jobs(
    client: TestClient, admin_conn: psycopg.Connection[tuple[object, ...]]
) -> None:
    admin_conn.execute(
        "INSERT INTO jobs (type, status, attempts, last_error) "
        "VALUES ('notify.email', 'dead', 5, 'SMTP failed: password=hunter2')"
    )
    owner = auth_headers(client, "owner@local.test")
    body = client.get("/api/v1/owner/health", headers=owner).json()
    assert body["process"]["hostname"]
    assert body["process"]["db_size_bytes"] > 0
    assert body["jobs"]["dead"] == 1
    (dead,) = body["dead_jobs"]
    assert dead["type"] == "notify.email"
    assert "hunter2" not in dead["last_error"]  # redacted
    customer = auth_headers(client, "admin@acme.test")
    assert client.get("/api/v1/owner/health", headers=customer).status_code == 403


def test_announcements_lifecycle(client: TestClient) -> None:
    owner = auth_headers(client, "owner@local.test")
    customer = auth_headers(client, "admin@acme.test")
    now = datetime.now(UTC)
    live = client.post(
        "/api/v1/owner/announcements",
        json={"title": "Maintenance on Sunday", "level": "warning", "link": "/app/settings"},
        headers=owner,
    )
    assert live.status_code == 201, live.text
    future = {
        "title": "Coming soon",
        "starts_at": (now + timedelta(days=2)).isoformat(),
        "ends_at": (now + timedelta(days=3)).isoformat(),
    }
    assert client.post("/api/v1/owner/announcements", json=future, headers=owner).status_code == 201
    bad = {**future, "ends_at": (now + timedelta(days=1)).isoformat()}
    assert client.post("/api/v1/owner/announcements", json=bad, headers=owner).status_code == 422
    js = {"title": "x" * 5, "link": "javascript:alert(1)"}
    assert client.post("/api/v1/owner/announcements", json=js, headers=owner).status_code == 422
    shown = client.get("/api/v1/announcements", headers=customer).json()
    assert [a["title"] for a in shown] == ["Maintenance on Sunday"]
    aid = live.json()["id"]
    client.put(
        f"/api/v1/owner/announcements/{aid}",
        json={"title": "Maintenance on Sunday", "active": False},
        headers=owner,
    )
    assert client.get("/api/v1/announcements", headers=customer).json() == []
    assert (
        client.post(
            "/api/v1/owner/announcements", json={"title": "nope"}, headers=customer
        ).status_code
        == 403
    )


def test_feature_flags_per_org(
    client: TestClient, admin_conn: psycopg.Connection[tuple[object, ...]]
) -> None:
    owner = auth_headers(client, "owner@local.test")
    customer = auth_headers(client, "admin@acme.test")
    assert client.get("/api/v1/features", headers=customer).json()["ai_chat"] is True
    resp = client.put(
        "/api/v1/owner/feature-flags",
        json={
            "key": "beta_widgets",
            "description": "Beta",
            "enabled": True,
            "org_ids": [acme(admin_conn)],
        },
        headers=owner,
    )
    assert resp.status_code == 200, resp.text
    assert client.get("/api/v1/features", headers=customer).json()["beta_widgets"] is True
    client.put(
        "/api/v1/owner/feature-flags",
        json={"key": "beta_widgets", "enabled": True, "org_ids": [str(uuid.uuid4())]},
        headers=owner,
    )
    assert client.get("/api/v1/features", headers=customer).json()["beta_widgets"] is False
    # turning ai_chat off blocks the chat API
    client.put(
        "/api/v1/owner/feature-flags", json={"key": "ai_chat", "enabled": False}, headers=owner
    )
    assert client.get("/api/v1/features", headers=customer).json()["ai_chat"] is False
    resp = client.post("/api/v1/ai/chat/sessions", headers=customer)
    assert resp.status_code == 403
    assert resp.json()["error"]["code"] == "feature_disabled"


def test_email_template_overrides_are_plain_text(
    client: TestClient, admin_conn: psycopg.Connection[tuple[object, ...]]
) -> None:
    owner = auth_headers(client, "owner@local.test")
    templates = client.get("/api/v1/owner/email-templates", headers=owner).json()
    welcome = next(t for t in templates if t["key"] == "welcome")
    assert welcome["default_subject"].startswith("Welcome to KloudRecon")
    assert welcome["placeholders"] == ["{org_name}", "{app_url}"]
    html = {"subject": "<b>Hi</b>", "intro": None}
    assert (
        client.put("/api/v1/owner/email-templates/welcome", json=html, headers=owner).status_code
        == 422
    )
    body = {
        "subject": "Welcome aboard, {org_name}",
        "intro": "We are glad you are here & ready.\n{secret}",
    }
    assert (
        client.put("/api/v1/owner/email-templates/welcome", json=body, headers=owner).status_code
        == 200
    )
    preview = client.post(
        "/api/v1/owner/email-templates/welcome/preview", json=body, headers=owner
    ).json()
    assert preview["subject"] == "Welcome aboard, Contoso Ltd"
    assert "We are glad you are here &amp; ready.<br>{secret}" in preview["html"]
    with session_scope() as s:
        enable_system(s)
        mail = platform.render_email(s, "welcome", {"org_name": "Acme Corp"})
    assert mail.subject == "Welcome aboard, Acme Corp"
    assert "We are glad you are here & ready." in mail.text
    # clearing both fields removes the override
    client.put("/api/v1/owner/email-templates/welcome", json={}, headers=owner)
    assert q(admin_conn, "SELECT count(*) FROM email_templates") == [(0,)]
    assert (
        client.put("/api/v1/owner/email-templates/nope", json=body, headers=owner).status_code
        == 404
    )


def test_read_only_org_view_is_audited_and_refuses_writes(
    client: TestClient, admin_conn: psycopg.Connection[tuple[object, ...]]
) -> None:
    owner = auth_headers(client, "owner@local.test")
    org = acme(admin_conn)
    grant = client.post(f"/api/v1/owner/orgs/{org}/view", headers=owner)
    assert grant.status_code == 200, grant.text
    token = grant.json()["token"]
    viewing = {**owner, VIEW: token}
    me = client.get("/api/v1/me", headers=viewing).json()
    assert me["org"]["name"] == "Acme Corp"
    assert me["user"]["org_role"] == "viewer"
    assert client.get("/api/v1/alerts/rules", headers=viewing).status_code == 200
    resp = client.post(
        "/api/v1/alerts/rules", json={"name": "x", "event_type": "scan_failed"}, headers=viewing
    )
    assert resp.status_code == 403
    assert resp.json()["error"]["code"] == "view_as_read_only"
    assert client.delete(f"/api/v1/alerts/rules/{uuid.uuid4()}", headers=viewing).status_code == 403
    audit = q(
        admin_conn,
        "SELECT org_id::text FROM audit_logs WHERE action = 'org.viewed_as_owner'",
    )
    assert audit == [(org,)]
    # the grant is bound to the owner: a customer cannot use it
    customer = auth_headers(client, "admin@acme.test")
    stolen = client.get("/api/v1/me", headers={**customer, VIEW: token})
    assert stolen.status_code == 403
    # a tampered grant is rejected
    assert client.get("/api/v1/me", headers={**owner, VIEW: token[:-2] + "xx"}).status_code == 403
