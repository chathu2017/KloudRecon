# 0030 — FinOps pages, charts and optimization rules

**Status:** accepted · Phase 4, steps 2–3

- **Charts.** ECharts (`echarts-for-react`, tree-shaken core, SVG renderer). The theme is read
  from the design tokens at run time and re-read when `data-theme` changes. The categorical order
  is chart tokens 1,5,4,3,2,6,8,7. That order was validated with the dataviz palette checks: every
  adjacent pair is ≥ 6.9 ΔE under colour-vision deficiency, so secondary encoding is used. Dark
  mode has its own chart steps (OKLCH L 0.48–0.67, ≥ 3:1 on the dark surface). A single-hue
  sequential ramp (`--seq-1..6`) drives heatmaps. Stacked areas use a thin surface-coloured
  separator; treemap cells are tinted with the entity hue and labelled in text tokens. Legends are
  opt-in and only shown for two or more series. Forecast bands are drawn as a stacked
  (P90 − P10) area on one axis. There are no dual axes. The explorer offers a table view.
- **Pages.** Cost & FinOps has one sub-navigation: Explorer, Forecast & budgets, Anomalies,
  Rightsizing, Waste, Commitments, What-if, Showback, Savings tracker. The Overview gains a cost
  block (month to date, month-end forecast, potential savings, 90-day trend with forecast, top 5
  savings). The resource drawer gains a lazily loaded Cost tab (90 days, meters, utilization
  sparklines, rightsizing). Findings show "cost at risk" (the resource's last 30 days).
- **Rightsizing.** Rules are documented in `finops/rightsizing.py`. The target must keep
  projected CPU P95 ≤ 70% and projected memory ≤ 85%. Reserved VMs get a note to exchange the
  reservation. Scale sets that belong to AKS are measured on the cluster.
- **Waste finder.** Categories follow plan 9.7.5 and are fed by the cost rules. Three are
  computed: dev/test schedule savings (12 h on weekdays, about 64% less, from billed cost),
  Log Analytics retention beyond 31 days (20% estimate, with the resources that send logs), and
  Hot-tier storage (25% estimate). The headline counts each resource once, at its largest saving.
- **Commitments.** No reservations are recommended for dev/test VMs (schedule them instead).
  Existing reservations with unused capacity for the same size absorb candidates first. The
  savings plan is sized to the P10 of daily eligible spend, so it stays fully used.
- **Potential savings** = rightsizing + waste + 1-year commitments. Cost findings now estimate
  savings from billed cost, and the Cost Efficiency pillar uses the real 30-day run-rate
  (decision 0025 anticipated both).
- **Savings tracker.** "Track saving" records the 30-day baseline of the resource. After at least
  7 days of cost data, realized = baseline − average daily cost since then × 30.4. Items without a
  resource (commitments, manual entries) show the expected saving only.
