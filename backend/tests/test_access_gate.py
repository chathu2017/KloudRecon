"""Systematic security checks over EVERY route, so new endpoints are covered automatically.

- Access gate: non-active accounts get 403 on all data endpoints.
- Owner-only: every /owner/* endpoint rejects customers (403) and anonymous callers (401).
- Tenant isolation: one org's admin never sees another org's data.
"""

from __future__ import annotations

import re
import uuid

import pytest
from fastapi.testclient import TestClient

from kloudrecon.api.main import create_app
from tests.conftest import auth_headers, register

pytestmark = pytest.mark.usefixtures("seeded")

# Reachable before approval (plan Section 6), plus account-level endpoints (decision 0012).
PRE_APPROVAL_PREFIXES = (
    "/api/v1/health",
    "/api/v1/auth/",
    "/api/v1/public/",
    "/api/v1/me",
    "/api/v1/onboarding",
    "/api/v1/invitations/",
    "/api/v1/notifications",
    "/api/v1/events/stream",
)

BODIES: dict[str, dict[str, object]] = {
    "/api/v1/team/invitations": {"email": "x@y.test", "role": "member"},
    "/api/v1/team/members/{member_id}": {"role": "viewer"},
}


def _routes() -> list[tuple[str, str]]:
    """Every (method, path) the API exposes, taken from its OpenAPI document."""
    spec = create_app(start_listener=False).openapi()
    return [
        (method.upper(), path)
        for path, ops in spec["paths"].items()
        if path.startswith("/api/v1")
        for method in ops
        if method in {"get", "post", "put", "patch", "delete"}
    ]


ROUTES = _routes()
DATA_ROUTES = [
    (m, p)
    for m, p in ROUTES
    if not p.startswith(PRE_APPROVAL_PREFIXES) and not p.startswith("/api/v1/owner")
]
OWNER_ROUTES = [(m, p) for m, p in ROUTES if p.startswith("/api/v1/owner")]


def _fill(path: str) -> str:
    return re.sub(r"\{[^}]+\}", str(uuid.uuid4()), path)


def _call(client: TestClient, method: str, path: str, headers: dict[str, str]) -> int:
    body = BODIES.get(path)
    return client.request(method, _fill(path), headers=headers, json=body).status_code


def test_route_inventory_is_not_empty() -> None:
    assert len(DATA_ROUTES) >= 8
    assert len(OWNER_ROUTES) >= 15


@pytest.mark.parametrize(("method", "path"), DATA_ROUTES)
def test_data_endpoints_require_active_account(client: TestClient, method: str, path: str) -> None:
    pending = auth_headers(client, "pending@new.test")
    fresh = auth_headers(client, "brand-new@nowhere.test")
    assert _call(client, method, path, pending) == 403
    assert _call(client, method, path, fresh) == 403
    assert _call(client, method, path, {}) == 401


@pytest.mark.parametrize(("method", "path"), DATA_ROUTES)
def test_data_endpoints_blocked_for_rejected_and_suspended(
    client: TestClient, method: str, path: str
) -> None:
    owner = auth_headers(client, "owner@local.test")
    rejected = register(client, f"r-{uuid.uuid4().hex[:6]}@x.test")
    org_id = client.get("/api/v1/me", headers=rejected).json()["org"]["id"]
    client.post(
        f"/api/v1/owner/registrations/{org_id}/reject", json={"reason": "No."}, headers=owner
    )
    assert _call(client, method, path, rejected) == 403

    admin = auth_headers(client, "admin@acme.test")
    acme_id = client.get("/api/v1/me", headers=admin).json()["org"]["id"]
    client.post(f"/api/v1/owner/orgs/{acme_id}/suspend", headers=owner)
    assert _call(client, method, path, admin) == 403


@pytest.mark.parametrize(("method", "path"), OWNER_ROUTES)
def test_owner_endpoints_are_owner_only(client: TestClient, method: str, path: str) -> None:
    assert _call(client, method, path, {}) == 401
    for email in ("admin@acme.test", "pending@new.test"):
        assert _call(client, method, path, auth_headers(client, email)) == 403


def test_org_audit_logs_are_isolated(client: TestClient) -> None:
    owner = auth_headers(client, "owner@local.test")
    other = register(client, "boss@other.test")
    other_org = client.get("/api/v1/me", headers=other).json()["org"]["id"]
    client.post(
        f"/api/v1/owner/registrations/{other_org}/approve",
        json={"plan_code": "starter", "trial_days": 0},
        headers=owner,
    )
    client.patch("/api/v1/me", json={"job_title": "Boss"}, headers=other)
    admin = auth_headers(client, "admin@acme.test")
    client.patch("/api/v1/me", json={"job_title": "Lead"}, headers=admin)

    acme_org = client.get("/api/v1/me", headers=admin).json()["org"]["id"]
    acme_logs = client.get("/api/v1/org/audit-logs", headers=admin).json()
    other_logs = client.get("/api/v1/org/audit-logs", headers=other).json()
    assert acme_logs
    assert other_logs
    assert {log["org_id"] for log in acme_logs} == {acme_org}
    assert {log["org_id"] for log in other_logs} == {other_org}


def test_org_endpoint_returns_only_own_org(client: TestClient) -> None:
    admin = auth_headers(client, "admin@acme.test")
    assert client.get("/api/v1/org", headers=admin).json()["name"] == "Acme Corp"
