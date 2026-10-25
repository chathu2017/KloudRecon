r"""Phase 1 smoke test against the RUNNING local stack (API, worker, web, Docker services).

Goes through the Vite proxy on :5173 like the browser: dev logins for the seeded users, access
gate, a new sign-up, owner approval pushed live over SSE, and the emails in Mailpit.

    cd backend; .\.venv\Scripts\python.exe ..\scripts\smoke_local.py
"""

from __future__ import annotations

import json
import threading
import time
import uuid

import httpx

WEB = "http://localhost:5173"
MAILPIT = "http://localhost:8025"
results: list[tuple[str, bool, str]] = []


def check(name: str, ok: bool, detail: str = "") -> None:
    results.append((name, ok, detail))
    print(f"[{'PASS' if ok else 'FAIL'}] {name} {detail}")


def login(c: httpx.Client, email: str) -> dict[str, str]:
    r = c.post(f"{WEB}/api/v1/auth/dev/login", json={"email": email, "name": ""})
    r.raise_for_status()
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


with httpx.Client(timeout=15) as c:
    mail_before = c.get(f"{MAILPIT}/api/v1/messages").json().get("total", 0)

    # 1) Dev login for the three seeded users
    expected = {
        "owner@local.test": ("active", True),
        "admin@acme.test": ("active", False),
        "pending@new.test": ("pending_approval", False),
    }
    for email, (state, owner) in expected.items():
        me = c.get(f"{WEB}/api/v1/me", headers=login(c, email)).json()
        check(
            f"dev login {email}",
            me["state"] == state and me["is_platform_owner"] == owner,
            f"state={me['state']} owner={me['is_platform_owner']}",
        )

    # 2) Non-active users get 403 on data APIs
    r = c.get(f"{WEB}/api/v1/org", headers=login(c, "pending@new.test"))
    check(
        "pending user blocked from data API",
        r.status_code == 403,
        f"{r.status_code} {r.json()['error']['code']}",
    )
    r = c.get(f"{WEB}/api/v1/org", headers=login(c, "admin@acme.test"))
    check("active user reaches data API", r.status_code == 200, str(r.status_code))

    # 3) New sign-up → onboarding → pending
    email = f"jane.{uuid.uuid4().hex[:6]}@contoso.test"
    jane = login(c, email)
    me = c.get(f"{WEB}/api/v1/me", headers=jane).json()
    check("new identity is profile_incomplete", me["state"] == "profile_incomplete")
    r = c.post(
        f"{WEB}/api/v1/onboarding",
        headers=jane,
        json={
            "name": "Jane Doe",
            "company": "Contoso E2E",
            "country": "Germany",
            "job_title": "CTO",
            "phone": "+49 30 1234",
            "company_size": "51-200",
            "industry": "Finance",
            "use_case": "Security posture review before our ISO audit.",
            "accept_terms": True,
        },
    )
    check("onboarding submitted", r.status_code == 201, str(r.status_code))
    org_id = r.json()["org"]["id"]
    check("sign-up waits for approval", r.json()["state"] == "pending_approval")

    # 4) Live SSE listener for Jane (pending users can listen)
    events: list[dict[str, object]] = []

    def listen() -> None:
        with httpx.stream("GET", f"{WEB}/api/v1/events/stream", headers=jane, timeout=30) as s:
            for line in s.iter_lines():
                if line.startswith("data:"):
                    events.append(json.loads(line[5:]))
                if any(e.get("type") == "account.status" for e in events):
                    return

    t = threading.Thread(target=listen, daemon=True)
    t.start()
    time.sleep(1.5)

    # 5) Appears in the owner queue; approve
    owner = login(c, "owner@local.test")
    queue = c.get(f"{WEB}/api/v1/owner/registrations", headers=owner).json()
    check("sign-up appears in owner queue", any(q["org"]["id"] == org_id for q in queue))
    r = c.post(
        f"{WEB}/api/v1/owner/registrations/{org_id}/approve",
        headers=owner,
        json={"plan_code": "trial", "trial_days": 14},
    )
    check("owner approves", r.status_code == 200, r.json().get("status", ""))

    t.join(timeout=10)
    check(
        "approval pushed live over SSE",
        any(e.get("type") == "account.status" for e in events),
        f"events={[e.get('type') for e in events]}",
    )

    # 6) Customer can reach the app
    me = c.get(f"{WEB}/api/v1/me", headers=jane).json()
    check("customer is active after approval", me["state"] == "active", me["state"])
    r = c.get(f"{WEB}/api/v1/org", headers=jane)
    check("customer reaches data API", r.status_code == 200, str(r.status_code))
    notes = c.get(f"{WEB}/api/v1/notifications", headers=jane).json()
    check(
        "customer has in-app notification", notes["unread_count"] >= 1, str(notes["unread_count"])
    )

    # 7) Emails delivered by the worker to Mailpit
    welcome = None
    for _ in range(30):
        msgs = c.get(f"{MAILPIT}/api/v1/search", params={"query": f"to:{email}"}).json()
        subjects = [m["Subject"] for m in msgs.get("messages", [])]
        welcome = next((s for s in subjects if "approved" in s.lower()), None)
        if welcome:
            break
        time.sleep(1)
    check("welcome email in Mailpit", welcome is not None, str(welcome))
    owner_mail = c.get(
        f"{MAILPIT}/api/v1/search", params={"query": 'subject:"New registration: Contoso E2E"'}
    ).json()
    check("owner got new-registration email", owner_mail.get("messages_count", 0) >= 1)
    total = c.get(f"{MAILPIT}/api/v1/messages").json().get("total", 0)
    check("emails sent in this run", total - mail_before >= 3, f"{total - mail_before} new")

failed = [r for r in results if not r[1]]
print(f"\n{len(results) - len(failed)}/{len(results)} checks passed")
raise SystemExit(1 if failed else 0)
