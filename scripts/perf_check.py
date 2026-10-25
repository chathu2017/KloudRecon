"""Dashboard API latency on Demo Mode data (Phase 5 hardening: P95 < 300 ms).

Run against a running local API (after `seed-demo`):
    cd backend; .\\.venv\\Scripts\\python.exe ..\\scripts\\perf_check.py [--runs 30] [--budget 300]

Each endpoint is called once to warm caches, then `--runs` times sequentially as the demo admin.
Prints P50/P95/max per endpoint and exits 1 when any P95 is above the budget.
Standard library only.
"""

from __future__ import annotations

import argparse
import json
import statistics
import sys
import time
import urllib.request

# The pages people open most: Overview first, then the module landing pages.
ENDPOINTS = [
    "/api/v1/overview",
    "/api/v1/me",
    "/api/v1/billing",
    "/api/v1/features",
    "/api/v1/announcements",
    "/api/v1/notifications",
    "/api/v1/scans?limit=10",
    "/api/v1/resources?limit=100",
    "/api/v1/resources/facets",
    "/api/v1/changes/summary",
    "/api/v1/security/summary",
    "/api/v1/security/findings?limit=50",
    "/api/v1/security/attack-paths",
    "/api/v1/compliance/frameworks",
    "/api/v1/scores/history",
    "/api/v1/costs/summary",
    "/api/v1/costs/explorer",
    "/api/v1/costs/forecast",
    "/api/v1/recommendations",
    "/api/v1/ai/summary",
    "/api/v1/reports",
    "/api/v1/alerts/rules",
]


def call(base: str, path: str, token: str) -> float:
    req = urllib.request.Request(base + path, headers={"Authorization": f"Bearer {token}"})
    started = time.perf_counter()
    with urllib.request.urlopen(req, timeout=30) as resp:
        resp.read()
        if resp.status != 200:
            raise RuntimeError(f"{path} -> {resp.status}")
    return (time.perf_counter() - started) * 1000


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawTextHelpFormatter)
    ap.add_argument("--base", default="http://127.0.0.1:8000")
    ap.add_argument("--email", default="demo@contoso.test")
    ap.add_argument("--runs", type=int, default=30)
    ap.add_argument("--budget", type=float, default=300.0, help="P95 budget in ms")
    args = ap.parse_args()

    login = urllib.request.Request(
        args.base + "/api/v1/auth/dev/login",
        data=json.dumps({"email": args.email}).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(login, timeout=30) as resp:
        token = json.loads(resp.read())["access_token"]

    failed = []
    print(f"{'endpoint':45} {'p50':>7} {'p95':>7} {'max':>7}  (ms, {args.runs} runs)")
    for path in ENDPOINTS:
        call(args.base, path, token)  # warm-up
        samples = sorted(call(args.base, path, token) for _ in range(args.runs))
        p50 = statistics.median(samples)
        p95 = samples[max(0, int(round(0.95 * len(samples))) - 1)]
        mark = "" if p95 <= args.budget else "  <-- over budget"
        print(f"{path:45} {p50:7.0f} {p95:7.0f} {samples[-1]:7.0f}{mark}")
        if p95 > args.budget:
            failed.append(path)
    if failed:
        print(f"\n{len(failed)} endpoint(s) above the {args.budget:.0f} ms P95 budget.")
        return 1
    print(f"\nAll endpoints within the {args.budget:.0f} ms P95 budget.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
