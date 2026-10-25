import { ChevronLeft, ChevronRight, Download, Search, ShieldCheck, UserPlus, X } from 'lucide-react';
import * as React from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { StackedBars } from '@/components/charts/charts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, NativeSelect } from '@/components/ui/input';
import { EmptyState, PageHeader, Skeleton } from '@/components/ui/misc';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { hasRole } from '@/components/layout/nav';
import { useAsOf } from '@/features/inventory/api';
import { typeInfo } from '@/features/inventory/types';
import { errorMessage } from '@/lib/api/client';
import { useMe } from '@/lib/auth/context';
import { downloadFile } from '@/lib/download';
import { formatDate, formatMoney } from '@/lib/format';
import { useDebounced } from '@/lib/hooks';
import { cn } from '@/lib/utils';
import { useBulkUpdate, useFindings, useSecuritySummary, type FindingFilters } from './api';
import { FindingStatusBadge, RiskScore, SeverityBadge } from './severity';
import { PILLAR_LABEL, SEVERITIES, SEVERITY_META, SOURCE_LABEL } from './severity-meta';

const PAGE = 50;
const STATUS_PRESETS: Record<string, string[] | undefined> = {
  active: undefined,
  open: ['open'],
  in_progress: ['in_progress'],
  accepted_risk: ['accepted_risk'],
  resolved: ['resolved'],
  all: ['open', 'in_progress', 'accepted_risk', 'resolved'],
};

function useFindingParams(): [FindingFilters & { statusPreset: string }, (patch: Record<string, string | undefined>) => void] {
  const [params, setParams] = useSearchParams();
  const list = (k: string) => params.get(k)?.split(',').filter(Boolean);
  const statusPreset = params.get('status') ?? 'active';
  const filters = {
    q: params.get('q') ?? undefined,
    severity: list('severity'),
    status: STATUS_PRESETS[statusPreset],
    source: list('source'),
    pillar: list('pillar'),
    rule_id: params.get('rule') ?? undefined,
    framework: params.get('framework') ?? undefined,
    control: params.get('control') ?? undefined,
    arm_id: params.get('arm_id') ?? undefined,
    assignee: params.get('assignee') ?? undefined,
    overdue: params.get('overdue') === '1' || undefined,
    sort: (params.get('sort') as FindingFilters['sort']) ?? 'risk',
    offset: Number(params.get('offset') ?? 0),
    limit: PAGE,
    statusPreset,
  };
  const update = (patch: Record<string, string | undefined>) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(patch)) {
          if (v) next.set(k, v);
          else next.delete(k);
        }
        if (!('offset' in patch)) next.delete('offset');
        return next;
      },
      { replace: true },
    );
  return [filters, update];
}

function Kpi({ label, value, hint, tone, onClick, active }: { label: React.ReactNode; value: React.ReactNode; hint?: React.ReactNode; tone?: string; onClick?: () => void; active?: boolean }) {
  const Comp = onClick ? 'button' : 'div';
  return (
    <Comp
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cn(
        'rounded-xl border border-border bg-surface p-4 text-left shadow-sm transition-colors',
        onClick && 'hover:border-border-strong',
        active && 'border-brand ring-1 ring-brand',
      )}
    >
      <div className={cn('flex items-center gap-1.5 text-xs font-medium text-muted', tone)}>{label}</div>
      <div className="mt-1.5 kpi-value">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-muted">{hint}</div>}
    </Comp>
  );
}

export function SummaryStrip({ onSeverity, selected }: { onSeverity?: (s: string) => void; selected?: string[] }) {
  const { data } = useSecuritySummary();
  if (!data) return <Skeleton className="h-24" />;
  const mttr = data.mttr_days.critical ?? data.mttr_days.high;
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
      {(['critical', 'high', 'medium', 'low'] as const).map((s) => {
        const meta = SEVERITY_META[s];
        const Icon = meta.icon;
        return (
          <Kpi
            key={s}
            label={
              <>
                {<Icon className={cn('size-3.5', meta.text)} aria-hidden />}
                {meta.label} security risks
              </>
            }
            value={data.open_by_severity[s] ?? 0}
            onClick={onSeverity ? () => onSeverity(s) : undefined}
            active={selected?.includes(s)}
          />
        );
      })}
      <Kpi label="Overdue (SLA)" value={data.overdue} tone={data.overdue ? 'text-critical-strong' : undefined} hint="past their due date" />
      <Kpi label="MTTR (critical/high)" value={mttr === null || mttr === undefined ? '—' : `${mttr} d`} hint="mean time to resolve" />
      <Kpi
        label="Since last scan"
        value={
          <span>
            <span className="text-critical-strong">+{data.new_since_last_scan}</span>
            <span className="mx-1 text-subtle">/</span>
            <span className="text-success-strong">−{data.resolved_since_last_scan}</span>
          </span>
        }
        hint="new / resolved"
      />
    </div>
  );
}

export function FindingsTrend() {
  const { data } = useSecuritySummary();
  if (!data) return <Skeleton className="h-48" />;
  return (
    <StackedBars
      ariaLabel="Open findings by severity per scan"
      data={data.trend.map((t) => ({ ...t, label: `#${String(t.sequence)}` }))}
      labelKey="label"
      series={[
        { key: 'critical', label: 'Critical', className: 'bg-critical' },
        { key: 'high', label: 'High', className: 'bg-high' },
        { key: 'medium', label: 'Medium', className: 'bg-medium' },
        { key: 'low', label: 'Low', className: 'bg-low' },
      ]}
    />
  );
}

export function FindingsPage() {
  const [filters, update] = useFindingParams();
  const [search, setSearch] = React.useState(filters.q ?? '');
  const debounced = useDebounced(search, 300);
  React.useEffect(() => {
    if ((filters.q ?? '') !== debounced) update({ q: debounced || undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);
  const { data, isPending, isFetching } = useFindings(filters);
  const { data: me } = useMe();
  const canEdit = hasRole(me?.user?.org_role, 'member');
  const navigate = useNavigate();
  const scanId = useAsOf();
  const [selection, setSelection] = React.useState<{ data: typeof data; ids: Set<string> }>({ data, ids: new Set() });
  // A new result page clears the selection.
  const selected = selection.data === data ? selection.ids : new Set<string>();
  const setSelected = (ids: Set<string>) => setSelection({ data, ids });
  const bulk = useBulkUpdate();

  const toggleSeverity = (s: string) => {
    const cur = new Set(filters.severity ?? []);
    if (cur.has(s)) cur.delete(s);
    else cur.add(s);
    update({ severity: [...cur].join(',') || undefined });
  };
  const offset = filters.offset ?? 0;
  const total = data?.total ?? 0;
  const items = data?.items ?? [];
  const chips = [
    filters.rule_id && { key: 'rule', label: `Rule: ${filters.rule_id}` },
    filters.framework && { key: 'framework', label: `${filters.framework.toUpperCase()} ${filters.control ?? ''}`, also: 'control' },
    filters.arm_id && { key: 'arm_id', label: `Resource: ${filters.arm_id.split('/').pop() ?? ''}` },
    filters.overdue && { key: 'overdue', label: 'Overdue' },
  ].filter(Boolean) as { key: string; label: string; also?: string }[];

  return (
    <>
      <PageHeader
        title="Findings"
        description="Every open issue across your connections, ranked by risk. Findings resolve automatically when a scan no longer sees them."
        actions={
          <>
            <Button asChild variant="secondary" size="sm">
              <Link to="/app/security/exceptions">
                <ShieldCheck /> Exceptions
              </Link>
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                void downloadFile(
                  '/api/v1/security/findings/export',
                  {
                    scan_id: scanId,
                    q: filters.q,
                    severity: filters.severity,
                    status: filters.status,
                    source: filters.source,
                    pillar: filters.pillar,
                    framework: filters.framework,
                    control: filters.control,
                  },
                  'kloudrecon-findings.csv',
                ).catch((e: unknown) => toast.error(errorMessage(e)));
              }}
            >
              <Download /> Export CSV
            </Button>
          </>
        }
      />
      <div className="space-y-4">
        <SummaryStrip onSeverity={toggleSeverity} selected={filters.severity} />
        <Card>
          <CardHeader className="pb-2">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-56 flex-1">
                <Search className="absolute left-2.5 top-2.5 size-4 text-subtle" aria-hidden />
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search title, resource or rule" className="pl-8" aria-label="Search findings" />
              </div>
              <NativeSelect className="w-auto" aria-label="Pillar" value={filters.pillar?.[0] ?? ''} onChange={(e) => update({ pillar: e.target.value || undefined })}>
                <option value="">All pillars</option>
                {Object.entries(PILLAR_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </NativeSelect>
              <NativeSelect className="w-auto" aria-label="Status" value={filters.statusPreset} onChange={(e) => update({ status: e.target.value === 'active' ? undefined : e.target.value })}>
                <option value="active">Open + in progress</option>
                <option value="open">Open</option>
                <option value="in_progress">In progress</option>
                <option value="accepted_risk">Accepted risk</option>
                <option value="resolved">Resolved</option>
                <option value="all">All statuses</option>
              </NativeSelect>
              <NativeSelect className="w-auto" aria-label="Source" value={filters.source?.[0] ?? ''} onChange={(e) => update({ source: e.target.value || undefined })}>
                <option value="">All sources</option>
                {Object.entries(SOURCE_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </NativeSelect>
              <NativeSelect className="w-auto" aria-label="Assignee" value={filters.assignee ?? ''} onChange={(e) => update({ assignee: e.target.value || undefined })}>
                <option value="">Anyone</option>
                <option value="me">Assigned to me</option>
                <option value="unassigned">Unassigned</option>
              </NativeSelect>
              <NativeSelect className="w-auto" aria-label="Sort" value={filters.sort} onChange={(e) => update({ sort: e.target.value === 'risk' ? undefined : e.target.value })}>
                <option value="risk">Highest risk</option>
                <option value="severity">Severity</option>
                <option value="first_seen">Newest</option>
                <option value="due">Due soonest</option>
                <option value="savings">Largest savings</option>
                <option value="title">Title</option>
              </NativeSelect>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 pt-2">
              {SEVERITIES.map((s) => {
                const on = filters.severity?.includes(s);
                const meta = SEVERITY_META[s];
                const Icon = meta.icon;
                return (
                  <button
                    key={s}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleSeverity(s)}
                    className={cn(
                      'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors',
                      on ? 'border-brand bg-brand-soft text-brand-strong' : 'border-border text-muted hover:bg-surface-2',
                    )}
                  >
                    {<Icon className={cn('size-3', meta.text)} aria-hidden />}
                    {meta.label}
                  </button>
                );
              })}
              {chips.map((c) => (
                <Badge key={c.key} tone="brand" className="gap-1">
                  {c.label}
                  <button type="button" aria-label={`Remove ${c.label}`} onClick={() => update({ [c.key]: undefined, ...(c.also ? { [c.also]: undefined } : {}) })}>
                    <X />
                  </button>
                </Badge>
              ))}
              <span className="ml-auto text-xs text-muted tabular">{isFetching ? 'Updating…' : `${total.toLocaleString()} findings`}</span>
            </div>
          </CardHeader>
          {selected.size > 0 && canEdit && (
            <div className="flex items-center gap-2 border-y border-border bg-brand-soft/40 px-5 py-2 text-sm">
              <span className="font-medium">{selected.size} selected</span>
              <Button size="sm" variant="secondary" loading={bulk.isPending} onClick={() => bulk.mutate({ ids: [...selected], status: 'in_progress', clear_assignee: false })}>
                Mark in progress
              </Button>
              <Button size="sm" variant="secondary" loading={bulk.isPending} onClick={() => me?.user && bulk.mutate({ ids: [...selected], assignee_id: me.user.id, clear_assignee: false })}>
                <UserPlus /> Assign to me
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
                Clear
              </Button>
            </div>
          )}
          {isPending ? (
            <CardContent>
              <Skeleton className="h-96" />
            </CardContent>
          ) : items.length === 0 ? (
            <CardContent>
              <EmptyState icon={<ShieldCheck />} title="No findings match" description="Try other filters, or run a scan to evaluate your resources." />
            </CardContent>
          ) : (
            <Table>
              <THead>
                <TR>
                  {canEdit && (
                    <TH className="w-8">
                      <input
                        type="checkbox"
                        aria-label="Select all on this page"
                        checked={selected.size === items.length}
                        onChange={(e) => setSelected(e.target.checked ? new Set(items.map((f) => f.id)) : new Set())}
                      />
                    </TH>
                  )}
                  <TH>Severity</TH>
                  <TH>Finding</TH>
                  <TH>Resource</TH>
                  <TH>Risk</TH>
                  <TH>Status</TH>
                  <TH>Assignee</TH>
                  <TH>Due</TH>
                </TR>
              </THead>
              <TBody>
                {items.map((f) => {
                  const info = typeInfo(f.resource_type ?? '');
                  const Icon = info.icon;
                  return (
                    <TR key={f.id} className="cursor-pointer" onClick={() => navigate(`/app/security/findings/${f.id}`)}>
                      {canEdit && (
                        <TD onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            aria-label={`Select ${f.title}`}
                            checked={selected.has(f.id)}
                            onChange={(e) => {
                              const next = new Set(selected);
                              if (e.target.checked) next.add(f.id);
                              else next.delete(f.id);
                              setSelected(next);
                            }}
                          />
                        </TD>
                      )}
                      <TD>
                        <SeverityBadge severity={f.severity} />
                      </TD>
                      <TD className="max-w-md">
                        <Link to={`/app/security/findings/${f.id}`} className="line-clamp-2 font-medium hover:text-brand-strong" onClick={(e) => e.stopPropagation()}>
                          {f.title}
                        </Link>
                        <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted">
                          <span>{SOURCE_LABEL[f.source] ?? f.source}</span>
                          <span aria-hidden>·</span>
                          <span>{PILLAR_LABEL[f.pillar] ?? f.pillar}</span>
                          {f.est_monthly_savings ? (
                            <>
                              <span aria-hidden>·</span>
                              <span className="text-success-strong">save ${Number(f.est_monthly_savings).toLocaleString()}/mo</span>
                            </>
                          ) : null}
                        </div>
                      </TD>
                      <TD className="max-w-60">
                        <span className="flex min-w-0 items-center gap-2">
                          <Icon className="size-4 shrink-0 text-muted" aria-hidden />
                          <span className="min-w-0">
                            <span className="block truncate">{f.resource_name}</span>
                            <span className="block truncate text-xs text-muted">
                              {f.resource_group ?? info.label}
                              {f.resource_monthly_cost ? (
                                <span title="Cost of risk: the resource's last 30 days (amortized)"> · {formatMoney(f.resource_monthly_cost)}/mo</span>
                              ) : null}
                            </span>
                          </span>
                        </span>
                      </TD>
                      <TD>
                        <RiskScore score={f.risk_score} />
                      </TD>
                      <TD>
                        <FindingStatusBadge status={f.status} />
                      </TD>
                      <TD className="text-muted">{f.assignee_name ?? '—'}</TD>
                      <TD className={cn('whitespace-nowrap tabular', f.overdue ? 'font-medium text-critical-strong' : 'text-muted')}>
                        {f.due_at ? formatDate(f.due_at) : '—'}
                        {f.overdue && <span className="sr-only"> (overdue)</span>}
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          )}
          {total > PAGE && (
            <div className="flex items-center justify-between border-t border-border px-5 py-3 text-sm text-muted">
              <span className="tabular">
                {offset + 1}–{Math.min(offset + PAGE, total)} of {total.toLocaleString()}
              </span>
              <div className="flex gap-1">
                <Button variant="secondary" size="sm" disabled={offset === 0} onClick={() => update({ offset: String(Math.max(0, offset - PAGE)) })}>
                  <ChevronLeft /> Previous
                </Button>
                <Button variant="secondary" size="sm" disabled={offset + PAGE >= total} onClick={() => update({ offset: String(offset + PAGE) })}>
                  Next <ChevronRight />
                </Button>
              </div>
            </div>
          )}
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Open findings over time</CardTitle>
          </CardHeader>
          <CardContent>
            <FindingsTrend />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
