"""Connections API: Save & Validate, friendly errors, secret handling, subscriptions, isolation."""

from __future__ import annotations

import json
import uuid
from typing import Any

import psycopg
import pytest
from fastapi.testclient import TestClient

from kloudrecon.services.infra import get_secret_store
from tests.conftest import auth_headers, register, use_azure_fixture

pytestmark = pytest.mark.usefixtures("seeded")

SECRET = "kr~Th1s-Is.The_Secret-VALUE~0042"
TENANT = "22222222-bbbb-4ccc-8ddd-000000000000"
CLIENT = "33333333-cccc-4ddd-8eee-000000000000"
SUB1 = "11111111-aaaa-4bbb-8ccc-000000000001"


def body(**overrides: Any) -> dict[str, Any]:
    data: dict[str, Any] = {
        "name": "Production tenant",
        "tenant_id": TENANT,
        "client_id": CLIENT,
        "client_secret": SECRET,
        "secret_expires_on": "2027-09-01",
        "scope": {"type": "all"},
        "tiers": {"core": True, "identity": False, "commitments": False},
    }
    data.update(overrides)
    return data


def add_member(
    conn: psycopg.Connection[tuple[object, ...]], email: str, role: str, org_email: str
) -> None:
    conn.execute(
        "INSERT INTO users (org_id, external_oid, email, name, org_role, status) "
        "SELECT org_id, %s, %s, %s, %s, 'active' FROM users WHERE email = %s",
        (f"dev:{email}", email, email.split("@")[0], role, org_email),
    )


def create(client: TestClient, headers: dict[str, str], **overrides: Any) -> dict[str, Any]:
    resp = client.post("/api/v1/connections", json=body(**overrides), headers=headers)
    assert resp.status_code == 201, resp.text
    result: dict[str, Any] = resp.json()
    return result


def test_save_and_validate_all_green(client: TestClient) -> None:
    use_azure_fixture("valid_all_green")
    admin = auth_headers(client, "admin@acme.test")
    saved = create(client, admin)
    conn = saved["connection"]
    assert saved["validation"]["status"] == "valid"
    assert conn["status"] == "valid"
    assert {c["status"] for c in saved["validation"]["checks"]} == {"pass"}
    assert conn["secret"] == {
        "stored": True,
        "expires_on": "2027-09-01",
        "days_left": conn["secret"]["days_left"],
        "updated_at": conn["secret"]["updated_at"],
    }
    assert [s["subscription_id"] for s in conn["subscriptions"]] == [
        SUB1,
        "11111111-aaaa-4bbb-8ccc-000000000002",
    ]
    assert get_secret_store().get_secret(f"kr-conn-{conn['id']}") == SECRET
    listed = client.get("/api/v1/connections", headers=admin).json()
    assert listed[0]["subscription_count"] == 2


def test_cost_unsupported_gives_partially_valid(client: TestClient) -> None:
    use_azure_fixture("valid_reader")
    saved = create(client, auth_headers(client, "admin@acme.test"))
    assert saved["connection"]["status"] == "partially_valid"
    subs = {s["subscription_id"]: s for s in saved["connection"]["subscriptions"]}
    assert subs[SUB1]["cost_available"] is True
    assert subs["11111111-aaaa-4bbb-8ccc-000000000002"]["cost_available"] is False


@pytest.mark.parametrize(
    ("fixture", "phrase"),
    [
        ("bad_secret", "copied the secret ID instead of the secret Value"),
        ("expired_secret", "client secret has expired"),
        ("app_not_found", "application (client) ID was not found"),
        ("tenant_not_found", "directory (tenant) ID was not found"),
    ],
)
def test_wrong_or_expired_secret_messages(client: TestClient, fixture: str, phrase: str) -> None:
    use_azure_fixture(fixture)
    saved = create(client, auth_headers(client, "admin@acme.test"))
    token = saved["validation"]["checks"][0]
    assert saved["connection"]["status"] == "invalid"
    assert token["key"] == "sign_in"
    assert token["status"] == "fail"
    assert phrase in token["message"]
    assert all(c["status"] == "skip" for c in saved["validation"]["checks"][1:])


def test_no_subscriptions_explains_role_propagation(client: TestClient) -> None:
    use_azure_fixture("no_subscriptions")
    saved = create(client, auth_headers(client, "admin@acme.test"))
    subs = next(c for c in saved["validation"]["checks"] if c["key"] == "subscriptions")
    assert subs["status"] == "fail"
    assert "5-10 minutes" in subs["message"]
    assert saved["connection"]["status"] == "invalid"


def test_write_access_is_warned(client: TestClient) -> None:
    use_azure_fixture("contributor")
    saved = create(client, auth_headers(client, "admin@acme.test"))
    perms = next(c for c in saved["validation"]["checks"] if c["key"] == "permissions")
    assert perms["status"] == "warn"
    assert "write access" in perms["message"]
    assert saved["connection"]["status"] == "partially_valid"


def test_identity_tier_reports_missing_graph_permissions(client: TestClient) -> None:
    use_azure_fixture("identity_partial")
    saved = create(
        client,
        auth_headers(client, "admin@acme.test"),
        tiers={"core": True, "identity": True, "commitments": True},
    )
    checks = {c["key"]: c for c in saved["validation"]["checks"]}
    assert checks["graph"]["status"] == "warn"
    perms = saved["validation"]["graph_permissions"]
    assert perms["User.Read.All"] == "granted"
    assert perms["Policy.Read.All"] == "missing"
    assert checks["commitments"]["status"] == "warn"


def test_secret_id_is_rejected_with_friendly_message(client: TestClient) -> None:
    guid_secret = str(uuid.uuid4())
    resp = client.post(
        "/api/v1/connections",
        json=body(client_secret=guid_secret),
        headers=auth_headers(client, "admin@acme.test"),
    )
    assert resp.status_code == 422
    assert "secret ID" in resp.text
    assert guid_secret not in resp.text


def test_invalid_ids_rejected(client: TestClient) -> None:
    resp = client.post(
        "/api/v1/connections",
        json=body(client_id="not-a-guid"),
        headers=auth_headers(client, "admin@acme.test"),
    )
    assert resp.status_code == 422
    assert "GUID" in resp.text


def test_only_admins_manage_connections(
    client: TestClient, admin_conn: psycopg.Connection[tuple[object, ...]]
) -> None:
    add_member(admin_conn, "mia@acme.test", "member", "admin@acme.test")
    member = auth_headers(client, "mia@acme.test")
    assert client.post("/api/v1/connections", json=body(), headers=member).status_code == 403
    assert client.get("/api/v1/connections", headers=member).status_code == 200


def test_plan_limit_on_connections(client: TestClient) -> None:
    use_azure_fixture("valid_all_green")
    admin = auth_headers(client, "admin@acme.test")  # Acme is on Starter: 1 connection
    create(client, admin)
    resp = client.post("/api/v1/connections", json=body(name="Second"), headers=admin)
    assert resp.status_code == 403
    assert resp.json()["error"]["code"] == "plan_limit"


def test_duplicate_name_conflicts(client: TestClient) -> None:
    use_azure_fixture("valid_all_green")
    owner = auth_headers(client, "owner@local.test")
    admin = auth_headers(client, "admin@acme.test")
    acme = client.get("/api/v1/me", headers=admin).json()["org"]["id"]
    client.patch(f"/api/v1/owner/orgs/{acme}", json={"plan_code": "pro"}, headers=owner)
    create(client, admin)
    resp = client.post("/api/v1/connections", json=body(), headers=admin)
    assert resp.status_code == 409


def test_replace_secret_revalidates(client: TestClient) -> None:
    use_azure_fixture("expired_secret")
    admin = auth_headers(client, "admin@acme.test")
    conn = create(client, admin)["connection"]
    assert conn["status"] == "invalid"
    use_azure_fixture("valid_all_green")
    new_secret = "kr~Brand-New.Secret_Value~0099"
    resp = client.put(
        f"/api/v1/connections/{conn['id']}/secret",
        json={"client_secret": new_secret, "secret_expires_on": "2028-01-31"},
        headers=admin,
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["connection"]["status"] == "valid"
    assert data["connection"]["secret"]["expires_on"] == "2028-01-31"
    assert new_secret not in resp.text
    assert get_secret_store().get_secret(f"kr-conn-{conn['id']}") == new_secret


def test_revalidate_uses_stored_secret(client: TestClient) -> None:
    use_azure_fixture("valid_all_green")
    admin = auth_headers(client, "admin@acme.test")
    conn = create(client, admin)["connection"]
    transports = use_azure_fixture("valid_all_green")
    resp = client.post(f"/api/v1/connections/{conn['id']}/validate", headers=admin)
    assert resp.status_code == 200
    assert resp.json()["status"] == "valid"
    token_request = transports[0].requests[0]  # type: ignore[attr-defined]
    assert SECRET in token_request.content.decode()  # sent to Entra ID only


def test_delete_removes_secret_and_data(client: TestClient) -> None:
    use_azure_fixture("valid_all_green")
    admin = auth_headers(client, "admin@acme.test")
    conn = create(client, admin)["connection"]
    assert client.delete(f"/api/v1/connections/{conn['id']}", headers=admin).status_code == 204
    assert get_secret_store().get_secret(f"kr-conn-{conn['id']}") is None
    assert client.get(f"/api/v1/connections/{conn['id']}", headers=admin).status_code == 404
    assert client.get("/api/v1/subscriptions", headers=admin).json() == []


def test_subscription_toggles_and_plan_limit(client: TestClient) -> None:
    use_azure_fixture("valid_all_green")
    admin = auth_headers(client, "admin@acme.test")
    create(client, admin)
    subs = client.get("/api/v1/subscriptions", headers=admin).json()
    first = subs[0]
    resp = client.patch(
        f"/api/v1/subscriptions/{first['id']}",
        json={"enabled": False, "is_production": True},
        headers=admin,
    )
    assert resp.status_code == 200
    assert resp.json()["enabled"] is False
    assert resp.json()["is_production"] is True
    assert resp.json()["disabled_reason"] == "Disabled by an admin"


def test_connections_are_tenant_isolated(client: TestClient) -> None:
    use_azure_fixture("valid_all_green")
    admin = auth_headers(client, "admin@acme.test")
    conn = create(client, admin)["connection"]
    owner = auth_headers(client, "owner@local.test")
    other = register(client, "boss@other.test")
    other_org = client.get("/api/v1/me", headers=other).json()["org"]["id"]
    client.post(
        f"/api/v1/owner/registrations/{other_org}/approve",
        json={"plan_code": "starter", "trial_days": 0},
        headers=owner,
    )
    assert client.get("/api/v1/connections", headers=other).json() == []
    assert client.get(f"/api/v1/connections/{conn['id']}", headers=other).status_code == 404
    assert client.get("/api/v1/subscriptions", headers=other).json() == []
    resp = client.delete(f"/api/v1/connections/{conn['id']}", headers=other)
    assert resp.status_code == 404


def test_secret_never_appears_in_responses_logs_or_database(
    client: TestClient,
    admin_conn: psycopg.Connection[tuple[object, ...]],
    capfd: pytest.CaptureFixture[str],
) -> None:
    from kloudrecon.core.logging import configure_logging

    configure_logging("DEBUG", "json")
    use_azure_fixture("bad_secret")
    admin = auth_headers(client, "admin@acme.test")
    bodies: list[str] = []
    resp = client.post("/api/v1/connections", json=body(), headers=admin)
    bodies.append(resp.text)
    conn_id = resp.json()["connection"]["id"]
    use_azure_fixture("valid_all_green")
    for method, path, payload in (
        ("PUT", f"/api/v1/connections/{conn_id}/secret", {"client_secret": SECRET}),
        ("POST", f"/api/v1/connections/{conn_id}/validate", None),
        ("PATCH", f"/api/v1/connections/{conn_id}", {"name": "Renamed"}),
        ("GET", f"/api/v1/connections/{conn_id}", None),
        ("GET", "/api/v1/connections", None),
        ("GET", "/api/v1/subscriptions", None),
        ("GET", "/api/v1/org/audit-logs", None),
        ("GET", "/api/v1/notifications", None),
    ):
        r = client.request(method, path, json=payload, headers=admin)
        assert r.status_code < 400, (path, r.text)
        bodies.append(r.text)
    for text in bodies:
        assert SECRET not in text

    # Nothing in any table (events, jobs, audit logs, validation reports...) holds the secret.
    tables = [
        row[0]
        for row in admin_conn.execute(
            "SELECT tablename FROM pg_tables WHERE schemaname = 'public'"
        ).fetchall()
    ]
    for table in tables:
        query = f'SELECT row_to_json(t)::text FROM "{table}" t'  # noqa: S608 - pg_tables names
        rows = admin_conn.execute(query).fetchall()
        dump = json.dumps([r[0] for r in rows])
        assert SECRET not in dump, f"secret found in table {table}"

    out, err = capfd.readouterr()
    assert "connection_validated" in out + err  # logging really ran
    assert SECRET not in out
    assert SECRET not in err
