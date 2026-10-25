import { Link } from 'react-router-dom';
import { EChart } from '@/components/charts/echarts';
import { baseOption, compactMoney, money, shortDate, useChartTheme, softFill } from '@/components/charts/theme';
import { Skeleton } from '@/components/ui/misc';
import { useResourceCost } from './api';
import { ConfidenceBadge, Delta, SkuChange, UsageBar } from './components';

const METRIC_LABEL: Record<string, string> = { cpu: 'CPU', memory: 'Memory' };

/** Resource drawer: 90 days of cost, meters, utilization sparklines and rightsizing. */
export default function ResourceCostPanel({ armId }: { armId: string }) {
  const { data, isPending } = useResourceCost(armId);
  const t = useChartTheme();
  if (isPending) return <Skeleton className="h-64" />;
  if (!data) return <p className="text-sm text-muted">Cost data is not available.</p>;
  const pct = data.previous30 > 0 ? (100 * (data.last30 - data.previous30)) / data.previous30 : null;
  const option = {
    ...baseOption(t),
    grid: { left: 4, right: 8, top: 8, bottom: 4, containLabel: true },
    tooltip: { ...(baseOption(t).tooltip as object), trigger: 'axis', valueFormatter: (v: number) => money(v, data.currency, 2) },
    xAxis: { ...(baseOption(t).xAxis as object), type: 'category', data: data.daily.map((p) => shortDate(p.date)), axisLabel: { color: t.muted, fontSize: 10, interval: 29 } },
    yAxis: { ...(baseOption(t).yAxis as object), type: 'value', axisLabel: { color: t.muted, fontSize: 10, formatter: (v: number) => compactMoney(v, data.currency) } },
    series: [{ name: 'Daily cost (amortized)', type: 'bar', barCategoryGap: '20%', itemStyle: { color: t.series[0], borderRadius: [2, 2, 0, 0] }, data: data.daily.map((p) => p.cost) }],
  };
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <div className="text-xs text-muted">Last 30 days (amortized)</div>
          <div className="kpi-value">{money(data.last30, data.currency, 2)}</div>
          <div className="text-xs text-muted">
            <Delta pct={pct} /> vs previous 30 days
          </div>
        </div>
        <div>
          <div className="text-xs text-muted">By meter category</div>
          <ul className="mt-1 space-y-0.5 text-sm">
            {data.meters.slice(0, 3).map((m) => (
              <li key={m.key} className="flex justify-between gap-2">
                <span className="truncate">{m.label}</span>
                <span className="tabular text-muted">{money(m.cost, data.currency, 2)}</span>
              </li>
            ))}
            {!data.meters.length && <li className="text-muted">No charges in 30 days.</li>}
          </ul>
        </div>
      </div>
      <EChart option={option} height={140} ariaLabel="Daily cost for 90 days" />
      {data.metrics.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold">Utilization (30 days, hourly)</h3>
          <div className="space-y-3">
            {data.metrics.map((m) => {
              const line = {
                grid: { left: 0, right: 0, top: 2, bottom: 2 },
                xAxis: { type: 'category', show: false, data: m.series.map((_, i) => i) },
                yAxis: { type: 'value', show: false, min: 0, max: 100 },
                tooltip: { ...(baseOption(t).tooltip as object), trigger: 'axis', valueFormatter: (v: number) => `${v.toFixed(1)}%` },
                series: [{ name: `${METRIC_LABEL[m.metric] ?? m.metric} daily average`, type: 'line', symbol: 'none', lineStyle: { width: 2, color: t.series[0] }, areaStyle: { color: softFill(t) }, data: m.series }],
              };
              return (
                <div key={m.metric} className="grid grid-cols-[1fr_140px] items-center gap-3">
                  <div>
                    <UsageBar label={METRIC_LABEL[m.metric] ?? m.metric} value={m.p95} />
                    <div className="mt-0.5 text-[11px] text-muted tabular">
                      avg {m.avg?.toFixed(0)}% · max {m.max?.toFixed(0)}% · {Math.round(m.samples / 24)} days
                    </div>
                  </div>
                  <EChart option={line} height={36} ariaLabel={`${m.metric} utilization sparkline`} />
                </div>
              );
            })}
          </div>
        </div>
      )}
      {data.rightsizing && (
        <div className="rounded-md border border-success/30 bg-success-soft p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm font-medium">Rightsizing: save {money(data.rightsizing.monthly_saving, data.rightsizing.currency)}/month</div>
            <ConfidenceBadge value={data.rightsizing.confidence} />
          </div>
          <div className="mt-2">
            <SkuChange from={data.rightsizing.current_sku} to={data.rightsizing.recommended_sku} />
          </div>
          <p className="mt-2 text-xs text-muted">{data.rightsizing.risk_note}</p>
          <Link to="/app/cost/rightsizing" className="mt-1 inline-block text-xs text-brand-strong hover:underline">
            All rightsizing recommendations
          </Link>
        </div>
      )}
    </div>
  );
}
