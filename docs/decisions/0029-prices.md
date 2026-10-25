# 0029 — Prices for rightsizing, commitments and what-if

**Status:** accepted · Phase 4, steps 1 and 3

- **Source.** VM prices come from the public Azure Retail Prices API
  (`prices.azure.com/api/retail/prices`, no authentication). One request per SKU and region
  returns pay-as-you-go Linux/Windows and 1-/3-year reservation prices. Spot, Low Priority and
  Dev/Test meters are ignored. Reservation prices are term totals, divided by 8,760 or 26,280
  hours. It is a public price list, not the customer's tenant, so it does not go through
  `AzureGateway`.
- **Cache.** Answers are cached in `price_cache`, a platform table without tenant data or RLS,
  for `PRICES_CACHE_DAYS` (default 7), plus a process cache.
- **Fallback.** When the API has no answer or is unreachable, a built-in catalog is used: USD per
  vCPU-hour by series, East US, plus region factors, a Windows license of 0.046/vCPU-hour, and
  reservation factors of 0.62 (1 year) and 0.40 (3 years). Every quote says which source it came
  from ("retail" or "catalog"), and the UI shows it. `PRICES_MODE=static` forces the catalog.
  Tests use this mode.
- **Other services.** App Service plans and SQL Database use the catalog list prices of Phase 3
  (`rules/pricing.py`) with region factors. Their Retail API shapes differ per tier, and a wrong
  match would be worse than a labelled estimate.
- **Reservations cover compute only.** For a Windows VM, the license part stays pay-as-you-go
  in reservation and what-if calculations.
- **Currency.** Cost data is shown in the billing currency. Price-based figures (rightsizing,
  commitments, what-if) are USD list prices. When the billing currency is not USD, those figures
  are labelled "USD list price" instead of being converted with a guessed exchange rate.
