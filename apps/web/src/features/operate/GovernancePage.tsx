import type * as React from 'react';
import { CheckCircle2, FolderTree, Lock, Settings2, Tags, XCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { BarRows, Meter } from '@/components/charts/charts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader, Skeleton } from '@/components/ui/misc';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { locationLabel } from '@/features/inventory/types';
import { SeverityBadge } from '@/features/security/severity';
import { str } from '@/lib/format';
import { useGovernance } from './api';

type Row = Record<string, unknown>;

interface MgNode {
  id: string;
  name: string;
  parent_id: string | null;
  type: string;
  production?: boolean;
}

function MgTree({ nodes }: { nodes: MgNode[] }) {
  const mgs = nodes.filter((n) => n.type === 'management_group');
  const subs = nodes.filter((n) => n.type === 'subscription');
  const children = (id: string | null) => mgs.filter((m) => m.parent_id === id);
  const roots = mgs.filter((m) => !m.parent_id || !mgs.some((x) => x.id === m.parent_id));
  const render = (n: MgNode, depth: number): React.ReactNode => (
    <li key={n.id}>
      <div className="flex items-center gap-2 py-1 text-sm" style={{ paddingLeft: depth * 16 }}>
        <FolderTree className="size-3.5 text-muted" aria-hidden /> {n.name}
      </div>
      <ul>{children(n.id).map((c) => render(c, depth + 1))}</ul>
    </li>
  );
  return (
    <div className="space-y-3">
      {mgs.length ? <ul>{roots.map((r) => render(r, 0))}</ul> : <p className="text-sm text-muted">Management groups are not visible (Reader on the tenant root is optional).</p>}
      <div>
        <div className="mb-1 text-xs font-medium text-muted">Subscriptions</div>
        <ul className="space-y-1">
          {subs.map((s) => (
            <li key={s.id} className="flex items-center justify-between text-sm">
              <span>{s.name}</span>
              {s.production && <Badge tone="brand">Production</Badge>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function GovernancePage() {
  const { data, isPending } = useGovernance();
  return (
    <>
      <PageHeader
        title="Governance"
        description="Tagging, naming, allowed regions, Azure Policy compliance, locks and subscription hygiene."
        actions={
          <Button asChild variant="secondary" size="sm">
            <Link to="/app/settings/governance">
              <Settings2 /> Governance settings
            </Link>
          </Button>
        }
      />
      {isPending || !data ? (
        <Skeleton className="h-96" />
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Card className="p-4">
              <div className="flex items-center gap-1.5 text-xs font-medium text-muted">
                <Tags className="size-3.5" aria-hidden /> Fully tagged
              </div>
              <div className="mt-1.5 kpi-value">{data.tags.percent === null ? '—' : `${str(data.tags.percent)}%`}</div>
              <Meter value={data.tags.percent as number | null} className="mt-2" />
            </Card>
            <Card className="p-4">
              <div className="text-xs font-medium text-muted">Policy non-compliant resources</div>
              <div className="mt-1.5 kpi-value">{data.policy_total}</div>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-1.5 text-xs font-medium text-muted">
                <Lock className="size-3.5" aria-hidden /> Production data groups locked
              </div>
              <div className="mt-1.5 kpi-value">
                {String(data.locks.locked)}/{String(data.locks.total)}
              </div>
            </Card>
            <Card className="p-4">
              <div className="text-xs font-medium text-muted">Empty resource groups</div>
              <div className="mt-1.5 kpi-value">{(data.hygiene.empty_resource_groups as Row[]).length}</div>
            </Card>
          </div>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <Card className="xl:col-span-2">
              <CardHeader>
                <CardTitle>Azure Policy compliance</CardTitle>
              </CardHeader>
              <Table>
                <THead>
                  <TR>
                    <TH>Assignment</TH>
                    <TH>Subscription</TH>
                    <TH className="text-right">Non-compliant</TH>
                  </TR>
                </THead>
                <TBody>
                  {data.policy.map((p, i) => (
                    <TR key={i}>
                      <TD className="font-medium">{String(p.assignment)}</TD>
                      <TD className="text-muted">{String(p.subscription)}</TD>
                      <TD className="text-right tabular">
                        {Number(p.non_compliant_resources) > 0 ? (
                          <span className="text-critical-strong">{String(p.non_compliant_resources)}</span>
                        ) : (
                          <CheckCircle2 className="ml-auto size-4 text-success-strong" aria-label="Compliant" />
                        )}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Required tags</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {(data.tags.coverage as Row[]).map((t) => (
                  <div key={String(t.tag)}>
                    <div className="flex justify-between text-sm">
                      <span className="font-mono text-xs">{String(t.tag)}</span>
                      <span className="tabular text-muted">{String(t.percent)}%</span>
                    </div>
                    <Meter value={t.percent as number} className="mt-1" />
                  </div>
                ))}
                <div className="pt-2">
                  <div className="mb-1 text-xs font-medium text-muted">Most used tag keys</div>
                  <div className="flex flex-wrap gap-1">
                    {(data.tags.top_keys as Row[]).map((k) => (
                      <Badge key={String(k.key)} tone="neutral" className="font-mono">
                        {String(k.key)} · {String(k.count)}
                      </Badge>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle>Regions</CardTitle>
              </CardHeader>
              <CardContent>
                <BarRows
                  rows={data.regions.map((r) => ({
                    key: String(r.location),
                    label: (
                      <span className="inline-flex items-center gap-1.5">
                        {r.allowed ? <CheckCircle2 className="size-3.5 text-success-strong" aria-label="Allowed" /> : <XCircle className="size-3.5 text-critical-strong" aria-label="Not allowed" />}
                        {locationLabel(String(r.location))}
                      </span>
                    ),
                    value: Number(r.count),
                    tone: r.allowed ? 'bg-brand' : 'bg-critical',
                  }))}
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Locks on production data</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-1.5 text-sm">
                  {(data.locks.production_data_groups as Row[]).map((g) => (
                    <li key={String(g.resource_group)} className="flex items-center justify-between">
                      <span>{String(g.resource_group)}</span>
                      {g.locked ? (
                        <Badge tone="success">
                          <Lock aria-hidden /> Locked
                        </Badge>
                      ) : (
                        <Badge tone="danger">No lock</Badge>
                      )}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Management groups</CardTitle>
              </CardHeader>
              <CardContent>
                <MgTree nodes={data.management_groups as unknown as MgNode[]} />
              </CardContent>
            </Card>
          </div>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle>Subscription hygiene</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {(
                  [
                    ['Empty resource groups', data.hygiene.empty_resource_groups as Row[]],
                    ['Empty subscriptions', data.hygiene.empty_subscriptions as Row[]],
                    ['Subscriptions without a budget', data.hygiene.subscriptions_without_budget as Row[]],
                  ] as [string, Row[]][]
                ).map(([label, rows]) => (
                  <div key={label}>
                    <div className="flex justify-between font-medium">
                      <span>{label}</span>
                      <span className="tabular">{rows.length}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {rows.slice(0, 8).map((r, i) => (
                        <Badge key={i} tone="neutral">
                          {String(r.name)}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card className="xl:col-span-2">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Governance findings</CardTitle>
                  <Link to="/app/security/findings?pillar=governance" className="text-sm font-medium text-brand-strong hover:underline">
                    View all
                  </Link>
                </div>
              </CardHeader>
              <ul className="divide-y divide-border border-t border-border">
                {data.findings.slice(0, 10).map((f) => (
                  <li key={f.id}>
                    <Link to={`/app/security/findings/${f.id}`} className="flex items-center gap-3 px-5 py-2.5 text-sm hover:bg-surface-2">
                      <SeverityBadge severity={f.severity} />
                      <span className="min-w-0 flex-1 truncate">{f.title}</span>
                      <span className="max-w-48 truncate text-muted">{f.resource_name}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        </div>
      )}
    </>
  );
}
