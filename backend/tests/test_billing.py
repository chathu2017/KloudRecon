"""Plans & billing (plan Section 18, decision 0038): billing state machine, read-only PlanGuard,
Stripe/Paddle webhooks (signatures, idempotency, plan mapping, grace period), checkout,
manual upgrade requests, trial reminders/expiry and owner business metrics."""

from __future__ import annotations

import json
import time
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

import httpx
import psycopg
import pytest
from fastapi.testclient import TestClient

from kloudrecon.core.config import get_settings
from kloudrecon.core.db import session_scope
from kloudrecon.core.rls import enable_system
from kloudrecon.domain.models import Organization
from kloudrecon.services import billing, plans
from kloudrecon.services import billing_providers as bp
from kloudrecon.services.infra import get_secret_store
from tests.conftest import auth_headers, register

pytestmark = pytest.mark.usefixtures("seeded")

STRIPE_SECRET = "whsec_test_stripe_0123456789"
PADDLE_SECRET = "pdl_ntfset_test_0123456789"


def q(conn: psycopg.Connection[tuple[object, ...]], sql: str, *args: object) -> list[Any]:
    return conn.execute(sql, args).fetchall()


def acme(conn: psycopg.Connection[tuple[object, ...]]) -> uuid.UUID:
    return uuid.UUID(str(q(conn, "SELECT org_id FROM users WHERE email = 'admin@acme.test'")[0][0]))


def set_trial(conn: psycopg.Connection[tuple[object, ...]], ends: datetime | None) -> None:
    conn.execute(
        "UPDATE organizations SET trial_ends_at = %s WHERE id = "
        "(SELECT org_id FROM users WHERE email = 'admin@acme.test')",
        (ends,),
    )


def org_state(org_id: uuid.UUID, now: datetime | None = None) -> billing.BillingState:
    with session_scope() as s:
        enable_system(s)
        org = s.get(Organization, org_id)
        assert org is not None
        return billing.state_of(s, org, now)


@pytest.fixture
def stripe(
    seeded: None,  # plans are re-seeded after each test's truncate
    monkeypatch: pytest.MonkeyPatch,
    admin_conn: psycopg.Connection[tuple[object, ...]],
) -> None:
    monkeypatch.setattr(get_settings(), "billing_provider", "stripe")
    get_secret_store().set_secret(bp.STRIPE_API_KEY, "sk_test_123")
    get_secret_store().set_secret(bp.STRIPE_WEBHOOK_SECRET, STRIPE_SECRET)
    admin_conn.execute(
        'UPDATE plans SET provider_prices = \'{"stripe": "price_pro", "paddle": "pri_pro"}\' '
        "WHERE code = 'pro'"
    )


def stripe_post(client: TestClient, event: dict[str, Any], secret: str = STRIPE_SECRET) -> Any:
    body = json.dumps(event).encode()
    ts = int(time.time())
    sig = f"t={ts},v1={bp.stripe_signature(secret, ts, body)}"
    return client.post(
        "/api/v1/public/billing/stripe/webhook",
        content=body,
        headers={"Stripe-Signature": sig, "Content-Type": "application/json"},
    )


def subscription(
    org_id: uuid.UUID, status: str, eid: str, etype: str = "customer.subscription.updated"
) -> dict[str, Any]:
    return {
        "id": eid,
        "type": etype,
        "data": {
            "object": {
                "id": "sub_1",
                "customer": "cus_1",
                "status": status,
                "metadata": {"org_id": str(org_id)},
                "current_period_end": int(time.time()) + 30 * 86400,
                "items": {"data": [{"price": {"id": "price_pro"}}]},
            }
        },
    }


# ---- state machine -------------------------------------------------------------------------------
def test_trial_then_read_only(admin_conn: psycopg.Connection[tuple[object, ...]]) -> None:
    org = acme(admin_conn)
    assert org_state(org).state == "active"
    set_trial(admin_conn, datetime.now(UTC) + timedelta(days=3))
    assert org_state(org).state == "trial"
    set_trial(admin_conn, datetime.now(UTC) - timedelta(minutes=1))
    s = org_state(org)
    assert (s.state, s.read_only) == ("trial_expired", True)


def test_read_only_blocks_writes_but_not_reads_billing_or_deletes(
    client: TestClient, admin_conn: psycopg.Connection[tuple[object, ...]]
) -> None:
    admin = auth_headers(client, "admin@acme.test")
    set_trial(admin_conn, datetime.now(UTC) - timedelta(days=1))
    resp = client.post(
        "/api/v1/alerts/rules", json={"name": "x", "event_type": "scan_failed"}, headers=admin
    )
    assert resp.status_code == 403
    assert resp.json()["error"]["code"] == "org_read_only"
    assert resp.json()["error"]["details"] == {"state": "trial_expired"}
    assert client.get("/api/v1/alerts/rules", headers=admin).status_code == 200
    body = client.get("/api/v1/billing", headers=admin).json()
    assert body["state"] == "trial_expired"
    assert body["read_only"] is True
    ok = client.post("/api/v1/billing/upgrade-request", json={"plan_code": "pro"}, headers=admin)
    assert ok.status_code == 200
    rid = str(uuid.uuid4())
    assert client.delete(f"/api/v1/alerts/rules/{rid}", headers=admin).status_code == 404
    # extending the trial lifts it
    set_trial(admin_conn, datetime.now(UTC) + timedelta(days=7))
    assert (
        client.post(
            "/api/v1/alerts/rules", json={"name": "x", "event_type": "scan_failed"}, headers=admin
        ).status_code
        == 201
    )


def test_billing_summary_shows_usage_and_plans(client: TestClient) -> None:
    admin = auth_headers(client, "admin@acme.test")
    body = client.get("/api/v1/billing", headers=admin).json()
    assert body["provider"] == "manual"
    assert body["self_serve"] is False
    assert body["plan_code"] == "starter"
    usage = {u["key"]: u for u in body["usage"]}
    assert usage["connections"]["limit"] == 1
    assert usage["ai_messages"]["limit"] == 200
    codes = [p["code"] for p in body["plans"]]
    assert codes[:3] == ["trial", "starter", "pro"]
    assert next(p for p in body["plans"] if p["code"] == "starter")["current"] is True


def test_trial_defaults_cover_ai_and_frameworks(
    admin_conn: psycopg.Connection[tuple[object, ...]],
) -> None:
    org = acme(admin_conn)
    admin_conn.execute("UPDATE organizations SET plan_id = NULL WHERE id = %s", (org,))
    with session_scope() as s:
        enable_system(s)
        assert plans.limit(s, org, "ai_messages") == 50
        assert plans.limit(s, org, "frameworks") == 1


# ---- manual provider -----------------------------------------------------------------------------
def test_manual_checkout_is_refused_and_upgrade_requests_reach_the_owner(
    client: TestClient, admin_conn: psycopg.Connection[tuple[object, ...]]
) -> None:
    admin = auth_headers(client, "admin@acme.test")
    resp = client.post("/api/v1/billing/checkout", json={"plan_code": "pro"}, headers=admin)
    assert resp.status_code == 422
    resp = client.post(
        "/api/v1/billing/upgrade-request",
        json={"plan_code": "pro", "message": "We need webhooks."},
        headers=admin,
    )
    assert resp.status_code == 200
    notes = q(
        admin_conn,
        "SELECT n.title, n.body FROM notifications n JOIN users u ON u.id = n.user_id "
        "WHERE u.email = 'owner@local.test' AND n.type = 'billing.upgrade_requested'",
    )
    assert notes == [("Upgrade request: Acme Corp → Pro", "We need webhooks.")]
    member = register(client, "someone@else.test")
    assert client.get("/api/v1/billing", headers=member).status_code == 403


# ---- Stripe --------------------------------------------------------------------------------------
@pytest.mark.usefixtures("stripe")
def test_stripe_checkout_link(client: TestClient) -> None:
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(200, json={"url": "https://checkout.stripe.com/c/pay/cs_test_1"})

    bp.set_transport(httpx.MockTransport(handler))
    try:
        admin = auth_headers(client, "admin@acme.test")
        resp = client.post("/api/v1/billing/checkout", json={"plan_code": "pro"}, headers=admin)
    finally:
        bp.set_transport(None)
    assert resp.status_code == 200, resp.text
    assert resp.json()["url"].startswith("https://checkout.stripe.com/")
    (req,) = seen
    assert req.url.path == "/v1/checkout/sessions"
    assert req.headers["Authorization"] == "Bearer sk_test_123"
    form = dict(httpx.QueryParams(req.content.decode()))
    assert form["line_items[0][price]"] == "price_pro"
    assert form["mode"] == "subscription"
    assert form["customer_email"] == "admin@acme.test"
    # a plan without a Stripe price cannot be bought online
    assert (
        client.post("/api/v1/billing/checkout", json={"plan_code": "enterprise"}, headers=admin)
    ).status_code == 422


@pytest.mark.usefixtures("stripe")
def test_stripe_lifecycle_conversion_grace_and_overdue(
    client: TestClient, admin_conn: psycopg.Connection[tuple[object, ...]]
) -> None:
    org = acme(admin_conn)
    set_trial(admin_conn, datetime.now(UTC) + timedelta(days=5))
    # a forged event is rejected
    bad = stripe_post(client, subscription(org, "active", "evt_bad"), secret="whsec_wrong")
    assert bad.status_code == 422
    assert bad.json()["error"]["code"] == "invalid_signature"
    done = stripe_post(
        client,
        {
            "id": "evt_1",
            "type": "checkout.session.completed",
            "data": {
                "object": {
                    "client_reference_id": str(org),
                    "customer": "cus_1",
                    "subscription": "sub_1",
                }
            },
        },
    )
    assert done.json() == {"received": True, "outcome": "processed"}
    resp = stripe_post(client, subscription(org, "active", "evt_2"))
    assert resp.json()["outcome"] == "processed"
    row = q(
        admin_conn,
        "SELECT p.code, o.trial_ends_at FROM organizations o JOIN plans p ON p.id = o.plan_id "
        "WHERE o.id = %s",
        org,
    )
    assert row == [("pro", None)]  # plan from the price, trial converted
    assert q(admin_conn, "SELECT reason FROM plan_changes WHERE org_id = %s", org) == [
        ("trial_converted",)
    ]
    # the provider retries the same event: processed once
    assert (
        stripe_post(client, subscription(org, "active", "evt_2")).json()["outcome"] == "duplicate"
    )
    # payment fails: grace, then read-only after BILLING_GRACE_DAYS
    stripe_post(
        client,
        {"id": "evt_3", "type": "invoice.payment_failed",
         "data": {"object": {"customer": "cus_1", "subscription": "sub_1"}}},
    )  # fmt: skip
    assert org_state(org).state == "grace"
    later = datetime.now(UTC) + timedelta(days=get_settings().billing_grace_days + 1)
    s = org_state(org, later)
    assert (s.state, s.read_only) == ("payment_overdue", True)
    stripe_post(
        client,
        {"id": "evt_4", "type": "invoice.paid",
         "data": {"object": {"customer": "cus_1", "subscription": "sub_1"}}},
    )  # fmt: skip
    assert org_state(org, later).state == "active"
    # cancellation: read-only once the paid period is over
    stripe_post(client, subscription(org, "canceled", "evt_5", "customer.subscription.deleted"))
    assert org_state(org).state == "active"  # period_end is in the future
    assert org_state(org, datetime.now(UTC) + timedelta(days=31)).state == "canceled"
    assert ("churned",) in q(admin_conn, "SELECT reason FROM plan_changes WHERE org_id = %s", org)


@pytest.mark.usefixtures("stripe")
def test_unmatched_and_stale_events(client: TestClient) -> None:
    other = subscription(uuid.uuid4(), "active", "evt_x")
    other["data"]["object"]["metadata"] = {}
    other["data"]["object"]["customer"] = "cus_unknown"
    other["data"]["object"]["id"] = "sub_unknown"
    assert stripe_post(client, other).json()["outcome"] == "ignored"
    body = json.dumps(subscription(uuid.uuid4(), "active", "evt_old")).encode()
    old = int(time.time()) - 3600
    resp = client.post(
        "/api/v1/public/billing/stripe/webhook",
        content=body,
        headers={"Stripe-Signature": f"t={old},v1={bp.stripe_signature(STRIPE_SECRET, old, body)}"},
    )
    assert resp.status_code == 422  # replayed / too old


# ---- Paddle --------------------------------------------------------------------------------------
def test_paddle_subscription_activates_plan(
    client: TestClient,
    admin_conn: psycopg.Connection[tuple[object, ...]],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(get_settings(), "billing_provider", "paddle")
    get_secret_store().set_secret(bp.PADDLE_WEBHOOK_SECRET, PADDLE_SECRET)
    admin_conn.execute(
        "UPDATE plans SET provider_prices = '{\"paddle\": \"pri_pro\"}' WHERE code = 'pro'"
    )
    org = acme(admin_conn)
    event = {
        "event_id": "evt_p1",
        "event_type": "subscription.activated",
        "data": {
            "id": "sub_p1",
            "status": "active",
            "customer_id": "ctm_1",
            "custom_data": {"org_id": str(org)},
            "items": [{"price": {"id": "pri_pro"}}],
            "current_billing_period": {"ends_at": "2026-10-30T00:00:00Z"},
        },
    }
    body = json.dumps(event).encode()
    ts = int(time.time())
    resp = client.post(
        "/api/v1/public/billing/paddle/webhook",
        content=body,
        headers={"Paddle-Signature": f"ts={ts};h1={bp.paddle_signature(PADDLE_SECRET, ts, body)}"},
    )
    assert resp.json()["outcome"] == "processed", resp.text
    assert q(
        admin_conn,
        "SELECT p.code FROM organizations o JOIN plans p ON p.id = o.plan_id WHERE o.id = %s",
        org,
    ) == [("pro",)]
    acct = q(admin_conn, "SELECT provider, customer_id, status FROM billing_accounts")
    assert acct == [("paddle", "ctm_1", "active")]
    assert (
        client.post(
            "/api/v1/public/billing/paddle/webhook",
            content=body,
            headers={"Paddle-Signature": f"ts={ts};h1=deadbeef"},
        ).status_code
        == 422
    )


# ---- trials --------------------------------------------------------------------------------------
def test_trial_reminders_and_expiry(admin_conn: psycopg.Connection[tuple[object, ...]]) -> None:
    org = acme(admin_conn)
    now = datetime(2026, 10, 1, 9, 0, tzinfo=UTC)
    set_trial(admin_conn, now + timedelta(days=2, hours=12))
    with session_scope() as s:
        assert billing.check_trials(s, now) == 1  # the 3-day reminder (7 is implied)
    with session_scope() as s:
        assert billing.check_trials(s, now) == 0
        assert billing.check_trials(s, now + timedelta(days=2)) == 1  # 1 day left
        assert billing.check_trials(s, now + timedelta(days=3)) == 1  # ended
        assert billing.check_trials(s, now + timedelta(days=4)) == 0
    titles = [
        r[0]
        for r in q(
            admin_conn,
            "SELECT title FROM notifications WHERE type = 'billing.trial' ORDER BY created_at",
        )
    ]
    assert titles == [
        "Your KloudRecon trial ends in 3 days",
        "Your KloudRecon trial ends in 1 day",
        "Your KloudRecon trial has ended",
    ]
    emails = q(admin_conn, "SELECT payload FROM jobs WHERE type = 'notify.email'")
    assert sum(1 for (p,) in emails if p["template"] == "trial_notice") == 3
    assert ("trial_expired",) in q(
        admin_conn, "SELECT reason FROM plan_changes WHERE org_id = %s", org
    )
    assert q(
        admin_conn, "SELECT count(*) FROM notifications WHERE type = 'billing.trial_expired'"
    ) == [(1,)]


def test_owner_extends_and_converts_trials(
    client: TestClient, admin_conn: psycopg.Connection[tuple[object, ...]]
) -> None:
    owner = auth_headers(client, "owner@local.test")
    org = acme(admin_conn)
    set_trial(admin_conn, datetime.now(UTC) + timedelta(days=1))
    admin_conn.execute(
        'UPDATE organizations SET settings = settings || \'{"trial_reminders": ["1"]}\' '
        "WHERE id = %s",
        (org,),
    )
    ends = (datetime.now(UTC) + timedelta(days=14)).isoformat()
    resp = client.patch(f"/api/v1/owner/orgs/{org}", json={"trial_ends_at": ends}, headers=owner)
    assert resp.status_code == 200, resp.text
    assert q(
        admin_conn, "SELECT settings ? 'trial_reminders' FROM organizations WHERE id = %s", org
    ) == [(False,)]
    resp = client.patch(
        f"/api/v1/owner/orgs/{org}", json={"trial_ends_at": None, "plan_code": "pro"}, headers=owner
    )
    assert resp.status_code == 200
    reasons = [
        r[0]
        for r in q(
            admin_conn, "SELECT reason FROM plan_changes WHERE org_id = %s ORDER BY created_at", org
        )
    ]
    assert reasons == ["upgraded", "trial_converted"]


# ---- owner metrics -------------------------------------------------------------------------------
def test_owner_metrics(
    client: TestClient, admin_conn: psycopg.Connection[tuple[object, ...]]
) -> None:
    owner = auth_headers(client, "owner@local.test")
    # a new sign-up approved on a 14-day Pro trial
    register(client, "cto@fabrikam.test")
    new_org = q(admin_conn, "SELECT org_id FROM users WHERE email = 'cto@fabrikam.test'")[0][0]
    resp = client.post(
        f"/api/v1/owner/registrations/{new_org}/approve",
        json={"plan_code": "pro", "trial_days": 14},
        headers=owner,
    )
    assert resp.status_code == 200, resp.text
    admin_conn.execute(
        "INSERT INTO ai_usage (org_id, kind, cost_usd, counted) VALUES (%s, 'chat', 0.42, true)",
        (acme(admin_conn),),
    )
    m = client.get("/api/v1/owner/metrics", headers=owner).json()
    assert m["mrr"] == 10.0  # Acme on Starter; the Pro trial does not count yet
    assert m["arr"] == 120.0
    assert m["orgs"]["paying"] == 1
    assert m["orgs"]["trial"] == 1
    assert m["trials_started_90d"] == 1
    assert m["conversion_rate_90d"] == 0.0
    assert m["by_plan"] == [{"plan": "Starter", "orgs": 1, "mrr": 10.0}]
    assert m["ai_cost_by_org"][0]["name"] == "Acme Corp"
    assert m["ai_cost_month_usd"] == pytest.approx(0.42)
    assert len(m["trials_expiring_7d"]) == 0
    customer = auth_headers(client, "admin@acme.test")
    assert client.get("/api/v1/owner/metrics", headers=customer).status_code == 403
