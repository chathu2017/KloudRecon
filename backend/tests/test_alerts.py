"""Alert rules and channels (plan 9.11): default rules, plan gating, SSRF-safe URLs, secrets in the
SecretStore, fan-out to in-app / email / Teams / Slack / signed webhooks, retries, dedupe and the
scan + secret-expiry hooks."""

from __future__ import annotations

import json
import re
import uuid
from datetime import date, timedelta
from typing import Any

import httpx
import psycopg
import pytest
from fastapi.testclient import TestClient

from kloudrecon.core.db import session_scope
from kloudrecon.core.errors import ValidationFailed
from kloudrecon.core.rls import enable_system
from kloudrecon.domain.alert_models import Integration
from kloudrecon.jobs.handlers import JobContext, handle_notify_webhook
from kloudrecon.jobs.queue import ClaimedJob
from kloudrecon.notify.emails import render
from kloudrecon.services import alerts, schedule
from kloudrecon.services.infra import get_secret_store
from tests.conftest import auth_headers, register, run_jobs
from tests.test_scans import create_connection

pytestmark = pytest.mark.usefixtures("seeded")

HOOK = "http://localhost:9000/hook"


def q(conn: psycopg.Connection[tuple[object, ...]], sql: str, *args: object) -> list[Any]:
    return conn.execute(sql, args).fetchall()  # type: ignore[arg-type]


def acme_id(conn: psycopg.Connection[tuple[object, ...]]) -> uuid.UUID:
    return uuid.UUID(str(q(conn, "SELECT org_id FROM users WHERE email = 'admin@acme.test'")[0][0]))


def set_plan(conn: psycopg.Connection[tuple[object, ...]], code: str) -> None:
    conn.execute(
        "UPDATE organizations SET plan_id = (SELECT id FROM plans WHERE code = %s) "
        "WHERE id = (SELECT org_id FROM users WHERE email = 'admin@acme.test')",
        (code,),
    )


class Receiver:
    """In-process webhook endpoint (httpx MockTransport)."""

    def __init__(self, status: int = 200) -> None:
        self.status = status
        self.requests: list[httpx.Request] = []

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        return httpx.Response(self.status, json={"ok": self.status < 300})


@pytest.fixture
def receiver() -> Any:
    r = Receiver()
    alerts.set_transport(httpx.MockTransport(r))
    yield r
    alerts.set_transport(None)


def add_webhook(client: TestClient, admin: dict[str, str], kind: str = "webhook") -> dict[str, Any]:
    resp = client.post(
        "/api/v1/integrations",
        json={"kind": kind, "name": f"{kind} hook", "url": HOOK},
        headers=admin,
    )
    assert resp.status_code == 201, resp.text
    body: dict[str, Any] = resp.json()
    return body


def critical_event(key: str = "scan:1") -> alerts.AlertEvent:
    return alerts.AlertEvent(
        "new_critical_risk",
        "1 new critical risk",
        "Storage account allows public blob access (stdata01)",
        "critical",
        "/app/security/findings?severity=critical",
        key,
        [{"title": "Public blob access", "resource": "stdata01"}],
    )


# ---- URL validation ------------------------------------------------------------------------------
@pytest.mark.parametrize(
    ("kind", "url", "error"),
    [
        ("webhook", "http://example.com/hook", "https"),
        ("webhook", "https://user:pw@example.com/hook", "without credentials"),
        ("webhook", "https://10.1.2.3/hook", "public internet"),
        ("webhook", "https://169.254.169.254/latest", "public internet"),
        ("teams", "https://example.com/hook", "Teams"),
        ("slack", "https://example.com/hook", "Slack"),
    ],
)
def test_webhook_urls_are_validated(kind: str, url: str, error: str) -> None:
    with pytest.raises(ValidationFailed) as exc:
        alerts.validate_url(kind, url)
    assert error in exc.value.message


def test_localhost_is_allowed_outside_production() -> None:
    assert alerts.validate_url("webhook", HOOK) == "localhost"


# ---- rules and channels via the API --------------------------------------------------------------
def test_default_rules_and_event_catalog(client: TestClient) -> None:
    admin = auth_headers(client, "admin@acme.test")
    events = client.get("/api/v1/alerts/events", headers=admin).json()
    assert {e["key"] for e in events} == set(alerts.EVENTS)
    assert next(e for e in events if e["key"] == "risky_change")["builtin_notice"] is True
    rules = client.get("/api/v1/alerts/rules", headers=admin).json()
    assert len(rules) == len(alerts.DEFAULT_RULES)
    critical = next(r for r in rules if r["event_type"] == "new_critical_risk")
    assert critical["channels"] == {"in_app": True, "email": True, "integrations": []}
    # built-in notices already cover these, so their default rules start without in-app/email
    risky = next(r for r in rules if r["event_type"] == "risky_change")
    assert risky["channels"] == {"in_app": False, "email": False, "integrations": []}
    # listing again does not duplicate
    assert len(client.get("/api/v1/alerts/rules", headers=admin).json()) == len(rules)


def test_rule_crud_and_roles(client: TestClient) -> None:
    admin = auth_headers(client, "admin@acme.test")
    body = {
        "name": "Big anomalies",
        "event_type": "cost_anomaly",
        "config": {"min_amount": 500},
        "channels": {"in_app": True},
    }
    created = client.post("/api/v1/alerts/rules", json=body, headers=admin)
    assert created.status_code == 201, created.text
    rule = created.json()
    assert rule["config"] == {"min_amount": 500.0}
    upd = client.put(
        f"/api/v1/alerts/rules/{rule['id']}", json={**body, "enabled": False}, headers=admin
    )
    assert upd.json()["enabled"] is False
    bad = client.post(
        "/api/v1/alerts/rules",
        json={**body, "channels": {"integrations": [str(uuid.uuid4())]}},
        headers=admin,
    )
    assert bad.status_code == 422
    assert (
        client.post(
            "/api/v1/alerts/rules", json={**body, "event_type": "nope"}, headers=admin
        ).status_code
        == 422
    )
    assert client.delete(f"/api/v1/alerts/rules/{rule['id']}", headers=admin).status_code == 200


def test_webhooks_need_a_plan_with_the_feature(
    client: TestClient, admin_conn: psycopg.Connection[tuple[object, ...]]
) -> None:
    admin = auth_headers(client, "admin@acme.test")  # Acme is on Starter
    resp = client.post(
        "/api/v1/integrations",
        json={"kind": "webhook", "name": "hook", "url": HOOK},
        headers=admin,
    )
    assert resp.status_code == 403
    assert resp.json()["error"]["code"] == "plan_feature"
    set_plan(admin_conn, "pro")
    assert add_webhook(client, admin)["signing_secret"].startswith("whsec_")


def test_integration_url_is_a_secret(
    client: TestClient, admin_conn: psycopg.Connection[tuple[object, ...]]
) -> None:
    set_plan(admin_conn, "pro")
    admin = auth_headers(client, "admin@acme.test")
    created = add_webhook(client, admin)
    listed = client.get("/api/v1/integrations", headers=admin)
    assert HOOK not in listed.text
    assert listed.json()[0]["url_hint"] == "localhost"
    (secret_name,) = q(admin_conn, "SELECT secret_name FROM integrations")[0]
    assert HOOK not in json.dumps(q(admin_conn, "SELECT * FROM integrations"), default=str)
    stored = json.loads(get_secret_store().get_secret(secret_name) or "{}")
    assert stored["url"] == HOOK
    assert stored["signing_secret"] == created["signing_secret"]
    # another organization cannot see or touch it
    other = register(client, "someone@elsewhere.test")
    iid = created["integration"]["id"]
    # (a new sign-up is pending approval, so the access gate refuses it outright)
    assert client.delete(f"/api/v1/integrations/{iid}", headers=other).status_code == 403
    with session_scope() as s:
        from kloudrecon.core.rls import set_tenant

        set_tenant(s, uuid.uuid4())
        assert s.query(Integration).count() == 0  # RLS hides other orgs' rows
    # deleting removes the stored secret
    assert client.delete(f"/api/v1/integrations/{iid}", headers=admin).status_code == 200
    assert get_secret_store().get_secret(secret_name) is None


# ---- delivery ------------------------------------------------------------------------------------
def test_dispatch_fans_out_and_signs_webhooks(
    client: TestClient, admin_conn: psycopg.Connection[tuple[object, ...]], receiver: Receiver
) -> None:
    set_plan(admin_conn, "pro")
    admin = auth_headers(client, "admin@acme.test")
    created = add_webhook(client, admin)
    iid, secret = created["integration"]["id"], created["signing_secret"]
    rules = client.get("/api/v1/alerts/rules", headers=admin).json()
    rule = next(r for r in rules if r["event_type"] == "new_critical_risk")
    client.put(
        f"/api/v1/alerts/rules/{rule['id']}",
        json={
            "name": rule["name"],
            "event_type": rule["event_type"],
            "channels": {"in_app": True, "email": True, "integrations": [iid]},
        },
        headers=admin,
    )
    org = acme_id(admin_conn)
    with session_scope() as s:
        enable_system(s)
        assert alerts.dispatch(s, org, [critical_event()]) == 1
    # in-app + email for owners/admins, webhook queued for the worker
    assert q(admin_conn, "SELECT title FROM notifications WHERE type = 'alert.new_critical_risk'")
    emails = q(admin_conn, "SELECT payload FROM jobs WHERE type = 'notify.email'")
    assert any(p["template"] == "alert" for (p,) in emails)
    assert run_jobs("notify.webhook") == 1
    (req,) = receiver.requests
    sig = req.headers["X-KloudRecon-Signature"]
    assert alerts.verify_signature(secret, sig, req.content)
    assert not alerts.verify_signature("whsec_wrong", sig, req.content)
    payload = json.loads(req.content)
    assert payload["type"] == "new_critical_risk"
    assert payload["link"].endswith("/app/security/findings?severity=critical")
    assert req.headers["X-KloudRecon-Event"] == "new_critical_risk"
    statuses = {(c, s) for c, s in q(admin_conn, "SELECT channel, status FROM alert_deliveries")}
    assert statuses == {("in_app", "sent"), ("email", "sent"), ("webhook", "sent")}
    # the same event (same dedupe key) is not sent twice
    with session_scope() as s:
        enable_system(s)
        assert alerts.dispatch(s, org, [critical_event()]) == 0
    log = client.get("/api/v1/alerts/deliveries", headers=admin).json()
    assert len(log) == 3


def test_severity_filter(admin_conn: psycopg.Connection[tuple[object, ...]]) -> None:
    org = acme_id(admin_conn)
    with session_scope() as s:
        enable_system(s)
        rule = next(r for r in alerts.list_rules(s, org) if r.event_type == "new_critical_risk")
        rule.config = {"min_severity": "critical"}
        ev = critical_event("k1")
        ev.severity = "high"
        assert alerts.dispatch(s, org, [ev]) == 0
        assert alerts.dispatch(s, org, [critical_event("k2")]) == 1


def test_failed_webhook_retries_then_fails(
    client: TestClient, admin_conn: psycopg.Connection[tuple[object, ...]], receiver: Receiver
) -> None:
    receiver.status = 500
    set_plan(admin_conn, "pro")
    admin = auth_headers(client, "admin@acme.test")
    iid = add_webhook(client, admin, "webhook")["integration"]["id"]
    org = acme_id(admin_conn)
    with session_scope() as s:
        enable_system(s)
        rule = next(r for r in alerts.list_rules(s, org) if r.event_type == "scan_failed")
        rule.channels = {"integrations": [iid]}
        s.flush()
        ev = alerts.AlertEvent("scan_failed", "Scan #2 failed", "x", "high", "/app", "scan:2")
        assert alerts.dispatch(s, org, [ev]) == 1
    ((delivery_id, job_payload),) = q(
        admin_conn,
        "SELECT (payload->>'delivery_id'), payload FROM jobs WHERE type = 'notify.webhook'",
    )

    def attempt(n: int, of: int) -> None:
        job = ClaimedJob(
            id=uuid.uuid4(), org_id=org, type="notify.webhook", payload=job_payload,
            attempts=n, max_attempts=of,
        )  # fmt: skip
        with pytest.raises(RuntimeError):
            handle_notify_webhook(JobContext(job=job, worker_id="test"))

    attempt(1, 3)
    row = q(admin_conn, "SELECT status, attempts, response_code FROM alert_deliveries "
            "WHERE id = %s", delivery_id)  # fmt: skip
    assert row == [("retrying", 1, 500)]  # the attempt survives the failed job
    attempt(3, 3)
    assert q(admin_conn, "SELECT status FROM alert_deliveries WHERE id = %s", delivery_id) == [
        ("failed",)
    ]
    listed = client.get("/api/v1/integrations", headers=admin).json()
    assert listed[0]["last_status"] == "failed"
    assert listed[0]["last_error"] == "HTTP 500"


def test_test_message_for_teams_and_slack(
    client: TestClient,
    admin_conn: psycopg.Connection[tuple[object, ...]],
    receiver: Receiver,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Teams/Slack hosts are allow-listed (and re-checked before every delivery); point them at
    # the in-process receiver for this test only.
    monkeypatch.setattr(alerts, "validate_url", lambda kind, url: "localhost")
    set_plan(admin_conn, "pro")
    admin = auth_headers(client, "admin@acme.test")
    org = acme_id(admin_conn)
    ids = []
    for kind in ("teams", "slack"):
        with session_scope() as s:
            enable_system(s)
            row = Integration(org_id=org, kind=kind, name=kind, secret_name="", url_hint="x")
            s.add(row)
            s.flush()
            row.secret_name = f"integration-test-{row.id.hex}"
            get_secret_store().set_secret(row.secret_name, json.dumps({"url": HOOK}))
            ids.append(str(row.id))
    for iid in ids:
        resp = client.post(f"/api/v1/integrations/{iid}/test", headers=admin)
        assert resp.status_code == 200, resp.text
        assert resp.json()["status"] == "sent"
    teams, slack = (json.loads(r.content) for r in receiver.requests)
    card = teams["attachments"][0]
    assert card["contentType"] == "application/vnd.microsoft.card.adaptive"
    assert card["content"]["body"][1]["text"] == "Test alert from KloudRecon"
    assert slack["blocks"][0]["text"]["text"] == "Test alert from KloudRecon"
    assert "X-KloudRecon-Signature" not in receiver.requests[0].headers


def test_members_cannot_change_alerts(client: TestClient) -> None:
    admin = auth_headers(client, "admin@acme.test")
    resp = client.post(
        "/api/v1/team/invitations", json={"email": "mia@acme.test", "role": "member"}, headers=admin
    )
    assert resp.status_code == 201, resp.text
    token = re.search(r"/invite/(.+)$", resp.json()["invite_url"])
    assert token
    member = auth_headers(client, "mia@acme.test")
    assert client.post(f"/api/v1/invitations/{token.group(1)}/accept", headers=member).is_success
    assert client.get("/api/v1/alerts/rules", headers=member).status_code == 200
    resp = client.post(
        "/api/v1/alerts/rules", json={"name": "x", "event_type": "scan_failed"}, headers=member
    )
    assert resp.status_code == 403
    assert (
        client.post(
            "/api/v1/integrations",
            json={"kind": "webhook", "name": "x", "url": HOOK},
            headers=member,
        ).status_code
        == 403
    )


# ---- hooks ---------------------------------------------------------------------------------------
def test_secret_expiry_reminders_raise_alerts(
    client: TestClient, admin_conn: psycopg.Connection[tuple[object, ...]], receiver: Receiver
) -> None:
    set_plan(admin_conn, "pro")
    _, conn_id = create_connection(client)
    admin = auth_headers(client, "admin@acme.test")
    iid = add_webhook(client, admin)["integration"]["id"]
    rules = client.get("/api/v1/alerts/rules", headers=admin).json()
    rule = next(r for r in rules if r["event_type"] == "secret_expiring")
    client.put(
        f"/api/v1/alerts/rules/{rule['id']}",
        json={"name": rule["name"], "event_type": "secret_expiring",
              "channels": {"integrations": [iid]}},
        headers=admin,
    )  # fmt: skip
    today = date(2026, 9, 26)
    admin_conn.execute(
        "UPDATE connections SET secret_expires_on = %s WHERE id = %s",
        (today + timedelta(days=5), conn_id),
    )
    with session_scope() as s:
        assert schedule.send_secret_reminders(s, today) == 1
    assert run_jobs("notify.webhook") == 1
    payload = json.loads(receiver.requests[0].content)
    assert payload["type"] == "secret_expiring"
    assert payload["severity"] == "critical"
    assert "expires in 5 days" in payload["title"]


def test_alert_email_template() -> None:
    mail = render(
        "alert",
        {
            "title": "2 new attack paths",
            "summary": "Internet → vm-web → <Key Vault>",
            "event": "New attack path",
            "link": "/app/security/attack-paths",
            "org_name": "Acme",
        },
    )
    assert mail.subject == "[KloudRecon] 2 new attack paths"
    assert "&lt;Key Vault&gt;" in mail.html
    assert "/app/security/attack-paths" in mail.text
