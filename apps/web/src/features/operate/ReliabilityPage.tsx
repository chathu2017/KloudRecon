import { AlertTriangle, CalendarClock, CheckCircle2, ExternalLink, Gauge, HardDrive } from 'lucide-react';
import { Link } from 'react-router-dom';
import { BarRows, LineChart, Meter, ScoreRing } from '@/components/charts/charts';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState, PageHeader, Skeleton } from '@/components/ui/misc';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ResourceDrawer } from '@/features/inventory/ResourceDrawer';
import { useResourceParam } from '@/features/inventory/useResourceParam';
import { typeInfo } from '@/features/inventory/types';
import { RiskScore, SeverityBadge } from '@/features/security/severity';
import { formatDate, str } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useQuotas, useReliability, useRetirements, useScoreHistory } from './api';

const PILLARS: { key: string; label: string }[] = [
  { key: 'reliability', label: 'Reliability' },
  { key: 'security', label: 'Security' },
  { key: 'cost', label: 'Cost optimization' },
  { key: 'operations', label: 'Operational excellence' },
  { key: 'performance', label: 'Performance efficiency' },
];
const RETIRE_TONE: Record<string, 'danger' | 'high' | 'warning' | 'neutral'> = {
  retired: 'danger',
  due_90_days: 'high',
  due_1_year: 'warning',
  later: 'neutral',
};
const RETIRE_LABEL: Record<string, string> = {
  retired: 'Retired',
  due_90_days: 'Within 90 days',
  due_1_year: 'Within a year',
  later: 'Later',
};

function Retirements() {
  const { data, isPending } = useRetirements();
  const [, open] = useResourceParam();
  if (isPending) return <Skeleton className="h-64" />;
  if (!data?.length) return <EmptyState icon={<CheckCircle2 />} title="Nothing retiring" description="No resource matches the retirement catalog or Advisor retirement notices." />;
  return (
    <div className="space-y-3">
      {data.map((m) => (
        <Card key={`${m.source}-${m.entry.key}`}>
          <CardContent className="flex flex-col gap-3 p-4 md:flex-row md:items-start">
            <div className="flex w-40 shrink-0 flex-col gap-1">
              <Badge tone={RETIRE_TONE[m.status] ?? 'neutral'}>
                <CalendarClock aria-hidden /> {RETIRE_LABEL[m.status]}
              </Badge>
              <span className="text-sm tabular">{m.source === 'advisor' ? 'Advisor notice' : formatDate(m.entry.retirement_date)}</span>
              {m.source === 'catalog' && (
                <span className="text-xs text-muted">{m.days_left < 0 ? `${Math.abs(m.days_left)} days ago` : `in ${m.days_left} days`}</span>
              )}
              {!m.entry.verified && m.source === 'catalog' && (
                <Badge tone="neutral" title="The date has not been re-checked against the source recently">
                  verify
                </Badge>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-medium">{m.entry.service}</div>
              <p className="mt-0.5 text-sm text-muted">{m.entry.hint}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {m.resources.slice(0, 12).map((r) => (
                  <button key={str(r.arm_id)} type="button" onClick={() => r.arm_id && open(str(r.arm_id))} className="rounded-md border border-border px-2 py-0.5 text-xs hover:bg-surface-2">
                    {str(r.name)}
                  </button>
                ))}
                {m.resources.length > 12 && <span className="text-xs text-muted">+{m.resources.length - 12} more</span>}
              </div>
            </div>
            {m.entry.source_url && (
              <a href={m.entry.source_url} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center gap-1 text-sm text-brand-strong hover:underline">
                Source <ExternalLink className="size-3" />
              </a>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function Quotas() {
  const { data, isPending } = useQuotas();
  if (isPending) return <Skeleton className="h-64" />;
  if (!data?.length) return <EmptyState icon={<Gauge />} title="No quota data" description="Quotas are read for regions where you run virtual machines." />;
  return (
    <Card>
      <Table>
        <THead>
          <TR>
            <TH>Quota</TH>
            <TH>Subscription</TH>
            <TH>Region</TH>
            <TH className="w-64">Usage</TH>
          </TR>
        </THead>
        <TBody>
          {data.map((q) => (
            <TR key={`${q.subscription_id}-${q.location}-${q.name ?? ''}`}>
              <TD className="font-medium">
                {q.localized ?? q.name}
                {q.percent >= 80 && (
                  <Badge tone="danger" className="ml-2">
                    <AlertTriangle aria-hidden /> Over 80%
                  </Badge>
                )}
              </TD>
              <TD className="text-muted">{q.subscription_name}</TD>
              <TD className="text-muted">{q.location}</TD>
              <TD>
                <div className="flex items-center gap-3">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
                    <div className={cn('h-full rounded-full', q.percent >= 90 ? 'bg-critical' : q.percent >= 80 ? 'bg-high' : 'bg-brand')} style={{ width: `${Math.min(100, q.percent)}%` }} />
                  </div>
                  <span className="w-28 text-right text-xs tabular text-muted">
                    {q.current.toLocaleString()} / {q.limit.toLocaleString()} ({q.percent}%)
                  </span>
                </div>
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </Card>
  );
}

export function ReliabilityPage() {
  const { data, isPending } = useReliability();
  const history = useScoreHistory();
  return (
    <>
      <PageHeader
        title="Reliability & Well-Architected"
        description="Well-Architected pillar scores, redundancy and backup gaps, retiring services and quota headroom."
      />
      {isPending || !data ? (
        <Skeleton className="h-96" />
      ) : (
        <Tabs defaultValue="overview">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="retirements">
              Retirements
              {(data.retirements.retired ?? 0) + (data.retirements.due_90_days ?? 0) > 0 && <Badge tone="danger">{(data.retirements.retired ?? 0) + (data.retirements.due_90_days ?? 0)}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="quotas">
              Quotas {data.quotas_over_80 > 0 && <Badge tone="danger">{data.quotas_over_80}</Badge>}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="overview" className="space-y-4">
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-[20rem_1fr]">
              <Card className="flex flex-col items-center justify-center p-6 text-center">
                <ScoreRing score={data.overall} label={data.grade ? `Grade ${data.grade}` : 'no data'} size={148} />
                <div className="mt-3 text-sm font-medium">Well-Architected score</div>
                <p className="mt-1 text-xs text-muted">Average of the five pillar scores from the latest scan.</p>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Pillars</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {PILLARS.map((p) => {
                    const v = data.well_architected[p.key] ?? null;
                    return (
                      <div key={p.key}>
                        <div className="flex items-center justify-between text-sm">
                          <span>{p.label}</span>
                          <span className="font-medium tabular">{v ?? '—'}</span>
                        </div>
                        <Meter value={v} className="mt-1" />
                      </div>
                    );
                  })}
                  <div className="pt-2">
                    <div className="mb-1 text-xs font-medium text-muted">Score history</div>
                    <LineChart ariaLabel="Reliability score over time" values={(history.data ?? []).map((h) => h.reliability ?? null)} labels={(history.data ?? []).map((h) => formatDate(h.started_at))} />
                  </div>
                </CardContent>
              </Card>
            </div>
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
              <Card className="xl:col-span-2">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle>Top reliability risks</CardTitle>
                    <Link to="/app/security/findings?pillar=reliability" className="text-sm font-medium text-brand-strong hover:underline">
                      All reliability findings
                    </Link>
                  </div>
                </CardHeader>
                {data.top_findings.length === 0 ? (
                  <CardContent>
                    <p className="text-sm text-muted">No open reliability findings.</p>
                  </CardContent>
                ) : (
                  <ul className="divide-y divide-border border-t border-border">
                    {data.top_findings.map((f) => {
                      const Icon = typeInfo(f.resource_type ?? '').icon;
                      return (
                        <li key={f.id}>
                          <Link to={`/app/security/findings/${f.id}`} className="flex items-center gap-3 px-5 py-2.5 hover:bg-surface-2">
                            <SeverityBadge severity={f.severity} />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-medium">{f.title}</span>
                              <span className="flex items-center gap-1 text-xs text-muted">
                                <Icon className="size-3" aria-hidden /> {f.resource_name}
                              </span>
                            </span>
                            <RiskScore score={f.risk_score} />
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Card>
              <div className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>By category</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <BarRows rows={data.by_category.slice(0, 8).map((c) => ({ key: String(c.category), label: String(c.category), value: Number(c.count), tone: 'bg-high' }))} />
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <HardDrive className="size-4 text-muted" aria-hidden /> Azure Advisor
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <BarRows rows={Object.entries(data.advisor).map(([k, v]) => ({ key: k, label: k.replace(/([A-Z])/g, ' $1').trim(), value: v }))} />
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>
          <TabsContent value="retirements">
            <Retirements />
          </TabsContent>
          <TabsContent value="quotas">
            <Quotas />
          </TabsContent>
        </Tabs>
      )}
      <ResourceDrawer />
    </>
  );
}
