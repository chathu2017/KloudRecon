from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

import jwt
import psycopg
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi.testclient import TestClient

from kloudrecon.core.config import Settings
from kloudrecon.core.errors import Unauthorized
from kloudrecon.core.security import EntraTokenVerifier, VerifierRegistry, mint_dev_token
from tests.conftest import ONBOARDING, auth_headers, register


def test_dev_users_listed(client: TestClient) -> None:
    resp = client.get("/api/v1/auth/dev/users")
    assert resp.status_code == 200
    assert {u["email"] for u in resp.json()} == {
        "owner@local.test",
        "admin@acme.test",
        "pending@new.test",
        "demo@contoso.test",
    }


def test_missing_and_bad_tokens_are_401(client: TestClient) -> None:
    assert client.get("/api/v1/me").status_code == 401
    resp = client.get("/api/v1/me", headers={"Authorization": "Bearer not-a-jwt"})
    assert resp.status_code == 401
    assert resp.json()["error"]["code"] == "invalid_token"


def test_new_identity_is_profile_incomplete(client: TestClient) -> None:
    me = client.get("/api/v1/me", headers=auth_headers(client, "new@person.test")).json()
    assert me["state"] == "profile_incomplete"
    assert me["user"] is None


@pytest.mark.usefixtures("seeded")
def test_seeded_dev_users_states(client: TestClient) -> None:
    owner = client.get("/api/v1/me", headers=auth_headers(client, "owner@local.test")).json()
    assert owner["state"] == "active"
    assert owner["is_platform_owner"] is True
    admin = client.get("/api/v1/me", headers=auth_headers(client, "admin@acme.test")).json()
    assert admin["state"] == "active"
    assert admin["org"]["name"] == "Acme Corp"
    assert admin["plan"]["code"] == "starter"
    pending = client.get("/api/v1/me", headers=auth_headers(client, "pending@new.test")).json()
    assert pending["state"] == "pending_approval"


def test_bootstrap_owner_created_on_first_login(
    client: TestClient, admin_conn: psycopg.Connection[tuple[object, ...]]
) -> None:
    me = client.get("/api/v1/me", headers=auth_headers(client, "OWNER@local.test")).json()
    assert me["is_platform_owner"] is True
    row = admin_conn.execute("SELECT platform_role, status FROM users").fetchone()
    assert row == ("owner", "active")
    actions = [r[0] for r in admin_conn.execute("SELECT action FROM audit_logs").fetchall()]
    assert "owner.bootstrap" in actions


@pytest.mark.usefixtures("seeded")
def test_onboarding_creates_pending_org_and_notifies_owner(
    client: TestClient, admin_conn: psycopg.Connection[tuple[object, ...]]
) -> None:
    headers = register(client, "jane@contoso.test")
    me = client.get("/api/v1/me", headers=headers).json()
    assert me["state"] == "pending_approval"
    assert me["org"]["name"] == "Contoso Test"
    assert me["user"]["org_role"] == "owner"
    notes = admin_conn.execute("SELECT type FROM notifications").fetchall()
    assert ("registration.pending",) in notes
    templates = {
        r[0] for r in admin_conn.execute("SELECT payload->>'template' FROM jobs").fetchall()
    }
    assert templates == {"registration_received", "registration_submitted"}


def test_onboarding_twice_conflicts(client: TestClient) -> None:
    headers = register(client, "twice@x.test")
    resp = client.post("/api/v1/onboarding", json=ONBOARDING, headers=headers)
    assert resp.status_code == 409


@pytest.mark.parametrize(
    ("field", "value"),
    [("accept_terms", False), ("company_size", "huge"), ("phone", "call me"), ("use_case", "x")],
)
def test_onboarding_validation(client: TestClient, field: str, value: Any) -> None:
    body = {**ONBOARDING, field: value}
    resp = client.post("/api/v1/onboarding", json=body, headers=auth_headers(client, "v@x.test"))
    assert resp.status_code == 422
    assert resp.json()["error"]["code"] == "validation_error"


def test_update_me_requires_active(client: TestClient) -> None:
    headers = register(client, "p@x.test")
    resp = client.patch("/api/v1/me", json={"name": "New"}, headers=headers)
    assert resp.status_code == 403


@pytest.mark.usefixtures("seeded")
def test_update_me(client: TestClient) -> None:
    headers = auth_headers(client, "admin@acme.test")
    resp = client.patch(
        "/api/v1/me",
        json={"job_title": "Head of Cloud", "notification_prefs": {"email_product": False}},
        headers=headers,
    )
    assert resp.status_code == 200
    assert resp.json()["user"]["job_title"] == "Head of Cloud"


@pytest.mark.usefixtures("seeded")
def test_public_plans(client: TestClient) -> None:
    plans = client.get("/api/v1/public/plans").json()
    assert [p["code"] for p in plans] == ["trial", "starter", "pro", "enterprise"]
    assert plans[1]["price_monthly"] == "10.00"


def test_dev_token_refused_outside_dev() -> None:
    with pytest.raises(RuntimeError):
        mint_dev_token(Settings(env="local", auth_mode="entra"), "a@b.test")


# ---- Entra External ID verification (signature, issuer, audience, scope) ---------------------

TENANT = "11111111-2222-3333-4444-555555555555"


@pytest.fixture
def entra() -> tuple[VerifierRegistry, Any]:
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    settings = Settings(
        env="local",
        auth_mode="entra",
        entra_tenant_id=TENANT,
        entra_tenant_subdomain="kloudreconid",
        entra_api_client_id="api-client-id",
        entra_api_audience="api://kloudrecon-api",
    )
    verifier = EntraTokenVerifier(settings)

    class _Key:
        def __init__(self) -> None:
            self.key = key.public_key()

    verifier._jwks.get_signing_key_from_jwt = lambda _t: _Key()  # type: ignore[method-assign,assignment,return-value]
    return VerifierRegistry([verifier]), key


def _entra_token(key: Any, **overrides: Any) -> str:
    now = datetime.now(UTC)
    claims: dict[str, Any] = {
        "iss": f"https://{TENANT}.ciamlogin.com/{TENANT}/v2.0",
        "aud": "api-client-id",
        "oid": "oid-123",
        "email": "Person@Example.com",
        "name": "Person",
        "scp": "access_as_user",
        "iat": now,
        "exp": now + timedelta(minutes=5),
    }
    claims.update(overrides)
    return jwt.encode(claims, key, algorithm="RS256", headers={"kid": "k1"})


def test_entra_valid_token(entra: tuple[VerifierRegistry, Any]) -> None:
    registry, key = entra
    principal = registry.verify(_entra_token(key))
    assert principal.external_oid == "oid-123"
    assert principal.email == "person@example.com"


def test_entra_accepts_subdomain_issuer_and_uri_audience(
    entra: tuple[VerifierRegistry, Any],
) -> None:
    registry, key = entra
    token = _entra_token(
        key,
        iss=f"https://kloudreconid.ciamlogin.com/{TENANT}/v2.0",
        aud="api://kloudrecon-api",
    )
    assert registry.verify(token).external_oid == "oid-123"


@pytest.mark.parametrize(
    ("overrides", "code"),
    [
        ({"aud": "someone-else"}, "invalid_token"),
        ({"scp": "other"}, "insufficient_scope"),
        ({"exp": datetime.now(UTC) - timedelta(hours=1)}, "invalid_token"),
        ({"iss": "https://evil.example.com/v2.0"}, "invalid_token"),
        ({"email": None, "preferred_username": None}, "token_missing_email"),
    ],
)
def test_entra_rejects_bad_tokens(
    entra: tuple[VerifierRegistry, Any], overrides: dict[str, Any], code: str
) -> None:
    registry, key = entra
    with pytest.raises(Unauthorized) as exc:
        registry.verify(_entra_token(key, **overrides))
    assert exc.value.code == code


def test_entra_rejects_wrong_signature(entra: tuple[VerifierRegistry, Any]) -> None:
    registry, _ = entra
    other = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    with pytest.raises(Unauthorized):
        registry.verify(_entra_token(other))
