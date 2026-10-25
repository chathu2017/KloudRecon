# 0028 — Forecast model, bands, backtest and anomaly detection

**Status:** accepted · Phase 4, steps 1–2

- **Model.** statsmodels `ETSModel`: additive error, additive damped trend and additive 7-day
  seasonality (Holt-Winters). It is fitted on up to 365 days of daily **actual** cost, up to
  yesterday, because today's charges are still arriving. Before fitting, days more than 5 robust
  standard deviations above the median are replaced by the median of the same weekday, so one
  anomaly does not widen every band. With fewer than 35 days of history, or if the fit fails, a
  seasonal-naive weekly profile with residual bands is used instead.
- **Bands.** The model's 80% prediction interval gives P10/P90, and the mean path is P50.
  Month-end and monthly totals add the daily quantiles. This treats days as fully correlated, a
  deliberately conservative (wider) band that is easy to explain.
- **Blend.** When the Cost Management Forecast API answers, P50 = 65% internal + 35% Azure, and
  the band moves with P50. The artifact records whether Azure was available.
- **Horizon.** To the end of the month three months after the last actual day. That covers the
  current month-end and the next three whole months.
- **Backtest.** The model is refitted without the last 30 days, and those 30 days are forecast
  and compared. It reports the daily MAPE, the MAPE on typical days (excluding outlier days, more
  than 4 robust standard deviations from their weekday's usual level: spikes and purchases), and
  the 30-day total error. The UI leads with the typical-day MAPE and shows the raw MAPE with the
  number of outlier days next to it.
- **Anomalies.** Detection runs on **amortized** daily cost, so monthly reservation purchases do
  not look like spikes, over the last 90 days. Expected = median of the same weekday in the
  previous 4 weeks. Noise = 1.4826 × MAD of the previous 28 days' residuals. A day is anomalous
  when actual − expected > max(4 × noise, 8% of expected, 50 in the billing currency);
  consecutive days merge. Services with at least 20/day are also checked (thresholds 5 × noise,
  35%, 40) when they do not overlap a total anomaly. The root cause is the delta against the
  same-weekday baseline, split service → resource → meter category, with a one-line headline.
  Status (open / acknowledged / resolved / expected) is kept across scans. Owners and admins get
  an in-app notification for new anomalies that ended in the last 7 days (not for seed scans).
