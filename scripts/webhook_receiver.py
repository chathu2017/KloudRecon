"""Local test endpoint for KloudRecon webhooks (decision 0037).

Run:  python scripts/webhook_receiver.py [--port 9000] [--secret whsec_...]
Then add a "Signed webhook" channel in Settings → Alerts with the URL
http://localhost:9000/hook (plain http to localhost is allowed outside production) and press
"Test". Each request is printed with its signature check. Standard library only.
"""

from __future__ import annotations

import argparse
import hashlib
import hmac
import json
import time
from http.server import BaseHTTPRequestHandler, HTTPServer


def verify(secret: str, header: str, body: bytes, tolerance: int = 300) -> bool:
    try:
        parts = dict(p.split("=", 1) for p in header.split(","))
        ts = int(parts["t"])
    except (ValueError, KeyError):
        return False
    if abs(time.time() - ts) > tolerance:
        return False
    mac = hmac.new(secret.encode(), f"{ts}.".encode() + body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(mac, parts.get("v1", ""))


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawTextHelpFormatter)
    ap.add_argument("--port", type=int, default=9000)
    ap.add_argument("--secret", default="", help="signing secret shown when the channel was added")
    args = ap.parse_args()

    class Handler(BaseHTTPRequestHandler):
        def do_POST(self) -> None:  # noqa: N802 -- http.server API
            body = self.rfile.read(int(self.headers.get("Content-Length") or 0))
            sig = self.headers.get("X-KloudRecon-Signature", "")
            check = "not signed" if not sig else ("no --secret given" if not args.secret else (
                "VALID" if verify(args.secret, sig, body) else "INVALID"))  # fmt: skip
            print(f"\n--- {self.headers.get('X-KloudRecon-Event', 'message')} · signature {check}")
            try:
                print(json.dumps(json.loads(body), indent=2)[:4000])
            except ValueError:
                print(body[:4000])
            self.send_response(200 if check != "INVALID" else 401)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(b'{"ok":true}')

        def log_message(self, format: str, *a: object) -> None:  # noqa: A002
            return

    print(f"Listening on http://localhost:{args.port}/hook (Ctrl+C to stop)")
    HTTPServer(("127.0.0.1", args.port), Handler).serve_forever()


if __name__ == "__main__":
    main()
