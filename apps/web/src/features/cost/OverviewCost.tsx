import { ArrowRight, Coins, Flame, PiggyBank, Target } from 'lucide-react';
import { Link } from 'react-router-dom';
import { EChart } from '@/components/charts/echarts';
import { baseOption, compactMoney, money, shortDate, useChartTheme, softFill } from '@/components/charts/theme';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/misc';
import { useCostSummary, type CostSummary } from './api';
import { Delta } from './components';

function TrendChart({ s }: { s: CostSummary }) {
  const t = useChartTheme();
  const dates = [...s.trend.map((p) => p.date), ...s.forecast.map((p) => p.date)];
  const n = s.trend.length;
  const pad = (k: number) => Array<null>(k).fill(null);
  const lower = [...pad(n), ...s.forecast.map((p) => p.p10)];
  const width = [...pad(n), ...s.forecast.map((p) => p.p90 - p.p10)];
  const option = {
    ...baseOption(t),
    grid: { left: 4, right: 8, top: 8, bottom: 4, containLabel: true },
    tooltip: {
      ...(baseOption(t).tooltip as object),
      trigger: 'axis',
      formatter: (items: { dataIndex: number }[]) => {
        const i = items[0]?.dataIndex ?? 0;
        const f = s.forecast[i - n];
        return i < n
          ? `${shortDate(dates[i] ?? '')}<br/><b>${money(s.trend[i]?.cost, s.currency)}</b> actual`
          : `${shortDate(dates[i] ?? '')}<br/><b>${money(f?.p50, s.currency)}</b> forecast<br/>${money(f?.p10, s.currency)} – ${money(f?.p90, s.currency)}`;
      },
    },
    xAxis: {
      ...(baseOption(t).xAxis as object),
      type: 'category',
      boundaryGap: false,
      data: dates.map(shortDate),
      axisLabel: { color: t.muted, fontSize: 10, interval: 20 },
    },
    yAxis: {
      ...(baseOption(t).yAxis as object),
      type: 'value',
      scale: true,
      axisLabel: { color: t.muted, fontSize: 10, formatter: (v: number) => compactMoney(v, s.currency) },
    },
    series: [
      { type: 'line', stack: 'b', symbol: 'none', lineStyle: { opacity: 0 }, data: lower, silent: true },
      { type: 'line', stack: 'b', symbol: 'none', lineStyle: { opacity: 0 }, areaStyle: { color: t.band }, data: width, silent: true },
      { name: 'Actual', type: 'line', symbol: 'none', lineStyle: { width: 2, color: t.series[0] }, areaStyle: { color: softFill(t) }, data: [...s.trend.map((p) => p.cost), ...pad(s.forecast.length)] },
      {
        name: 'Forecast',
        type: 'line',
        symbol: 'none',
        lineStyle: { width: 2, type: 'dashed', color: t.series[0] },
        data: [...pad(n - 1), s.trend[n - 1]?.cost ?? null, ...s.forecast.map((p) => p.p50)],
      },
    ],
  };
  return <EChart option={option} height={170} ariaLabel="Daily cost for 90 days with the forecast" />;
}

/** Overview block (plan 9.1): month-to-date, month-end forecast, savings, trend, top 5 savings. */
export function OverviewCost() {
  const { data: s, isPending } = useCostSummary();
  if (isPending) return <Skeleton className="h-64" />;
  if (!s?.available) return null;
  const vsLast = s.previous_month ? (100 * ((s.forecast_month_end ?? 0) - s.previous_month)) / s.previous_month : null;
  const mtdVs = s.previous_month_same_days ? (100 * (s.mtd - s.previous_month_same_days)) / s.previous_month_same_days : null;
  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div>
          <CardTitle>Cost</CardTitle>
          <CardDescription>Actual cost, billing currency {s.currency}{s.data_through ? `, through ${shortDate(s.data_through)}` : ''}.</CardDescription>
        </div>
        <Link to="/app/cost" className="inline-flex items-center gap-1 text-sm text-brand-strong hover:underline">
          Cost explorer <ArrowRight className="size-3.5" />
        </Link>
      </CardHeader>
      <CardContent className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1.4fr)_minmax(0,1.1fr)]">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 lg:grid-cols-1">
          <div>
            <div className="flex items-center gap-1.5 text-xs font-medium text-muted">
              <Coins className="size-3.5" aria-hidden /> Month to date
            </div>
            <div className="mt-1 kpi-value">{money(s.mtd, s.currency)}</div>
            <div className="text-xs text-muted">
              <Delta pct={mtdVs} /> vs same days last month
            </div>
          </div>
          <div>
            <div className="flex items-center gap-1.5 text-xs font-medium text-muted">
              <Target className="size-3.5" aria-hidden /> Month-end forecast
            </div>
            <div className="mt-1 kpi-value">{money(s.forecast_month_end, s.currency)}</div>
            <div className="text-xs text-muted">
              <Delta pct={vsLast} /> vs last month ({money(s.previous_month, s.currency)})
            </div>
          </div>
          <Link to="/app/cost/rightsizing" className="rounded-md focus-visible:outline-2">
            <div className="flex items-center gap-1.5 text-xs font-medium text-muted">
              <PiggyBank className="size-3.5" aria-hidden /> Potential savings
            </div>
            <div className="mt-1 kpi-value text-success-strong">{money(s.potential_savings, s.currency)}</div>
            <div className="text-xs text-muted">per month · {money(s.potential_savings * 12, s.currency)} per year</div>
          </Link>
        </div>
        <div className="min-w-0">
          <div className="mb-1 flex items-center justify-between text-xs font-medium text-muted">
            <span>Cost trend with forecast</span>
            {s.open_anomalies > 0 && (
              <Link to="/app/cost/anomalies">
                <Badge tone="danger">
                  <Flame aria-hidden /> {s.open_anomalies} anomal{s.open_anomalies === 1 ? 'y' : 'ies'}
                </Badge>
              </Link>
            )}
          </div>
          <TrendChart s={s} />
        </div>
        <div className="min-w-0">
          <div className="mb-2 text-xs font-medium text-muted">Top 5 savings</div>
          <ol className="space-y-1.5">
            {s.top_savings.map((item, i) => (
              <li key={`${item.kind}-${item.ref}`}>
                <Link to={item.link} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-surface-2">
                  <span className="w-4 text-xs tabular text-subtle">{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate" title={item.title}>
                    {item.title}
                  </span>
                  <span className="shrink-0 font-medium tabular text-success-strong">{money(item.monthly_saving, s.currency)}</span>
                </Link>
              </li>
            ))}
          </ol>
        </div>
      </CardContent>
    </Card>
  );
}
