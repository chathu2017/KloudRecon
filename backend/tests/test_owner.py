from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from kloudrecon.core.config import get_settings
from kloudrecon.services.infra import get_email_sender
from kloudrecon.services.infra.email import MemoryEmailSender
from kloudrecon.worker.main import Worker
from tests.conftest import auth_headers, register

pytestmark = pytest.mark.usefixtures("seeded")

OWNER_GETS = [
    "/api/v1/owner/overview",
    "/api/v1/owner/registrations",
    "/api/v1/owner/orgs",
    "/api/v1/owner/users",
    "/api/v1/owner/plans",
    "/api/v1/owner/audit-logs",
]


def _owner(client: TestClient) -> dict[str, str]:
    return auth_headers(client, "owner@local.test")


def _drain_jobs() -> None:
    worker = Worker(get_settings())
    while (job := worker._claim()) is not None:
        worker._execute(job)


def _org_id(client: TestClient, headers: dict[str, str]) -> str:
    return str(client.get("/api/v1/me", headers=headers).json()["org"]["id"])


@pytest.mark.parametrize("path", OWNER_GETS)
@pytest.mark.parametrize("email", ["admin@acme.test", "pending@new.test", "stranger@x.test"])
def test_owner_endpoints_forbidden_for_non_owners(
    client: TestClient, path: str, email: str
) -> None:
    resp = client.get(path, headers=auth_headers(client, email))
    assert resp.status_code == 403
    assert resp.json()["error"]["code"] == "owner_only"


@pytest.mark.parametrize("path", OWNER_GETS)
def test_owner_endpoints_require_auth(client: TestClient, path: str) -> None:
    assert client.get(path).status_code == 401


@pytest.mark.parametrize("path", OWNER_GETS)
def test_owner_endpoints_ok_for_owner(client: TestClient, path: str) -> None:
    assert client.get(path, headers=_owner(client)).status_code == 200


def test_owner_mutations_forbidden_for_org_admin(client: TestClient) -> None:
    admin = auth_headers(client, "admin@acme.test")
    pending_org = client.get("/api/v1/owner/registrations", headers=_owner(client)).json()[0]
    org_id = pending_org["org"]["id"]
    resp = client.post(
        f"/api/v1/owner/registrations/{org_id}/approve",
        json={"plan_code": "pro", "trial_days": 0},
        headers=admin,
    )
    assert resp.status_code == 403


def test_full_approval_flow_sends_welcome_email(client: TestClient) -> None:
    customer = register(client, "jane@contoso.test")
    assert client.get("/api/v1/org", headers=customer).status_code == 403

    owner = _owner(client)
    queue = client.get("/api/v1/owner/registrations", headers=owner).json()
    names = {r["org"]["name"] for r in queue}
    assert {"Contoso Test", "NewCo Ltd"} <= names
    org_id = _org_id(client, customer)
    entry = next(r for r in queue if r["org"]["id"] == org_id)
    assert entry["owner"]["email"] == "jane@contoso.test"
    assert entry["waiting_seconds"] >= 0

    resp = client.post(
        f"/api/v1/owner/registrations/{org_id}/approve",
        json={"plan_code": "trial", "trial_days": 14},
        headers=owner,
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["status"] == "active"
    assert resp.json()["plan_name"] == "Trial"

    me = client.get("/api/v1/me", headers=customer).json()
    assert me["state"] == "active"
    assert me["org"]["trial_ends_at"] is not None
    assert client.get("/api/v1/org", headers=customer).status_code == 200

    _drain_jobs()
    sender = get_email_sender()
    assert isinstance(sender, MemoryEmailSender)
    subjects = {(m.to[0], m.subject) for m in sender.sent}
    assert ("jane@contoso.test", "Welcome to KloudRecon — your account is approved") in subjects
    assert any(to == "owner@local.test" for to, _ in subjects)  # new-registration email

    notes = client.get("/api/v1/notifications", headers=customer).json()
    assert notes["items"][0]["type"] == "account.approved"

    audit = client.get("/api/v1/owner/audit-logs", headers=owner).json()
    assert any(a["action"] == "registration.approved" for a in audit)


def test_reject_flow(client: TestClient) -> None:
    customer = register(client, "bob@spam.test")
    org_id = _org_id(client, customer)
    resp = client.post(
        f"/api/v1/owner/registrations/{org_id}/reject",
        json={"reason": "Could not verify the company."},
        headers=_owner(client),
    )
    assert resp.status_code == 200
    me = client.get("/api/v1/me", headers=customer).json()
    assert me["state"] == "rejected"
    assert me["rejection_reason"] == "Could not verify the company."
    resp = client.get("/api/v1/org", headers=customer)
    assert resp.status_code == 403
    assert resp.json()["error"]["code"] == "account_rejected"
    _drain_jobs()
    sender = get_email_sender()
    assert isinstance(sender, MemoryEmailSender)
    assert any(m.subject == "Your KloudRecon registration" for m in sender.sent)


def test_approve_twice_and_bad_plan(client: TestClient) -> None:
    owner = _owner(client)
    org_id = client.get("/api/v1/owner/registrations", headers=owner).json()[0]["org"]["id"]
    bad = client.post(
        f"/api/v1/owner/registrations/{org_id}/approve",
        json={"plan_code": "platinum", "trial_days": 0},
        headers=owner,
    )
    assert bad.status_code == 422
    ok = client.post(
        f"/api/v1/owner/registrations/{org_id}/approve",
        json={"plan_code": "starter", "trial_days": 0},
        headers=owner,
    )
    assert ok.status_code == 200
    again = client.post(
        f"/api/v1/owner/registrations/{org_id}/approve",
        json={"plan_code": "starter", "trial_days": 0},
        headers=owner,
    )
    assert again.status_code == 409


def test_bulk_approve(client: TestClient) -> None:
    register(client, "a@one.test")
    register(client, "b@two.test")
    owner = _owner(client)
    ids = [r["org"]["id"] for r in client.get("/api/v1/owner/registrations", headers=owner).json()]
    active = [o["id"] for o in client.get("/api/v1/owner/orgs?status=active", headers=owner).json()]
    resp = client.post(
        "/api/v1/owner/registrations/bulk-approve",
        json={"org_ids": [*ids, active[0]], "plan_code": "starter", "trial_days": 7},
        headers=owner,
    )
    body = resp.json()
    assert len(body["succeeded"]) == len(ids)
    assert list(body["failed"]) == [active[0]]
    assert client.get("/api/v1/owner/registrations", headers=owner).json() == []


def test_suspend_and_reactivate_org(client: TestClient) -> None:
    owner = _owner(client)
    admin = auth_headers(client, "admin@acme.test")
    org_id = _org_id(client, admin)
    assert client.post(f"/api/v1/owner/orgs/{org_id}/suspend", headers=owner).status_code == 200
    resp = client.get("/api/v1/org", headers=admin)
    assert resp.status_code == 403
    assert resp.json()["error"]["code"] == "account_suspended"
    assert client.post(f"/api/v1/owner/orgs/{org_id}/reactivate", headers=owner).status_code == 200
    assert client.get("/api/v1/org", headers=admin).status_code == 200


def test_org_detail_and_update(client: TestClient) -> None:
    owner = _owner(client)
    org_id = _org_id(client, auth_headers(client, "admin@acme.test"))
    detail = client.get(f"/api/v1/owner/orgs/{org_id}", headers=owner).json()
    assert detail["members"][0]["email"] == "admin@acme.test"
    resp = client.patch(
        f"/api/v1/owner/orgs/{org_id}",
        json={"owner_notes": "Key account", "plan_code": "pro"},
        headers=owner,
    )
    assert resp.status_code == 200
    assert resp.json()["owner_notes"] == "Key account"
    assert resp.json()["plan_name"] == "Pro"


def test_suspend_user_and_not_self(client: TestClient) -> None:
    owner = _owner(client)
    users = client.get("/api/v1/owner/users?q=acme", headers=owner).json()
    assert [u["email"] for u in users] == ["admin@acme.test"]
    admin_id = users[0]["id"]
    assert client.post(f"/api/v1/owner/users/{admin_id}/suspend", headers=owner).status_code == 200
    blocked = client.get("/api/v1/org", headers=auth_headers(client, "admin@acme.test"))
    assert blocked.status_code == 403
    me_id = client.get("/api/v1/me", headers=owner).json()["user"]["id"]
    assert client.post(f"/api/v1/owner/users/{me_id}/suspend", headers=owner).status_code == 409


def test_plans_crud(client: TestClient) -> None:
    owner = _owner(client)
    plan = {
        "code": "team",
        "name": "Team",
        "price_monthly": "25",
        "limits": {"connections": 2},
        "features": {},
    }
    created = client.post("/api/v1/owner/plans", json=plan, headers=owner)
    assert created.status_code == 201
    assert client.post("/api/v1/owner/plans", json=plan, headers=owner).status_code == 409
    plan_id = created.json()["id"]
    updated = client.put(
        f"/api/v1/owner/plans/{plan_id}", json={**plan, "price_monthly": "29"}, headers=owner
    )
    assert updated.json()["price_monthly"] == "29.00"


def test_overview(client: TestClient) -> None:
    body = client.get("/api/v1/owner/overview", headers=_owner(client)).json()
    assert body["pending_registrations"] == 1
    assert body["active_orgs"] == 1
    assert body["total_users"] == 3
    assert "queued" in body["jobs"]
