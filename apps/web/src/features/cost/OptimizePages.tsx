import * as React from 'react';
import {
  ChevronDown,
  ChevronRight,
  Info,
  PiggyBank,
  Scale,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { money, shortDate } from '@/components/charts/theme';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState, Skeleton, Tooltip } from '@/components/ui/misc';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { typeInfo } from '@/features/inventory/types';
import { useResourceParam } from '@/features/inventory/useResourceParam';
import { SeverityBadge } from '@/features/security/severity';
import { cn } from '@/lib/utils';
import { useCommitments, useRightsizing, useWaste } from './api';
import {
  ConfidenceBadge,
  Kpi,
  PriceSource,
  Segmented,
  SkuChange,
  TrackButton,
  UsageBar,
} from './components';

function num(v: unknown): number | null {
  return typeof v === 'number' ? v : null;
}

// ---- rightsizing ----------------------------------------------------------------------------------
export function RightsizingPage() {
  const { data, isPending } = useRightsizing();
  const [, openResource] = useResourceParam();
  if (isPending) return <Skeleton className="h-96" />;
  if (!data?.items.length)
    return (
      <EmptyState
        icon={<Scale />}
        title="Nothing to rightsize"
        description="Resources use their capacity well, or metrics are not available yet."
      />
    );
  const byType = data.items.reduce<Record<string, number>>((acc, i) => {
    acc[i.resource_type] = (acc[i.resource_type] ?? 0) + i.monthly_saving;
    return acc;
  }, {});
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          icon={PiggyBank}
          label="Monthly saving"
          value={money(data.total_saving, data.currency)}
          tone="success"
          hint={`${money(data.total_saving * 12, data.currency)} per year`}
        />
        <Kpi
          icon={Scale}
          label="Recommendations"
          value={data.items.length}
          hint={`${data.items.filter((i) => i.confidence === 'high').length} with high confidence`}
        />
        {Object.entries(byType)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 2)
          .map(([type, saving]) => (
            <Kpi
              key={type}
              label={typeInfo(type).label}
              value={money(saving, data.currency)}
              hint="monthly saving"
            />
          ))}
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Recommendations</CardTitle>
          <CardDescription>
            From 30 days of hourly Azure Monitor metrics (P95 CPU and memory). Prices are USD list
            prices; the saving assumes the resource keeps running as today.
          </CardDescription>
        </CardHeader>
        <Table>
          <THead>
            <TR>
              <TH>Resource</TH>
              <TH>Change</TH>
              <TH>Utilization (P95)</TH>
              <TH className="text-right">Monthly</TH>
              <TH>Confidence</TH>
            </TR>
          </THead>
          <TBody>
            {data.items.map((r) => {
              const info = typeInfo(r.resource_type);
              const Icon = info.icon;
              return (
                <TR key={r.id} className="align-top">
                  <TD className="max-w-56">
                    <button
                      type="button"
                      onClick={() => openResource(r.arm_id)}
                      className="flex w-full min-w-0 items-start gap-2 text-left"
                    >
                      <Icon className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
                      <span className="min-w-0">
                        <span className="block truncate font-medium hover:underline">
                          {r.resource_name}
                        </span>
                        <span className="block truncate text-xs text-muted" title={r.resource_group ?? ''}>
                          {info.label} · {r.resource_group}
                        </span>
                      </span>
                    </button>
                  </TD>
                  <TD>
                    <SkuChange from={r.current_sku} to={r.recommended_sku} />
                    <div className="mt-1 text-xs capitalize text-muted">
                      {r.action.replace('_', ' ')}
                    </div>
                  </TD>
                  <TD>
                    <div className="space-y-1">
                      <UsageBar label="CPU" value={num(r.metrics.cpu_p95)} />
                      {r.metrics.memory_p95 !== undefined && (
                        <UsageBar label="Mem" value={num(r.metrics.memory_p95)} />
                      )}
                    </div>
                  </TD>
                  <TD className="text-right">
                    <div className="font-semibold tabular text-success-strong">
                      −{money(r.monthly_saving, r.currency)}
                    </div>
                    <div className="text-xs tabular text-muted">
                      of {money(r.current_monthly, r.currency)}
                    </div>
                    <div className="mt-1">
                      <PriceSource source={r.price_source} />
                    </div>
                  </TD>
                  <TD>
                    <div className="flex flex-col items-start gap-1.5">
                      <ConfidenceBadge value={r.confidence} />
                      {r.risk_note && (
                        <Tooltip content={r.risk_note}>
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 text-xs text-muted hover:text-text"
                          >
                            <Info className="size-3" /> Before you resize
                          </button>
                        </Tooltip>
                      )}
                      <TrackButton
                        body={{
                          source: 'rightsizing',
                          ref: `${r.arm_id}|${r.recommended_sku}`,
                          notes: '',
                        }}
                        tracked={r.tracked}
                      />
                    </div>
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      </Card>
    </div>
  );
}

// ---- waste ------------------------------------------------------------------------------------------
export function WastePage() {
  const { data, isPending } = useWaste();
  const [open, setOpen] = React.useState<string | null>(null);
  const [, openResource] = useResourceParam();
  if (isPending) return <Skeleton className="h-96" />;
  if (!data) return null;
  const withItems = data.categories.filter((c) => c.items.length);
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <Kpi
          icon={Sparkles}
          label="Waste found"
          value={money(data.total_saving, data.currency)}
          tone="success"
          hint="per month (each resource counted once)"
        />
        <Kpi
          label="Resources"
          value={new Set(withItems.flatMap((c) => c.items.map((i) => i.arm_id))).size}
          hint={`in ${withItems.length} categories`}
        />
        <Kpi label="Per year" value={money(data.total_saving * 12, data.currency)} />
      </div>
      <div className="space-y-3">
        {data.categories.map((c) => {
          const expanded = open === c.key;
          return (
            <Card key={c.key} className={cn(!c.items.length && 'opacity-60')}>
              <button
                type="button"
                className="flex w-full items-center gap-4 p-4 text-left"
                aria-expanded={expanded}
                disabled={!c.items.length}
                onClick={() => setOpen(expanded ? null : c.key)}
              >
                {expanded ? (
                  <ChevronDown className="size-4 text-muted" />
                ) : (
                  <ChevronRight className="size-4 text-muted" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{c.title}</div>
                  <div className="text-sm text-muted">{c.description}</div>
                </div>
                <Badge tone={c.items.length ? 'brand' : 'neutral'}>{c.items.length}</Badge>
                <div className="w-28 text-right font-semibold tabular text-success-strong">
                  {c.monthly_saving ? money(c.monthly_saving, data.currency) : '—'}
                </div>
              </button>
              {expanded && (
                <div className="border-t border-border">
                  <Table>
                    <THead>
                      <TR>
                        <TH>Resource</TH>
                        <TH>Why</TH>
                        <TH className="text-right">Cost / month</TH>
                        <TH className="text-right">Saving</TH>
                        <TH />
                      </TR>
                    </THead>
                    <TBody>
                      {c.items.map((i) => (
                        <TR key={i.ref} className="align-top">
                          <TD>
                            <button
                              type="button"
                              className="text-left font-medium hover:underline"
                              onClick={() => openResource(i.arm_id)}
                            >
                              {i.name}
                            </button>
                            <div className="text-xs text-muted">
                              {typeInfo(i.type).label} · {i.resource_group}
                            </div>
                          </TD>
                          <TD className="max-w-md text-sm text-muted">
                            <div className="flex items-start gap-2">
                              {i.severity && <SeverityBadge severity={i.severity} />}
                              {i.finding_id ? (
                                <Link
                                  className="hover:underline"
                                  to={`/app/security/findings/${i.finding_id}`}
                                >
                                  {i.detail}
                                </Link>
                              ) : (
                                <span>{i.detail}</span>
                              )}
                            </div>
                          </TD>
                          <TD className="text-right tabular text-muted">
                            {money(i.monthly_cost, data.currency)}
                          </TD>
                          <TD className="text-right font-semibold tabular text-success-strong">
                            {money(i.monthly_saving, data.currency)}
                          </TD>
                          <TD className="text-right">
                            <TrackButton
                              body={{ source: 'waste', ref: i.ref, notes: '' }}
                              tracked={i.tracked}
                              disabled={!i.monthly_saving}
                            />
                          </TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}

// ---- commitments ------------------------------------------------------------------------------------
export function CommitmentsPage() {
  const { data, isPending } = useCommitments();
  const [term, setTerm] = React.useState<'1y' | '3y'>('1y');
  if (isPending) return <Skeleton className="h-96" />;
  if (!data) return null;
  const recs = data.recommendations.filter((r) => r.term === term);
  const saving = recs.reduce((s, r) => s + r.monthly_saving, 0);
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          icon={PiggyBank}
          label={`Potential saving (${term === '1y' ? '1 year' : '3 years'})`}
          value={money(saving, data.currency)}
          tone="success"
          hint="per month"
        />
        <Kpi
          icon={ShieldCheck}
          label="Compute covered today"
          value={data.covered_pct !== null ? `${data.covered_pct}%` : '—'}
          hint="of VM spend by reservations"
        />
        <Kpi
          label="Compute spend"
          value={money(data.compute_monthly, data.currency)}
          hint="last 30 days, amortized"
        />
        <Kpi
          label="Existing reservations"
          value={data.reservations.length}
          hint={data.tier ? 'Commitments tier on' : 'Commitments tier off'}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Existing reservations</CardTitle>
          <CardDescription>
            Average utilization over the last 30 days. Below 80% means paid capacity sits idle.
          </CardDescription>
        </CardHeader>
        {data.reservations.length ? (
          <Table>
            <THead>
              <TR>
                <TH>Reservation</TH>
                <TH>SKU</TH>
                <TH>Term</TH>
                <TH>Expires</TH>
                <TH className="w-72">Utilization</TH>
              </TR>
            </THead>
            <TBody>
              {data.reservations.map((r) => {
                const u = r.utilization_avg ?? 0;
                return (
                  <TR key={r.id}>
                    <TD className="font-medium">{r.name}</TD>
                    <TD className="font-mono text-xs">
                      {r.sku} × {r.quantity}
                    </TD>
                    <TD>{r.term === 'P3Y' ? '3 years' : '1 year'}</TD>
                    <TD className="text-muted">{r.expiry ? shortDate(r.expiry) : '—'}</TD>
                    <TD>
                      <div className="flex items-center gap-3">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
                          <div
                            className={cn(
                              'h-full rounded-full',
                              u >= 80 ? 'bg-success' : u >= 60 ? 'bg-medium' : 'bg-critical',
                            )}
                            style={{ width: `${u}%` }}
                          />
                        </div>
                        <span className="w-12 text-right text-sm tabular">{u.toFixed(0)}%</span>
                        {u < 80 && <Badge tone="warning">Underused</Badge>}
                      </div>
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        ) : (
          <CardContent className="text-sm text-muted">
            No reservations found{data.tier ? '' : ' (turn on the Commitments tier to read them)'}.
          </CardContent>
        )}
      </Card>

      <Card>
        <CardHeader className="flex-row items-end justify-between gap-3">
          <div>
            <CardTitle>Recommendations</CardTitle>
            <CardDescription>
              Steady production VMs that ran every day of the last 30, and a compute savings plan
              for the remaining steady spend. Dev/test VMs are left out: schedule them instead.
            </CardDescription>
          </div>
          <Segmented
            label="Term"
            value={term}
            onChange={setTerm}
            options={[
              { value: '1y', label: '1 year' },
              { value: '3y', label: '3 years' },
            ]}
          />
        </CardHeader>
        <Table>
          <THead>
            <TR>
              <TH>Commitment</TH>
              <TH className="text-right">Pay-as-you-go</TH>
              <TH className="text-right">Committed</TH>
              <TH className="text-right">Saving</TH>
              <TH>
                <Tooltip content="The share of hours the capacity must run, and the months the workload must keep running, before the commitment beats pay-as-you-go.">
                  <span className="inline-flex items-center gap-1">
                    Break-even <Info className="size-3" />
                  </span>
                </Tooltip>
              </TH>
              <TH />
            </TR>
          </THead>
          <TBody>
            {recs.map((r) => (
              <TR key={r.ref} className="align-top">
                <TD>
                  <div className="font-medium">{r.title}</div>
                  <div
                    className="mt-0.5 max-w-md truncate text-xs text-muted"
                    title={r.resources.join(', ')}
                  >
                    {r.kind === 'savings_plan'
                      ? 'Compute savings plan'
                      : r.resources.slice(0, 4).join(', ')}
                    {r.resources.length > 4 ? ` +${r.resources.length - 4} more` : ''}
                  </div>
                  {r.notes.map((n) => (
                    <div key={n} className="mt-1 flex max-w-md items-start gap-1 text-xs text-muted">
                      <Info className="mt-0.5 size-3 shrink-0" aria-hidden /> {n}
                    </div>
                  ))}
                </TD>
                <TD className="text-right tabular text-muted">
                  {money(r.on_demand_monthly, data.currency)}
                </TD>
                <TD className="text-right tabular">{money(r.commitment_monthly, data.currency)}</TD>
                <TD className="text-right">
                  <div className="font-semibold tabular text-success-strong">
                    {money(r.monthly_saving, data.currency)}
                  </div>
                  <div className="text-xs tabular text-muted">{r.saving_pct}%</div>
                </TD>
                <TD>
                  <div className="text-sm tabular">{r.break_even_utilization}% utilization</div>
                  <div className="text-xs tabular text-muted">{r.break_even_months} months</div>
                </TD>
                <TD>
                  <div className="flex flex-col items-end gap-1.5">
                    <TrackButton
                      body={{ source: 'commitment', ref: r.ref, notes: '' }}
                      tracked={r.tracked}
                    />
                    <PriceSource source={r.price_source} />
                  </div>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
    </div>
  );
}
