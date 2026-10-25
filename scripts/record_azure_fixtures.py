r"""Record sanitized Azure REST fixtures from YOUR test subscription (decision 0014).

Runs the validation checklist and a small inventory/activity query through RestAzureGateway with a
RecordingTransport, then writes backend/tests/fixtures/azure/recorded_<name>.json.

Sanitizing: token responses keep only the `roles` claim; keys that look like secrets are redacted;
the client secret is never written. Response bodies still contain your subscription IDs, resource
names and tags, so review the file before committing it.

    cd backend
    .\.venv\Scripts\python.exe ..\scripts\record_azure_fixtures.py --name mytenant ^
        --tenant <TENANT_ID> --client <CLIENT_ID>
    (the secret is read with a hidden prompt)
"""

from __future__ import annotations

import argparse
import getpass
import json
from datetime import UTC, datetime, timedelta
from pathlib import Path

from kloudrecon.services.azure.fixtures import RecordingTransport
from kloudrecon.services.azure.gateway import INVENTORY_QUERY
from kloudrecon.services.azure.rest import RestAzureGateway
from kloudrecon.services.azure.validation import validate

OUT = Path(__file__).resolve().parents[1] / "backend" / "tests" / "fixtures" / "azure"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--name", required=True, help="fixture name suffix")
    parser.add_argument("--tenant", required=True)
    parser.add_argument("--client", required=True)
    parser.add_argument("--identity", action="store_true", help="also probe Microsoft Graph")
    args = parser.parse_args()
    secret = getpass.getpass("Client secret Value (hidden): ")

    recorder = RecordingTransport()
    gw = RestAzureGateway(
        tenant_id=args.tenant, client_id=args.client, client_secret=secret, transport=recorder
    )
    report = validate(gw, scope={"type": "all"}, tiers={"core": True, "identity": args.identity})
    print(f"Validation: {report.status}")
    for check in report.checks:
        print(f"  [{check.status:4}] {check.label}: {check.message}")
    subs = [s["subscriptionId"] for s in report.subscriptions]
    if subs:
        rows = list(gw.resource_graph(INVENTORY_QUERY, subs[:1], page_size=50))
        print(f"Inventory sample: {len(rows)} resources")
        now = datetime.now(UTC)
        events = list(gw.activity_log(subs[0], now - timedelta(days=1), now))
        print(f"Activity Log (24 h): {len(events)} events")
    path = OUT / f"recorded_{args.name}.json"
    recorder.save(path)
    assert secret not in json.dumps(recorder.recorded)
    print(f"Wrote {path} ({len(recorder.recorded)} interactions). Review it before committing.")


if __name__ == "__main__":
    main()
