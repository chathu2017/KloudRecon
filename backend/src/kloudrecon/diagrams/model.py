"""The normalized diagram graph (plan 9.3): containers (groups), nodes and typed edges.

- Group: a container styled like Microsoft reference architectures (management group,
  subscription, region, resource group, VNet, subnet, application, tier...). `parent` nests it.
- Node: one resource (`id` = ARM ID), an aggregate of several resources of one type
  (`members`), or an external entity (Internet, on-premises).
- Edge kinds: contains, peering, private-endpoint, vnet-integration, lb-backend, route,
  nsg-attached, identity-uses, rbac-grants, dns, dependency, exposure, connection.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any

EDGE_KINDS = (
    "contains",
    "peering",
    "private-endpoint",
    "vnet-integration",
    "lb-backend",
    "route",
    "nsg-attached",
    "identity-uses",
    "rbac-grants",
    "dns",
    "dependency",
    "exposure",
    "connection",
)


@dataclass
class Group:
    id: str
    kind: str  # tenant | mg | subscription | region | rg | vnet | subnet | app | tier | zone
    label: str
    parent: str | None = None
    sublabel: str = ""
    badges: list[str] = field(default_factory=list)
    arm_id: str | None = None
    attrs: dict[str, Any] = field(default_factory=dict)


@dataclass
class Member:
    id: str
    label: str
    sublabel: str = ""


@dataclass
class Node:
    id: str
    type: str  # ARM type, or "external/internet", "external/onprem"...
    label: str
    parent: str | None = None
    sublabel: str = ""
    kind: str = "resource"  # resource | aggregate | external | summary
    arm_id: str | None = None
    members: list[Member] = field(default_factory=list)
    badges: list[str] = field(default_factory=list)
    attrs: dict[str, Any] = field(default_factory=dict)

    @property
    def arm_ids(self) -> list[str]:
        if self.members:
            return [m.id for m in self.members]
        return [self.arm_id] if self.arm_id else []


@dataclass
class Edge:
    id: str
    source: str
    target: str
    kind: str
    label: str = ""
    attrs: dict[str, Any] = field(default_factory=dict)


@dataclass
class Graph:
    view: str
    title: str
    description: str
    direction: str = "RIGHT"  # ELK layered direction hint
    groups: list[Group] = field(default_factory=list)
    nodes: list[Node] = field(default_factory=list)
    edges: list[Edge] = field(default_factory=list)
    stats: dict[str, Any] = field(default_factory=dict)

    def __post_init__(self) -> None:
        self._edge_keys: set[str] = {e.id for e in self.edges}  # not a field: not serialized

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    def node_ids(self) -> set[str]:
        return {n.id for n in self.nodes}

    def add_edge(self, source: str, target: str, kind: str, label: str = "", **attrs: Any) -> None:
        if source == target:
            return
        key = f"{kind}:{source}->{target}"
        reverse = f"{kind}:{target}->{source}"
        if key in self._edge_keys or (
            kind in ("peering", "connection") and reverse in self._edge_keys
        ):
            return
        self._edge_keys.add(key)
        self.edges.append(Edge(key, source, target, kind, label, dict(attrs)))


def from_dict(data: dict[str, Any]) -> Graph:
    return Graph(
        view=data["view"],
        title=data["title"],
        description=data["description"],
        direction=data.get("direction", "RIGHT"),
        groups=[Group(**g) for g in data.get("groups", [])],
        nodes=[
            Node(**{**n, "members": [Member(**m) for m in n.get("members", [])]})
            for n in data.get("nodes", [])
        ],
        edges=[Edge(**e) for e in data.get("edges", [])],
        stats=dict(data.get("stats") or {}),
    )
