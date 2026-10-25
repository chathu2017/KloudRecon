# 0013 — One AzureGateway protocol; Demo Mode is a synthetic tenant behind it

**Status:** accepted · Phase 2

- Every Azure call goes through `services/azure/gateway.py::AzureGateway` (ARM, Resource Graph,
  Activity Log, Cost Management, Defender, Advisor, Policy, Monitor metrics, Capacity, Graph).
- `RestAzureGateway` implements it with plain REST calls (httpx) instead of many `azure-mgmt-*`
  SDKs: fewer dependencies, one retry/throttling path, and every request is replayable.
- `DemoAzureGateway` implements the same protocol over a deterministic synthetic "Contoso Demo"
  tenant (`services/azure/demo/`): ~590 resources in a hub-spoke landing zone, RBAC, 90 days of
  Activity Log, 13 months of daily cost with seasonality and two anomalies, metrics, Defender
  CVEs/alerts/pricing, Advisor, Policy, reservations, budgets, quotas and Entra ID data.
  Because the demo goes through the real scan pipeline, Demo Mode exercises the same code as real
  customers, and later phases get their data from the same place.
- The demo tenant evolves by **epochs**: epoch N = N scans after the first. Each epoch adds,
  deletes and modifies a few resources (bounded, repeating after 60 epochs) and emits matching
  Activity Log events placed between the two scans, so Changes/Compare work in the demo.
- Free-form Resource Graph KQL is not supported by the demo gateway (only the canonical queries in
  `gateway.py`); later rule engines evaluate stored properties for demo data.
- Demo data uses RFC 5737 IP ranges and the `contoso.example` domain. Titles are our own words.
