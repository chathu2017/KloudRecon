"""Daily scan schedule, secret expiry reminders, retention and scan notifications."""

from __future__ import annotations

import uuid
from datetime import UTC, date, datetime, timedelta
from typing import Any

import psycopg
import pytest
from fastapi.testclient import TestClient

from kloudrecon.core.db import session_scope
from kloudrecon.notify.emails import render
from kloudrecon.services import schedule
from kloudrecon.services.scan.pipeline import run_scan
from tests.conftest import auth_headers, use_azure_fixture
from tests.test_scans import create_connection, queued_scan

pytestmark = pytest.mark.usefixtures("seeded")


def q(conn: psycopg.Connection[tuple[object, ...]], sql: str, *args: object) -> list[Any]:
    return conn.execute(sql, args).fetchall()  # type: ignore[arg-type]


def test_daily_scan_is_queued_once_at_the_org_hour(
    client: TestClient, admin_conn: psycopg.Connection[tuple[object, ...]]
) -> None:
    _, conn_id = create_connection(client)
    admin_conn.execute("DELETE FROM scans")  # the first scan is not relevant here
    at_two = datetime(2026, 9, 26, 2, 10, tzinfo=UTC)
    with session_scope() as s:
        assert schedule.schedule_daily_scans(s, at_two) == 1
    with session_scope() as s:
        assert schedule.schedule_daily_scans(s, at_two + timedelta(minutes=5)) == 0
        assert schedule.schedule_daily_scans(s, at_two.replace(hour=3)) == 0
    assert q(admin_conn, "SELECT trigger FROM scans WHERE connection_id = %s", conn_id) == [
        ("scheduled",)
    ]
    # admin moves the schedule to 05:00 UTC and turns it off
    admin = auth_headers(client, "admin@acme.test")
    resp = client.put(
        "/api/v1/org/settings/scans",
        json={"daily_scan_enabled": False, "scan_hour_utc": 5},
        headers=admin,
    )
    assert resp.status_code == 200
    assert client.get("/api/v1/org/settings/scans", headers=admin).json() == {
        "daily_scan_enabled": False,
        "scan_hour_utc": 5,
    }
    admin_conn.execute("DELETE FROM scans")
    with session_scope() as s:
        assert schedule.schedule_daily_scans(s, datetime(2026, 9, 27, 5, 0, tzinfo=UTC)) == 0


def test_secret_reminders_30_14_7_1_and_expired(
    client: TestClient, admin_conn: psycopg.Connection[tuple[object, ...]]
) -> None:
    _, conn_id = create_connection(client)
    today = date(2026, 9, 26)
    admin_conn.execute(
        "UPDATE connections SET secret_expires_on = %s WHERE id = %s",
        (today + timedelta(days=10), conn_id),
    )
    with session_scope() as s:
        assert schedule.send_secret_reminders(s, today) == 1  # 14-day reminder (30 is implied)
    with session_scope() as s:
        assert schedule.send_secret_reminders(s, today) == 0
        assert schedule.send_secret_reminders(s, today + timedelta(days=3)) == 1  # 7 days left
        assert schedule.send_secret_reminders(s, today + timedelta(days=9)) == 1  # 1 day left
        assert schedule.send_secret_reminders(s, today + timedelta(days=11)) == 1  # expired
        assert schedule.send_secret_reminders(s, today + timedelta(days=12)) == 0
    titles = [r[0] for r in q(admin_conn, "SELECT title FROM notifications ORDER BY created_at")]
    assert any("expires in 10 days" in t for t in titles)
    assert any("expired" in t for t in titles)
    emails = q(admin_conn, "SELECT payload FROM jobs WHERE type = 'notify.email'")
    assert sum(1 for (p,) in emails if p["template"] == "secret_expiring") == 4


def test_replacing_the_secret_resets_reminders(
    client: TestClient, admin_conn: psycopg.Connection[tuple[object, ...]]
) -> None:
    admin, conn_id = create_connection(client)
    admin_conn.execute(
        "UPDATE connections SET settings = '{\"reminders_sent\": [30, 14]}' WHERE id = %s",
        (conn_id,),
    )
    use_azure_fixture("valid_all_green")
    client.put(
        f"/api/v1/connections/{conn_id}/secret",
        json={"client_secret": "kr~Another-Secret.Value~77", "secret_expires_on": "2027-12-31"},
        headers=admin,
    )
    settings = q(admin_conn, "SELECT settings FROM connections WHERE id = %s", conn_id)[0][0]
    assert settings["reminders_sent"] == []


def test_retention_keeps_latest_scans(
    client: TestClient, admin_conn: psycopg.Connection[tuple[object, ...]]
) -> None:
    _, conn_id = create_connection(client)
    org = q(admin_conn, "SELECT org_id FROM connections WHERE id = %s", conn_id)[0][0]
    for i in range(6):
        admin_conn.execute(
            "INSERT INTO scans (id, org_id, connection_id, sequence, trigger, status, created_at) "
            "VALUES (%s, %s, %s, %s, 'scheduled', 'succeeded', now() - make_interval(days => %s))",
            (uuid.uuid4(), org, conn_id, 10 + i, 100 + i),
        )
    with session_scope() as s:
        removed = schedule.apply_scan_retention(s)
    assert removed == 4  # 6 old + 1 queued first scan → keep 3 newest per connection
    assert q(admin_conn, "SELECT count(*) FROM scans")[0][0] == 3


def test_first_scan_notifies_admins_and_emails(
    client: TestClient, admin_conn: psycopg.Connection[tuple[object, ...]]
) -> None:
    _, conn_id = create_connection(client)
    use_azure_fixture("scan_v1")
    run_scan(queued_scan(admin_conn, conn_id))
    notes = q(admin_conn, "SELECT type, title, link FROM notifications")
    assert ("scan.completed", "Your first scan of Prod is ready", "/app") in notes
    templates = [
        p["template"]
        for (p,) in q(admin_conn, "SELECT payload FROM jobs WHERE type = 'notify.email'")
    ]
    assert "scan_completed" in templates
    events = [r[0] for r in q(admin_conn, "SELECT type FROM events")]
    assert "scan.progress" in events
    assert "scan.completed" in events


def test_failed_scan_notifies_and_respects_email_prefs(
    client: TestClient, admin_conn: psycopg.Connection[tuple[object, ...]]
) -> None:
    _, conn_id = create_connection(client)
    admin_conn.execute(
        "UPDATE users SET notification_prefs = '{\"email_scans\": false}' "
        "WHERE email = 'admin@acme.test'"
    )
    use_azure_fixture("bad_secret")
    assert run_scan(queued_scan(admin_conn, conn_id)) == "failed"
    notes = q(admin_conn, "SELECT type, body FROM notifications WHERE type = 'scan.failed'")
    assert notes
    assert "secret ID" in notes[0][1]
    templates = [
        p["template"]
        for (p,) in q(admin_conn, "SELECT payload FROM jobs WHERE type = 'notify.email'")
    ]
    assert "scan_failed" not in templates


@pytest.mark.parametrize(
    ("template", "context", "phrase"),
    [
        ("scan_completed", {"connection": "Prod", "first": True, "resources": 5}, "first"),
        ("scan_failed", {"connection": "Prod", "reason": "expired"}, "Scan failed"),
        (
            "secret_expiring",
            {"connection": "Prod", "days_left": 7, "expires_on": "2026-10-03"},
            "expires in 7",
        ),
        ("secret_expiring", {"connection": "Prod", "days_left": -2}, "expired"),
        ("risky_changes", {"connection": "Prod", "count": 2, "items": ["nsg: open"]}, "risky"),
    ],
)
def test_new_email_templates_render(template: str, context: dict[str, Any], phrase: str) -> None:
    email = render(template, context)
    assert phrase in email.subject
    assert "Prod" in email.text
    assert "<script" not in email.html
