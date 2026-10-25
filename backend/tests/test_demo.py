"""Demo Mode (plan Section 17): the synthetic tenant's shape and the seed-demo command."""

from __future__ import annotations

import statistics
from datetime import UTC, date, datetime, timedelta

import psycopg
import pytest
from fastapi.testclient import TestClient

from kloudrecon.services.azure.demo import signals
from kloudrecon.services.azure.demo.gateway import DemoAzureGateway
from kloudrecon.services.azure.demo.summary import daily_totals, monthly_costs, summarize
from kloudrecon.services.azure.demo.world import ROLE_IDS, SUBSCRIPTIONS, world_at
from kloudrecon.services.demo import seed_demo_data
from tests.conftest import auth_headers

ANCHOR = datetime(2026, 9, 26, tzinfo=UTC)


def by_name(name: str) -> dict[str, object]:
    return next(r for r in world_at(0).resources.values() if r["name"] == name)


def assignments_for(principal: str) -> list[tuple[str, str]]:
    names = {v: k for k, v in ROLE_IDS.items()}
    return [
        (names[a["properties"]["roleDefinitionId"].rsplit("/", 1)[-1]], a["properties"]["scope"])
        for a in world_at(0).role_assignments.values()
        if a["properties"]["principalId"] == principal
    ]


def test_dataset_size_and_services() -> None:
    s = summarize(ANCHOR)
    assert 550 <= s["resources"] <= 650
    assert s["subscriptions"] == 4
    assert s["virtual_machines"] > 50
    assert s["aks_clusters"] == 2
    assert s["app_services"] >= 10
    assert s["sql_databases"] >= 6
    assert s["storage_accounts"] >= 15
    assert s["key_vaults"] >= 4
    assert s["cost_months"] == 13
    assert s["attack_path_scenarios"] == 3
    assert s["defender_cves"] >= 50
    assert s["entra_users"] >= 100
    assert s["entra_guests"] >= 5


def test_hub_spoke_network() -> None:
    hub = by_name("vnet-hub-eus")
    peers = {p["name"] for p in hub["properties"]["virtualNetworkPeerings"]}  # type: ignore[index]
    assert {
        "peer-to-vnet-prod-spoke-eus",
        "peer-to-vnet-prod-aks-eus",
        "peer-to-vnet-dev-spoke-eus",
    } <= peers
    types = {r["type"] for r in world_at(0).resources.values()}
    assert {
        "microsoft.network/azurefirewalls",
        "microsoft.network/virtualnetworkgateways",
        "microsoft.network/bastionhosts",
        "microsoft.network/applicationgateways",
        "microsoft.network/privateendpoints",
        "microsoft.network/privatednszones",
    } <= types


def test_three_attack_path_ingredients() -> None:
    # 1) jump box: RDP open to the internet + public IP + identity with Contributor on Prod
    nsg = by_name("nsg-prod-jumpbox")
    rule = nsg["properties"]["securityRules"][0]["properties"]  # type: ignore[index]
    assert (rule["sourceAddressPrefix"], rule["destinationPortRange"]) == ("*", "3389")
    jump = by_name("vm-prod-jumpbox01")
    pid = jump["identity"]["principalId"]  # type: ignore[index]
    assert ("Contributor", f"/subscriptions/{SUBSCRIPTIONS['prod'].id}") in assignments_for(pid)
    assert by_name("pip-vm-prod-jumpbox01")["properties"]["ipConfiguration"]  # type: ignore[index]
    # 2) legacy web app over HTTP with a data-owner identity on confidential storage
    app = by_name("app-contoso-legacy-portal")
    assert app["properties"]["httpsOnly"] is False  # type: ignore[index]
    uami = by_name("id-legacy-portal")["properties"]["principalId"]  # type: ignore[index]
    roles = assignments_for(uami)
    assert roles[0][0] == "Storage Blob Data Owner"
    assert roles[0][1].endswith("/stcontosocustdata")
    assert by_name("stcontosocustdata")["tags"]["data-classification"] == "confidential"  # type: ignore[index]
    # 3) dev AKS with a public API server; kubelet identity can change the data RG with public SQL
    aks = by_name("aks-contoso-dev")
    assert aks["properties"]["apiServerAccessProfile"]["enablePrivateCluster"] is False  # type: ignore[index]
    kubelet = by_name("aks-contoso-dev-agentpool")["properties"]["principalId"]  # type: ignore[index]
    assert assignments_for(kubelet)[0][1].endswith("/resourceGroups/rg-data-dev")
    assert by_name("sql-contoso-dev")["properties"]["publicNetworkAccess"] == "Enabled"  # type: ignore[index]


def test_cost_has_seasonality_and_two_anomalies() -> None:
    months = monthly_costs(ANCHOR.date())
    assert len(months) == 13
    assert months["2025-12"] > months["2026-02"] * 1.05
    days = daily_totals(ANCHOR.date(), days=60)
    median = statistics.median(days.values())
    assert days[ANCHOR.date() - timedelta(days=36)] > median * 1.3  # AKS autoscale runaway
    assert days[ANCHOR.date() - timedelta(days=8)] > median + 500  # egress spike
    gw = DemoAzureGateway([ANCHOR])
    amortized = gw.cost_query(
        f"/subscriptions/{SUBSCRIPTIONS['prod'].id}",
        {
            "type": "AmortizedCost",
            "timePeriod": {"from": "2026-09-01", "to": "2026-09-20"},
            "dataset": {
                "granularity": "Daily",
                "grouping": [{"type": "Dimension", "name": "ServiceName"}],
            },
        },
    )
    assert amortized["columns"][0]["name"] == "Cost"
    assert {row[2] for row in amortized["rows"]} >= {"Virtual Machines", "Storage"}


def test_metrics_cves_identity_and_activity() -> None:
    gw = DemoAzureGateway([ANCHOR])
    idle = by_name("vm-dev-build03")
    data = gw.arm_get(
        f"{idle['id']}/providers/Microsoft.Insights/metrics",
        "2023-10-01",
        {"metricnames": "Percentage CPU"},
    )
    points = data["value"][0]["timeseries"][0]["data"]
    assert len(points) >= 24 * 29
    assert statistics.mean(p["average"] for p in points) < 10  # rightsizing candidate
    subs = list(
        gw.arm_list(
            f"/subscriptions/{SUBSCRIPTIONS['prod'].id}/providers/Microsoft.Security/subAssessments",
            "2019-01-01",
        )
    )
    assert any(s["properties"]["additionalData"]["exploitable"] for s in subs)
    users = gw.graph_get("users")["value"]
    reg = gw.graph_get("reports/authenticationMethods/userRegistrationDetails")["value"]
    assert any(not r["isMfaRegistered"] for r in reg)
    ga = [
        a
        for a in gw.graph_get("roleManagement/directory/roleAssignments")["value"]
        if a["roleDefinitionId"] == "62e90394-69f5-4237-9190-012177145e10"
    ]
    assert len(ga) >= 5
    apps = gw.graph_get("applications")["value"]
    expiring = [
        a
        for a in apps
        if datetime.fromisoformat(a["passwordCredentials"][0]["endDateTime"].replace("Z", "+00:00"))
        < ANCHOR + timedelta(days=30)
    ]
    assert len(expiring) >= 3
    assert len(users) >= 100
    events = list(gw.activity_log(SUBSCRIPTIONS["prod"].id, ANCHOR - timedelta(days=90), ANCHOR))
    ops = {e["operationName"]["value"] for e in events}
    assert "Microsoft.Authorization/roleAssignments/write" in ops
    assert "Microsoft.Network/networkSecurityGroups/securityRules/write" in ops


def test_epochs_are_deterministic_and_bounded() -> None:
    a, b = world_at(3), world_at(3)
    assert a.resources == b.resources
    sizes = [len(world_at(e).resources) for e in range(0, 25)]
    assert max(sizes) - min(sizes) < 15
    assert signals.SECURE_SCORES["prod"] < 1


@pytest.mark.usefixtures("seeded")
def test_seed_demo_creates_history_and_is_idempotent(
    client: TestClient, admin_conn: psycopg.Connection[tuple[object, ...]]
) -> None:
    result = seed_demo_data(history_days=(9.0, 1.0))
    assert result.statuses == ["succeeded", "succeeded"]
    assert "demo@contoso.test" in result.users
    again = seed_demo_data(history_days=(9.0, 1.0))
    assert again.skipped
    demo = auth_headers(client, "demo@contoso.test")
    overview = client.get("/api/v1/overview", headers=demo).json()
    assert overview["counts"]["resources"] > 550
    assert len(overview["history"]) == 2
    assert overview["connections"][0]["is_demo"] is True
    conn = client.get("/api/v1/connections", headers=demo).json()[0]
    assert conn["secret"]["stored"] is False
    assert conn["status"] == "valid"
    viewer = auth_headers(client, "viewer@contoso.test")
    resp = client.post("/api/v1/scans", json={"connection_id": conn["id"]}, headers=viewer)
    assert resp.status_code == 403
    # Scan now works for the demo admin (queued; the worker would run it)
    resp = client.post("/api/v1/scans", json={"connection_id": conn["id"]}, headers=demo)
    assert resp.status_code == 202
    reset = seed_demo_data(reset=True, history_days=(3.0,))
    assert reset.statuses == ["succeeded"]
    assert reset.connection_id != result.connection_id
    count = admin_conn.execute("SELECT count(*) FROM scans").fetchone()
    assert count == (1,)


def test_monthly_costs_handles_year_boundary() -> None:
    months = monthly_costs(date(2026, 1, 15))
    assert next(iter(months)) == "2025-01"
    assert list(months)[-1] == "2026-01"
