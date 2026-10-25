"""KloudRecon Draw (view 8): the detailed drawing. Nothing is folded away.

    subscription
      ├─ virtual network → subnet → what lives in it
      │     └─ machine (one box per VM): public IP → network interface → VM → disks
      └─ resource group → everything that is not in a subnet
            (NSGs, route tables, storage, vaults, workspaces, identities, unattached parts...)

Every relationship the scan knows becomes a labelled link: public IP and private IP addresses,
OS and data disks, NSG and route table attachments, peering, private endpoints, VNet integration,
load balancer backends, hosting, logging, identities, RBAC grants of managed identities, gateway
connections, private DNS links and internet exposure.

Only noise stays hidden (VM extensions, Network Watcher, flow logs, DNS link objects and the NICs
of private endpoints). To keep large tenants readable, a subnet with more than MACHINE_LIMIT
virtual machines shows them as one expandable node, and more than AGGREGATE resources of one
type in a container become one expandable node.
"""

from __future__ import annotations

from collections import defaultdict
from typing import Any

from kloudrecon.diagrams import builder as b
from kloudrecon.diagrams import classify
from kloudrecon.diagrams.model import Graph, Group, Member, Node

MACHINE_LIMIT = 6
AGGREGATE = 8
TITLE = "KloudRecon Draw"

VM = "microsoft.compute/virtualmachines"
NIC = "microsoft.network/networkinterfaces"
PIP = "microsoft.network/publicipaddresses"
DISK = "microsoft.compute/disks"
NSG = "microsoft.network/networksecuritygroups"
VNET = "microsoft.network/virtualnetworks"
PE = "microsoft.network/privateendpoints"
LNG = "microsoft.network/localnetworkgateways"
UAMI = "microsoft.managedidentity/userassignedidentities"

# never drawn, not even here
NOISE = {
    "microsoft.compute/virtualmachines/extensions",
    "microsoft.network/privatednszones/virtualnetworklinks",
    "microsoft.network/networkwatchers",
    "microsoft.network/networkwatchers/flowlogs",
}
# scan edge type → (link kind, label, reverse direction?)
LINKS: dict[str, tuple[str, str, bool]] = {
    "hosted_on": ("dependency", "hosted on", False),
    "logs_to": ("dependency", "logs", False),
    "waf_policy": ("dependency", "WAF policy", False),
    "firewall_policy": ("dependency", "firewall policy", False),
    "availability_set": ("dependency", "availability set", False),
    "uses_identity": ("identity-uses", "identity", False),
    "kubelet_identity": ("identity-uses", "kubelet identity", False),
    "lb_backend": ("lb-backend", "backend", True),
    "appgw_backend": ("lb-backend", "backend", True),
    "gateway": ("connection", "", False),
}


def _props(r: dict[str, Any]) -> dict[str, Any]:
    return r.get("properties") or {}


def private_ips(nic: dict[str, Any]) -> list[str]:
    return [
        str(ip)
        for ipc in _props(nic).get("ipConfigurations") or []
        if (ip := (ipc.get("properties") or {}).get("privateIPAddress"))
    ]


def _inbound_from_internet(nsg: dict[str, Any]) -> int:
    count = 0
    for rule in _props(nsg).get("securityRules") or []:
        p = rule.get("properties") or {}
        sources = [str(p.get("sourceAddressPrefix") or ""), *(p.get("sourceAddressPrefixes") or [])]
        if (
            str(p.get("direction")).lower() == "inbound"
            and str(p.get("access")).lower() == "allow"
            and any(s.lower() in ("*", "internet", "0.0.0.0/0", "any") for s in sources)
        ):
            count += 1
    return count


def detail(r: dict[str, Any]) -> str:
    """The second line of a node: the facts an engineer looks for first."""
    t = str(r.get("type") or "").lower()
    props = _props(r)
    sku = r.get("sku") or {}
    if t == VM:
        size = str((props.get("hardwareProfile") or {}).get("vmSize") or "").replace(
            "Standard_", ""
        )
        os_type = str(((props.get("storageProfile") or {}).get("osDisk") or {}).get("osType") or "")
        return " · ".join(x for x in (size, os_type) if x)
    if t == NIC:
        ips = private_ips(r)
        return ips[0] + (f" +{len(ips) - 1}" if len(ips) > 1 else "") if ips else "no private IP"
    if t == PIP:
        addr = str(props.get("ipAddress") or props.get("publicIPAllocationMethod") or "")
        return " · ".join(x for x in (addr, str(sku.get("name") or "")) if x)
    if t == DISK:
        gb = props.get("diskSizeGB")
        return " · ".join(x for x in (f"{gb} GB" if gb else "", str(sku.get("name") or "")) if x)
    if t == NSG:
        rules = len(props.get("securityRules") or [])
        return f"{rules} rule{'' if rules == 1 else 's'}"
    if t == "microsoft.network/routetables":
        routes = len(props.get("routes") or [])
        return f"{routes} route{'' if routes == 1 else 's'}"
    if t == "microsoft.network/privatednszones":
        return "private DNS zone"
    return classify.sublabel(r)


class DetailPlacer(b.Placer):
    def resource_node(self, arm: str, parent: str | None) -> Node:
        node = super().resource_node(arm, parent)
        r = self.t.res[arm]
        node.sublabel = detail(r) or node.sublabel or classify.type_label(node.type)
        node.attrs["type_label"] = classify.type_label(node.type)
        node.attrs["resource_group"] = r.get("resourceGroup")
        if node.type == NIC:
            node.attrs["private_ips"] = private_ips(r)
        if node.type == NSG:
            open_rules = _inbound_from_internet(r)
            if open_rules:
                node.badges.append(f"{open_rules} inbound from internet")
        if node.type != PIP:
            # the public IP is drawn as its own node here, so the globe marker would repeat it
            node.badges = [x for x in node.badges if not x.startswith("Public IP")]
        return node


def draw(topo: b.Topology) -> Graph:
    g = Graph(
        view="draw",
        title=TITLE,
        description="The detailed drawing: every resource with its network interfaces, IP "
        "addresses, disks, security groups and routes, and every connection between them.",
    )
    res = topo.res
    groups: set[str] = set()
    place = DetailPlacer(g, topo)

    # ---- what the scan knows, indexed -----------------------------------------------------------
    direct_subnet: dict[str, str] = {}  # arm → subnet group id
    nics_of: dict[str, list[str]] = defaultdict(list)
    disks_of: dict[str, list[tuple[str, str]]] = defaultdict(list)  # vm → (disk, label)
    pips_of: dict[str, list[str]] = defaultdict(list)  # NIC / LB / firewall ... → public IPs
    part_of: dict[str, str] = {}  # NIC, disk, public IP → what it is attached to
    hidden: dict[str, str] = {}  # not drawn → drawn stand-in
    guards: dict[str, set[str]] = defaultdict(set)  # NSG / route table → what it is attached to
    for e in topo.inp.edges:
        s, t, kind = e["source"], e["target"], e["type"]
        attrs = e.get("attrs") or {}
        if kind == "in_subnet" and attrs.get("subnet"):
            direct_subnet.setdefault(s, f"subnet:{t}/{str(attrs['subnet']).lower()}")
        elif kind == "nic" and t in res:
            if topo.type_of(s) == PE:
                hidden[t] = s
            else:
                nics_of[s].append(t)
                part_of[t] = s
        elif kind == "disk" and t in res:
            role = "OS disk" if attrs.get("role") == "os" else f"data disk · LUN {attrs.get('lun')}"
            disks_of[s].append((t, role))
            part_of[t] = s
        elif kind == "public_ip" and t in res:
            pips_of[s].append(t)
            part_of[t] = s
        elif kind == "child_of" and topo.type_of(s) in NOISE:
            hidden[s] = t
        elif kind in ("subnet_nsg", "subnet_route_table") and attrs.get("subnet"):
            guards[t].add(f"subnet:{s}/{str(attrs['subnet']).lower()}")
        elif kind == "nsg":
            guards[t].add(f"nic:{s}")

    def drawn(arm: str) -> bool:
        r = res.get(arm)
        return r is not None and r["type"] not in NOISE and r["type"] != VNET and arm not in hidden

    # ---- containers: subscription → VNet → subnet ----------------------------------------------
    vnets = sorted(a for a, r in res.items() if r["type"] == VNET)
    for vnet in vnets:
        r = res[vnet]
        sg = b._sub_group(g, topo, topo.sub_of(vnet), groups)
        props = _props(r)
        g.groups.append(
            Group(
                id=f"vnet:{vnet}",
                kind="vnet",
                label=str(r["name"]),
                parent=sg,
                sublabel=f"{b.region_name(r.get('location'))} · {b._cidrs(r)}",
                badges=["DDoS protection"] if props.get("enableDdosProtection") else [],
                arm_id=vnet,
                attrs={"location": r.get("location"), "cidrs": b._cidrs(r)},
            )
        )
        for subnet in props.get("subnets") or []:
            sp = subnet.get("properties") or {}
            delegations = [
                str((d.get("properties") or {}).get("serviceName") or "").rsplit("/", 1)[-1]
                for d in sp.get("delegations") or []
            ]
            g.groups.append(
                Group(
                    id=f"subnet:{vnet}/{str(subnet['name']).lower()}",
                    kind="subnet",
                    label=str(subnet["name"]),
                    parent=f"vnet:{vnet}",
                    sublabel=str(sp.get("addressPrefix") or ""),
                    badges=[f"delegated to {d}" for d in delegations if d][:1],
                    attrs={"cidr": sp.get("addressPrefix")},
                )
            )
    subnet_ids = {x.id for x in g.groups if x.kind == "subnet"}
    by_id = {x.id: x for x in g.groups}

    def rg_group(arm: str) -> str:
        r = res[arm]
        sub = topo.sub_of(arm)
        rg = str(r.get("resourceGroup") or "").lower()
        gid = f"rg:{sub}/{rg}"
        if gid not in by_id:
            info = topo.inp.resource_groups.get(f"/subscriptions/{sub}/resourcegroups/{rg}") or {}
            group = Group(
                id=gid,
                kind="rg",
                label=str(info.get("name") or r.get("resourceGroup") or rg),
                parent=b._sub_group(g, topo, sub, groups),
                sublabel=b.region_name(info.get("location") or r.get("location")),
                badges=["AKS managed"] if rg.startswith("mc_") else [],
                arm_id=f"/subscriptions/{sub}/resourcegroups/{rg}",
            )
            g.groups.append(group)
            by_id[gid] = group
        return gid

    def subnet_home(arm: str) -> str | None:
        gid = direct_subnet.get(arm)
        return gid if gid in subnet_ids else None

    # ---- virtual machines: one box each, or one node for a crowded subnet -----------------------
    vms = sorted(a for a, r in res.items() if r["type"] == VM)
    vm_home: dict[str, str] = {}
    for vm in vms:
        home = next((h for n in nics_of.get(vm, []) if (h := subnet_home(n))), None)
        vm_home[vm] = home or rg_group(vm)
    crowd: dict[str, list[str]] = defaultdict(list)
    for vm in vms:
        crowd[vm_home[vm]].append(vm)

    def parts(vm: str) -> list[str]:
        out = list(nics_of.get(vm, []))
        out += [p for n in nics_of.get(vm, []) for p in pips_of.get(n, [])]
        out += [d for d, _ in disks_of.get(vm, [])]
        return out

    container_of: dict[str, str] = {}
    inside: dict[str, str] = {}  # NSG / route table → the one subnet it is drawn in
    for home, members in crowd.items():
        if len(members) > MACHINE_LIMIT:
            agg_id = f"agg:{home}:{VM}"
            g.nodes.append(
                Node(
                    id=agg_id,
                    type=VM,
                    label=classify.type_label(VM, plural=True),
                    parent=home,
                    sublabel=f"{len(members)} machines with their NICs and disks",
                    kind="aggregate",
                    members=[Member(m, topo.name_of(m), detail(res[m])) for m in members],
                    attrs={"count": len(members), "category": "compute"},
                )
            )
            for vm in members:
                place.node_of[vm] = agg_id
                for part in parts(vm):
                    hidden[part] = vm
            continue
        for vm in members:
            gid = f"vm:{vm}"
            nics = nics_of.get(vm, [])
            ip = next((i for n in nics for i in private_ips(res[n])), "")
            g.groups.append(
                Group(
                    id=gid,
                    kind="machine",
                    label=topo.name_of(vm),
                    parent=home,
                    sublabel=" · ".join(x for x in ("Virtual machine", ip) if x),
                    arm_id=vm,
                )
            )
            by_id[gid] = g.groups[-1]
            for arm in [vm, *parts(vm)]:
                container_of[arm] = gid
    # ---- everything else: its subnet, the box of what it is attached to, or its resource group --
    for arm in sorted(res):
        if not drawn(arm) or arm in place.node_of:
            continue
        if arm in container_of:
            place.add(container_of[arm], arm)
            continue
        owner = part_of.get(arm)
        home = subnet_home(arm) or (subnet_home(owner) if owner and drawn(owner) else None)
        served = guards.get(arm) or set()
        if home is None and len(served) == 1:
            # an NSG or route table that serves one subnet (or one machine) is drawn inside it
            (only,) = served
            if only in subnet_ids:
                home = only
                inside[arm] = only
            elif container_of.get(only.removeprefix("nic:")):
                home = container_of[only.removeprefix("nic:")]
        place.add(home or rg_group(arm), arm)
    place.flush(threshold=AGGREGATE)

    def nid(arm: str) -> str | None:
        seen: set[str] = set()
        while arm in hidden and arm not in seen:
            seen.add(arm)
            arm = hidden[arm]
        return place.node_of.get(arm)

    def link(source: str | None, target: str | None, kind: str, label: str = "") -> None:
        if source and target:
            g.add_edge(source, target, kind, label)

    # ---- attachments: public IP → NIC → VM → disks ---------------------------------------------
    for owner, nics in nics_of.items():
        for nic in nics:
            ips = private_ips(res[nic])
            link(nid(nic), nid(owner), "attached", ips[0] if ips else "NIC")
    for owner, disks in disks_of.items():
        for disk, role in disks:
            link(nid(owner), nid(disk), "attached", role)
    for owner, pips in pips_of.items():
        for pip in pips:
            link(nid(pip), nid(owner), "attached", "public IP")
    # ---- everything the scan relates ------------------------------------------------------------
    hubs = topo.hubs()
    for e in topo.inp.edges:
        s, t, kind = e["source"], e["target"], e["type"]
        attrs = e.get("attrs") or {}
        subnet_gid = f"subnet:{s}/{str(attrs.get('subnet') or '').lower()}"
        if kind == "peering" and f"vnet:{t}" in by_id:
            x, y = topo.oriented(s, t, hubs)
            label = "peering · gateway transit" if attrs.get("gateway_transit") else "peering"
            g.add_edge(f"vnet:{x}", f"vnet:{y}", "peering", label)
        elif kind == "subnet_nsg" and subnet_gid in subnet_ids:
            if inside.get(t) == subnet_gid:
                by_id[subnet_gid].badges.insert(0, f"NSG {topo.name_of(t)}")
            else:
                link(nid(t), subnet_gid, "nsg-attached", "filters subnet")
        elif kind == "nsg":
            link(nid(t), nid(s), "nsg-attached", "filters NIC")
        elif kind == "subnet_route_table" and subnet_gid in subnet_ids:
            if inside.get(t) == subnet_gid:
                by_id[subnet_gid].badges.insert(0, f"UDR {topo.name_of(t)}")
            else:
                link(nid(t), subnet_gid, "route", "routes subnet")
        elif kind == "private_link":
            link(nid(s), nid(t), "private-endpoint", str(attrs.get("group") or "private link"))
        elif kind == "vnet_integration":
            target = f"subnet:{t}/{str(attrs.get('subnet') or '').lower()}"
            if target in subnet_ids:
                link(nid(s), target, "vnet-integration", "VNet integration")
        elif kind == "dns_link" and f"vnet:{t}" in by_id:
            link(nid(s), f"vnet:{t}", "dns", "DNS link")
        elif kind == "child_of" and drawn(s):
            link(nid(t), nid(s), "contains", "")
        elif kind in LINKS:
            mapped, label, reverse = LINKS[kind]
            a, z = (t, s) if reverse else (s, t)
            link(nid(a), nid(z), mapped, label)
    # user-defined routes that send traffic to a firewall
    firewalls = {
        str((ipc.get("properties") or {}).get("privateIPAddress") or ""): a
        for a, r in res.items()
        if r["type"] == "microsoft.network/azurefirewalls"
        for ipc in _props(r).get("ipConfigurations") or []
    }
    for arm, r in res.items():
        if r["type"] != "microsoft.network/routetables":
            continue
        for route in _props(r).get("routes") or []:
            rp = route.get("properties") or {}
            fw = firewalls.get(str(rp.get("nextHopIpAddress") or ""))
            if fw:
                link(
                    nid(arm),
                    nid(fw),
                    "route",
                    f"{rp.get('addressPrefix') or 'traffic'} via firewall",
                )
    # RBAC grants of managed identities, at resource scope only (wider scopes would link everything)
    principal: dict[str, str] = {}
    for arm, r in res.items():
        if not drawn(arm):
            continue
        pid = (r.get("identity") or {}).get("principalId")
        if pid:
            principal[str(pid).lower()] = arm
        if r["type"] == UAMI and _props(r).get("principalId"):
            principal[str(_props(r)["principalId"]).lower()] = arm
    for ra in topo.inp.rbac:
        grantee = principal.get(str(ra.get("principal_id") or "").lower())
        scope = str(ra.get("scope") or "").lower().rstrip("/")
        if grantee and scope in res and drawn(scope):
            link(nid(grantee), nid(scope), "rbac-grants", str(ra.get("role_name") or "role"))
    # ---- the outside world ----------------------------------------------------------------------
    for arm in sorted(res):
        r = res[arm]
        node = nid(arm)
        if node is None:
            continue
        if r["type"] == PIP and (arm in part_of or node != arm):
            b._external(g, b.INTERNET, "Internet")
            addr = str(_props(r).get("ipAddress") or "public")
            g.add_edge(b.INTERNET, node, "exposure", addr if node == arm else "public IPs")
        elif classify.is_public_facing(str(r["type"])) and not pips_of.get(arm):
            b._external(g, b.INTERNET, "Internet")
            g.add_edge(b.INTERNET, node, "exposure", "public endpoint")
    lngs = [a for a, r in res.items() if r["type"] == LNG]
    if lngs:
        prefixes = sorted(
            {
                p
                for a in lngs
                for p in (_props(res[a]).get("localNetworkAddressSpace") or {}).get(
                    "addressPrefixes"
                )
                or []
            }
        )
        b._external(g, b.ONPREM, "On-premises", ", ".join(prefixes[:3]))
        for a in lngs:
            link(nid(a), b.ONPREM, "connection", str(_props(res[a]).get("gatewayIpAddress") or ""))
    # empty resource groups never appear; empty subnets stay (an empty subnet is a fact)
    kinds: dict[str, int] = defaultdict(int)
    for n in g.nodes:
        kinds[n.type] += len(n.members) or 1
    g.stats = {
        "resources": sum(kinds.values()),
        "machines": len([x for x in g.groups if x.kind == "machine"]),
        "vnets": len(vnets),
        "subnets": len(subnet_ids),
        "links": len(g.edges),
    }
    return g
