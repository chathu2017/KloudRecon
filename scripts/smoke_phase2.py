r"""Phase 2 smoke test against the RUNNING local stack (API, worker, web, Docker services).

Requires `seed-dev` and `seed-demo`. Goes through the Vite proxy on :5173 like the browser:
Demo Mode data (overview, inventory, orphans, changes, compare, export), Scan now with live SSE
progress until the worker finishes, a live connection validation against Microsoft Entra ID
(a made-up tenant → friendly error, secret never echoed), and role checks.

    cd backend; .\.venv\Scripts\python.exe ..\scripts\smoke_phase2.py
"""

from __future__ import annotations

import json
import threading
import time
import uuid

import httpx

WEB = "http://localhost:5173"
results: list[tuple[str, bool, str]] = []


def check(name: str, ok: bool, detail: str = "") -> None:
    results.append((name, ok, detail))
    print(f"[{'PASS' if ok else 'FAIL'}] {name} {detail}")


def login(c: httpx.Client, email: str) -> dict[str, str]:
    r = c.post(f"{WEB}/api/v1/auth/dev/login", json={"email": email, "name": ""})
    r.raise_for_status()
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def listen(headers: dict[str, str], seen: list[dict[str, object]], stop: threading.Event) -> None:
    try:
        with (
            httpx.Client(timeout=None) as c,
            c.stream("GET", f"{WEB}/api/v1/events/stream", headers=headers) as r,
        ):
            for line in r.iter_lines():
                if stop.is_set():
                    return
                if line.startswith("data:"):
                    try:
                        seen.append(json.loads(line[5:].strip()))
                    except json.JSONDecodeError:
                        continue
    except httpx.HTTPError:
        return


with httpx.Client(timeout=30) as c:
    ready = c.get(f"{WEB}/api/v1/health/ready")
    check("API ready (DB + queue)", ready.status_code == 200, str(ready.status_code))

    demo = login(c, "demo@contoso.test")
    ov = c.get(f"{WEB}/api/v1/overview", headers=demo).json()
    check(
        "demo overview",
        ov["counts"]["resources"] > 550 and len(ov["history"]) >= 4,
        f"resources={ov['counts']['resources']} scans={len(ov['history'])} "
        f"orphans={ov['counts'].get('orphans')}",
    )
    page = c.get(f"{WEB}/api/v1/resources", params={"limit": 50}, headers=demo).json()
    check("inventory page", len(page["items"]) == 50 and page["next_cursor"], f"total={page['total']}")
    vms = c.get(
        f"{WEB}/api/v1/resources",
        params={"type": "microsoft.compute/virtualmachines", "q": "jumpbox"},
        headers=demo,
    ).json()["items"]
    detail = c.get(
        f"{WEB}/api/v1/resources/detail", params={"arm_id": vms[0]["arm_id"]}, headers=demo
    ).json()
    check(
        "resource detail + related + portal link",
        bool(detail["related"]) and detail["portal_url"].startswith("https://portal.azure.com"),
        f"related={len(detail['related'])}",
    )
    orphans = c.get(f"{WEB}/api/v1/resources/orphans", headers=demo).json()
    check("orphaned resources", len(orphans["items"]) > 10, str(orphans["by_category"]))
    changes = c.get(f"{WEB}/api/v1/changes", params={"days": 30}, headers=demo).json()
    check(
        "changes timeline with callers",
        bool(changes["items"]) and any(ch["caller"] for ch in changes["items"]),
        f"items={len(changes['items'])}",
    )
    scans = [
        s
        for s in c.get(f"{WEB}/api/v1/scans", headers=demo).json()
        if s["status"] in ("succeeded", "partial")
    ]
    cmp = c.get(
        f"{WEB}/api/v1/compare", params={"from": scans[1]["id"], "to": scans[0]["id"]}, headers=demo
    ).json()
    check("compare scans", cmp["counts"]["added"] >= 1, str(cmp["counts"]))
    export = c.get(f"{WEB}/api/v1/resources/export", params={"format": "csv"}, headers=demo)
    check(
        "CSV export",
        export.status_code == 200 and export.text.count("\n") > 550,
        f"{len(export.content)} bytes",
    )

    viewer = login(c, "viewer@contoso.test")
    conn = c.get(f"{WEB}/api/v1/connections", headers=demo).json()[0]
    r = c.post(f"{WEB}/api/v1/scans", json={"connection_id": conn["id"]}, headers=viewer)
    check("viewer cannot start scans", r.status_code == 403, str(r.status_code))

    # Scan now → live SSE progress → worker completes the scan.
    seen: list[dict[str, object]] = []
    stop = threading.Event()
    t = threading.Thread(target=listen, args=(demo, seen, stop), daemon=True)
    t.start()
    time.sleep(1.5)
    r = c.post(f"{WEB}/api/v1/scans", json={"connection_id": conn["id"]}, headers=demo)
    if r.status_code == 429:
        check("scan now (cooldown active, rerun in 15 min)", True, r.json()["error"]["message"])
    else:
        check("scan now queued", r.status_code == 202, str(r.status_code))
        scan_id = r.json()["id"]
        deadline = time.time() + 180
        done = False
        while time.time() < deadline and not done:
            time.sleep(1)
            done = any(
                e.get("type") in ("scan.completed", "scan.failed")
                and (e.get("payload") or {}).get("scan_id") == scan_id  # type: ignore[union-attr]
                for e in seen
            )
        progress = [
            e for e in seen
            if e.get("type") == "scan.progress"
            and (e.get("payload") or {}).get("scan_id") == scan_id  # type: ignore[union-attr]
        ]
        check("live progress over SSE", len(progress) >= 10, f"{len(progress)} progress events")
        final = c.get(f"{WEB}/api/v1/scans/{scan_id}", headers=demo).json()
        check(
            "worker finished the scan",
            done and final["status"] == "succeeded",
            f"status={final['status']} stages={[s['status'] for s in final['stages']]}",
        )
        ch = final["stats"].get("changes", {})
        check("rescan detects changes", ch.get("created", 0) + ch.get("modified", 0) > 0, str(ch))
        notes = c.get(f"{WEB}/api/v1/notifications", headers=demo).json()["items"]
        check("scan notification", any("Scan finished" in n["title"] for n in notes))
    stop.set()

    # Live validation against Microsoft Entra ID with a made-up tenant.
    admin = login(c, "admin@acme.test")
    for existing in c.get(f"{WEB}/api/v1/connections", headers=admin).json():
        if existing["name"] == "Smoke test":
            c.delete(f"{WEB}/api/v1/connections/{existing['id']}", headers=admin)
    secret = f"kr~Smoke-{uuid.uuid4().hex[:12]}.Value"
    r = c.post(
        f"{WEB}/api/v1/connections",
        json={
            "name": "Smoke test",
            "tenant_id": str(uuid.uuid4()),
            "client_id": str(uuid.uuid4()),
            "client_secret": secret,
            "secret_expires_on": "2027-09-01",
        },
        headers=admin,
        timeout=40,
    )
    body = r.json()
    msg = body["validation"]["checks"][0]["message"] if r.status_code == 201 else r.text
    check(
        "live validation: friendly Entra error",
        r.status_code == 201 and body["connection"]["status"] == "invalid",
        msg[:120],
    )
    check("secret never echoed", secret not in r.text)
    if r.status_code == 201:
        d = c.delete(f"{WEB}/api/v1/connections/{body['connection']['id']}", headers=admin)
        check("delete connection", d.status_code == 204, str(d.status_code))

failed = [n for n, ok, _ in results if not ok]
print(f"\n{len(results) - len(failed)}/{len(results)} checks passed")
raise SystemExit(1 if failed else 0)
