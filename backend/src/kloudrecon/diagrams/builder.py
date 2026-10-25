"""Topology builder (plan 9.3): scan data → the normalized diagram views.

1. network        subscription → VNet → subnet → resources; Internet, on-premises, peering,
                  private endpoints, VNet integration, UDRs to the firewall, private DNS
2. hub_spoke      regions → hub and spoke VNets (auto-detected), infrastructure in hubs,
                  workload summaries in spokes, peering / gateway transit, on-premises
3. resource_group subscription → resource group → resources, dependencies
4. application    one container per value of a tag (default `app`)
5. data_flow      Internet → ingress → applications → data, via RBAC grants, private
                  endpoints and shared application tags
6. region         region → category → resource types with counts, global peering
7. hierarchy      tenant root → management groups → subscriptions
8. draw           the detailed drawing (`diagrams/draw.py`): nothing folded, every link labelled

Details that would clutter the picture are folded: NICs and disks into their VM, extensions,
DNS links and SQL databases into their parent, NSGs and route tables become subnet badges.
Any container with more than AGGREGATE resources of one type shows them as one aggregate node
(`members` lets the UI expand it).
"""

from __future__ import annotations

import re
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from typing import Any

from kloudrecon.diagrams import classify
from kloudrecon.diagrams.model import Graph, Group, Member, Node

AGGREGATE = 5
INTERNET = "external:internet"
ONPREM = "external:onprem"
VIEWS = (
    "network",
    "hub_spoke",
    "resource_group",
    "application",
    "data_flow",
    "region",
    "hierarchy",
    "draw",
)
VIEW_TITLES = {
    "network": "Network topology",
    "hub_spoke": "Hub and spoke",
    "resource_group": "Resource groups",
    "application": "Applications",
    "data_flow": "Data flow",
    "region": "Regions",
    "hierarchy": "Management groups & subscriptions",
    "draw": "KloudRecon Draw",
}
REGION_NAMES = {
    "eastus": "East US",
    "eastus2": "East US 2",
    "westus": "West US",
    "westus2": "West US 2",
    "westus3": "West US 3",
    "centralus": "Central US",
    "northeurope": "North Europe",
    "westeurope": "West Europe",
    "uksouth": "UK South",
    "germanywestcentral": "Germany West Central",
    "francecentral": "France Central",
    "swedencentral": "Sweden Central",
    "southeastasia": "Southeast Asia",
    "australiaeast": "Australia East",
    "japaneast": "Japan East",
    "canadacentral": "Canada Central",
    "global": "Global",
}
_SUBNET = re.compile(r"^(.*/virtualnetworks/[^/]+)/subnets/([^/]+)$", re.I)
INFRA_TYPES = {
    "microsoft.network/azurefirewalls",
    "microsoft.network/virtualnetworkgateways",
    "microsoft.network/bastionhosts",
    "microsoft.network/applicationgateways",
}
INGRESS_TYPES = {
    "microsoft.cdn/profiles",
    "microsoft.network/applicationgateways",
    "microsoft.network/frontdoors",
    "microsoft.apimanagement/service",
}
APP_TYPES = {
    "microsoft.web/sites",
    "microsoft.app/containerapps",
    "microsoft.containerservice/managedclusters",
    "microsoft.compute/virtualmachines",
    "microsoft.compute/virtualmachinescalesets",
}
DATA_TYPES = {
    "microsoft.sql/servers",
    "microsoft.dbforpostgresql/flexibleservers",
    "microsoft.dbformysql/flexibleservers",
    "microsoft.documentdb/databaseaccounts",
    "microsoft.cache/redis",
    "microsoft.storage/storageaccounts",
    "microsoft.keyvault/vaults",
    "microsoft.eventhub/namespaces",
    "microsoft.servicebus/namespaces",
}
# resource edge type → (diagram edge kind, reverse direction?)
EDGE_MAP: dict[str, tuple[str, bool]] = {
    "hosted_on": ("dependency", False),
    "private_link": ("private-endpoint", False),
    "uses_identity": ("identity-uses", False),
    "kubelet_identity": ("identity-uses", False),
    "lb_backend": ("lb-backend", True),
    "appgw_backend": ("lb-backend", True),
    "logs_to": ("dependency", False),
    "gateway": ("connection", False),
    "waf_policy": ("dependency", False),
    "firewall_policy": ("dependency", False),
}


def region_name(loc: str | None) -> str:
    return REGION_NAMES.get((loc or "global").lower(), (loc or "global").title())


@dataclass
class Inputs:
    resources: dict[str, dict[str, Any]]
    edges: list[dict[str, Any]]
    resource_groups: dict[str, dict[str, Any]] = field(default_factory=dict)
    subscriptions: dict[str, dict[str, Any]] = field(default_factory=dict)
    management_groups: list[dict[str, Any]] = field(default_factory=list)
    subscription_mg: dict[str, str] = field(default_factory=dict)
    rbac: list[dict[str, Any]] = field(default_factory=list)
    tenant_id: str = ""


class Topology:
    """Indexes over one scan used by every view."""

    def __init__(self, inp: Inputs) -> None:
        self.inp = inp
        self.res = {k.lower(): v for k, v in inp.resources.items()}
        self.out: dict[str, list[dict[str, Any]]] = defaultdict(list)
        self.inc: dict[str, list[dict[str, Any]]] = defaultdict(list)
        for e in inp.edges:
            self.out[e["source"]].append(e)
            self.inc[e["target"]].append(e)
        self.owner: dict[str, str] = {}
        self._fold()
        self._subnets = self._place_subnets()

    # -- helpers ------------------------------------------------------------------------------
    def type_of(self, arm: str) -> str:
        return str((self.res.get(arm) or {}).get("type") or "")

    def name_of(self, arm: str) -> str:
        r = self.res.get(arm)
        return str(r["name"]) if r else arm.rsplit("/", 1)[-1]

    def sub_of(self, arm: str) -> str:
        r = self.res.get(arm)
        if r and r.get("subscriptionId"):
            return str(r["subscriptionId"]).lower()
        parts = arm.split("/")
        return parts[2].lower() if len(parts) > 2 and parts[1] == "subscriptions" else ""

    def sub_name(self, sub: str) -> str:
        return str((self.inp.subscriptions.get(sub) or {}).get("name") or sub[:8])

    def visible(self, arm: str) -> bool:
        r = self.res.get(arm)
        if r is None:
            return False
        t = str(r["type"])
        if t in classify.FOLDED:
            return False
        return not (t in classify.ATTACHED_ONLY and arm in self.owner)

    def resolve(self, arm: str) -> str:
        """The drawn resource that stands for `arm` (NIC → VM, disk → VM, DB → server...)."""
        seen = set()
        while arm in self.owner and arm not in seen:
            seen.add(arm)
            arm = self.owner[arm]
        return arm

    def _fold(self) -> None:
        for e in self.inp.edges:
            s, t, kind = e["source"], e["target"], e["type"]
            if kind == "nic" and self.type_of(t) == "microsoft.network/networkinterfaces":
                self.owner[t] = s  # NIC belongs to its VM / private endpoint
            elif kind == "disk" or kind == "public_ip":
                self.owner[t] = s
            elif kind == "child_of" and self.type_of(s) in classify.FOLDED:
                self.owner[s] = t
            elif kind == "managed_by" and self.type_of(s) == "microsoft.compute/disks":
                self.owner.setdefault(s, t)

    def _place_subnets(self) -> dict[str, tuple[str, str]]:
        placed: dict[str, tuple[str, str]] = {}
        for e in self.inp.edges:
            if e["type"] != "in_subnet" or not (e.get("attrs") or {}).get("subnet"):
                continue
            src = self.resolve(e["source"])
            placed.setdefault(src, (e["target"], str(e["attrs"]["subnet"])))
        return placed

    def subnet_of(self, arm: str) -> tuple[str, str] | None:
        return self._subnets.get(arm)

    def vnet_of(self, arm: str) -> str | None:
        s = self.subnet_of(arm)
        if s:
            return s[0]
        for e in self.out.get(arm, []):
            if e["type"] == "vnet_integration":
                return str(e["target"])
        return None

    def public_ips(self, arm: str) -> list[str]:
        """Public IP addresses owned by `arm` (directly or through its NICs)."""
        ips = []
        for pip, owner in self.owner.items():
            if self.type_of(pip) != "microsoft.network/publicipaddresses":
                continue
            if self.resolve(owner) == arm or owner == arm:
                addr = ((self.res.get(pip) or {}).get("properties") or {}).get("ipAddress")
                ips.append(str(addr or self.name_of(pip)))
        return ips

    def peers(self) -> dict[str, set[str]]:
        out: dict[str, set[str]] = defaultdict(set)
        for e in self.inp.edges:
            if e["type"] == "peering" and e["target"] in self.res:
                out[e["source"]].add(e["target"])
                out[e["target"]].add(e["source"])
        return out

    def hubs(self) -> set[str]:
        """VNets holding a firewall or gateway, or peered with 2+ VNets one of which is a leaf."""
        peers = self.peers()
        vnets = [a for a, r in self.res.items() if r["type"] == "microsoft.network/virtualnetworks"]
        found = {
            v
            for a, r in self.res.items()
            if r["type"]
            in ("microsoft.network/azurefirewalls", "microsoft.network/virtualnetworkgateways")
            and (v := self.vnet_of(a)) is not None
        }
        found |= {
            v
            for v in vnets
            if len(peers.get(v, ())) >= 2 and any(len(peers.get(p, ())) == 1 for p in peers[v])
        }
        return found

    def oriented(self, a: str, b: str, hubs: set[str]) -> tuple[str, str]:
        """Hub first, so layouts flow from hubs to spokes."""
        if b in hubs and a not in hubs:
            return b, a
        if (a in hubs) == (b in hubs) and b < a:
            return b, a
        return a, b

    def mc_group(self, arm: str) -> bool:
        return str((self.res.get(arm) or {}).get("resourceGroup") or "").startswith("mc_")

    def principals(self, arm: str) -> set[str]:
        r = self.res.get(arm) or {}
        ids: set[str] = set()
        identity = r.get("identity") or {}
        if identity.get("principalId"):
            ids.add(str(identity["principalId"]).lower())
        for uami in identity.get("userAssignedIdentities") or {}:
            u = self.res.get(str(uami).lower()) or {}
            pid = (u.get("properties") or {}).get("principalId")
            if pid:
                ids.add(str(pid).lower())
        return ids


# ---- placement with aggregation ------------------------------------------------------------------
class Placer:
    def __init__(self, graph: Graph, topo: Topology) -> None:
        self.g = graph
        self.t = topo
        self.node_of: dict[str, str] = {}
        self.pending: dict[str, list[str]] = defaultdict(list)

    def add(self, container: str | None, arm: str) -> None:
        self.pending[container or ""].append(arm)

    def flush(self, *, aggregate: bool = True, key: Any = None, threshold: int = AGGREGATE) -> None:
        for container, arms in self.pending.items():
            by_type: dict[str, list[str]] = defaultdict(list)
            for arm in sorted(set(arms)):
                bucket = key(arm) if key else self.t.type_of(arm)
                by_type[bucket].append(arm)
            for bucket, members in sorted(by_type.items()):
                rtype = self.t.type_of(members[0])
                if aggregate and len(members) > threshold:
                    nid = f"agg:{container}:{bucket}"
                    self.g.nodes.append(
                        Node(
                            id=nid,
                            type=rtype,
                            label=classify.type_label(rtype, plural=True),
                            parent=container or None,
                            sublabel=f"{len(members)} resources",
                            kind="aggregate",
                            members=[
                                Member(m, self.t.name_of(m), classify.sublabel(self.t.res[m]))
                                for m in members
                            ],
                            attrs={"count": len(members), "category": classify.category(rtype)},
                        )
                    )
                    for m in members:
                        self.node_of[m] = nid
                else:
                    for m in members:
                        self.g.nodes.append(self.resource_node(m, container or None))
                        self.node_of[m] = m
        self.pending.clear()

    def resource_node(self, arm: str, parent: str | None) -> Node:
        r = self.t.res[arm]
        badges = []
        ips = self.t.public_ips(arm)
        if ips:
            badges.append(f"Public IP {ips[0]}")
        rtype = str(r["type"])
        attrs: dict[str, Any] = {
            "category": classify.category(rtype),
            "location": r.get("location"),
        }
        if rtype == "microsoft.sql/servers":
            dbs = [
                self.t.name_of(e["source"])
                for e in self.t.inc.get(arm, [])
                if e["type"] == "child_of"
                and self.t.type_of(e["source"]) == "microsoft.sql/servers/databases"
                and self.t.name_of(e["source"]) != "master"
            ]
            attrs["databases"] = dbs
        sub = classify.sublabel(r)
        if rtype == "microsoft.sql/servers" and attrs.get("databases"):
            sub = f"{len(attrs['databases'])} databases"
        return Node(
            id=arm,
            type=rtype,
            label=str(r["name"]),
            parent=parent,
            sublabel=sub,
            arm_id=arm,
            badges=badges,
            attrs=attrs,
        )

    def edge(self, source_arm: str, target_arm: str, kind: str, label: str = "") -> None:
        s = self.node_of.get(self.t.resolve(source_arm))
        t = self.node_of.get(self.t.resolve(target_arm))
        if s and t and s != t:
            self.g.add_edge(s, t, kind, label)

    def resource_edges(self) -> None:
        for e in self.t.inp.edges:
            mapped = EDGE_MAP.get(e["type"])
            if mapped is None:
                continue
            kind, reverse = mapped
            src, tgt = (e["target"], e["source"]) if reverse else (e["source"], e["target"])
            self.edge(src, tgt, kind)


def _external(graph: Graph, nid: str, label: str, sublabel: str = "") -> None:
    if nid not in graph.node_ids():
        graph.nodes.append(
            Node(
                id=nid,
                type=nid.replace("external:", "external/"),
                label=label,
                sublabel=sublabel,
                kind="external",
            )
        )


def _cidrs(vnet: dict[str, Any]) -> str:
    return ", ".join(
        (vnet.get("properties") or {}).get("addressSpace", {}).get("addressPrefixes") or []
    )


def _sub_group(
    g: Graph, topo: Topology, sub: str, existing: set[str], parent: str | None = None
) -> str:
    gid = f"sub:{sub}"
    if gid not in existing:
        info = topo.inp.subscriptions.get(sub) or {}
        g.groups.append(
            Group(
                id=gid,
                kind="subscription",
                label=topo.sub_name(sub),
                parent=parent,
                sublabel="Production" if info.get("is_production") else "Subscription",
                badges=["production"] if info.get("is_production") else [],
                arm_id=f"/subscriptions/{sub}",
            )
        )
        existing.add(gid)
    return gid


# ---- 1. network ----------------------------------------------------------------------------------
def network(topo: Topology) -> Graph:
    g = Graph(
        view="network",
        title=VIEW_TITLES["network"],
        description="Virtual networks and subnets per subscription, with what runs inside them, "
        "private endpoints to platform services, peering, internet exposure and on-premises links.",
    )
    groups: set[str] = set()
    place = Placer(g, topo)
    vnets = [a for a, r in topo.res.items() if r["type"] == "microsoft.network/virtualnetworks"]
    firewalls = {
        str(((ipc.get("properties") or {}).get("privateIPAddress")) or ""): a
        for a, r in topo.res.items()
        if r["type"] == "microsoft.network/azurefirewalls"
        for ipc in (r.get("properties") or {}).get("ipConfigurations") or []
    }
    subnet_rt: dict[str, str] = {}
    for vnet in sorted(vnets):
        r = topo.res[vnet]
        sub = topo.sub_of(vnet)
        sg = _sub_group(g, topo, sub, groups)
        vid = f"vnet:{vnet}"
        props = r.get("properties") or {}
        g.groups.append(
            Group(
                id=vid,
                kind="vnet",
                label=str(r["name"]),
                parent=sg,
                sublabel=f"{region_name(r.get('location'))} · {_cidrs(r)}",
                badges=["DDoS protection"] if props.get("enableDdosProtection") else [],
                arm_id=vnet,
                attrs={"location": r.get("location"), "cidrs": _cidrs(r)},
            )
        )
        for subnet in props.get("subnets") or []:
            sp = subnet.get("properties") or {}
            badges = []
            nsg = str((sp.get("networkSecurityGroup") or {}).get("id") or "").lower()
            rt = str((sp.get("routeTable") or {}).get("id") or "").lower()
            if nsg:
                badges.append(f"NSG {topo.name_of(nsg)}")
            if rt:
                badges.append(f"UDR {topo.name_of(rt)}")
                subnet_rt[f"subnet:{vnet}/{str(subnet['name']).lower()}"] = rt
            g.groups.append(
                Group(
                    id=f"subnet:{vnet}/{str(subnet['name']).lower()}",
                    kind="subnet",
                    label=str(subnet["name"]),
                    parent=vid,
                    sublabel=str(sp.get("addressPrefix") or ""),
                    badges=badges,
                    attrs={"nsg": nsg or None, "route_table": rt or None},
                )
            )
    subnet_ids = {gr.id for gr in g.groups if gr.kind == "subnet"}
    hubs = topo.hubs()
    paas: set[str] = set()
    for arm in sorted(topo.res):
        if not topo.visible(arm) or topo.mc_group(arm):
            continue
        s = topo.subnet_of(arm)
        if s is None:
            continue
        gid = f"subnet:{s[0]}/{s[1].lower()}"
        if gid in subnet_ids:
            place.add(gid, arm)
    # platform services reached through private endpoints or VNet integration
    for e in topo.inp.edges:
        if e["type"] == "private_link" and topo.visible(topo.resolve(e["target"])):
            paas.add(topo.resolve(e["target"]))
        if e["type"] == "vnet_integration" and topo.visible(e["source"]):
            paas.add(e["source"])
    for arm, r in topo.res.items():
        if r["type"] == "microsoft.cdn/profiles":
            paas.add(arm)
    for arm in sorted(paas):
        if topo.subnet_of(arm) is None:
            place.add(_sub_group(g, topo, topo.sub_of(arm), groups), arm)
    place.flush()
    # private DNS zones: one aggregate per subscription, linked to the VNets
    zones: dict[str, list[str]] = defaultdict(list)
    for arm, r in topo.res.items():
        if r["type"] == "microsoft.network/privatednszones":
            zones[topo.sub_of(arm)].append(arm)
    for sub, members in zones.items():
        nid = f"dns:{sub}"
        g.nodes.append(
            Node(
                id=nid,
                type="microsoft.network/privatednszones",
                label="Private DNS zones",
                parent=_sub_group(g, topo, sub, groups),
                sublabel=f"{len(members)} zones",
                kind="aggregate",
                members=[Member(m, topo.name_of(m)) for m in sorted(members)],
                attrs={"count": len(members), "category": "network"},
            )
        )
        linked = {
            str(e["target"])
            for e in topo.inp.edges
            if e["type"] == "dns_link" and topo.resolve(e["source"]) in members
        }
        # links to every VNet would criss-cross the picture: state them on the node instead
        g.nodes[-1].sublabel = f"{len(members)} zones · linked to {len(linked)} VNets"
        g.nodes[-1].attrs["linked_vnets"] = sorted(topo.name_of(v) for v in linked)
    # peering, private endpoints, VNet integration, load balancing
    for e in topo.inp.edges:
        if e["type"] == "peering":
            label = (
                "peering (gateway transit)"
                if (e.get("attrs") or {}).get("gateway_transit")
                else "peering"
            )
            if f"vnet:{e['target']}" in {gr.id for gr in g.groups}:
                a, b = topo.oriented(e["source"], e["target"], hubs)
                g.add_edge(f"vnet:{a}", f"vnet:{b}", "peering", label)
        elif e["type"] == "private_link":
            place.edge(
                e["source"],
                e["target"],
                "private-endpoint",
                str((e.get("attrs") or {}).get("group") or ""),
            )
        elif e["type"] == "vnet_integration":
            sid = f"subnet:{e['target']}/{str((e.get('attrs') or {}).get('subnet') or '').lower()}"
            src = place.node_of.get(e["source"])
            if src and sid in subnet_ids:
                g.add_edge(src, sid, "vnet-integration", "VNet integration")
        elif e["type"] in ("lb_backend", "appgw_backend"):
            place.edge(e["target"], e["source"], "lb-backend")
    # user-defined routes: the next hop becomes part of the subnet's UDR badge
    by_id = {gr.id: gr for gr in g.groups}
    for sid, rt in subnet_rt.items():
        for route in ((topo.res.get(rt) or {}).get("properties") or {}).get("routes") or []:
            rp = route.get("properties") or {}
            fw = firewalls.get(str(rp.get("nextHopIpAddress") or ""))
            if fw and sid in by_id:
                group = by_id[sid]
                group.badges = [
                    f"UDR → {topo.name_of(fw)}" if b.startswith("UDR") else b for b in group.badges
                ]
                group.attrs["next_hop"] = topo.name_of(fw)
    _internet_and_onprem(g, topo, place)
    g.stats = {"vnets": len(vnets), "subnets": len(subnet_ids)}
    return g


def _internet_and_onprem(g: Graph, topo: Topology, place: Placer) -> None:
    exposed = [
        n
        for n in g.nodes
        if n.kind == "resource"
        and n.arm_id
        and (topo.public_ips(n.arm_id) or classify.is_public_facing(n.type))
    ]
    for n in exposed:
        if n.type in ("microsoft.network/virtualnetworkgateways",):
            continue
        _external(g, INTERNET, "Internet")
        ips = topo.public_ips(n.arm_id or "")
        g.add_edge(INTERNET, n.id, "exposure", ips[0] if ips else "public")
    lngs = [a for a, r in topo.res.items() if r["type"] == "microsoft.network/localnetworkgateways"]
    if lngs:
        prefixes = sorted(
            {
                p
                for a in lngs
                for p in (
                    (
                        (topo.res[a].get("properties") or {}).get("localNetworkAddressSpace") or {}
                    ).get("addressPrefixes")
                    or []
                )
            }
        )
        _external(g, ONPREM, "On-premises", ", ".join(prefixes[:3]))
        for r in topo.res.values():
            if r["type"] != "microsoft.network/connections":
                continue
            props = r.get("properties") or {}
            gw = str((props.get("virtualNetworkGateway1") or {}).get("id") or "").lower()
            node = place.node_of.get(gw)
            if node:
                g.add_edge(
                    node,
                    ONPREM,
                    "connection",
                    f"{props.get('connectionType') or 'VPN'} · {r['name']}",
                )


# ---- 2. hub and spoke ----------------------------------------------------------------------------
def hub_spoke(topo: Topology) -> Graph:
    g = Graph(
        view="hub_spoke",
        title=VIEW_TITLES["hub_spoke"],
        description="Hubs are detected from firewalls, gateways and peering degree. Hubs show "
        "shared infrastructure; spokes summarise their workloads.",
    )
    vnets = sorted(
        a for a, r in topo.res.items() if r["type"] == "microsoft.network/virtualnetworks"
    )
    peers: dict[str, set[str]] = defaultdict(set)
    transit: set[tuple[str, str]] = set()
    for e in topo.inp.edges:
        if e["type"] == "peering" and e["target"] in topo.res:
            peers[e["source"]].add(e["target"])
            peers[e["target"]].add(e["source"])
            if (e.get("attrs") or {}).get("gateway_transit"):
                transit.add((e["source"], e["target"]))
    infra_in: dict[str, list[str]] = defaultdict(list)
    workload_in: dict[str, list[str]] = defaultdict(list)
    for arm in sorted(topo.res):
        if not topo.visible(arm) or (
            topo.mc_group(arm) and topo.type_of(arm) != "microsoft.containerservice/managedclusters"
        ):
            continue
        vnet = topo.vnet_of(arm)
        if vnet is None:
            continue
        (infra_in if topo.type_of(arm) in INFRA_TYPES else workload_in)[vnet].append(arm)
    hubs = topo.hubs()
    regions: set[str] = set()
    for vnet in vnets:
        r = topo.res[vnet]
        loc = str(r.get("location") or "global")
        rid = f"region:{loc}"
        if rid not in regions:
            g.groups.append(
                Group(id=rid, kind="region", label=region_name(loc), sublabel="Azure region")
            )
            regions.add(rid)
        role = "hub" if vnet in hubs else "spoke" if peers.get(vnet) else "standalone"
        g.groups.append(
            Group(
                id=f"vnet:{vnet}",
                kind="vnet",
                label=str(r["name"]),
                parent=rid,
                sublabel=f"{topo.sub_name(topo.sub_of(vnet))} · {_cidrs(r)}",
                badges=[role.capitalize()],
                arm_id=vnet,
                attrs={"role": role, "location": loc},
            )
        )
    place = Placer(g, topo)
    for vnet in vnets:
        for arm in infra_in.get(vnet, []):
            place.add(f"vnet:{vnet}", arm)
    place.flush(aggregate=False)
    for vnet in vnets:
        for arm in workload_in.get(vnet, []):
            place.add(f"vnet:{vnet}", arm)
    place.flush(aggregate=True)
    # force summaries in spokes: collapse any remaining single workloads of big spokes
    for vnet in vnets:
        for other in sorted(peers.get(vnet, ())):
            if topo.oriented(vnet, other, hubs) == (vnet, other):
                label = "peering"
                if (vnet, other) in transit or (other, vnet) in transit:
                    label = "peering · gateway transit"
                a_region = topo.res[vnet].get("location")
                b_region = topo.res[other].get("location")
                if a_region != b_region:
                    label = "global " + label
                g.add_edge(f"vnet:{vnet}", f"vnet:{other}", "peering", label)
    _internet_and_onprem(g, topo, place)
    g.stats = {
        "hubs": sorted(topo.name_of(h) for h in hubs),
        "spokes": len([v for v in vnets if v not in hubs and peers.get(v)]),
    }
    return g


# ---- 3. resource groups --------------------------------------------------------------------------
def _dependency_edges(place: Placer, topo: Topology) -> None:
    # subnet membership is the network view's job; here it would tie everything to the VNets
    place.resource_edges()
    for e in topo.inp.edges:
        if e["type"] == "vnet_integration":
            place.edge(e["source"], e["target"], "vnet-integration", "VNet integration")
        elif e["type"] == "peering":
            place.edge(e["source"], e["target"], "peering", "peering")


def resource_group(topo: Topology) -> Graph:
    g = Graph(
        view="resource_group",
        title=VIEW_TITLES["resource_group"],
        description="Every subscription and resource group with its resources and their "
        "dependencies. Attached disks, NICs and extensions are folded into their virtual machine.",
    )
    groups: set[str] = set()
    place = Placer(g, topo)
    rgs: dict[str, str] = {}
    for arm in sorted(topo.res):
        if not topo.visible(arm):
            continue
        r = topo.res[arm]
        sub = topo.sub_of(arm)
        rg = str(r.get("resourceGroup") or "").lower()
        gid = f"rg:{sub}/{rg}"
        if gid not in rgs:
            sg = _sub_group(g, topo, sub, groups)
            info = topo.inp.resource_groups.get(f"/subscriptions/{sub}/resourcegroups/{rg}") or {}
            g.groups.append(
                Group(
                    id=gid,
                    kind="rg",
                    label=str(info.get("name") or rg),
                    parent=sg,
                    sublabel=region_name(info.get("location") or r.get("location")),
                    badges=["AKS managed"] if rg.startswith("mc_") else [],
                    arm_id=f"/subscriptions/{sub}/resourcegroups/{rg}",
                )
            )
            rgs[gid] = gid
        place.add(gid, arm)
    place.flush()
    _dependency_edges(place, topo)
    g.stats = {"resource_groups": len(rgs)}
    return g


# ---- 4. application ------------------------------------------------------------------------------
def application(topo: Topology, tag: str = "app") -> Graph:
    g = Graph(
        view="application",
        title=VIEW_TITLES["application"],
        description=f"Resources grouped by the '{tag}' tag, with dependencies between them.",
    )
    place = Placer(g, topo)
    apps: Counter[str] = Counter()
    untagged = 0
    key = tag.lower()
    for arm in sorted(topo.res):
        if not topo.visible(arm):
            continue
        tags = {k.lower(): v for k, v in (topo.res[arm].get("tags") or {}).items()}
        value = str(tags.get(key) or "")
        if not value:
            untagged += 1
            continue
        gid = f"app:{value}"
        if value not in apps:
            g.groups.append(Group(id=gid, kind="app", label=value, sublabel=f"{tag} = {value}"))
        apps[value] += 1
        place.add(gid, arm)
    place.flush()
    _dependency_edges(place, topo)
    for gr in g.groups:
        gr.badges = [f"{apps[gr.label]} resources"]
    g.stats = {"tag": tag, "applications": len(apps), "untagged": untagged}
    return g


# ---- 5. data flow --------------------------------------------------------------------------------
def data_flow(topo: Topology) -> Graph:
    g = Graph(
        view="data_flow",
        title=VIEW_TITLES["data_flow"],
        description="How traffic reaches applications and which data stores they use: ingress, "
        "applications and data, linked by backends, RBAC grants, private endpoints and app tags.",
    )
    tiers = [
        ("tier:ingress", "Ingress"),
        ("tier:apps", "Applications"),
        ("tier:data", "Data & secrets"),
    ]
    for gid, label in tiers:
        g.groups.append(Group(id=gid, kind="tier", label=label))
    place = Placer(g, topo)

    def app_tag(arm: str) -> str:
        return str(
            {k.lower(): v for k, v in (topo.res[arm].get("tags") or {}).items()}.get("app") or ""
        )

    def env_tag(arm: str) -> str:
        tags = {k.lower(): v for k, v in (topo.res[arm].get("tags") or {}).items()}
        return str(tags.get("env") or tags.get("environment") or "").lower()

    members: dict[str, list[str]] = defaultdict(list)
    for arm in sorted(topo.res):
        if not topo.visible(arm):
            continue
        t = topo.type_of(arm)
        if t in INGRESS_TYPES:
            members["tier:ingress"].append(arm)
        elif t in APP_TYPES and not (
            t == "microsoft.compute/virtualmachinescalesets" and topo.mc_group(arm)
        ):
            members["tier:apps"].append(arm)
        elif t in DATA_TYPES:
            members["tier:data"].append(arm)
    for gid, arms in members.items():
        for arm in arms:
            place.add(gid, arm)
    # summarised per application and type, so each application reads as one flow
    place.flush(key=lambda arm: f"{topo.type_of(arm)}|{app_tag(arm)}", threshold=2)
    for n in g.nodes:
        if n.kind == "aggregate":
            app = app_tag(n.members[0].id) or "untagged"
            n.label = f"{app} · {classify.type_label(n.type, plural=True)}"
    ingress = set(members["tier:ingress"])
    apps = set(members["tier:apps"])
    data = set(members["tier:data"])
    # Internet → ingress (and directly exposed apps)
    for arm in sorted(ingress | apps):
        if arm in ingress or topo.public_ips(arm):
            _external(g, INTERNET, "Internet")
            node = place.node_of.get(arm)
            if node:
                g.add_edge(INTERNET, node, "exposure", "HTTPS" if arm in ingress else "public IP")
    # ingress → apps: backends and shared app tag
    for e in topo.inp.edges:
        if e["type"] in ("appgw_backend", "lb_backend"):
            place.edge(e["target"], e["source"], "lb-backend", "backend")
    for i in ingress:
        for a in apps:
            if (
                app_tag(i)
                and app_tag(i) == app_tag(a)
                and topo.type_of(a) != "microsoft.compute/virtualmachines"
            ):
                place.edge(i, a, "dependency", "routes to")
    # apps → data: RBAC grants (resource or RG scope), private endpoints in the same VNet, app tag
    principal_of: dict[str, str] = {}
    for a in apps:
        for pid in topo.principals(a):
            principal_of[pid] = a
    for ra in topo.inp.rbac:
        grantee = principal_of.get(str(ra.get("principal_id") or "").lower())
        scope = str(ra.get("scope") or "").lower().rstrip("/")
        if not grantee or scope.count("/") < 4:  # subscription-wide grants would link everything
            continue
        for d in data:
            if d == scope or d.startswith(scope + "/"):
                place.edge(grantee, d, "rbac-grants", str(ra.get("role_name") or "role"))
    pe_targets: dict[str, set[str]] = defaultdict(set)
    for e in topo.inp.edges:
        if e["type"] == "private_link":
            vnet = topo.vnet_of(e["source"])
            if vnet:
                pe_targets[vnet].add(topo.resolve(e["target"]))
    for a in apps:
        vnet = topo.vnet_of(a)
        for d in pe_targets.get(vnet or "", set()) & data:
            if app_tag(a) and app_tag(a) == app_tag(d):
                place.edge(a, d, "private-endpoint", "private endpoint")
    # shared app tag: only managed app platforms, only within one environment
    platforms = {
        "microsoft.web/sites",
        "microsoft.app/containerapps",
        "microsoft.containerservice/managedclusters",
    }
    for a in apps:
        if topo.type_of(a) not in platforms or not app_tag(a):
            continue
        for d in data:
            same = app_tag(a) == app_tag(d) and env_tag(a) == env_tag(d)
            if same and place.node_of.get(a) != place.node_of.get(d):
                place.edge(a, d, "dependency", "")
    g.stats = {"ingress": len(ingress), "apps": len(apps), "data": len(data)}
    return g


# ---- 6. region -----------------------------------------------------------------------------------
def region(topo: Topology) -> Graph:
    g = Graph(
        view="region",
        title=VIEW_TITLES["region"],
        description="What runs in each region, by category and type, with cross-region peering.",
        direction="DOWN",
    )
    counts: dict[tuple[str, str], list[str]] = defaultdict(list)
    for arm in sorted(topo.res):
        if not topo.visible(arm):
            continue
        loc = str(topo.res[arm].get("location") or "global").lower()
        counts[(loc, topo.type_of(arm))].append(arm)
    regions = sorted(
        {loc for loc, _ in counts},
        key=lambda loc: (
            loc == "global",
            -sum(len(v) for (lc, _), v in counts.items() if lc == loc),
        ),
    )
    for loc in regions:
        g.groups.append(
            Group(id=f"region:{loc}", kind="region", label=region_name(loc), sublabel=loc)
        )
        cats: dict[str, list[str]] = defaultdict(list)
        for (lc, t), _ in counts.items():
            if lc == loc:
                cats[classify.category(t)].append(t)
        for cat in classify.CATEGORY_ORDER:
            if cat not in cats:
                continue
            cid = f"cat:{loc}:{cat}"
            g.groups.append(
                Group(
                    id=cid,
                    kind="category",
                    label=classify.CATEGORY_LABEL[cat],
                    parent=f"region:{loc}",
                )
            )
            for t in sorted(cats[cat]):
                arms = counts[(loc, t)]
                g.nodes.append(
                    Node(
                        id=f"rt:{loc}:{t}",
                        type=t,
                        label=classify.type_label(t, plural=len(arms) > 1),
                        parent=cid,
                        sublabel=f"{len(arms)}",
                        kind="aggregate" if len(arms) > 1 else "resource",
                        arm_id=arms[0] if len(arms) == 1 else None,
                        members=[
                            Member(a, topo.name_of(a), classify.sublabel(topo.res[a])) for a in arms
                        ]
                        if len(arms) > 1
                        else [],
                        attrs={"count": len(arms), "category": cat},
                    )
                )
    for e in topo.inp.edges:
        if e["type"] != "peering" or e["target"] not in topo.res:
            continue
        a = str(topo.res[e["source"]].get("location") or "global").lower()
        b = str(topo.res[e["target"]].get("location") or "global").lower()
        if a != b:
            g.add_edge(
                f"rt:{a}:microsoft.network/virtualnetworks",
                f"rt:{b}:microsoft.network/virtualnetworks",
                "peering",
                "global peering",
            )
    g.stats = {"regions": len(regions)}
    return g


# ---- 7. hierarchy --------------------------------------------------------------------------------
def hierarchy(topo: Topology) -> Graph:
    g = Graph(
        view="hierarchy",
        title=VIEW_TITLES["hierarchy"],
        description="Management groups and subscriptions, with resources per subscription.",
        direction="DOWN",
    )
    mgs = {str(m["id"]): m for m in topo.inp.management_groups}
    root_id = next((i for i, m in mgs.items() if not m.get("parent_id")), None)
    if root_id is None:
        root_id = topo.inp.tenant_id or "tenant"
        mgs[root_id] = {"id": root_id, "name": "Tenant root", "parent_id": None}
    for mid, m in mgs.items():
        g.nodes.append(
            Node(
                id=f"mg:{mid}",
                type="microsoft.management/managementgroups",
                label=str(m.get("name") or mid),
                sublabel="Tenant root group" if mid == root_id else "Management group",
                kind="resource",
            )
        )
    for mid, m in mgs.items():
        parent = m.get("parent_id")
        if parent and str(parent) in mgs:
            g.add_edge(f"mg:{parent}", f"mg:{mid}", "contains")
    per_sub = Counter(topo.sub_of(a) for a in topo.res)
    for sub, info in sorted(topo.inp.subscriptions.items()):
        nid = f"sub:{sub}"
        g.nodes.append(
            Node(
                id=nid,
                type="microsoft.resources/subscriptions",
                label=str(info.get("name") or sub),
                sublabel=f"{per_sub.get(sub, 0)} resources",
                arm_id=f"/subscriptions/{sub}",
                badges=["Production"] if info.get("is_production") else [],
                attrs={"resources": per_sub.get(sub, 0), "subscription_id": sub},
            )
        )
        mg = topo.inp.subscription_mg.get(sub) or root_id
        g.add_edge(f"mg:{mg}", nid, "contains")
    g.stats = {"management_groups": len(mgs), "subscriptions": len(topo.inp.subscriptions)}
    return g


def build(inp: Inputs, view: str, *, tag: str = "app") -> Graph:
    topo = Topology(inp)
    return build_with(topo, view, tag=tag)


def build_with(topo: Topology, view: str, *, tag: str = "app") -> Graph:
    if view == "network":
        return network(topo)
    if view == "hub_spoke":
        return hub_spoke(topo)
    if view == "resource_group":
        return resource_group(topo)
    if view == "application":
        return application(topo, tag)
    if view == "data_flow":
        return data_flow(topo)
    if view == "region":
        return region(topo)
    if view == "hierarchy":
        return hierarchy(topo)
    if view == "draw":
        from kloudrecon.diagrams.draw import draw  # draw builds on this module

        return draw(topo)
    raise ValueError(f"unknown view {view}")


def subnet_parts(ref: str) -> tuple[str, str] | None:
    m = _SUBNET.match(ref)
    return (m.group(1).lower(), m.group(2)) if m else None
