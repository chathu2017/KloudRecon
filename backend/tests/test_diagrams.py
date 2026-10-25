"""Phase 4 diagrams: the topology builder on the synthetic Contoso tenant (no database) and the
diagram API on a seeded demo (views, overlays, timeline, annotations)."""

from __future__ import annotations

from collections.abc import Iterator
from typing import Any

import psycopg
import pytest
from fastapi.testclient import TestClient

from kloudrecon.diagrams import builder
from kloudrecon.diagrams.model import from_dict
from kloudrecon.services.azure.demo.world import (
    MANAGEMENT_GROUPS,
    SUBSCRIPTIONS,
    TENANT_ID,
    world_at,
)
from kloudrecon.services.scan.relationships import extract_edges
from kloudrecon.services.scan.stages import normalize
from tests.conftest import TABLES, _admin_dsn, auth_headers

FINOPS_TABLES = (
    "savings_tracker, rightsizing, metrics_summary, budgets, cost_anomalies, cost_forecasts, "
    "cost_daily, diagram_annotations, diagrams, price_cache"
)


@pytest.fixture(scope="module")
def topo() -> builder.Topology:
    rows = [normalize(r) for r in world_at(0).rows()]
    edges = [
        {"source": e.source, "target": e.target, "type": e.edge_type, "attrs": e.attrs}
        for e in extract_edges(rows)
    ]
    subs = {s.id: {"name": s.name, "is_production": k == "prod"} for k, s in SUBSCRIPTIONS.items()}
    return builder.Topology(
        builder.Inputs(
            resources={r["id"]: r for r in rows},
            edges=edges,
            subscriptions=subs,
            management_groups=[
                {"id": m["name"], "name": m["displayName"], "parent_id": m["parentId"]}
                for m in MANAGEMENT_GROUPS
            ],
            subscription_mg={s.id: s.mg for s in SUBSCRIPTIONS.values()},
            rbac=[
                {
                    "principal_id": str(ra["properties"]["principalId"]).lower(),
                    "scope": str(ra["properties"]["scope"]).lower(),
                    "role_name": "role",
                }
                for ra in world_at(0).role_assignments.values()
            ],
            tenant_id=TENANT_ID,
        )
    )


def _check_graph(g: builder.Graph) -> None:
    groups = {x.id for x in g.groups}
    nodes = {n.id for n in g.nodes}
    assert len(nodes) == len(g.nodes), "node ids are unique"
    assert all(x.parent is None or x.parent in groups for x in g.groups)
    assert all(n.parent is None or n.parent in groups for n in g.nodes)
    for e in g.edges:
        assert e.source in nodes | groups, e
        assert e.target in nodes | groups, e
    assert len({e.id for e in g.edges}) == len(g.edges)


@pytest.mark.parametrize("view", builder.VIEWS)
def test_every_view_is_consistent(topo: builder.Topology, view: str) -> None:
    g = builder.build_with(topo, view)
    _check_graph(g)
    assert g.nodes
    assert from_dict(g.to_dict()).to_dict() == g.to_dict()
    assert len(g.nodes) < 200  # large tenants are summarised, not dumped


def test_network_view_folds_and_places(topo: builder.Topology) -> None:
    g = builder.network(topo)
    types = {n.type for n in g.nodes}
    assert "microsoft.network/networkinterfaces" not in types
    assert "microsoft.compute/disks" not in types
    subnets = {x.id: x for x in g.groups if x.kind == "subnet"}
    fw_subnet = next(s for s in subnets.values() if s.label == "AzureFirewallSubnet")
    firewall = next(n for n in g.nodes if n.type == "microsoft.network/azurefirewalls")
    assert firewall.parent == fw_subnet.id
    dev_vms = next(
        n for n in g.nodes if n.kind == "aggregate" and n.parent and "snet-dev-vms" in n.parent
    )
    assert dev_vms.type == "microsoft.compute/virtualmachines"
    assert len(dev_vms.members) > builder.AGGREGATE
    kinds = {e.kind for e in g.edges}
    assert {"peering", "private-endpoint", "exposure", "connection"} <= kinds
    # routes and DNS links are stated on the containers instead of criss-crossing the canvas
    assert any(b.startswith("UDR → afw-hub-eus") for x in subnets.values() for b in x.badges)
    dns = next(n for n in g.nodes if n.type == "microsoft.network/privatednszones")
    assert "linked to" in dns.sublabel
    assert any(x.badges and x.badges[0].startswith("NSG") for x in subnets.values())
    assert builder.INTERNET in {n.id for n in g.nodes}
    assert builder.ONPREM in {n.id for n in g.nodes}


def test_draw_view_shows_the_parts_and_labels_every_link(topo: builder.Topology) -> None:
    g = builder.build_with(topo, "draw")
    types = {n.type for n in g.nodes}
    # nothing is folded: NICs, disks, public IPs and NSGs are drawn
    assert {
        "microsoft.network/networkinterfaces",
        "microsoft.compute/disks",
        "microsoft.network/publicipaddresses",
        "microsoft.network/networksecuritygroups",
    } <= types
    assert "microsoft.compute/virtualmachines/extensions" not in types
    machines = [x for x in g.groups if x.kind == "machine"]
    assert machines
    assert all(m.parent for m in machines)
    box = next(m for m in machines if m.label == "vm-prod-jumpbox01")
    inside = {n.type.rsplit("/", 1)[-1]: n for n in g.nodes if n.parent == box.id}
    assert set(inside) == {"virtualmachines", "networkinterfaces", "disks", "publicipaddresses"}
    assert inside["networkinterfaces"].sublabel.startswith("10.")
    assert "GB" in inside["disks"].sublabel
    by_pair = {(e.source, e.target): e for e in g.edges}
    pip, nic, vm = (
        inside[k].id for k in ("publicipaddresses", "networkinterfaces", "virtualmachines")
    )
    assert by_pair[(pip, nic)].label == "public IP"
    assert by_pair[(nic, vm)].label.startswith("10.")
    assert by_pair[(vm, inside["disks"].id)].label == "OS disk"
    assert by_pair[(builder.INTERNET, pip)].kind == "exposure"
    # a crowded subnet shows its machines as one expandable node
    crowd = next(n for n in g.nodes if n.kind == "aggregate" and n.type.endswith("virtualmachines"))
    assert len(crowd.members) > 6
    kinds = {e.kind for e in g.edges}
    assert {"attached", "nsg-attached", "peering", "private-endpoint", "route", "exposure"} <= kinds
    # an NSG that serves one subnet is drawn inside it and named on the subnet
    assert any(b.startswith("NSG ") for x in g.groups if x.kind == "subnet" for b in x.badges)
    assert all(e.label for e in g.edges if e.kind == "attached")


def test_hub_spoke_detection(topo: builder.Topology) -> None:
    g = builder.hub_spoke(topo)
    roles = {x.label: x.attrs.get("role") for x in g.groups if x.kind == "vnet"}
    assert roles["vnet-hub-eus"] == "hub"
    assert roles["vnet-hub-weu"] == "hub"
    assert roles["vnet-prod-spoke-eus"] == "spoke"
    assert roles["vnet-dev-spoke-eus"] == "spoke"
    labels = {e.label for e in g.edges if e.kind == "peering"}
    assert "peering · gateway transit" in labels
    assert "global peering" in labels
    hub_nodes = [n.type for n in g.nodes if n.parent and "vnet-hub-eus" in n.parent]
    assert "microsoft.network/azurefirewalls" in hub_nodes


def test_data_flow_links_apps_to_data(topo: builder.Topology) -> None:
    g = builder.data_flow(topo)
    tiers = {n.parent for n in g.nodes if n.kind != "external"}
    assert tiers == {"tier:ingress", "tier:apps", "tier:data"}
    assert any(e.kind == "rbac-grants" for e in g.edges)
    assert any(e.kind == "exposure" and e.source == builder.INTERNET for e in g.edges)
    assert len(g.edges) < 80


def test_hierarchy_and_region(topo: builder.Topology) -> None:
    h = builder.hierarchy(topo)
    assert {n.label for n in h.nodes} >= {"Tenant Root Group", "Corp", "Contoso-Prod"}
    prod = next(n for n in h.nodes if n.label == "Contoso-Prod")
    assert any(e.target == prod.id and e.source == "mg:mg-corp" for e in h.edges)
    r = builder.region(topo)
    assert {x.label for x in r.groups if x.kind == "region"} >= {"East US", "West Europe"}
    assert any(e.label == "global peering" for e in r.edges)


def test_application_view_by_other_tag(topo: builder.Topology) -> None:
    g = builder.application(topo, "env")
    assert {x.label for x in g.groups} >= {"prod", "dev"}
    assert g.stats["tag"] == "env"


# ---- API ----------------------------------------------------------------------------------------
@pytest.fixture(autouse=True)
def _clean_tables() -> None:  # the API tests share a seeded demo (see `demo`)
    return None


@pytest.fixture(scope="module")
def demo(_database: None) -> Iterator[dict[str, Any]]:
    from kloudrecon.core.db import session_scope
    from kloudrecon.services.demo import seed_demo_data
    from kloudrecon.services.seed import seed_dev

    with psycopg.connect(_admin_dsn(), autocommit=True) as conn:
        conn.execute(f"TRUNCATE {FINOPS_TABLES}, {TABLES} RESTART IDENTITY CASCADE")
    with session_scope() as s:
        seed_dev(s)
    result = seed_demo_data(history_days=(3.0, 2.0, 1.0))
    assert result.statuses == ["succeeded"] * 3
    yield {"org_id": result.org_id, "scans": result.created_scans}
    with psycopg.connect(_admin_dsn(), autocommit=True) as conn:
        conn.execute(f"TRUNCATE {FINOPS_TABLES}, {TABLES} RESTART IDENTITY CASCADE")


@pytest.fixture(scope="module")
def api(demo: dict[str, Any]) -> Iterator[TestClient]:
    from kloudrecon.api.main import create_app

    with TestClient(create_app(start_listener=False)) as c:
        yield c


def test_stage_stores_all_views(demo: dict[str, Any]) -> None:
    with psycopg.connect(_admin_dsn(), autocommit=True) as conn:
        rows = conn.execute(
            "SELECT view, node_count FROM diagrams WHERE scan_id = %s ORDER BY view",
            (demo["scans"][-1],),
        ).fetchall()
        log = conn.execute(
            "SELECT status, message FROM scan_stage_logs WHERE scan_id = %s AND stage = 'diagram'",
            (demo["scans"][-1],),
        ).fetchone()
    assert {r[0] for r in rows} == set(builder.VIEWS)
    assert log is not None
    assert log[0] == "succeeded"


def test_view_api_with_overlays(api: TestClient) -> None:
    h = auth_headers(api, "demo@contoso.test")
    r = api.get("/api/v1/diagrams/network", headers=h)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["graph"]["view"] == "network"
    ov = body["overlays"]
    assert ov["cost"]
    assert ov["findings"]
    assert ov["exposure"]
    assert len(ov["attack_paths"]) == 9
    assert ov["changes"]["previous_scan_id"]
    assert ov["changes"]["added"] or ov["changes"]["modified"] or ov["changes"]["removed"]
    assert "app" in body["tags"]
    hier = api.get("/api/v1/diagrams/hierarchy", headers=h).json()
    prod = next(n for n in hier["graph"]["nodes"] if n["label"] == "Contoso-Prod")
    assert any(
        e["target"] == prod["id"] and e["source"] == "mg:mg-corp" for e in hier["graph"]["edges"]
    )
    env = api.get("/api/v1/diagrams/application", params={"tag": "env"}, headers=h).json()
    assert env["graph"]["stats"]["tag"] == "env"
    assert api.get("/api/v1/diagrams/nope", headers=h).status_code == 422


def test_timeline_and_time_machine(api: TestClient, demo: dict[str, Any]) -> None:
    h = auth_headers(api, "demo@contoso.test")
    items = api.get("/api/v1/diagrams/timeline", headers=h).json()
    assert [i["sequence"] for i in items] == [1, 2, 3]
    assert items[-1]["nodes"]["network"] > 0
    first = api.get(
        "/api/v1/diagrams/network", params={"scan_id": str(demo["scans"][0])}, headers=h
    ).json()
    assert first["scan_sequence"] == 1
    assert first["overlays"]["changes"]["previous_scan_id"] is None


def test_annotations_crud(api: TestClient) -> None:
    h = auth_headers(api, "demo@contoso.test")
    body = {
        "view": "network",
        "text": "Firewall rules reviewed",
        "color": "blue",
        "position": {"x": 10, "y": 20},
    }
    r = api.post("/api/v1/diagrams/annotations", json=body, headers=h)
    assert r.status_code == 201, r.text
    note = r.json()
    moved = api.put(
        f"/api/v1/diagrams/annotations/{note['id']}",
        json={**body, "position": {"x": 50, "y": 60}},
        headers=h,
    ).json()
    assert moved["position"] == {"x": 50.0, "y": 60.0}
    listed = api.get("/api/v1/diagrams/annotations", params={"view": "network"}, headers=h).json()
    assert [n["id"] for n in listed] == [note["id"]]
    viewer = auth_headers(api, "viewer@contoso.test")
    assert api.post("/api/v1/diagrams/annotations", json=body, headers=viewer).status_code == 403
    assert api.delete(f"/api/v1/diagrams/annotations/{note['id']}", headers=h).status_code == 200
    assert (
        api.get("/api/v1/diagrams/annotations", params={"view": "network"}, headers=h).json() == []
    )


# ---- architecture document -----------------------------------------------------------------
def test_address_plan_on_demo(topo: builder.Topology) -> None:
    from kloudrecon.services.architecture_doc import address_plan

    plan = address_plan(topo)
    roles = {v.name: v.role for v in plan.vnets}
    assert roles["vnet-hub-eus"] == "hub"
    assert roles["vnet-prod-spoke-eus"] == "spoke"
    hub = next(v for v in plan.vnets if v.name == "vnet-hub-eus")
    assert hub.addresses == 65536
    fw = next(s for s in hub.subnets if s.name == "AzureFirewallSubnet")
    assert (fw.addresses, fw.usable) == (64, 59)
    assert plan.on_premises
    assert plan.on_premises[0].value == "172.16.0.0/16"
    assert not [i for i in plan.issues if i.severity == "high"]  # the demo has no overlaps
    # platform subnets are never reported for a missing NSG
    assert not [i for i in plan.issues if "GatewaySubnet" in i.message]


NET = "/subscriptions/s1/resourcegroups/rg/providers/microsoft.network"


def _vnet(name: str, cidr: str, subnets: list[tuple[str, str]]) -> dict[str, Any]:
    return {
        "id": f"{NET}/virtualnetworks/{name}",
        "name": name,
        "type": "microsoft.network/virtualnetworks",
        "location": "westeurope",
        "subscriptionId": "s1",
        "properties": {
            "addressSpace": {"addressPrefixes": [cidr]},
            "subnets": [
                {"name": n, "properties": {"addressPrefix": p, "ipConfigurations": [{}] * used}}
                for n, p, used in ((n, p, 26 if n == "full" else 0) for n, p in subnets)
            ],
        },
    }


def test_address_plan_flags_overlaps_and_full_subnets() -> None:
    from kloudrecon.services.architecture_doc import address_plan

    a = _vnet("vnet-a", "10.0.0.0/16", [("full", "10.0.1.0/27")])
    b = _vnet("vnet-b", "10.0.128.0/17", [("GatewaySubnet", "10.0.128.0/27")])
    lng = {
        "id": f"{NET}/localnetworkgateways/dc",
        "name": "dc",
        "type": "microsoft.network/localnetworkgateways",
        "subscriptionId": "s1",
        "properties": {"localNetworkAddressSpace": {"addressPrefixes": ["10.0.200.0/24"]}},
    }
    topo = builder.Topology(builder.Inputs(resources={r["id"]: r for r in (a, b, lng)}, edges=[]))
    plan = address_plan(topo)
    messages = [(i.severity, i.message) for i in plan.issues]
    high = [m for s, m in messages if s == "high"]
    assert any("vnet-a and vnet-b overlap" in m for m in high)
    assert any("on-premises (dc)" in m for m in high)
    assert ("medium", "Subnet vnet-a/full (10.0.1.0/27) is 96% used.") in messages
    assert any("vnet-a/full has no network security group" in m for _, m in messages)
    assert not any("GatewaySubnet" in m for _, m in messages)
    assert {v.role for v in plan.vnets} == {"standalone"}


def test_architecture_document_api(api: TestClient) -> None:
    h = auth_headers(api, "demo@contoso.test")
    r = api.get("/api/v1/diagrams/document", headers=h)
    assert r.status_code == 200, r.text
    doc = r.json()
    keys = [s["key"] for s in doc["sections"]]
    assert keys == [
        "overview",
        "hierarchy",
        "network",
        "hub_spoke",
        "region",
        "resource_group",
        "application",
        "data_flow",
    ]
    assert all(s["paragraphs"] for s in doc["sections"])
    assert {s["view"] for s in doc["sections"][1:]} <= set(builder.VIEWS)
    assert doc["address_plan"]["vnets"]
    assert sum(t["count"] for t in doc["components"]) > 100
    assert {t["label"] for t in doc["components"]} >= {"Compute", "Networking", "Storage"}
    assert doc["security"]["score"]["overall"] > 0
    assert doc["cost"]["last30_actual"] > 0
    hub = next(s for s in doc["sections"] if s["key"] == "hub_spoke")
    assert "Azure Firewall" in " ".join(hub["paragraphs"])
