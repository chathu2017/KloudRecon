from __future__ import annotations

import asyncio
import re
import uuid

import psycopg
import pytest
from fastapi.testclient import TestClient

from kloudrecon.api.routers.v1.notifications import format_sse
from kloudrecon.core.db import psycopg_dsn, session_scope
from kloudrecon.core.rls import system_context
from kloudrecon.notify.listener import EventHub, Subscriber
from kloudrecon.services import events
from tests.conftest import APP_URL_STR, auth_headers, register

pytestmark = pytest.mark.usefixtures("seeded")


def _admin(client: TestClient) -> dict[str, str]:
    return auth_headers(client, "admin@acme.test")


def _invite(client: TestClient, email: str, role: str = "member") -> str:
    resp = client.post(
        "/api/v1/team/invitations", json={"email": email, "role": role}, headers=_admin(client)
    )
    assert resp.status_code == 201, resp.text
    match = re.search(r"/invite/(.+)$", resp.json()["invite_url"])
    assert match
    return match.group(1)


def test_invite_and_accept_joins_org_directly(
    client: TestClient, admin_conn: psycopg.Connection[tuple[object, ...]]
) -> None:
    token = _invite(client, "Newbie@Acme.test", "viewer")
    row = admin_conn.execute("SELECT token_hash FROM invitations").fetchone()
    assert row is not None
    assert token not in str(row[0])  # only the hash is stored

    invitee = auth_headers(client, "newbie@acme.test", "Nina Newbie")
    preview = client.get(f"/api/v1/invitations/{token}", headers=invitee).json()
    assert preview["org_name"] == "Acme Corp"
    assert preview["status"] == "pending"

    me = client.post(f"/api/v1/invitations/{token}/accept", headers=invitee).json()
    assert me["state"] == "active"
    assert me["user"]["org_role"] == "viewer"
    assert client.get("/api/v1/org", headers=invitee).status_code == 200

    members = client.get("/api/v1/team/members", headers=_admin(client)).json()
    assert {m["email"] for m in members} == {"admin@acme.test", "newbie@acme.test"}
    # admin was notified
    notes = client.get("/api/v1/notifications", headers=_admin(client)).json()
    assert notes["unread_count"] == 1
    assert notes["items"][0]["type"] == "member.joined"
    # the link cannot be reused
    again = client.post(
        f"/api/v1/invitations/{token}/accept", headers=auth_headers(client, "newbie@acme.test")
    )
    assert again.status_code == 409


def test_invitation_email_must_match(client: TestClient) -> None:
    token = _invite(client, "right@acme.test")
    wrong = auth_headers(client, "wrong@acme.test")
    resp = client.post(f"/api/v1/invitations/{token}/accept", headers=wrong)
    assert resp.status_code == 403
    assert resp.json()["error"]["code"] == "invitation_email_mismatch"


def test_expired_and_revoked_invitations(
    client: TestClient, admin_conn: psycopg.Connection[tuple[object, ...]]
) -> None:
    token = _invite(client, "late@acme.test")
    admin_conn.execute("UPDATE invitations SET expires_at = now() - interval '1 minute'")
    resp = client.post(
        f"/api/v1/invitations/{token}/accept", headers=auth_headers(client, "late@acme.test")
    )
    assert resp.json()["error"]["code"] == "invitation_expired"

    token2 = _invite(client, "gone@acme.test")
    inv_id = client.get("/api/v1/team/invitations", headers=_admin(client)).json()[0]["id"]
    assert (
        client.delete(f"/api/v1/team/invitations/{inv_id}", headers=_admin(client)).status_code
        == 200
    )
    resp = client.post(
        f"/api/v1/invitations/{token2}/accept", headers=auth_headers(client, "gone@acme.test")
    )
    assert resp.json()["error"]["code"] == "invitation_revoked"


def test_unknown_invitation(client: TestClient) -> None:
    resp = client.get("/api/v1/invitations/" + "x" * 43, headers=auth_headers(client, "who@x.test"))
    assert resp.status_code == 404


def test_invite_existing_member_conflicts(client: TestClient) -> None:
    resp = client.post(
        "/api/v1/team/invitations",
        json={"email": "admin@acme.test", "role": "member"},
        headers=_admin(client),
    )
    assert resp.status_code == 409


def test_roles_and_last_owner_rules(client: TestClient) -> None:
    token = _invite(client, "bea@acme.test", "admin")
    bea = auth_headers(client, "bea@acme.test")
    client.post(f"/api/v1/invitations/{token}/accept", headers=bea)
    members = {m["email"]: m["id"] for m in client.get("/api/v1/team/members", headers=bea).json()}

    # an admin cannot touch the owner
    resp = client.patch(
        f"/api/v1/team/members/{members['admin@acme.test']}", json={"role": "member"}, headers=bea
    )
    assert resp.status_code == 403
    # the owner cannot demote themselves as the last owner
    resp = client.patch(
        f"/api/v1/team/members/{members['admin@acme.test']}",
        json={"role": "admin"},
        headers=_admin(client),
    )
    assert resp.json()["error"]["code"] == "last_owner"
    # owner demotes bea to viewer; bea then loses admin endpoints
    resp = client.patch(
        f"/api/v1/team/members/{members['bea@acme.test']}",
        json={"role": "viewer"},
        headers=_admin(client),
    )
    assert resp.json()["org_role"] == "viewer"
    assert client.get("/api/v1/team/invitations", headers=bea).status_code == 403
    # remove
    assert (
        client.delete(
            f"/api/v1/team/members/{members['bea@acme.test']}", headers=_admin(client)
        ).status_code
        == 200
    )
    assert client.get("/api/v1/me", headers=bea).json()["state"] == "profile_incomplete"


def test_pending_user_cannot_use_team_endpoints(client: TestClient) -> None:
    pending = auth_headers(client, "pending@new.test")
    for method, path in [
        ("get", "/api/v1/team/members"),
        ("get", "/api/v1/team/invitations"),
        ("post", "/api/v1/team/invitations"),
        ("get", "/api/v1/org"),
        ("get", "/api/v1/org/audit-logs"),
    ]:
        body = {"email": "a@b.test"} if method == "post" else None
        resp = client.request(method.upper(), path, headers=pending, json=body)
        assert resp.status_code == 403, path
        assert resp.json()["error"]["code"] == "account_pending_approval"


def test_members_are_isolated_between_orgs(client: TestClient) -> None:
    other = register(client, "boss@other.test")
    owner = auth_headers(client, "owner@local.test")
    org_id = client.get("/api/v1/me", headers=other).json()["org"]["id"]
    client.post(
        f"/api/v1/owner/registrations/{org_id}/approve",
        json={"plan_code": "starter", "trial_days": 0},
        headers=owner,
    )
    other_members = client.get("/api/v1/team/members", headers=other).json()
    assert [m["email"] for m in other_members] == ["boss@other.test"]
    acme_member_id = client.get("/api/v1/team/members", headers=_admin(client)).json()[0]["id"]
    # cannot change or remove a member of another org
    resp = client.patch(
        f"/api/v1/team/members/{acme_member_id}", json={"role": "viewer"}, headers=other
    )
    assert resp.status_code == 404
    assert client.delete(f"/api/v1/team/members/{acme_member_id}", headers=other).status_code == 404


def test_notifications_read_flow(client: TestClient) -> None:
    owner = auth_headers(client, "owner@local.test")
    register(client, "n@x.test")
    notes = client.get("/api/v1/notifications", headers=owner).json()
    assert notes["unread_count"] == 1
    note_id = notes["items"][0]["id"]
    assert client.post(f"/api/v1/notifications/{note_id}/read", headers=owner).status_code == 200
    assert client.get("/api/v1/notifications", headers=owner).json()["unread_count"] == 0
    register(client, "m@x.test")
    client.post("/api/v1/notifications/read-all", headers=owner)
    assert client.get("/api/v1/notifications", headers=owner).json()["unread_count"] == 0
    # another user cannot read the owner's notification
    admin = _admin(client)
    assert client.post(f"/api/v1/notifications/{note_id}/read", headers=admin).status_code == 404
    assert client.get("/api/v1/notifications", headers=admin).json()["items"] == []


def test_stream_requires_profile(client: TestClient) -> None:
    assert client.get("/api/v1/events/stream").status_code == 401
    resp = client.get("/api/v1/events/stream", headers=auth_headers(client, "nobody@x.test"))
    assert resp.status_code == 403


def test_subscriber_filtering() -> None:
    org, user, other = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
    sub = Subscriber(org_id=org, user_id=user)
    assert sub.wants({"org_id": str(org), "user_id": None})
    assert sub.wants({"org_id": None, "user_id": str(user)})
    assert not sub.wants({"org_id": str(org), "user_id": str(other)})
    assert not sub.wants({"org_id": str(uuid.uuid4()), "user_id": None})
    assert not Subscriber(org_id=None, user_id=user).wants({"org_id": None, "user_id": None})


def test_format_sse() -> None:
    out = format_sse({"id": 7, "type": "notification.created", "payload": {"a": 1}})
    assert out.startswith("id: 7\nevent: notification.created\ndata: {")
    assert out.endswith("\n\n")


async def test_listener_delivers_committed_events_only() -> None:
    hub = EventHub()
    user = uuid.uuid4()
    sub = hub.subscribe(None, user)
    hub.start(psycopg_dsn(APP_URL_STR))
    try:
        for _ in range(50):
            if hub.connected:
                break
            await asyncio.sleep(0.1)
        assert hub.connected
        # rolled back: never delivered
        try:
            with session_scope() as s, system_context(s):
                events.publish(s, "test.rolled_back", {}, user_id=user)
                raise RuntimeError("rollback")
        except RuntimeError:
            pass
        with session_scope() as s, system_context(s):
            events.publish(s, "test.committed", {"n": 1}, user_id=user)
        event = await asyncio.wait_for(sub.queue.get(), timeout=5)
        assert event["type"] == "test.committed"
        assert event["payload"] == {"n": 1}
        assert sub.queue.empty()
    finally:
        hub.stop()
