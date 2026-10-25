"""Pure scan helpers: content hash, field diff, risky-change rules, relationships."""

from __future__ import annotations

import copy
from typing import Any

from kloudrecon.services.azure.demo.world import world_at
from kloudrecon.services.scan import diff
from kloudrecon.services.scan.relationships import extract_edges, managed_identity_names

NSG_ID = "/subscriptions/s/resourceGroups/rg/providers/Microsoft.Network/networkSecurityGroups/n"


def nsg(rules: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "id": NSG_ID,
        "name": "n",
        "type": "microsoft.network/networksecuritygroups",
        "tags": {},
        "properties": {"securityRules": rules, "provisioningState": "Succeeded"},
    }


def rule(name: str, source: str, port: str = "3389") -> dict[str, Any]:
    return {
        "name": name,
        "properties": {
            "direction": "Inbound",
            "access": "Allow",
            "sourceAddressPrefix": source,
            "destinationPortRange": port,
        },
    }


def test_content_hash_ignores_volatile_fields() -> None:
    a = {
        "id": "x",
        "name": "vm",
        "type": "t",
        "etag": "1",
        "properties": {
            "hardwareProfile": {"vmSize": "A"},
            "provisioningState": "Succeeded",
            "extended": {"instanceView": {"powerState": {"code": "PowerState/running"}}},
        },
    }
    b = copy.deepcopy(a)
    b["etag"] = "2"
    b["properties"]["extended"]["instanceView"]["powerState"]["code"] = "PowerState/deallocated"
    b["properties"]["provisioningState"] = "Updating"
    assert diff.content_hash(a) == diff.content_hash(b)
    b["properties"]["hardwareProfile"]["vmSize"] = "B"
    assert diff.content_hash(a) != diff.content_hash(b)


def test_diff_fields_by_name_for_lists() -> None:
    before = nsg([rule("a", "10.0.0.0/8")])
    after = nsg([rule("a", "10.0.0.0/8"), rule("b", "*")])
    after["tags"] = {"env": "prod"}
    paths = [d["path"] for d in diff.diff_fields(before, after)]
    assert "tags.env" in paths
    assert "properties.securityRules[b]" in paths


def test_risky_rules() -> None:
    before = nsg([rule("a", "10.0.0.0/8")])
    after = nsg([rule("a", "10.0.0.0/8"), rule("open-rdp", "Internet")])
    reason = diff.risky_snapshot_change(
        "modified", "microsoft.network/networksecuritygroups", before, after
    )
    assert reason == "Inbound rule open to the internet: open-rdp"
    assert (
        diff.risky_snapshot_change(
            "modified", "microsoft.network/networksecuritygroups", after, after
        )
        is None
    )
    st_before = {"properties": {"allowBlobPublicAccess": False}}
    st_after = {"properties": {"allowBlobPublicAccess": True}}
    assert (
        diff.risky_snapshot_change(
            "modified", "microsoft.storage/storageaccounts", st_before, st_after
        )
        == "Anonymous blob access enabled"
    )
    assert diff.risky_snapshot_change("deleted", "microsoft.keyvault/vaults", {}, None) == (
        "Key Vault deleted"
    )
    assert diff.risky_operation("Microsoft.Authorization/roleAssignments/write") == (
        "Role assignment created"
    )
    assert diff.risky_operation("Microsoft.Compute/virtualMachines/write") is None


def test_activity_change_types_and_parents() -> None:
    assert diff.activity_change_type("Microsoft.Compute/virtualMachines/write") == "modified"
    assert diff.activity_change_type("Microsoft.Compute/virtualMachines/delete") == "deleted"
    assert diff.activity_change_type("Microsoft.Compute/virtualMachines/restart/action") == "action"
    assert diff.activity_change_type("Microsoft.Compute/virtualMachines/read") is None
    assert diff.parent_resource_id(f"{NSG_ID}/securityRules/r1") == NSG_ID.lower()
    assert diff.caller_type("a@b.c") == "user"
    assert diff.caller_type("11111111-2222-3333-4444-555555555555") == "service_principal"


def test_relationships_on_demo_tenant() -> None:
    rows = world_at(0).rows()
    edges = extract_edges(rows)
    kinds = {e.edge_type for e in edges}
    assert {
        "peering",
        "subnet_nsg",
        "in_subnet",
        "public_ip",
        "nic",
        "disk",
        "private_link",
        "dns_link",
        "hosted_on",
        "vnet_integration",
        "kubelet_identity",
        "uses_identity",
        "child_of",
        "lb_backend",
    } <= kinds
    jump = next(
        e for e in edges if e.source.endswith("/vm-prod-jumpbox01") and e.edge_type == "nic"
    )
    assert jump.target.endswith("/nic-vm-prod-jumpbox01")
    subnet_edges = [e for e in edges if e.edge_type == "in_subnet" and "subnet" in e.attrs]
    assert subnet_edges
    assert all("/subnets/" not in e.target for e in edges)
    names = managed_identity_names(rows)
    assert any(v.startswith("vm-prod-jumpbox01") for v in names.values())
