"""Turn the output of a collection script into a health report.

`parse_output` reads what the customer pasted (JSON, possibly with console text around it);
`analyze` returns one summary dict for either platform:

    os, cpu, memory, disks, patches, vulnerabilities, logs, services, security, network,
    findings (severity, area, title, detail, recommendation), counts, score, grade, status

Score: 100 minus 25 per critical, 12 per high, 5 per medium and 2 per low finding (floor 0).
Status: critical if any critical finding; at_risk below 60; attention below 85 or with any high
finding; else healthy.

The pasted text is untrusted: it is only parsed, sizes are capped, and every value is coerced.
Pure functions: no database, no network.
"""

# ruff: noqa: E501 -- finding sentences

from __future__ import annotations

import json
import re
from datetime import UTC, date, datetime
from typing import Any

from kloudrecon.health import catalog

MAX_BYTES = 1_500_000
MAX_ITEMS = 200
SCHEMAS = {"kloudrecon.windows.v1": "windows", "kloudrecon.linux.v1": "linux"}
PENALTY = {"critical": 25, "high": 12, "medium": 5, "low": 2}
RISKY_PORTS = {
    21: "FTP",
    23: "Telnet",
    69: "TFTP",
    111: "rpcbind",
    512: "rexec",
    513: "rlogin",
    514: "rsh",
}
# Windows services that are "automatic" but normally stopped (trigger or delayed start, updaters)
QUIET_SERVICES = re.compile(
    r"^(edgeupdate|gupdate|googleupdater|mapsbroker|sppsvc|remoteregistry|wbiosrvc|cdpsvc|"
    r"trustedinstaller|shellhwdetection|tiledatamodelsvc|clr_optimization|gpsvc|bits|wuauserv|"
    r"dosvc|usosvc|ccmsetup|onesyncsvc|lplatsvc|intel|igccservice|msiserver)",
    re.I,
)
DISK_ERRORS = re.compile(
    r"I/O error|EXT4-fs error|XFS.*(error|corrupt)|Buffer I/O|medium error", re.I
)


class HealthInputError(ValueError):
    """The pasted text is not the output of a KloudRecon collection script."""


def _s(value: Any, limit: int = 300) -> str:
    return str(value if value is not None else "").strip()[:limit]


def _i(value: Any, default: int = 0) -> int:
    try:
        return int(float(str(value).strip()))
    except (TypeError, ValueError):
        return default


def _time(value: Any) -> datetime | None:
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00")) if value else None
    except ValueError:
        return None
    if parsed is not None and parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=UTC)
    return parsed


def _pct(part: float, whole: float) -> float:
    return round(100 * part / whole, 1) if whole else 0.0


def parse_output(text: str) -> tuple[str, dict[str, Any]]:
    """(platform, data). Accepts the JSON with anything before or after it (console lines)."""
    if len(text.encode("utf-8", "ignore")) > MAX_BYTES:
        raise HealthInputError(
            "The output is too large (1.5 MB at most). Paste the script output only."
        )
    start, end = text.find("{"), text.rfind("}")
    if start < 0 or end <= start:
        raise HealthInputError(
            "This is not the script output: no JSON was found. Paste everything the script printed."
        )
    try:
        data = json.loads(text[start : end + 1])
    except ValueError:
        raise HealthInputError(
            "The output could not be read as JSON. It may be cut off: copy the whole output, from the first { to the last }."
        ) from None
    if not isinstance(data, dict) or data.get("schema") not in SCHEMAS:
        raise HealthInputError("This is not the output of a KloudRecon health check script.")
    return SCHEMAS[str(data["schema"])], data


class _Report:
    def __init__(self) -> None:
        self.findings: list[dict[str, str]] = []
        self.security: list[dict[str, str]] = []

    def add(self, key: str, severity: str, area: str, title: str, detail: str, fix: str) -> None:
        self.findings.append(
            {
                "id": key,
                "severity": severity,
                "area": area,
                "title": title,
                "detail": detail,
                "recommendation": fix,
            }
        )

    def check(self, key: str, label: str, ok: bool | None, detail: str = "") -> None:
        status = "unknown" if ok is None else "pass" if ok else "fail"
        self.security.append({"key": key, "label": label, "status": status, "detail": detail})


# ---- checks shared by both platforms -------------------------------------------------------------
def _resources(
    rep: _Report, cpu: dict[str, Any], memory: dict[str, Any], disks: list[dict[str, Any]]
) -> None:
    for d in disks:
        used = float(d.get("used_pct") or 0)
        name = d["mount"]
        if used >= 95:
            rep.add(
                f"disk-{name}",
                "critical",
                "Storage",
                f"Disk {name} is {used:.0f}% full",
                f"{_bytes(d['free'])} free of {_bytes(d['size'])}.",
                "Free space or extend the volume now: a full disk stops services and can corrupt data.",
            )
        elif used >= 90:
            rep.add(
                f"disk-{name}",
                "high",
                "Storage",
                f"Disk {name} is {used:.0f}% full",
                f"{_bytes(d['free'])} free of {_bytes(d['size'])}.",
                "Clean up logs and temporary files or extend the volume.",
            )
        elif used >= 80:
            rep.add(
                f"disk-{name}",
                "medium",
                "Storage",
                f"Disk {name} is {used:.0f}% full",
                f"{_bytes(d['free'])} free of {_bytes(d['size'])}.",
                "Plan a cleanup or an extension before it reaches 90%.",
            )
        if float(d.get("inodes_pct") or 0) >= 90:
            rep.add(
                f"inodes-{name}",
                "high",
                "Storage",
                f"File system {name} is running out of inodes",
                f"{d['inodes_pct']:.0f}% of inodes are used.",
                "Remove large numbers of small files (session, cache or mail spool directories).",
            )
    used = float(memory.get("used_pct") or 0)
    if used >= 95:
        rep.add(
            "memory",
            "high",
            "Memory",
            f"Memory is {used:.0f}% used",
            f"{_bytes(memory.get('available') or 0)} available of {_bytes(memory.get('total') or 0)}.",
            "Find the process using the memory, then add memory or move the workload.",
        )
    elif used >= 90:
        rep.add(
            "memory",
            "medium",
            "Memory",
            f"Memory is {used:.0f}% used",
            f"{_bytes(memory.get('available') or 0)} available of {_bytes(memory.get('total') or 0)}.",
            "Watch the trend; add memory if it stays this high.",
        )
    swap = float(memory.get("swap_used_pct") or 0)
    if swap >= 80:
        rep.add(
            "swap",
            "medium",
            "Memory",
            f"Swap or page file is {swap:.0f}% used",
            "The server is paging heavily, which slows everything down.",
            "Add memory or reduce what runs on the server.",
        )
    load = float(cpu.get("load_pct") or 0)
    if load >= 200:
        rep.add(
            "cpu",
            "high",
            "CPU",
            "CPU is overloaded",
            f"Load is {load:.0f}% of the available cores.",
            "Find the busy process; scale the server up or move work off it.",
        )
    elif load >= 90:
        rep.add(
            "cpu",
            "medium",
            "CPU",
            "CPU load is high",
            f"Load is {load:.0f}% of the available cores at the time of the check.",
            "Check whether this is normal for the workload; rightsizing may be needed.",
        )


def _uptime(rep: _Report, days: float | None) -> None:
    if days is None:
        return
    if days > 365:
        rep.add(
            "uptime",
            "high",
            "Patching",
            f"Not restarted for {days:.0f} days",
            "Kernel and system updates only take effect after a restart.",
            "Plan a restart in the next maintenance window.",
        )
    elif days > 180:
        rep.add(
            "uptime",
            "medium",
            "Patching",
            f"Not restarted for {days:.0f} days",
            "Kernel and system updates only take effect after a restart.",
            "Plan a restart in the next maintenance window.",
        )


def _lifecycle(
    rep: _Report, family: str, version: str, detected: str, today: date
) -> dict[str, Any]:
    v = catalog.version(family, version)
    out: dict[str, Any] = {"label": v.label if v else "", "end_of_support": None, "days_left": None}
    if v is None or v.end_of_support is None:
        return out
    days = (v.end_of_support - today).days
    out.update(end_of_support=v.end_of_support.isoformat(), days_left=days)
    if days < 0:
        rep.add(
            "os-eol",
            "high",
            "Lifecycle",
            f"{v.label} is past its end of support",
            f"Vendor security updates ended on {v.end_of_support:%d %B %Y}.",
            "Upgrade to a supported release, or buy extended security updates as a stopgap.",
        )
    elif days <= 180:
        rep.add(
            "os-eol",
            "medium",
            "Lifecycle",
            f"{v.label} reaches end of support in {days} days",
            f"Vendor security updates end on {v.end_of_support:%d %B %Y}.",
            "Plan the upgrade to a supported release now.",
        )
    return out


def _patch_findings(rep: _Report, p: dict[str, Any], how: str) -> None:
    if not p["checked"]:
        rep.add(
            "patch-unknown",
            "low",
            "Patching",
            "Pending updates could not be read",
            "The script could not query the update service, so the patch state is unknown.",
            how,
        )
    crit, sec = int(p["critical"]), int(p["security"])
    cves = sorted({c for item in p["items"] for c in item.get("cves") or []})
    known = f" Known CVEs: {', '.join(cves[:8])}{' ...' if len(cves) > 8 else ''}." if cves else ""
    if crit:
        rep.add(
            "patch-critical",
            "high",
            "Patching",
            f"{crit} critical update{'s' if crit != 1 else ''} missing",
            f"{sec} security update(s) are pending in total.{known}",
            "Install the pending critical updates in the next maintenance window and restart if required.",
        )
    elif sec >= 10:
        rep.add(
            "patch-security",
            "high",
            "Patching",
            f"{sec} security updates missing",
            f"The server is well behind on security patches.{known}",
            "Install the pending security updates and set up automatic or scheduled patching.",
        )
    elif sec:
        rep.add(
            "patch-security",
            "medium",
            "Patching",
            f"{sec} security update{'s' if sec != 1 else ''} missing",
            f"Pending security updates were found.{known}",
            "Install the pending security updates.",
        )
    elif int(p["pending"]) > 30:
        rep.add(
            "patch-backlog",
            "low",
            "Patching",
            f"{p['pending']} updates pending",
            "None is marked as a security update, but the backlog is growing.",
            "Bring the server up to date.",
        )
    age = p.get("days_since_patch")
    if age is not None and age > 180:
        rep.add(
            "patch-age",
            "high",
            "Patching",
            f"No update installed for {age} days",
            "Nothing has been patched for more than six months.",
            "Review the patching process for this server.",
        )
    elif age is not None and age > 90:
        rep.add(
            "patch-age",
            "medium",
            "Patching",
            f"No update installed for {age} days",
            "Nothing has been patched for more than three months.",
            "Patch the server and schedule regular patching.",
        )
    if p.get("reboot_pending"):
        rep.add(
            "reboot",
            "medium",
            "Patching",
            "A restart is pending",
            "Installed updates are not active until the server restarts.",
            "Restart the server in the next maintenance window.",
        )


def _bytes(n: float) -> str:
    n = float(n or 0)
    for unit in ("B", "KB", "MB", "GB", "TB"):
        if n < 1024 or unit == "TB":
            return f"{n:.0f} {unit}" if unit in ("B", "KB") else f"{n:.1f} {unit}"
        n /= 1024
    return f"{n:.1f} TB"


def _finish(rep: _Report, summary: dict[str, Any]) -> dict[str, Any]:
    order = {"critical": 0, "high": 1, "medium": 2, "low": 3}
    rep.findings.sort(key=lambda f: (order[f["severity"]], f["area"], f["title"]))
    counts = {s: sum(1 for f in rep.findings if f["severity"] == s) for s in order}
    score = max(0, 100 - sum(PENALTY[f["severity"]] for f in rep.findings))
    grade = (
        "A"
        if score >= 90
        else "B"
        if score >= 75
        else "C"
        if score >= 60
        else "D"
        if score >= 40
        else "E"
    )
    if counts["critical"]:
        status = "critical"
    elif score < 60:
        status = "at_risk"
    elif counts["high"] or score < 85:
        status = "attention"  # one high finding is never "healthy", whatever the score
    else:
        status = "healthy"
    summary.update(
        findings=rep.findings,
        security=rep.security,
        counts=counts,
        score=score,
        grade=grade,
        status=status,
    )
    return summary


# ---- Windows -------------------------------------------------------------------------------------
def analyze_windows(d: dict[str, Any], family: str, version: str, now: datetime) -> dict[str, Any]:
    rep = _Report()
    os_ = d.get("os") or {}
    boot = _time(os_.get("last_boot"))
    uptime_days = round((now - boot).total_seconds() / 86400, 1) if boot else None
    cpu_raw = d.get("cpu") or {}
    cpu = {
        "model": _s(cpu_raw.get("name")),
        "cores": _i(cpu_raw.get("logical") or cpu_raw.get("cores")),
        "load_pct": float(_i(cpu_raw.get("load_percent"))),
    }
    mem = d.get("memory") or {}
    total, free = _i(mem.get("total_bytes")), _i(mem.get("free_bytes"))
    page, page_used = _i(mem.get("pagefile_mb")), _i(mem.get("pagefile_used_mb"))
    memory = {
        "total": total,
        "available": free,
        "used_pct": _pct(total - free, total),
        "swap_total": page * 1048576,
        "swap_used_pct": _pct(page_used, page),
    }
    disks = []
    for x in (d.get("disks") or [])[:40]:
        size, free_b = _i(x.get("size_bytes")), _i(x.get("free_bytes"))
        if size:
            disks.append(
                {
                    "mount": _s(x.get("name"), 60),
                    "filesystem": _s(x.get("filesystem"), 20),
                    "size": size,
                    "free": free_b,
                    "used_pct": _pct(size - free_b, size),
                    "inodes_pct": None,
                }
            )
    _resources(rep, cpu, memory, disks)
    _uptime(rep, uptime_days)
    life = _lifecycle(rep, family, version, _s(os_.get("caption")), now.date())
    items: list[dict[str, Any]] = []
    for u in (d.get("pending_updates") or [])[:MAX_ITEMS]:
        cats = _s(u.get("categories")).lower()
        sev = _s(u.get("severity"), 20)
        if "definition" in cats:
            continue  # antivirus signatures arrive several times a day
        items.append(
            {
                "name": _s(u.get("title"), 200),
                "id": ("KB" + _s(u.get("kb"), 30)) if u.get("kb") else "",
                "severity": sev or ("Security" if "security" in cats else ""),
                "security": bool(sev) or "security" in cats,
                "cves": [_s(c, 20) for c in (u.get("cves") or [])[:20]],
                "published": _s(u.get("published"), 10),
            }
        )
    hotfixes = [
        {
            "id": _s(h.get("id"), 20),
            "description": _s(h.get("description"), 60),
            "installed_on": _s(h.get("installed_on"), 10),
        }
        for h in (d.get("hotfixes") or [])[:40]
    ]
    last = max((h["installed_on"] for h in hotfixes if h["installed_on"]), default="")
    last_date = _time(last)
    patches = {
        "checked": bool(d.get("updates_checked")),
        "pending": len(items),
        "security": sum(1 for i in items if i["security"]),
        "critical": sum(1 for i in items if i["severity"].lower() == "critical"),
        "last_patched": last or None,
        "days_since_patch": (now.date() - last_date.date()).days if last_date else None,
        "reboot_pending": bool(d.get("reboot_pending")),
        "auto_updates": None,
        "items": items,
        "installed": hotfixes[:15],
    }
    _patch_findings(
        rep, patches, "Run the script in an elevated PowerShell window (Run as administrator)."
    )
    counts = d.get("event_counts") or {}
    logs: dict[str, Any] = {
        "critical": sum(_i((counts.get(k) or {}).get("critical")) for k in counts),
        "errors": sum(_i((counts.get(k) or {}).get("error")) for k in counts),
        "warnings": sum(_i((counts.get(k) or {}).get("warning")) for k in counts),
        "top": [
            {
                "source": f"{_s(e.get('log'), 20)} / {_s(e.get('source'), 80)}",
                "id": _s(e.get("id"), 12),
                "level": _s(e.get("level"), 10),
                "count": _i(e.get("count")),
                "last": _s(e.get("last"), 25),
                "message": _s(e.get("message"), 300),
            }
            for e in (d.get("events") or [])[:40]
        ],
    }
    if logs["critical"]:
        rep.add(
            "events-critical",
            "medium",
            "Logs",
            f"{logs['critical']} critical event(s) in the last 7 days",
            "Critical events usually mean an unexpected shutdown, a failing device or a crashed service.",
            "Review the critical events listed under Errors and warnings.",
        )
    if logs["errors"] > 500:
        rep.add(
            "events-errors",
            "medium",
            "Logs",
            f"{logs['errors']:,} error events in the last 7 days",
            "A high error rate hides real problems and often points at one misbehaving component.",
            "Fix the most frequent error first (see Errors and warnings).",
        )
    if any(
        DISK_ERRORS.search(e["message"]) or e["source"].lower().endswith(("disk", "ntfs", "volmgr"))
        for e in logs["top"]
    ):
        rep.add(
            "events-disk",
            "high",
            "Storage",
            "Disk or file system errors in the event log",
            "The system log reports disk, NTFS or volume errors.",
            "Check the disk health (SMART, storage array, Azure disk metrics) and run chkdsk in a maintenance window.",
        )
    stopped = [
        {
            "name": _s(s.get("name"), 80),
            "display_name": _s(s.get("display_name"), 120),
            "state": _s(s.get("state"), 20),
        }
        for s in (d.get("services_stopped") or [])[:60]
        if not s.get("delayed") and not QUIET_SERVICES.match(_s(s.get("name")))
    ]
    if stopped:
        rep.add(
            "services",
            "medium",
            "Services",
            f"{len(stopped)} automatic service(s) are not running",
            ", ".join(s["display_name"] or s["name"] for s in stopped[:6]),
            "Start the services or set them to Manual if they are not needed.",
        )
    fw = d.get("firewall") or []
    off = [_s(p.get("profile"), 20) for p in fw if p.get("enabled") is False]
    rep.check(
        "firewall",
        "Windows Firewall on for every profile",
        (not off) if fw else None,
        f"Off: {', '.join(off)}" if off else "",
    )
    if off:
        rep.add(
            "firewall",
            "high",
            "Security",
            f"Windows Firewall is off for: {', '.join(off)}",
            "The host firewall is the last line of defence when a network rule is wrong.",
            "Turn the firewall on for all profiles: Set-NetFirewallProfile -All -Enabled True",
        )
    df = d.get("defender") or {}
    if df.get("available"):
        rep.check("antivirus", "Real-time antivirus protection", bool(df.get("realtime")))
        if not df.get("realtime"):
            rep.add(
                "antivirus",
                "high",
                "Security",
                "Real-time antivirus protection is off",
                "Microsoft Defender is installed but not protecting in real time.",
                "Turn it on: Set-MpPreference -DisableRealtimeMonitoring $false (or check the third-party product).",
            )
        age = _i(df.get("signature_age_days"))
        rep.check("signatures", "Antivirus signatures up to date", age <= 7, f"{age} days old")
        if age > 7:
            rep.add(
                "signatures",
                "medium",
                "Security",
                f"Antivirus signatures are {age} days old",
                "Old signatures do not detect current malware.",
                "Update them: Update-MpSignature",
            )
    else:
        rep.check(
            "antivirus",
            "Real-time antivirus protection",
            None,
            "Microsoft Defender status is not available (another product may be in use).",
        )
    smb1 = d.get("smb1_enabled")
    rep.check("smb1", "SMBv1 disabled", None if smb1 is None else not smb1)
    if smb1:
        rep.add(
            "smb1",
            "high",
            "Security",
            "SMBv1 is enabled",
            "SMBv1 is an obsolete protocol used by ransomware such as WannaCry.",
            "Disable it: Set-SmbServerConfiguration -EnableSMB1Protocol $false",
        )
    rdp = d.get("rdp") or {}
    if rdp.get("enabled"):
        rep.check(
            "rdp-nla", "Remote Desktop requires Network Level Authentication", bool(rdp.get("nla"))
        )
        if not rdp.get("nla"):
            rep.add(
                "rdp-nla",
                "high",
                "Security",
                "Remote Desktop does not require Network Level Authentication",
                "Without NLA anyone who can reach the port gets a logon screen.",
                "Require NLA in System Properties > Remote, or by Group Policy.",
            )
    else:
        rep.check("rdp-nla", "Remote Desktop", True, "Remote Desktop is disabled.")
    tls = d.get("tls") or {}
    old = [k for k in ("SSL 3.0", "TLS 1.0", "TLS 1.1") if tls.get(k) not in (None, 0)]
    rep.check("tls", "Old TLS/SSL protocols not explicitly enabled", not old, ", ".join(old))
    if old:
        rep.add(
            "tls",
            "low",
            "Security",
            f"Old protocols are enabled: {', '.join(old)}",
            "These protocols have known weaknesses.",
            "Disable them in the SCHANNEL registry settings once clients support TLS 1.2 or later.",
        )
    admins = [_s(a.get("name"), 120) for a in (d.get("local_admins") or [])[:50]]
    rep.check(
        "admins",
        "Few local administrators",
        len(admins) <= 5 if admins else None,
        f"{len(admins)} members",
    )
    if len(admins) > 5:
        rep.add(
            "admins",
            "low",
            "Security",
            f"{len(admins)} members in the local Administrators group",
            "Every extra administrator is another way in.",
            "Remove accounts that do not need to be administrators.",
        )
    certs = [
        {"subject": _s(c.get("subject"), 200), "not_after": _s(c.get("not_after"), 25)}
        for c in (d.get("certificates_expiring") or [])[:20]
    ]
    if certs:
        rep.add(
            "certificates",
            "medium",
            "Security",
            f"{len(certs)} certificate(s) expire within 30 days or have expired",
            "; ".join(c["subject"] for c in certs[:3]),
            "Renew the certificates before they expire.",
        )
    listening = [
        {
            "protocol": "tcp",
            "port": _i(p.get("port")),
            "address": _s(p.get("address"), 60),
            "process": _s(p.get("process"), 60),
        }
        for p in (d.get("listening") or [])[:80]
    ]
    _ports(rep, listening)
    if not d.get("elevated"):
        rep.add(
            "not-elevated",
            "low",
            "Collection",
            "The script was not run as administrator",
            "Some information (event logs, updates, security settings) may be incomplete.",
            "Run the script again in an elevated PowerShell window for a complete report.",
        )
    vulns = [
        {"id": c, "severity": i["severity"] or "Unrated", "source": i["id"] or i["name"][:60]}
        for i in items
        for c in i["cves"]
    ][:MAX_ITEMS]
    return _finish(
        rep,
        {
            "platform": "windows",
            "collected_at": _s(d.get("collected_at"), 30),
            "complete": bool(d.get("elevated")),
            "os": {
                "name": _s(os_.get("caption"), 120),
                "version": _s(os_.get("version"), 40),
                "kernel": f"build {_s(os_.get('build'), 20)}",
                "hostname": _s(os_.get("hostname"), 120),
                "architecture": _s(os_.get("architecture"), 20),
                "uptime_days": uptime_days,
                "last_boot": _s(os_.get("last_boot"), 25),
                "virtualization": f"{_s(os_.get('manufacturer'), 60)} {_s(os_.get('model'), 60)}".strip(),
                "domain": _s(os_.get("domain"), 120),
                "lifecycle": life,
                "roles": [_s(r, 80) for r in (d.get("roles") or [])[:40]],
            },
            "cpu": cpu,
            "memory": memory,
            "disks": disks,
            "patches": patches,
            "vulnerabilities": vulns,
            "logs": logs,
            "services": {"failed": stopped},
            "network": {"listening": listening},
            "accounts": {
                "administrators": admins,
                "policy": [_s(x, 120) for x in (d.get("account_policy") or [])[:12]],
            },
        },
    )


def _ports(rep: _Report, listening: list[dict[str, Any]]) -> None:
    risky = sorted(
        {
            f"{RISKY_PORTS[p['port']]} ({p['port']})"
            for p in listening
            if p["port"] in RISKY_PORTS and not p["address"].startswith("127.")
        }
    )
    rep.check(
        "legacy-ports", "No legacy clear-text services listening", not risky, ", ".join(risky)
    )
    if risky:
        rep.add(
            "legacy-ports",
            "medium",
            "Network",
            f"Legacy services are listening: {', '.join(risky)}",
            "These protocols send data or credentials unencrypted.",
            "Stop and disable the services, or replace them with SSH/SFTP.",
        )


# ---- Linux ---------------------------------------------------------------------------------------
def _kv(text: str) -> dict[str, str]:
    out: dict[str, str] = {}
    for line in text.splitlines():
        key, _, value = line.strip().partition(" ")
        if key:
            out[key] = value.strip()
    return out


def _linux_patches(sections: dict[str, str], manager: str) -> tuple[list[dict[str, Any]], int]:
    items: list[dict[str, Any]] = []
    for line in sections.get("patches", "").splitlines()[:400]:
        line = line.strip()
        if not line:
            continue
        if (
            manager == "apt"
        ):  # openssl/jammy-security 3.0.2-0ubuntu1.18 amd64 [upgradable from: ...]
            m = re.match(r"^([^/\s]+)/(\S+)\s+(\S+)", line)
            if m:
                pocket = m.group(2)
                items.append(
                    {
                        "name": m.group(1),
                        "id": m.group(3)[:60],
                        "severity": "Security" if "security" in pocket else "",
                        "security": "security" in pocket,
                        "cves": [],
                        "published": "",
                    }
                )
        elif manager == "rpm":  # RHSA-2024:1234 Important/Sec. kernel-5.14...
            m = re.match(r"^(\S+)\s+(\S+)\s+(\S+)$", line)
            if m:
                kind = m.group(2)
                sec = "sec" in kind.lower()
                sev = kind.split("/")[0] if "/" in kind else ("Security" if sec else "")
                items.append(
                    {
                        "name": m.group(3)[:120],
                        "id": m.group(1)[:40],
                        "severity": sev,
                        "security": sec,
                        "cves": [],
                        "published": "",
                    }
                )
        elif (
            manager == "zypper"
        ):  # Repo | Name | Category | Severity | Interactive | Status | Summary
            cols = [c.strip() for c in line.split("|")]
            if len(cols) >= 6 and cols[1] and cols[1] != "Name" and not set(cols[0]) <= {"-", "+"}:
                sec = cols[2].lower() == "security"
                items.append(
                    {
                        "name": (cols[6] if len(cols) > 6 else cols[1])[:120],
                        "id": cols[1][:60],
                        "severity": cols[3].capitalize() if sec else "",
                        "security": sec,
                        "cves": [],
                        "published": "",
                    }
                )
    cve_of: dict[str, list[str]] = {}
    for line in sections.get("cves", "").splitlines()[:400]:
        m = re.search(r"(CVE-\d{4}-\d+)", line)
        if m:
            target = (
                line.split()[-1]
                if manager == "rpm"
                else next((c.strip() for c in line.split("|")[2:3]), "")
            )
            cve_of.setdefault(target[:120], []).append(m.group(1))
    for item in items:
        item["cves"] = sorted(set(cve_of.get(item["name"], []) + cve_of.get(item["id"], [])))[:20]
    return items[:MAX_ITEMS], _i(sections.get("updates_count"), len(items))


_MONTHS = {
    m: i
    for i, m in enumerate(
        ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"], 1
    )
}


def _install_date(text: str) -> datetime | None:
    """apt writes `2026-09-24`; `rpm -qa --last` writes `Wed 19 Nov 2025 10:25:22 PM UTC` or
    `Wed Nov 19 22:25:22 2025` depending on the locale."""
    iso = re.search(r"(\d{4})-(\d{2})-(\d{2})", text)
    if iso:
        return _time(iso.group(0))
    year = re.search(r"\b(20\d{2})\b", text)
    month = re.search(r"\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)", text.lower())
    day = re.search(r"\b(\d{1,2})\b(?!:)", re.sub(r"\d{1,2}:\d{2}(:\d{2})?", "", text))
    if not (year and month and day):
        return None
    try:
        return datetime(int(year.group(1)), _MONTHS[month.group(1)], int(day.group(1)), tzinfo=UTC)
    except ValueError:
        return None


def analyze_linux(d: dict[str, Any], family: str, version: str, now: datetime) -> dict[str, Any]:
    rep = _Report()
    raw = d.get("sections") or {}
    sections = {str(k): str(v)[:70000] for k, v in raw.items()} if isinstance(raw, dict) else {}
    osr = {}
    for line in sections.get("os_release", "").splitlines():
        key, _, value = line.partition("=")
        osr[key.strip()] = value.strip().strip('"')
    up = sections.get("uptime", "").split()
    uptime_days = round(float(up[0]) / 86400, 1) if up and re.match(r"^[\d.]+$", up[0]) else None
    cpu_text = sections.get("cpu", "")
    cores_m = re.search(r"cores (\d+)", cpu_text)
    cores = _i(cores_m.group(1)) if cores_m else 0
    load = re.search(r"loadavg ([\d.]+)", cpu_text)
    load1 = float(load.group(1)) if load else 0.0
    model = re.search(r"model name\s*:\s*(.+)", cpu_text)
    cpu = {
        "model": _s(model.group(1) if model else "", 120),
        "cores": cores,
        "load1": load1,
        "load_pct": _pct(load1, cores) if cores else 0.0,
    }
    mem = {
        m.group(1): _i(m.group(2)) * 1024
        for m in re.finditer(r"^(\w+):\s+(\d+) kB", sections.get("meminfo", ""), re.M)
    }
    total = mem.get("MemTotal", 0)
    avail = mem.get(
        "MemAvailable", mem.get("MemFree", 0) + mem.get("Buffers", 0) + mem.get("Cached", 0)
    )
    swap_t, swap_f = mem.get("SwapTotal", 0), mem.get("SwapFree", 0)
    memory = {
        "total": total,
        "available": avail,
        "used_pct": _pct(total - avail, total),
        "swap_total": swap_t,
        "swap_used_pct": _pct(swap_t - swap_f, swap_t),
    }
    inode = {}
    for line in sections.get("inodes", "").splitlines()[1:]:
        cols = line.split()
        if len(cols) >= 6:
            inode[cols[5]] = (
                float(cols[4].rstrip("%") or 0)
                if cols[4].rstrip("%").replace(".", "").isdigit()
                else 0.0
            )
    disks = []
    for line in sections.get("df", "").splitlines()[1:60]:
        cols = line.split()
        if len(cols) >= 7 and cols[2].isdigit():
            size, used = _i(cols[2]) * 1024, _i(cols[3]) * 1024
            mount = " ".join(cols[6:])[:120]
            disks.append(
                {
                    "mount": mount,
                    "filesystem": cols[1][:20],
                    "size": size,
                    "free": _i(cols[4]) * 1024,
                    "used_pct": _pct(used, used + _i(cols[4]) * 1024),
                    "inodes_pct": inode.get(mount),
                }
            )
    _resources(rep, cpu, memory, disks)
    _uptime(rep, uptime_days)
    life = _lifecycle(rep, family, version, osr.get("PRETTY_NAME", ""), now.date())
    state = _kv(sections.get("patch_state", ""))
    manager = state.get("manager", "none")
    items, pending = _linux_patches(sections, manager)
    last = state.get("last_install", "")
    last_date = _install_date(last)
    reboot = sections.get("reboot_required", "").splitlines()[:1]
    patches = {
        # zypper prints repository messages instead of a table when it cannot reach its repositories
        "checked": manager in ("apt", "rpm", "zypper")
        and "patches" in sections
        and not (
            manager == "zypper" and sections["patches"].strip() and "|" not in sections["patches"]
        ),
        "pending": max(pending, len(items)),
        "security": sum(1 for i in items if i["security"]),
        "critical": sum(1 for i in items if i["severity"].lower() == "critical"),
        "last_patched": last_date.date().isoformat() if last_date else None,
        "days_since_patch": (now.date() - last_date.date()).days if last_date else None,
        "reboot_pending": bool(reboot and reboot[0].strip() == "yes"),
        "auto_updates": _i(state.get("auto_updates")) > 0 if "auto_updates" in state else None,
        "items": items,
        "installed": [],
        "manager": manager,
        "packages": _i(state.get("packages")),
    }
    _patch_findings(
        rep,
        patches,
        "Run the script as root (sudo) on a server that can reach its package repositories.",
    )
    if patches["auto_updates"] is False:
        rep.add(
            "auto-updates",
            "low",
            "Patching",
            "Automatic security updates are not configured",
            "Security patches are installed only when someone does it by hand.",
            "Enable unattended-upgrades (Debian/Ubuntu) or dnf-automatic (RHEL family) for security updates.",
        )
    counts = _kv(sections.get("journal_counts", ""))
    top: dict[str, dict[str, Any]] = {}
    for line in sections.get("journal_errors", "").splitlines():
        m = re.match(r"^(\S+)\s+\S+\s+([^:\[\s]+)(?:\[\d+\])?:\s*(.*)$", line)
        if not m:
            continue
        unit, message = m.group(2)[:80], re.sub(r"\d+", "#", m.group(3))[:160]
        entry = top.setdefault(
            f"{unit}|{message}",
            {
                "source": unit,
                "id": "",
                "level": "error",
                "count": 0,
                "last": m.group(1)[:25],
                "message": m.group(3)[:300],
            },
        )
        entry["count"] += 1
        entry["last"] = m.group(1)[:25]
    kernel_log = sections.get("kernel_log", "")
    logs: dict[str, Any] = {
        "critical": _i(counts.get("2")),
        "errors": _i(counts.get("3")),
        "warnings": _i(counts.get("4")),
        "top": sorted(top.values(), key=lambda e: -e["count"])[:25],
    }
    if logs["critical"]:
        rep.add(
            "events-critical",
            "medium",
            "Logs",
            f"{logs['critical']} critical log entries in the last 7 days",
            "Critical entries usually mean a failing device, a crashed service or the kernel protecting itself.",
            "Review them: journalctl -p 2 --since '7 days ago'",
        )
    if logs["errors"] > 500:
        rep.add(
            "events-errors",
            "medium",
            "Logs",
            f"{logs['errors']:,} error log entries in the last 7 days",
            "A high error rate hides real problems and often points at one misbehaving service.",
            "Fix the most frequent error first (see Errors and warnings).",
        )
    oom = _i(sections.get("oom_kills"))
    if oom:
        rep.add(
            "oom",
            "high",
            "Memory",
            f"The kernel killed processes for lack of memory ({oom} time(s) in 30 days)",
            "An out-of-memory kill stops whatever process the kernel picks, often the database or application.",
            "Add memory, limit the memory of the services, or move a workload off the server.",
        )
    if DISK_ERRORS.search(kernel_log) or DISK_ERRORS.search(sections.get("journal_errors", "")):
        rep.add(
            "disk-errors",
            "high",
            "Storage",
            "Disk or file system errors in the kernel log",
            "The kernel reports I/O or file system errors.",
            "Check the disk (smartctl, cloud disk metrics) and run a file system check in a maintenance window.",
        )
    failed = [
        {"name": line.split()[0][:120], "display_name": line.split()[0][:120], "state": "failed"}
        for line in sections.get("failed_units", "").splitlines()[:40]
        if line.split()
    ]
    if failed:
        rep.add(
            "services",
            "medium",
            "Services",
            f"{len(failed)} systemd unit(s) failed",
            ", ".join(f["name"] for f in failed[:6]),
            "Check each one: systemctl status <unit> and journalctl -u <unit>",
        )
    ssh: dict[str, str] = {}
    for line in sections.get("sshd", "").splitlines():
        parts = line.strip().split()
        if len(parts) >= 2:
            ssh.setdefault(parts[0].lower(), parts[1].lower())
    if ssh:
        root_login = ssh.get("permitrootlogin")
        rep.check(
            "ssh-root",
            "SSH root login disabled",
            root_login != "yes" if root_login else None,
            root_login or "",
        )
        if root_login == "yes":
            rep.add(
                "ssh-root",
                "high",
                "Security",
                "SSH allows root to sign in with a password",
                "Attackers try root first; a direct root login leaves no trace of who signed in.",
                "Set PermitRootLogin no (or prohibit-password) in /etc/ssh/sshd_config and reload sshd.",
            )
        pw_auth = ssh.get("passwordauthentication")
        rep.check(
            "ssh-password",
            "SSH password sign-in disabled",
            pw_auth != "yes" if pw_auth else None,
            pw_auth or "",
        )
        if pw_auth == "yes":
            rep.add(
                "ssh-password",
                "medium",
                "Security",
                "SSH allows password sign-in",
                "Passwords can be guessed or reused; keys cannot be brute-forced the same way.",
                "Use SSH keys and set PasswordAuthentication no.",
            )
        if ssh.get("permitemptypasswords") == "yes":
            rep.add(
                "ssh-empty",
                "critical",
                "Security",
                "SSH allows empty passwords",
                "Any account without a password can sign in remotely.",
                "Set PermitEmptyPasswords no immediately.",
            )
    else:
        rep.check("ssh-root", "SSH configuration", None, "Not readable (run the script as root).")
    fw = _kv(sections.get("firewall", ""))
    active = None
    if fw:
        active = (
            ("active" in fw.get("ufw", "").lower() and "inactive" not in fw.get("ufw", "").lower())
            or fw.get("firewalld", "") == "running"
            or _i(fw.get("nft_rules")) > 3
            or _i(fw.get("iptables_rules")) > 0
        )
    rep.check("firewall", "Host firewall active", active)
    if active is False:
        rep.add(
            "firewall",
            "medium",
            "Security",
            "No host firewall is active",
            "The server relies only on network rules outside it.",
            "Enable ufw or firewalld with a default-deny inbound policy.",
        )
    mac = sections.get("mac", "").lower()
    if "selinux" in mac:
        enforcing = "enforcing" in mac
        rep.check("mac", "SELinux enforcing", enforcing, mac.replace("\n", ", ")[:60])
        if not enforcing:
            rep.add(
                "mac",
                "low",
                "Security",
                "SELinux is not enforcing",
                "SELinux limits what a compromised service can do.",
                "Set SELINUX=enforcing after checking the audit log for denials.",
            )
    elif "apparmor" in mac:
        rep.check("mac", "AppArmor enabled", "apparmor enabled" in mac)
    acct = _kv(sections.get("accounts", ""))
    uid0 = [
        line.split()[1][:60]
        for line in sections.get("accounts", "").splitlines()
        if line.startswith("uid0 ") and len(line.split()) > 1
    ]
    extra = [u for u in uid0 if u != "root"]
    rep.check("uid0", "Only root has user ID 0", not extra, ", ".join(extra))
    if extra:
        rep.add(
            "uid0",
            "critical",
            "Security",
            f"Accounts other than root have user ID 0: {', '.join(extra)}",
            "These accounts are root in everything but name.",
            "Remove the accounts or give them a normal user ID.",
        )
    empty = acct.get("empty_passwords", "")
    if empty.isdigit():
        rep.check(
            "empty-passwords",
            "No account with an empty password",
            int(empty) == 0,
            f"{empty} account(s)",
        )
        if int(empty) > 0:
            rep.add(
                "empty-passwords",
                "critical",
                "Security",
                f"{empty} account(s) have an empty password",
                "Anyone can sign in to these accounts.",
                "Lock them (passwd -l <user>) or set a password.",
            )
    synced = re.search(r"NTPSynchronized=(\w+)|synchronized:\s*(\w+)", sections.get("time", ""))
    if synced:
        ok = (synced.group(1) or synced.group(2)).lower() == "yes"
        rep.check("time", "Clock synchronised", ok)
        if not ok:
            rep.add(
                "time",
                "low",
                "Operations",
                "The clock is not synchronised",
                "Wrong time breaks authentication, certificates and log correlation.",
                "Enable chrony or systemd-timesyncd.",
            )
    listening = []
    for line in sections.get("listening", "").splitlines()[:80]:
        parts = line.split()
        if len(parts) == 2 and ":" in parts[1]:
            address, _, port = parts[1].rpartition(":")
            if port.isdigit():
                listening.append(
                    {
                        "protocol": parts[0][:6],
                        "port": int(port),
                        "address": address[:60],
                        "process": "",
                    }
                )
    _ports(rep, listening)
    if not d.get("root"):
        rep.add(
            "not-root",
            "low",
            "Collection",
            "The script was not run as root",
            "Logs, SSH settings, accounts and patch information may be incomplete.",
            "Run it again with sudo for a complete report.",
        )
    kernels = sections.get("kernels", "")
    running = re.search(r"running (\S+)", kernels)
    vulns = [
        {"id": c, "severity": i["severity"] or "Unrated", "source": i["name"]}
        for i in items
        for c in i["cves"]
    ][:MAX_ITEMS]
    vulns += [
        {"id": i["id"], "severity": i["severity"], "source": i["name"]}
        for i in items
        if i["security"] and not i["cves"] and re.match(r"^[A-Z]+-\d{4}", i["id"])
    ][: MAX_ITEMS - len(vulns)]
    return _finish(
        rep,
        {
            "platform": "linux",
            "collected_at": _s(d.get("collected_at"), 30),
            "complete": bool(d.get("root")),
            "os": {
                "name": _s(osr.get("PRETTY_NAME") or osr.get("NAME"), 120),
                "version": _s(osr.get("VERSION_ID"), 40),
                "kernel": _s(running.group(1) if running else sections.get("uname", ""), 120),
                "hostname": _s(sections.get("hostname"), 120),
                "architecture": _s((sections.get("uname", "").split() or [""])[-1], 20),
                "uptime_days": uptime_days,
                "last_boot": "",
                "virtualization": _s(sections.get("virtualization"), 40),
                "domain": "",
                "lifecycle": life,
                "roles": [],
            },
            "cpu": cpu,
            "memory": memory,
            "disks": disks,
            "patches": patches,
            "vulnerabilities": vulns,
            "logs": logs,
            "services": {"failed": failed},
            "network": {"listening": listening},
            "accounts": {
                "administrators": [a for a in acct.get("admins", "").split(",") if a][:50],
                "policy": [f"Accounts that can sign in: {acct.get('login_users', '?')}"],
            },
        },
    )


def analyze(
    text: str, family: str, version: str, now: datetime | None = None
) -> tuple[str, dict[str, Any], dict[str, Any]]:
    """(platform, raw data, summary) for a pasted script output."""
    platform, data = parse_output(text)
    now = now or datetime.now(UTC)
    summary = (
        analyze_windows(data, family, version, now)
        if platform == "windows"
        else analyze_linux(data, family, version, now)
    )
    return platform, data, summary
