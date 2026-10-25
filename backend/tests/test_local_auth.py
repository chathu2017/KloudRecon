"""AUTH_MODE=local: emailed one-time codes, owner password + code, provider sign-in (0047)."""

from __future__ import annotations

import re
import uuid
from collections.abc import Iterator
from datetime import UTC, datetime, timedelta
from urllib.parse import parse_qs, urlparse

import pytest
from fastapi.testclient import TestClient

OWNER = "owner@local.test"
PASSWORD = "Correct-Horse-42-Battery"


def _reset_caches() -> None:
    from kloudrecon.core.config import get_settings
    from kloudrecon.core.security import get_verifier_registry

    get_settings.cache_clear()
    get_verifier_registry.cache_clear()


@pytest.fixture
def local_mode(monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    monkeypatch.setenv("AUTH_MODE", "local")
    monkeypatch.setenv("AUTH_OTP_RESEND_SECONDS", "0")
    _reset_caches()
    yield
    monkeypatch.undo()
    _reset_caches()


def _sent() -> list:  # type: ignore[type-arg]
    from kloudrecon.services.infra import get_email_sender

    return get_email_sender().sent  # type: ignore[attr-defined,no-any-return]


def _last_code() -> str:
    match = re.search(r"\b(\d{6})\b", _sent()[-1].text)
    assert match
    return match.group(1)


def _start(client: TestClient, email: str, name: str = "") -> str:
    resp = client.post("/api/v1/auth/otp/start", json={"email": email, "name": name})
    assert resp.status_code == 200, resp.text
    return str(resp.json()["challenge_id"])


def _verify(client: TestClient, challenge_id: str, code: str):  # type: ignore[no-untyped-def]
    return client.post("/api/v1/auth/otp/verify", json={"challenge_id": challenge_id, "code": code})


def _set_password(email: str = OWNER, password: str = PASSWORD) -> None:
    from kloudrecon.core.db import session_scope
    from kloudrecon.services import local_auth, seed

    with session_scope() as session:
        seed.create_owner(session, email)
        local_auth.set_owner_password(session, email, password)


def _wrong(code: str) -> str:
    return f"{(int(code) + 1) % 1_000_000:06d}"


# ---- customers ------------------------------------------------------------------------------


def test_customer_signs_in_with_emailed_code(local_mode: None, client: TestClient) -> None:
    challenge = _start(client, "New.User@Example.test", "New User")
    mail = _sent()[-1]
    assert mail.to == ["new.user@example.test"]
    assert "sign-in code" in mail.subject
    code = _last_code()

    resp = _verify(client, challenge, code)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["email"] == "new.user@example.test"
    headers = {"Authorization": f"Bearer {body['access_token']}"}
    me = client.get("/api/v1/me", headers=headers)
    assert me.status_code == 200
    assert me.json()["state"] == "profile_incomplete"

    # single use
    again = _verify(client, challenge, code)
    assert again.status_code == 401
    assert again.json()["error"]["code"] == "invalid_code"


def test_code_is_stored_only_as_a_digest(local_mode: None, client: TestClient) -> None:
    from kloudrecon.core.db import session_scope
    from kloudrecon.domain.models import AuthChallenge

    challenge = _start(client, "digest@example.test")
    code = _last_code()
    with session_scope() as session:
        row = session.get(AuthChallenge, uuid.UUID(challenge))
        assert row is not None
        assert code not in row.code_hash
        assert len(row.code_hash) == 64


def test_wrong_codes_are_counted_and_lock_the_challenge(
    local_mode: None, client: TestClient
) -> None:
    challenge = _start(client, "guess@example.test")
    code = _last_code()
    for _ in range(5):
        resp = _verify(client, challenge, _wrong(code))
        assert resp.status_code == 401
    locked = _verify(client, challenge, code)
    assert locked.status_code == 429
    assert locked.json()["error"]["code"] == "too_many_attempts"


def test_expired_and_unknown_challenges_fail_the_same_way(
    local_mode: None, client: TestClient
) -> None:
    from kloudrecon.core.db import session_scope
    from kloudrecon.domain.models import AuthChallenge

    challenge = _start(client, "late@example.test")
    code = _last_code()
    with session_scope() as session:
        row = session.get(AuthChallenge, uuid.UUID(challenge))
        assert row is not None
        row.expires_at = datetime.now(UTC) - timedelta(seconds=1)
    expired = _verify(client, challenge, code)
    unknown = _verify(client, str(uuid.uuid4()), code)
    assert expired.status_code == unknown.status_code == 401
    assert expired.json() == unknown.json()


def test_code_must_be_six_digits(local_mode: None, client: TestClient) -> None:
    challenge = _start(client, "shape@example.test")
    assert _verify(client, challenge, "12345").status_code == 422
    assert _verify(client, challenge, "abcdef").status_code == 422


def test_too_many_codes_for_one_address(local_mode: None, client: TestClient) -> None:
    for _ in range(5):
        _start(client, "flood@example.test")
    resp = client.post("/api/v1/auth/otp/start", json={"email": "flood@example.test"})
    assert resp.status_code == 429
    assert resp.json()["error"]["code"] == "too_many_codes"


def test_resend_replaces_the_code(local_mode: None, client: TestClient) -> None:
    challenge = _start(client, "resend@example.test")
    first = _last_code()
    resp = client.post("/api/v1/auth/otp/resend", json={"challenge_id": challenge})
    assert resp.status_code == 200, resp.text
    second = _last_code()
    assert len(_sent()) == 2
    if first != second:
        assert _verify(client, challenge, first).status_code == 401
    assert _verify(client, challenge, second).status_code == 200


def test_resend_waits(
    monkeypatch: pytest.MonkeyPatch, local_mode: None, client: TestClient
) -> None:
    monkeypatch.setenv("AUTH_OTP_RESEND_SECONDS", "30")
    _reset_caches()
    challenge = _start(client, "wait@example.test")
    resp = client.post("/api/v1/auth/otp/resend", json={"challenge_id": challenge})
    assert resp.status_code == 429
    assert resp.json()["error"]["code"] == "resend_too_soon"


def test_send_failure_is_reported_and_leaves_no_challenge(
    monkeypatch: pytest.MonkeyPatch, local_mode: None, client: TestClient
) -> None:
    from kloudrecon.core.db import session_scope
    from kloudrecon.domain.models import AuthChallenge
    from kloudrecon.services.infra import get_email_sender

    def boom(_message: object) -> str:
        raise RuntimeError("smtp down")

    monkeypatch.setattr(get_email_sender(), "send", boom)
    resp = client.post("/api/v1/auth/otp/start", json={"email": "down@example.test"})
    assert resp.status_code == 503
    assert resp.json()["error"]["code"] == "email_unavailable"
    with session_scope() as session:
        assert session.query(AuthChallenge).count() == 0


# ---- platform owners ------------------------------------------------------------------------


def test_owner_cannot_use_the_customer_path(local_mode: None, client: TestClient) -> None:
    _set_password()
    challenge = _start(client, OWNER)  # same answer as for anyone else
    assert _sent() == []  # but nothing is sent
    assert _verify(client, challenge, "123456").status_code == 401


def test_owner_signs_in_with_password_and_code(local_mode: None, client: TestClient) -> None:
    _set_password()
    bad = client.post("/api/v1/auth/owner/start", json={"email": OWNER, "password": "nope"})
    assert bad.status_code == 401
    assert bad.json()["error"]["code"] == "invalid_credentials"
    assert _sent() == []

    resp = client.post("/api/v1/auth/owner/start", json={"email": OWNER, "password": PASSWORD})
    assert resp.status_code == 200, resp.text
    assert _sent()[-1].to == [OWNER]
    session = _verify(client, resp.json()["challenge_id"], _last_code())
    assert session.status_code == 200, session.text
    headers = {"Authorization": f"Bearer {session.json()['access_token']}"}
    assert client.get("/api/v1/owner/orgs", headers=headers).status_code == 200


def test_owner_without_password_or_unknown_email_gets_the_same_answer(
    local_mode: None, client: TestClient
) -> None:
    a = client.post("/api/v1/auth/owner/start", json={"email": OWNER, "password": PASSWORD})
    b = client.post(
        "/api/v1/auth/owner/start", json={"email": "nobody@example.test", "password": PASSWORD}
    )
    assert a.status_code == b.status_code == 401
    assert a.json() == b.json()


def test_password_for_a_non_owner_is_refused(local_mode: None, client: TestClient) -> None:
    from kloudrecon.core.db import session_scope
    from kloudrecon.services import local_auth

    with session_scope() as session:
        local_auth.set_owner_password(session, "customer@example.test", PASSWORD)
    resp = client.post(
        "/api/v1/auth/owner/start", json={"email": "customer@example.test", "password": PASSWORD}
    )
    assert resp.status_code == 401


def test_owner_password_locks_after_repeated_failures(local_mode: None, client: TestClient) -> None:
    _set_password()
    for _ in range(5):
        client.post("/api/v1/auth/owner/start", json={"email": OWNER, "password": "wrong"})
    locked = client.post("/api/v1/auth/owner/start", json={"email": OWNER, "password": PASSWORD})
    assert locked.status_code == 401
    assert _sent() == []


def test_owner_session_without_password_proof_is_refused(
    local_mode: None, client: TestClient
) -> None:
    from kloudrecon.core.security import mint_local_token

    _set_password()
    token, _ = mint_local_token(OWNER, "", ("otp",))
    resp = client.get("/api/v1/me", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 401


def test_passwords_are_hashed_and_weak_ones_refused() -> None:
    from kloudrecon.core.errors import ValidationFailed
    from kloudrecon.services import local_auth

    stored = local_auth.hash_password(PASSWORD)
    assert stored.startswith("scrypt$")
    assert PASSWORD not in stored
    assert local_auth.verify_password(PASSWORD, stored)
    assert not local_auth.verify_password(PASSWORD + "x", stored)
    assert not local_auth.verify_password(PASSWORD, "not-a-hash")
    with pytest.raises(ValidationFailed):
        local_auth.check_password_strength("short1A!")
    with pytest.raises(ValidationFailed):
        local_auth.check_password_strength("alllowercaseletters")


# ---- modes ----------------------------------------------------------------------------------


def test_local_endpoints_do_not_exist_in_dev_mode(client: TestClient) -> None:
    assert (
        client.post("/api/v1/auth/otp/start", json={"email": "a@example.test"}).status_code == 404
    )
    assert (
        client.post("/api/v1/auth/owner/start", json={"email": OWNER, "password": "x"}).status_code
        == 404
    )
    assert client.get("/api/v1/auth/sso/google/start", follow_redirects=False).status_code == 404


def test_dev_login_does_not_exist_in_local_mode(local_mode: None, client: TestClient) -> None:
    assert (
        client.post("/api/v1/auth/dev/login", json={"email": "a@example.test"}).status_code == 404
    )
    assert client.get("/api/v1/auth/dev/users").status_code == 404
    config = client.get("/api/v1/auth/config").json()
    assert config["auth_mode"] == "local"
    assert config["sso"] == []


def test_seed_dev_creates_no_accounts_in_local_mode(local_mode: None) -> None:
    from kloudrecon.core.db import session_scope
    from kloudrecon.services.seed import seed_dev

    with session_scope() as session:
        assert seed_dev(session) == []


# ---- provider sign-in -----------------------------------------------------------------------


@pytest.fixture
def google(monkeypatch: pytest.MonkeyPatch, local_mode: None) -> None:
    monkeypatch.setenv("GOOGLE_CLIENT_ID", "client-id")
    monkeypatch.setenv("GOOGLE_CLIENT_SECRET", "client-secret")
    _reset_caches()


def _begin(client: TestClient) -> tuple[str, str]:
    # another host name than PUBLIC_API_URL: one hop to the public host, where the cookie is set
    hop = client.get("/api/v1/auth/sso/google/start", follow_redirects=False)
    assert hop.status_code == 303
    assert hop.headers["location"] == "http://localhost:8000/api/v1/auth/sso/google/start?c=1"
    assert "kr_sso" not in hop.cookies
    resp = client.get(
        "/api/v1/auth/sso/google/start", headers={"host": "localhost:8000"}, follow_redirects=False
    )
    assert resp.status_code == 303
    target = urlparse(resp.headers["location"])
    assert target.netloc == "accounts.google.com"
    query = parse_qs(target.query)
    assert query["code_challenge_method"] == ["S256"]
    assert "kr_sso" in resp.cookies
    return query["state"][0], resp.cookies["kr_sso"]


def _fragment(location: str) -> dict[str, str]:
    return {k: v[0] for k, v in parse_qs(urlparse(location).fragment).items()}


def test_provider_is_offered_only_when_configured(google: None, client: TestClient) -> None:
    assert client.get("/api/v1/auth/config").json()["sso"] == ["google"]
    assert client.get("/api/v1/auth/sso/microsoft/start", follow_redirects=False).status_code == 404


def test_provider_sign_in_still_needs_an_emailed_code(
    monkeypatch: pytest.MonkeyPatch, google: None, client: TestClient
) -> None:
    from kloudrecon.services import sso

    state, cookie = _begin(client)
    monkeypatch.setattr(sso, "_exchange", lambda *_: "id-token")

    def claims(_provider: object, _token: str) -> dict[str, object]:
        import base64
        import json

        raw = cookie.split(".", 1)[0]
        nonce = json.loads(base64.urlsafe_b64decode(raw + "=" * (-len(raw) % 4)))["n"]
        return {
            "email": "Sso.User@Example.test",
            "email_verified": True,
            "name": "S",
            "nonce": nonce,
        }

    monkeypatch.setattr(sso, "_claims", claims)
    resp = client.get(
        "/api/v1/auth/sso/google/callback",
        params={"code": "abc", "state": state},
        follow_redirects=False,
    )
    assert resp.status_code == 303
    result = _fragment(resp.headers["location"])
    assert result["sso"] == "code"
    assert result["email"] == "sso.user@example.test"
    assert "access_token" not in result
    assert _verify(client, result["challenge_id"], _last_code()).status_code == 200


def test_provider_callback_with_a_foreign_state_is_refused(
    monkeypatch: pytest.MonkeyPatch, google: None, client: TestClient
) -> None:
    from kloudrecon.services import sso

    _begin(client)
    monkeypatch.setattr(sso, "_exchange", lambda *_: pytest.fail("must not be reached"))
    resp = client.get(
        "/api/v1/auth/sso/google/callback",
        params={"code": "abc", "state": "someone-elses-state"},
        follow_redirects=False,
    )
    assert resp.status_code == 303
    assert "sso_error" in _fragment(resp.headers["location"])
    assert _sent() == []


# ---- Communication Services client ----------------------------------------------------------


def test_communication_sender_needs_a_connection_string() -> None:
    from kloudrecon.integrations.communication_email import CommunicationServiceEmailSender

    with pytest.raises(RuntimeError):
        CommunicationServiceEmailSender("", "DoNotReply@example.test")
    with pytest.raises(RuntimeError):
        CommunicationServiceEmailSender("null", "DoNotReply@example.test")


def test_communication_sender_is_used_when_configured(monkeypatch: pytest.MonkeyPatch) -> None:
    from azure.communication.email import EmailClient

    from kloudrecon.core.config import Settings
    from kloudrecon.integrations.communication_email import CommunicationServiceEmailSender
    from kloudrecon.services.infra import build_email_sender
    from kloudrecon.services.infra.email import OutgoingEmail

    sent: list[dict[str, object]] = []

    class FakePoller:
        def result(self) -> dict[str, str]:
            return {"id": "msg-1"}

    class FakeClient:
        def begin_send(self, payload: dict[str, object]) -> FakePoller:
            sent.append(payload)
            return FakePoller()

    monkeypatch.setattr(EmailClient, "from_connection_string", lambda _cs: FakeClient())
    settings = Settings(
        email_mode="acs",
        acs_connection_string="endpoint=https://x.communication.azure.com/;accesskey=abc",
        email_sender="DoNotReply@example.test",
    )
    sender = build_email_sender(settings)
    assert isinstance(sender, CommunicationServiceEmailSender)
    message_id = sender.send(
        OutgoingEmail(to=["a@example.test"], subject="S", html="<p>h</p>", text="t")
    )
    assert message_id == "msg-1"
    assert sent[0]["senderAddress"] == "DoNotReply@example.test"
    assert sent[0]["recipients"] == {"to": [{"address": "a@example.test"}]}
