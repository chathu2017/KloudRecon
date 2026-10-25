"""The basic vulnerability assessment (decision 0052): pure builders, the demo tenant and the
effect on attack path scores. No database."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

from kloudrecon.security import assessment as basic
from kloudrecon.security.exposure import ExposureItem
from kloudrecon.services import reliability
from kloudrecon.services.azure.demo import security as demo_security
from kloudrecon.services.azure.demo.world import world_at
from kloudrecon.services.scan.stages import normalize

NOW = datetime(2026, 10, 4, 12, 0, tzinfo=UTC)
BASE = "/subscriptions/s1/resourcegroups/rg/providers"


def vm(name: str, **over: Any) -> dict[str, Any]:
    props: dict[str, Any] = {
        "storageProfile": {
            "imageReference": {
                "publisher": "canonical",
                "offer": "ubuntu-24_04-lts",
                "sku": "server",
                "exactVersion": "24.04.202601300",
            },
            "osDisk": {"osType": "Linux"},
        },
        "osProfile": {
            "linuxConfiguration": {
                "disablePasswordAuthentication": True,
                "patchSettings": {"patchMode": "ImageDefault", "assessmentMode": "ImageDefault"},
            }
        },
    }
    props.update(over)
    return {
        "id": f"{BASE}/microsoft.compute/virtualmachines/{name}".lower(),
        "name": name,
        "type": "microsoft.compute/virtualmachines",
        "properties": props,
    }


def summary(machine: dict[str, Any], days_ago: int, **counts: int) -> dict[str, Any]:
    return {
        "id": f"{machine['id']}/patchAssessmentResults/latest",
        "properties": {
            "lastModifiedDateTime": (NOW - timedelta(days=days_ago)).isoformat(),
            "rebootPending": bool(counts.get("critical")),
            "availablePatchCountByClassification": counts,
        },
    }


def patch(machine: dict[str, Any], name: str, classification: str) -> dict[str, Any]:
    return {
        "id": f"{machine['id']}/patchAssessmentResults/latest/softwarePatches/{name}",
        "properties": {"patchName": name, "classifications": [classification], "kbId": "5043080"},
    }


def exposed(machine: dict[str, Any], port: int) -> dict[str, ExposureItem]:
    item = ExposureItem(arm_id=machine["id"], kind="vm", resource=machine)
    item.ports = [{"port": port, "service": "SSH"}]
    return {machine["id"]: item}


def test_image_date_and_os_label() -> None:
    assert basic.image_date({"exactVersion": "24.04.202601300"}).isoformat() == "2026-01-30"  # type: ignore[union-attr]
    assert basic.image_date({"exactVersion": "20348.2340.240303"}).isoformat() == "2024-03-03"  # type: ignore[union-attr]
    assert basic.image_date({"version": "latest"}) is None
    assert basic.image_date({}) is None
    assert basic.os_label(vm("a")) == "Ubuntu 24.04 lts server"
    odd = vm("b")
    odd["properties"]["storageProfile"]["imageReference"] = {
        "offer": "0001-com-ubuntu-server-jammy",
        "sku": "22_04-lts-gen2",
    }
    assert basic.os_label(odd) == "Ubuntu server jammy 22.04 lts gen2"


def test_machine_never_assessed_is_unknown_not_clean() -> None:
    a = vm("vm-a")
    [m] = basic.machines([a], [], [], exposed(a, 22), NOW)
    assert m["assessed"] == "never"
    assert (m["critical"], m["security"]) == (0, 0)
    assert m["level"] != "ok"
    assert m["management_open"] is True
    assert m["image_age_days"] == 247
    assert "never checked for missing updates" in m["reasons"]
    assert any("247 days old" in r for r in m["reasons"])
    assert "management port open to the internet" in m["reasons"]
    # the same machine, unexposed and freshly built, is a lower priority
    fresh = vm("vm-b")
    fresh["properties"]["storageProfile"]["imageReference"]["exactVersion"] = "24.04.202609300"
    [quiet] = basic.machines([fresh], [], [], {}, NOW)
    assert quiet["priority"] < m["priority"]


def test_missing_patches_rank_by_classification_and_exposure() -> None:
    a, b, c = vm("crit"), vm("sec"), vm("clean")
    summaries = [
        summary(a, 1, critical=2, security=3, other=5),
        summary(b, 20, security=4),
        summary(c, 1, other=2),
    ]
    patches = [
        patch(a, "KB1", "Critical"),
        patch(a, "KB2", "Security"),
        patch(a, "Definition update", "Definition"),
    ]
    out = basic.machines([c, b, a], summaries, patches, exposed(a, 3389), NOW)
    by = {m["name"]: m for m in out}
    assert [m["name"] for m in out] == ["crit", "sec", "clean"]
    assert by["crit"]["level"] == "critical"
    assert by["crit"]["reboot_pending"] is True
    assert [p["name"] for p in by["crit"]["patches"]] == ["KB1", "KB2"]  # definitions left out
    assert by["crit"]["other"] == 5
    assert by["sec"]["assessed"] == "stale"
    assert by["sec"]["level"] == "high"  # stale, security gaps, old image without auto-patching
    assert by["clean"]["assessed"] == "current"
    assert by["clean"]["level"] == "ok"
    assert by["clean"]["priority"] == 0
    s = basic.summarize(out, [], [])
    assert (s["critical_patches"], s["security_patches"], s["machines_with_gaps"]) == (2, 7, 2)
    assert (s["assessed"], s["stale"], s["never_assessed"]) == (2, 1, 0)


def test_lifecycle_uses_the_catalog_and_skips_supported_software() -> None:
    entries = [e for e in reliability.catalog_entries() if e["key"].startswith("sw-")]
    assert len(entries) >= 12
    old = vm("vm-old")
    old["properties"]["storageProfile"]["imageReference"] = {
        "publisher": "canonical",
        "offer": "UbuntuServer",
        "sku": "18.04-LTS",
    }
    win = vm("vm-win")
    win["properties"]["storageProfile"]["imageReference"] = {
        "publisher": "MicrosoftWindowsServer",
        "offer": "WindowsServer",
        "sku": "2016-Datacenter",
    }
    items = basic.lifecycle([vm("vm-new"), old, win], entries, {old["id"]: object()}, NOW)
    by = {x["name"]: x for x in items}
    assert set(by) == {"vm-old", "vm-win"}  # Ubuntu 24.04 is supported: not listed
    assert by["vm-old"]["status"] == "ended"
    assert by["vm-old"]["days_left"] < 0
    assert by["vm-old"]["exposed"] is True
    assert by["vm-win"]["status"] == "due_1_year"
    assert items[0]["name"] == "vm-old"  # the most overdue first


def test_unpinned_container_images() -> None:
    def app(name: str, *images: str) -> dict[str, Any]:
        return {
            "id": f"{BASE}/microsoft.app/containerapps/{name}",
            "name": name,
            "type": "microsoft.app/containerapps",
            "properties": {
                "template": {
                    "containers": [{"name": f"c{i}", "image": x} for i, x in enumerate(images)]
                }
            },
        }

    out = basic.images(
        [
            app("a", "acr.azurecr.io/web:latest", "acr.azurecr.io/api:1.4.2"),
            app("b", "localhost:5000/tool", "acr.azurecr.io/x@sha256:abc"),
        ],
        {},
    )
    assert [(x["name"], x["issue"]) for x in out] == [("a", "latest tag"), ("b", "no tag")]


def test_demo_tenant_assessment_and_weak_software() -> None:
    w = world_at(3)
    resources = [normalize(r) for r in w.rows()]
    summaries, patches = demo_security.patch_assessments(w, NOW)
    entries = [
        {**e, "resource_type": str(e["resource_type"]).lower()}
        for e in reliability.catalog_entries()
        if e["key"].startswith("sw-")
    ]
    result = basic.build(resources, summaries, patches, entries, {}, NOW)
    s = result["summary"]
    assert s["machines"] == len(result["machines"]) > 10
    assert s["never_assessed"] > 0
    assert s["stale"] > 0
    assert s["assessed"] > 0
    assert s["critical_patches"] >= 2
    jump = next(m for m in result["machines"] if m["name"] == "vm-prod-jumpbox01")
    assert (jump["critical"], jump["security"]) == (2, 3)
    assert len(jump["patches"]) == 5
    assert result["machines"][0]["priority"] >= result["machines"][-1]["priority"]
    weak = basic.weak_software(result)
    assert weak[jump["arm_id"]] == ["5 critical or security patches missing"]
    assert result["patch_data"] is True
