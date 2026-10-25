"""Recommendations hub (plan 9.8) on the Contoso Demo: priority, sources, workflow, tickets,
bulk actions and CSV export."""

from __future__ import annotations

import csv
import io
import uuid
from collections.abc import Iterator
from datetime import UTC, datetime, timedelta
from typing import Any

import psycopg
import pytest
from fastapi.testclient import TestClient

from kloudrecon.services import recommendations as rec
from tests.conftest import TABLES, _admin_dsn, auth_headers


@pytest.fixture(autouse=True)
def _clean_tables() -> None:  # data is shared across this module (see `demo`)
    return None


@pytest.fixture(scope="module")
def demo(_database: None) -> Iterator[dict[str, Any]]:
    from kloudrecon.core.db import session_scope
    from kloudrecon.services.demo import seed_demo_data
    from kloudrecon.services.seed import seed_dev

    with psycopg.connect(_admin_dsn(), autocommit=True) as conn:
        conn.execute(f"TRUNCATE {TABLES} RESTART IDENTITY CASCADE")
    with session_scope() as s:
        seed_dev(s)
    result = seed_demo_data(history_days=(2.0, 1.0))
    yield {"org_id": result.org_id}
    with psycopg.connect(_admin_dsn(), autocommit=True) as conn:
        conn.execute(f"TRUNCATE {TABLES} RESTART IDENTITY CASCADE")


@pytest.fixture(scope="module")
def api(demo: dict[str, Any]) -> Iterator[TestClient]:
    from kloudrecon.api.main import create_app

    with TestClient(create_app(start_listener=False)) as c:
        yield c


def _admin(api: TestClient) -> dict[str, str]:
    return auth_headers(api, "demo@contoso.test")


def _list(api: TestClient, **params: Any) -> dict[str, Any]:
    resp = api.get("/api/v1/recommendations", params=params, headers=_admin(api))
    assert resp.status_code == 200, resp.text
    return resp.json()  # type: ignore[no-any-return]


# ---- scoring -------------------------------------------------------------------------------------
def test_priority_formula() -> None:
    assert rec.savings_impact(0) == 0
    assert rec.savings_impact(99) == pytest.approx(50.0)
    assert rec.savings_impact(10_000_000) == 100
    assert rec.impact(90, 0) == 90
    assert rec.impact(0, 99) == 50
    assert rec.impact(40, 99) == 60  # 50 + 40/4
    # impact x confidence / effort
    assert rec.priority(90, "high", "low") == 90
    assert rec.priority(90, "medium", "medium") == 45
    assert rec.priority(90, "low", "high") == 18
    assert [rec.band(s) for s in (60, 59, 35, 34, 15, 14)] == ["P1", "P2", "P2", "P3", "P3", "P4"]
    assert rec.hub_ref("rs", "a|b") == rec.hub_ref("rs", "a|b")
    assert rec.hub_ref("rs", "a|b").startswith("rs-")


# ---- backlog ------------------------------------------------------------------------------------
def test_backlog_combines_every_source_in_priority_order(api: TestClient) -> None:
    data = _list(api)
    items = data["items"]
    sources = {i["source"] for i in items}
    assert {"rule", "advisor", "defender", "toxic", "rightsizing", "waste", "commitment"} <= sources
    prios = [i["priority"] for i in items]
    assert prios == sorted(prios, reverse=True)
    for i in items:
        assert i["band"] == rec.band(i["priority"])
        assert i["ref"].split("-", 1)[0] in {"f", "rs", "w", "c"}
    h = data["headline"]
    assert h["open_count"] > 100
    assert h["monthly_savings"] > 0
    assert h["yearly_savings"] == pytest.approx(h["monthly_savings"] * 12, abs=0.05)
    assert h["critical"] > 0
    assert 0 < h["top10_risk_reduction_pct"] <= 100
    assert sum(h["by_band"].values()) == h["open_count"]
    # a purchase appears once (the better of its 1-year / 3-year options)
    commit_titles = [i["title"] for i in items if i["source"] == "commitment"]
    assert commit_titles
    assert not any(
        t.replace("3-year", "1-year") in commit_titles for t in commit_titles if "3-year" in t
    )


def test_filters(api: TestClient) -> None:
    savings = _list(api, kind="savings")["items"]
    assert savings
    assert all(i["monthly_saving"] > 0 for i in savings)
    p1 = _list(api, band="P1")["items"]
    assert p1
    assert all(i["band"] == "P1" for i in p1)
    rs = _list(api, source="rightsizing")["items"]
    assert rs
    assert all(i["source"] == "rightsizing" for i in rs)
    name = rs[0]["resource_name"]
    found = _list(api, q=name)["items"]
    assert any(i["ref"] == rs[0]["ref"] for i in found)
    assert _list(api, q="no-such-thing-xyz")["total"] == 0


def test_computed_recommendation_workflow_and_savings_tracking(api: TestClient) -> None:
    headers = _admin(api)
    item = _list(api, source="rightsizing")["items"][0]
    ref = item["ref"]
    me = api.get("/api/v1/me", headers=headers).json()
    due = (datetime.now(UTC) + timedelta(days=7)).isoformat()
    resp = api.patch(
        f"/api/v1/recommendations/{ref}",
        json={"status": "in_progress", "assignee_id": me["user"]["id"], "due_at": due},
        headers=headers,
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["status"] == "in_progress"
    assert body["assignee_name"]
    assert body["due_at"]

    resp = api.post(
        f"/api/v1/recommendations/{ref}/comments",
        json={"body": "Change window Friday."},
        headers=headers,
    )
    assert resp.status_code == 201
    comments = api.get(f"/api/v1/recommendations/{ref}/comments", headers=headers).json()
    assert [c["kind"] for c in comments] == ["event", "comment"]
    assert "Assigned to" in comments[0]["body"] or "Status" in comments[0]["body"]

    resp = api.patch(f"/api/v1/recommendations/{ref}", json={"status": "done"}, headers=headers)
    assert resp.json()["status"] == "done"
    tracked = api.get("/api/v1/costs/savings", headers=headers).json()
    assert any(e["source"] == "rightsizing" for e in tracked["items"])


def test_finding_recommendation_uses_finding_workflow(api: TestClient) -> None:
    headers = _admin(api)
    item = next(i for i in _list(api, source="rule", status="open")["items"])
    ref = item["ref"]
    resp = api.patch(
        f"/api/v1/recommendations/{ref}", json={"status": "dismissed"}, headers=headers
    )
    assert resp.status_code == 422
    assert "exception" in resp.json()["error"]["message"]
    resp = api.patch(f"/api/v1/recommendations/{ref}", json={"status": "done"}, headers=headers)
    assert resp.status_code == 200
    finding = api.get(f"/api/v1/security/findings/{item['finding_id']}", headers=headers).json()
    assert finding["status"] == "resolved"
    api.post(
        f"/api/v1/recommendations/{ref}/comments", json={"body": "Fixed in prod."}, headers=headers
    )
    comments = api.get(f"/api/v1/recommendations/{ref}/comments", headers=headers).json()
    assert any(c["body"] == "Fixed in prod." for c in comments)
    detail = api.get(f"/api/v1/security/findings/{item['finding_id']}", headers=headers).json()
    assert any(c["body"] == "Fixed in prod." for c in detail["comments"])


def test_bulk_update(api: TestClient) -> None:
    headers = _admin(api)
    items = _list(api, status="open", source="waste")["items"][:2]
    refs = [i["ref"] for i in items] + ["w-0000000000000000"]
    resp = api.post(
        "/api/v1/recommendations/bulk",
        json={"refs": refs, "status": "in_progress"},
        headers=headers,
    )
    assert resp.status_code == 200, resp.text
    assert resp.json() == {"updated": 2, "skipped": ["w-0000000000000000"]}
    after = {i["ref"]: i["status"] for i in _list(api, source="waste")["items"]}
    assert all(after[r] == "in_progress" for r in refs[:2])


def test_tickets(api: TestClient) -> None:
    headers = _admin(api)
    item = _list(api, source="rule")["items"][0]
    jira = api.get(
        f"/api/v1/recommendations/{item['ref']}/ticket?format=jira", headers=headers
    ).json()
    assert jira["body"].startswith("h2. ")
    assert "h3. How to fix" in jira["body"]
    assert "# " in jira["body"]
    assert jira["title"].startswith(f"[{item['band']}]")
    ado = api.get(
        f"/api/v1/recommendations/{item['ref']}/ticket?format=ado", headers=headers
    ).json()
    assert ado["body"].startswith("## ")
    assert "- [ ] " in ado["body"]
    assert "/app/security/findings/" in ado["body"]


def test_csv_export_and_formula_injection() -> None:
    assert rec._cell("=HYPERLINK(1)") == "'=HYPERLINK(1)"
    assert rec._cell("-2") == "'-2"
    assert rec._cell("vm-web-01") == "vm-web-01"


def test_csv_export_endpoint(api: TestClient) -> None:
    resp = api.get("/api/v1/recommendations/export", params={"band": "P1"}, headers=_admin(api))
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("text/csv")
    rows = list(csv.reader(io.StringIO(resp.content.decode("utf-8-sig"))))
    assert rows[0][:3] == ["band", "priority", "status"]
    assert len(rows) > 1
    assert all(r[0] == "P1" for r in rows[1:])


def test_viewer_is_read_only_and_refs_validate(api: TestClient) -> None:
    viewer = auth_headers(api, "viewer@contoso.test")
    item = _list(api)["items"][0]
    assert api.get(f"/api/v1/recommendations/{item['ref']}", headers=viewer).status_code == 200
    resp = api.patch(
        f"/api/v1/recommendations/{item['ref']}", json={"status": "in_progress"}, headers=viewer
    )
    assert resp.status_code == 403
    assert api.get("/api/v1/recommendations/..%2Fx", headers=viewer).status_code in (404, 422)
    assert (
        api.get(f"/api/v1/recommendations/f-{uuid.uuid4()}", headers=_admin(api)).status_code == 404
    )


def test_other_org_cannot_see_demo_recommendations(api: TestClient) -> None:
    item = _list(api)["items"][0]
    acme = auth_headers(api, "admin@acme.test")
    assert api.get(f"/api/v1/recommendations/{item['ref']}", headers=acme).status_code == 404
    assert api.get("/api/v1/recommendations", headers=acme).json()["total"] == 0
