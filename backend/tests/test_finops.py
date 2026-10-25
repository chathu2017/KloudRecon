"""Phase 4 FinOps end to end on the Contoso Demo: stages 11-15 (cost, forecast/budgets/anomalies,
metrics, reservations, quotas) and the FinOps API. The demo is seeded once for this module."""

from __future__ import annotations

from collections.abc import Iterator
from datetime import date, timedelta
from typing import Any

import psycopg
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select, text

from kloudrecon.core.db import session_scope
from kloudrecon.core.rls import enable_system, set_tenant
from kloudrecon.domain.models import (
    Budget,
    Connection,
    CostAnomaly,
    CostDaily,
    CostForecast,
    MetricSummary,
    Scan,
    ScanArtifact,
    ScanStageLog,
)
from tests.conftest import TABLES, _admin_dsn, auth_headers

FINOPS_TABLES = (
    "savings_tracker, rightsizing, metrics_summary, budgets, cost_anomalies, cost_forecasts, "
    "cost_daily, diagram_annotations, diagrams, price_cache"
)


@pytest.fixture(autouse=True)
def _clean_tables() -> None:  # data is shared across this module (see `demo`)
    return None


@pytest.fixture(scope="module")
def demo(_database: None) -> Iterator[dict[str, Any]]:
    from kloudrecon.services.demo import seed_demo_data
    from kloudrecon.services.seed import seed_dev

    with psycopg.connect(_admin_dsn(), autocommit=True) as conn:
        conn.execute(f"TRUNCATE {FINOPS_TABLES}, {TABLES} RESTART IDENTITY CASCADE")
    with session_scope() as s:
        seed_dev(s)
    result = seed_demo_data(history_days=(3.0, 2.0, 1.0))
    assert result.statuses == ["succeeded"] * 3
    yield {
        "org_id": result.org_id,
        "connection_id": result.connection_id,
        "scans": result.created_scans,
    }
    with psycopg.connect(_admin_dsn(), autocommit=True) as conn:
        conn.execute(f"TRUNCATE {FINOPS_TABLES}, {TABLES} RESTART IDENTITY CASCADE")


@pytest.fixture(scope="module")
def api(demo: dict[str, Any]) -> Iterator[TestClient]:
    from kloudrecon.api.main import create_app

    with TestClient(create_app(start_listener=False)) as c:
        yield c


def _admin(api: TestClient) -> dict[str, str]:
    return auth_headers(api, "demo@contoso.test")


def _latest_scan(demo: dict[str, Any]) -> Scan:
    with session_scope() as s:
        enable_system(s)
        scan = s.get(Scan, demo["scans"][-1])
        assert scan is not None
        return scan


# ---- stages -------------------------------------------------------------------------------------
def test_finops_stages_succeed(demo: dict[str, Any]) -> None:
    with session_scope() as s:
        enable_system(s)
        logs = {
            log.stage: log
            for log in s.scalars(
                select(ScanStageLog).where(ScanStageLog.scan_id == demo["scans"][-1])
            )
        }
    for stage in ("cost", "forecast", "metrics", "reservations", "quotas"):
        assert logs[stage].status == "succeeded", (stage, logs[stage].message)
    assert "2 anomaly" in (logs["forecast"].message or "")
    from kloudrecon.services.scan.pipeline import stage_titles

    keys = [k for k, _, _ in stage_titles()]
    assert keys.index("identity") < keys.index("cost") < keys.index("quotas") < keys.index("rules")


def test_cost_import_matches_cost_management_within_one_percent(demo: dict[str, Any]) -> None:
    """Acceptance: the 30-day actual cost equals what Cost Management returns (within 1%)."""
    from kloudrecon.services.azure.demo.gateway import DemoAzureGateway
    from kloudrecon.services.azure.demo.world import SUBSCRIPTIONS
    from kloudrecon.services.azure.factory import demo_epoch_times

    scan = _latest_scan(demo)
    with session_scope() as s:
        enable_system(s)
        conn = s.get(Connection, demo["connection_id"])
        assert conn is not None
        gw = DemoAzureGateway(demo_epoch_times(dict(conn.settings)))
    assert scan.started_at is not None
    today = scan.started_at.date()
    start = today - timedelta(days=29)
    expected = 0.0
    for sub in SUBSCRIPTIONS.values():
        body = {
            "type": "ActualCost",
            "timePeriod": {"from": start.isoformat(), "to": today.isoformat()},
            "dataset": {"granularity": "None"},
        }
        expected += sum(
            float(r[0]) for r in gw.cost_query(f"/subscriptions/{sub.id}", body)["rows"]
        )
    with session_scope() as s:
        set_tenant(s, demo["org_id"])
        stored = float(
            s.scalar(
                select(func.sum(CostDaily.cost_actual)).where(
                    CostDaily.org_id == demo["org_id"],
                    CostDaily.usage_date >= start,
                    CostDaily.usage_date <= today,
                )
            )
            or 0
        )
    assert expected > 10_000
    assert abs(stored - expected) / expected < 0.01
    assert scan.stats["cost"]["last30_actual"] == pytest.approx(stored, rel=0.01)


def test_cost_history_is_13_months_without_duplicates(demo: dict[str, Any]) -> None:
    with session_scope() as s:
        set_tenant(s, demo["org_id"])
        first, last = s.execute(
            select(func.min(CostDaily.usage_date), func.max(CostDaily.usage_date)).where(
                CostDaily.org_id == demo["org_id"]
            )
        ).one()
        dupes = s.execute(
            text(
                "SELECT count(*) FROM (SELECT usage_date, arm_id, meter_category, subscription_id "
                "FROM cost_daily GROUP BY 1, 2, 3, 4 HAVING count(*) > 1) d"
            )
        ).scalar_one()
        partitions = s.execute(
            text(
                "SELECT count(*) FROM pg_inherits i JOIN pg_class p ON p.oid = i.inhparent "
                "WHERE p.relname = 'cost_daily'"
            )
        ).scalar_one()
        costed = s.execute(
            text("SELECT count(*) FROM resources WHERE scan_id = :s AND monthly_cost > 0"),
            {"s": demo["scans"][-1]},
        ).scalar_one()
    assert first is not None
    assert last is not None
    assert (last - first).days >= 360
    assert first.day == 1
    assert dupes == 0  # later scans re-pulled the last days instead of appending
    assert partitions >= 14
    assert costed > 100


def test_forecast_bands_backtest_and_budgets(demo: dict[str, Any]) -> None:
    with session_scope() as s:
        set_tenant(s, demo["org_id"])
        art = s.scalar(
            select(ScanArtifact.data).where(
                ScanArtifact.scan_id == demo["scans"][-1], ScanArtifact.kind == "forecast"
            )
        )
        rows = s.scalars(
            select(CostForecast).where(
                CostForecast.scan_id == demo["scans"][-1], CostForecast.source == "blended"
            )
        ).all()
        budgets = s.scalars(select(Budget).where(Budget.scan_id == demo["scans"][-1])).all()
    assert art is not None
    assert art["azure_available"] is True
    assert art["method"] == "ets+azure"
    me = art["month_end"]
    assert me["p10"] <= me["p50"] <= me["p90"]
    assert me["mtd"] > 0
    assert len(art["months"]) == 3
    assert art["backtest"]["mape_typical"] is not None
    assert art["backtest"]["mape_typical"] < 10
    assert len(art["backtest"]["points"]) == 30
    assert len(rows) >= 90
    assert all(r.p10 <= r.p50 <= r.p90 for r in rows)
    assert len(budgets) == 4
    assert all(b.amount > 0 and b.forecast is not None for b in budgets)


def test_two_anomalies_with_root_cause(demo: dict[str, Any]) -> None:
    with session_scope() as s:
        set_tenant(s, demo["org_id"])
        found = s.scalars(
            select(CostAnomaly)
            .where(CostAnomaly.org_id == demo["org_id"])
            .order_by(CostAnomaly.date)
        ).all()
    assert len(found) == 2
    aks, egress = found
    assert aks.days == 4
    assert "aks-user-vmss" in aks.driver["headline"]
    assert egress.days == 3
    assert "Bandwidth on stcontosodataexport" in egress.driver["headline"]
    tree = egress.driver["services"][0]
    assert tree["service"] == "Storage"
    assert tree["resources"][0]["meters"][0]["meter_category"] == "Bandwidth"
    assert float(egress.delta) > 2000


def test_metrics_cover_vms_plans_sql_and_aks(demo: dict[str, Any]) -> None:
    with session_scope() as s:
        set_tenant(s, demo["org_id"])
        rows = s.scalars(
            select(MetricSummary).where(MetricSummary.scan_id == demo["scans"][-1])
        ).all()
    types = {r.resource_type for r in rows}
    assert {
        "microsoft.compute/virtualmachines",
        "microsoft.web/serverfarms",
        "microsoft.sql/servers/databases",
        "microsoft.containerservice/managedclusters",
    } <= types
    build03 = [r for r in rows if r.arm_id.endswith("/vm-dev-build03") and r.metric == "cpu"]
    assert build03
    assert float(build03[0].p95 or 0) < 10
    assert all(len(r.series) >= 29 for r in rows)
    assert any(r.metric == "memory" for r in rows)


def test_quotas_include_compute_and_network(demo: dict[str, Any]) -> None:
    with session_scope() as s:
        set_tenant(s, demo["org_id"])
        art = s.scalar(
            select(ScanArtifact.data).where(
                ScanArtifact.scan_id == demo["scans"][-1], ScanArtifact.kind == "quotas"
            )
        )
        res = s.scalar(
            select(ScanArtifact.data).where(
                ScanArtifact.scan_id == demo["scans"][-1], ScanArtifact.kind == "reservations"
            )
        )
    providers = {u["provider"] for items in (art or {})["usages"].values() for u in items}
    assert providers == {"Microsoft.Compute", "Microsoft.Network"}
    assert res is not None
    assert len(res["orders"]) == 2
    assert {o["utilization_avg"] is not None for o in res["orders"]} == {True}


def test_every_org_table_enforces_rls(demo: dict[str, Any]) -> None:
    """Every table (incl. cost partitions) with an org_id column has RLS enabled and forced."""
    with psycopg.connect(_admin_dsn(), autocommit=True) as conn:
        rows = conn.execute(
            "SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity FROM pg_class c "
            "JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'org_id' "
            "JOIN pg_namespace n ON n.oid = c.relnamespace "
            "WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')"
        ).fetchall()
    missing = [name for name, enabled, forced in rows if not (enabled and forced)]
    assert rows
    assert missing == []


def test_cost_rows_are_tenant_isolated(demo: dict[str, Any]) -> None:
    import uuid

    with session_scope() as s:
        set_tenant(s, uuid.uuid4())
        assert s.scalar(select(func.count()).select_from(CostDaily)) == 0
        assert s.scalar(select(func.count()).select_from(CostAnomaly)) == 0


def test_cost_partition_maintenance(demo: dict[str, Any]) -> None:
    with session_scope() as s:
        set_tenant(s, demo["org_id"])
        created = s.execute(
            text("SELECT kr_ensure_cost_partitions(:a, :b)"),
            {"a": date(2030, 1, 5), "b": date(2030, 2, 1)},
        ).scalar_one()
        system = s.execute(text("SELECT current_setting('app.system', true)")).scalar_one()
        dropped = s.execute(
            text("SELECT kr_drop_cost_partitions_before(:c)"), {"c": date(2001, 1, 1)}
        ).scalar_one()
    assert created == 2
    assert system == "off"  # the function restores the caller's setting
    assert dropped == 0


# ---- API: explorer, forecast, anomalies ---------------------------------------------------------
def test_explorer_returns_every_chart(api: TestClient) -> None:
    h = _admin(api)
    r = api.get("/api/v1/costs/explorer", params={"group_by": "service", "range": "30d"}, headers=h)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["currency"] == "USD"
    assert len(body["daily"]) == 30
    assert len(body["monthly"]) == 13
    assert 1 <= len(body["series_keys"]) <= 9
    assert body["top_resources"]
    assert body["movers"]
    assert body["heatmap"]
    assert abs(sum(g["cost"] for g in body["groups"]) - body["total"]) < 1
    assert {"env", "app"} <= set(body["tag_keys"])
    services = {g["label"] for g in body["groups"]}
    assert "Virtual Machines" in services
    for group_by in ("resource_group", "subscription", "location", "meter", "resource", "tag:env"):
        r = api.get(
            "/api/v1/costs/explorer", params={"group_by": group_by, "range": "7d"}, headers=h
        )
        assert r.status_code == 200, (group_by, r.text)
    r = api.get(
        "/api/v1/costs/explorer",
        params={"metric": "amortized", "range": "12m", "group_by": "meter", "service": "Storage"},
        headers=h,
    )
    assert r.status_code == 200
    assert {g["label"] for g in r.json()["groups"]} >= {"Storage", "Bandwidth"}
    bad = api.get("/api/v1/costs/explorer", params={"group_by": "nope"}, headers=h)
    assert bad.status_code == 422


def test_summary_forecast_and_budgets(api: TestClient) -> None:
    h = _admin(api)
    s = api.get("/api/v1/costs/summary", headers=h).json()
    assert s["available"] is True
    assert s["mtd"] > 0
    assert s["forecast_p10"] <= s["forecast_month_end"] <= s["forecast_p90"]
    assert s["potential_savings"] > 1000
    assert set(s["savings_breakdown"]) == {"rightsizing", "waste", "commitments"}
    assert len(s["top_savings"]) == 5
    assert len(s["trend"]) >= 80
    f = api.get("/api/v1/costs/forecast", headers=h).json()
    assert f["available"] is True
    assert f["azure_available"] is True
    assert f["mape_typical"] is not None
    assert len(f["backtest"]) == 30
    assert len(f["months"]) == 3
    assert f["months"][0]["previous_year"] is not None
    assert len(f["budgets"]) == 4
    budget = f["budgets"][0]
    assert budget["burn"][-1]["forecast"] is not None
    assert budget["status"] in {"ok", "at_risk", "over"}


def test_anomalies_api_and_status(api: TestClient) -> None:
    h = _admin(api)
    items = api.get("/api/v1/costs/anomalies", headers=h).json()
    assert len(items) == 2
    egress = items[0]
    assert egress["services"][0]["resources"][0]["name"] == "stcontosodataexport"
    assert egress["pct"] > 50
    assert len(egress["series"]) > 20
    r = api.patch(
        f"/api/v1/costs/anomalies/{egress['id']}", json={"status": "acknowledged"}, headers=h
    )
    assert r.status_code == 200
    assert r.json()["status"] == "acknowledged"
    viewer = auth_headers(api, "viewer@contoso.test")
    denied = api.patch(
        f"/api/v1/costs/anomalies/{egress['id']}", json={"status": "resolved"}, headers=viewer
    )
    assert denied.status_code == 403
    only_open = api.get("/api/v1/costs/anomalies", params={"status": "open"}, headers=h).json()
    assert len(only_open) == 1


def test_time_machine_cuts_cost_at_scan_date(api: TestClient, demo: dict[str, Any]) -> None:
    h = _admin(api)
    first = demo["scans"][0]
    latest = api.get("/api/v1/costs/explorer", params={"range": "7d"}, headers=h).json()
    older = api.get(
        "/api/v1/costs/explorer", params={"range": "7d", "scan_id": str(first)}, headers=h
    ).json()
    assert older["data_through"] < latest["data_through"]


def test_resource_cost_and_metrics(api: TestClient) -> None:
    h = _admin(api)
    rs = api.get("/api/v1/costs/rightsizing", headers=h).json()
    build = next(i for i in rs["items"] if i["resource_name"] == "vm-dev-build03")
    r = api.get("/api/v1/costs/resource", params={"arm_id": build["arm_id"]}, headers=h)
    assert r.status_code == 200
    body = r.json()
    assert len(body["daily"]) == 90
    assert body["last30"] > 0
    assert {m["metric"] for m in body["metrics"]} == {"cpu", "memory"}
    assert body["rightsizing"]["recommended_sku"] == "Standard_D8s_v5"


# ---- API: optimization --------------------------------------------------------------------------
def test_rightsizing_shows_savings_with_skus(api: TestClient) -> None:
    """Acceptance: rightsizing shows savings with SKUs."""
    body = api.get("/api/v1/costs/rightsizing", headers=_admin(api)).json()
    names = {i["resource_name"]: i for i in body["items"]}
    expected = {"vm-dev-build03", "sqldb-payments", "asp-prod-api-p2v3", "aks-contoso-dev"}
    assert expected <= set(names)
    vm = names["vm-dev-build03"]
    assert (vm["current_sku"], vm["recommended_sku"]) == ("Standard_D16s_v5", "Standard_D8s_v5")
    assert vm["monthly_saving"] == pytest.approx(0.768 * 730 - 0.384 * 730, rel=1e-3)
    assert vm["confidence"] in {"high", "medium", "low"}
    assert vm["metrics"]["cpu_p95"] < 10
    assert names["vm-erp-app01"]["risk_note"].startswith("Covered by a reservation")
    assert body["total_saving"] > 3000


def test_waste_finder_categories(api: TestClient) -> None:
    body = api.get("/api/v1/costs/waste", headers=_admin(api)).json()
    cats = {c["key"]: c for c in body["categories"]}
    assert {"unattached", "stopped", "idle", "snapshots", "schedule", "logs", "ahb"} <= set(cats)
    assert cats["unattached"]["items"]
    assert cats["logs"]["items"]
    assert body["total_saving"] > 0
    assert body["total_saving"] <= sum(c["monthly_saving"] for c in body["categories"]) + 0.01


def test_commitments(api: TestClient) -> None:
    body = api.get("/api/v1/costs/commitments", headers=_admin(api)).json()
    assert len(body["reservations"]) == 2
    assert body["reservations"][0]["utilization"]
    ri = [r for r in body["recommendations"] if r["kind"] == "reservation"]
    sp = [r for r in body["recommendations"] if r["kind"] == "savings_plan"]
    assert ri
    assert len(sp) == 2
    one = next(r for r in ri if r["term"] == "1y")
    assert one["break_even_utilization"] == pytest.approx(62.0, abs=0.5)
    assert one["break_even_months"] == pytest.approx(7.4, abs=0.1)
    assert all("vm-dev-" not in n for r in ri for n in r["resources"])


def _vm(api: TestClient, name: str) -> str:
    rows = api.get("/api/v1/costs/whatif/resources", params={"q": name}, headers=_admin(api)).json()
    return str(next(r["arm_id"] for r in rows if r["name"] == name))


def test_whatif_three_cases(api: TestClient) -> None:
    """Acceptance: what-if calculates correctly for 3 test cases (catalog prices, East US)."""
    h = _admin(api)
    build03 = _vm(api, "vm-dev-build03")  # Linux Standard_D16s_v5 in eastus
    scenarios = [
        {"kind": "resize", "arm_id": build03, "target_sku": "Standard_D4s_v5"},
        {"kind": "reservation", "arm_id": build03, "term": "1y"},
        {"kind": "shutdown", "arm_id": build03, "hours_per_day": 12, "days_per_week": 5},
        {"kind": "region", "arm_id": build03, "target_region": "westeurope"},
    ]
    r = api.post("/api/v1/costs/whatif", json={"scenarios": scenarios}, headers=h)
    assert r.status_code == 200, r.text
    resize, reserve, shutdown, region = r.json()["results"]
    current = 0.768 * 730  # 560.64
    assert resize["current_monthly"] == pytest.approx(current)
    assert resize["new_monthly"] == pytest.approx(0.192 * 730)
    assert resize["monthly_delta"] == pytest.approx(-420.48)
    assert resize["annual_delta"] == pytest.approx(-420.48 * 12)
    assert reserve["new_monthly"] == pytest.approx(current * 0.62, abs=0.01)
    assert shutdown["new_monthly"] == pytest.approx(0.768 * 12 * 5 * 52 / 12, abs=0.01)
    assert shutdown["monthly_delta"] == pytest.approx(0.768 * 12 * 5 * 52 / 12 - current, abs=0.02)
    assert region["new_monthly"] == pytest.approx(current * 1.15, abs=0.01)
    assert resize["price_source"] == "catalog"
    assert resize["billed_last30"] > 0
    bad = api.post(
        "/api/v1/costs/whatif",
        json={"scenarios": [{"kind": "resize", "arm_id": build03, "target_sku": "bogus"}]},
        headers=h,
    )
    assert bad.status_code == 422


def test_whatif_windows_reservation_keeps_license(api: TestClient) -> None:
    h = _admin(api)
    jump = _vm(api, "vm-prod-jumpbox01")  # Windows Standard_B2ms
    out = api.post(
        "/api/v1/costs/whatif",
        json={"scenarios": [{"kind": "reservation", "arm_id": jump, "term": "3y"}]},
        headers=h,
    ).json()["results"][0]
    license_part = 0.046 * 2
    assert out["current_hourly"] == pytest.approx(0.0832 + license_part)
    assert out["new_hourly"] == pytest.approx(0.0832 * 0.40 + license_part)
    assert any("license" in n for n in out["notes"])


def test_showback_and_export(api: TestClient) -> None:
    h = _admin(api)
    body = api.get("/api/v1/costs/showback", params={"key": "env"}, headers=h).json()
    assert body["key"] == "env"
    assert body["groups"]
    assert 0 < body["coverage_pct"] <= 100
    assert abs(body["tagged"] + body["untagged"] - body["total"]) < 0.05
    csv_resp = api.get("/api/v1/costs/showback/export", params={"key": "env"}, headers=h)
    assert csv_resp.status_code == 200
    assert csv_resp.headers["content-type"].startswith("text/csv")
    assert csv_resp.text.splitlines()[0].startswith("tag:env,")


def test_savings_tracker_flow(api: TestClient) -> None:
    h = _admin(api)
    rs = api.get("/api/v1/costs/rightsizing", headers=h).json()["items"][0]
    ref = f"{rs['arm_id']}|{rs['recommended_sku']}"
    r = api.post("/api/v1/costs/savings", json={"source": "rightsizing", "ref": ref}, headers=h)
    assert r.status_code == 201, r.text
    entry = r.json()
    assert entry["expected_monthly"] == pytest.approx(rs["monthly_saving"])
    assert entry["status"] == "tracking"
    assert entry["baseline_monthly"] is not None
    again = api.post("/api/v1/costs/savings", json={"source": "rightsizing", "ref": ref}, headers=h)
    assert again.status_code == 422
    listed = api.get("/api/v1/costs/rightsizing", headers=h).json()["items"][0]
    assert listed["tracked"] is True
    manual = api.post(
        "/api/v1/costs/savings",
        json={
            "source": "manual",
            "ref": "turned-off-test-env",
            "title": "Test env off",
            "expected_monthly": 120,
        },
        headers=h,
    )
    assert manual.status_code == 201
    assert manual.json()["status"] == "not_measurable"
    summary = api.get("/api/v1/costs/savings", headers=h).json()
    assert summary["expected_monthly"] >= rs["monthly_saving"] + 120
    viewer = auth_headers(api, "viewer@contoso.test")
    assert api.delete(f"/api/v1/costs/savings/{entry['id']}", headers=viewer).status_code == 403
    assert api.delete(f"/api/v1/costs/savings/{entry['id']}", headers=h).status_code == 200


def test_savings_are_measured_from_cost_data(demo: dict[str, Any]) -> None:
    """A tracked item is measured once 7 days of cost exist after it was implemented."""
    from datetime import UTC, datetime

    from kloudrecon.domain.finops_schemas import SavingsIn
    from kloudrecon.domain.models import SavingsEntry
    from kloudrecon.services import optimize

    with session_scope() as s:
        set_tenant(s, demo["org_id"])
        arm = s.scalar(
            select(CostDaily.arm_id)
            .where(
                CostDaily.org_id == demo["org_id"],
                CostDaily.resource_type == "microsoft.compute/virtualmachines",
            )
            .limit(1)
        )
        assert arm is not None
        user_id = s.scalar(text("SELECT id FROM users WHERE email = 'demo@contoso.test'"))
        out = optimize.track(
            s,
            demo["org_id"],
            user_id,
            SavingsIn(
                source="manual", ref="measure-me", title="x", arm_id=arm, expected_monthly=10
            ),
            when=datetime.now(UTC) - timedelta(days=20),
        )
        row = s.get(SavingsEntry, out.id)
        assert row is not None
        assert row.status == "measured"
        assert row.days_measured >= 7
        assert row.realized_monthly is not None


def test_findings_show_cost_of_risk(api: TestClient) -> None:
    h = _admin(api)
    page = api.get("/api/v1/security/findings", params={"limit": 100}, headers=h).json()
    costed = [f for f in page["items"] if f["resource_monthly_cost"]]
    assert costed
    detail = api.get(f"/api/v1/security/findings/{costed[0]['id']}", headers=h).json()
    assert detail["resource_monthly_cost"] == pytest.approx(costed[0]["resource_monthly_cost"])


def test_cost_findings_use_actual_cost(demo: dict[str, Any]) -> None:
    """Phase 4: cost findings estimate savings from billed cost, not list prices."""
    from kloudrecon.domain.models import Finding, Resource

    with session_scope() as s:
        set_tenant(s, demo["org_id"])
        row = s.execute(
            select(Finding.est_monthly_savings, Resource.monthly_cost)
            .join(Resource, Resource.arm_id == Finding.arm_id)
            .where(
                Finding.org_id == demo["org_id"],
                Finding.rule_id == "cost-disk-unattached",
                Resource.scan_id == demo["scans"][-1],
            )
            .limit(1)
        ).first()
    assert row is not None
    savings, billed = row
    assert float(savings) == pytest.approx(float(billed), rel=0.01)
