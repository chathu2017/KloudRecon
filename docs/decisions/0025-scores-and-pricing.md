# 0025 — Risk scores, pillar scores and the Phase 3 cost estimate

**Status:** accepted · Phase 3, step 7

- Finding risk follows plan Section 11. Exposure, attack path, privileged identity, sensitive
  data and CVE adjustments apply to security findings; the production +5 applies to every pillar.
  Identity/Entra findings of high or critical severity count as "privileged identity involved".
  Compensating control = the resource has a private endpoint and is not exposed.
- Pillar score = 100 × (1 − Σ risk of open findings / Σ severity weight of evaluated checks),
  counting catalog rules only; custom KQL rules and Defender/Advisor items are shown but not
  scored (their evaluated population is unknown). Open toxic combinations add their risk to the
  security numerator. Pillars without evaluated checks have no score, and the KloudRecon Score is
  renormalised over the pillars that have one.
- Until Phase 4 imports actual cost, Cost Efficiency uses list-price estimates
  (`rules/pricing.py`): run-rate = Σ estimated monthly price of the inventory; savings = Σ
  estimated savings of open cost findings (rules and Advisor). Phase 4 swaps in Cost Management
  data.
