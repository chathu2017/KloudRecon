"""Host metrics (psutil) for the worker heartbeat and the owner console."""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any

import psutil

# On the VM: root disk and the PostgreSQL data disk. Elsewhere, only existing paths are reported.
DISK_PATHS = ("/", "/var/lib/postgresql")


def disk_free_percent() -> dict[str, float]:
    result: dict[str, float] = {}
    paths = [p for p in DISK_PATHS if Path(p).exists()] or [os.path.abspath(os.sep)]
    for path in paths:
        try:
            usage = psutil.disk_usage(path)
        except OSError:
            continue
        result[path] = round(100.0 - usage.percent, 1)
    return result


def host_stats() -> dict[str, Any]:
    mem = psutil.virtual_memory()
    disks = disk_free_percent()
    return {
        "cpu_percent": psutil.cpu_percent(interval=None),
        "mem_used_percent": mem.percent,
        "mem_available_mb": round(mem.available / 1024 / 1024),
        "disk_free_percent": min(disks.values()) if disks else None,
        "disks": disks,
        "load_avg": list(os.getloadavg()) if hasattr(os, "getloadavg") else None,
    }
