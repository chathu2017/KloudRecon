import { ArrowLeft, ChevronRight, Download, Lock, ShieldCheck } from 'lucide-react';
import * as React from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Meter } from '@/components/charts/charts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, NativeSelect } from '@/components/ui/input';
import { EmptyState, PageHeader, Skeleton } from '@/components/ui/misc';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { useAsOf } from '@/features/inventory/api';
import { RiskScore, SeverityBadge } from '@/features/security/severity';
import { errorMessage } from '@/lib/api/client';
import { downloadFile } from '@/lib/download';
import { cn } from '@/lib/utils';
import { useControl, useFramework, useFrameworks, type Control } from './api';

const STATUS: Record<string, { label: string; tone: 'danger' | 'success' | 'neutral' | 'info' }> = {
  failed: { label: 'Failing', tone: 'danger' },
  passed: { label: 'Passing', tone: 'success' },
  not_applicable: { label: 'No resources', tone: 'neutral' },
  not_assessed: { label: 'Manual', tone: 'info' },
};

export function CompliancePage() {
  const { data, isPending } = useFrameworks();
  return (
    <>
      <PageHeader
        title="Compliance"
        description="Automated checks mapped to framework control IDs. This helps you prepare for audits; it is not a certification."
        actions={
          <Button asChild variant="secondary" size="sm">
            <Link to="/app/settings/governance#compliance">Choose frameworks</Link>
          </Button>
        }
      />
      {isPending || !data ? (
        <Skeleton className="h-72" />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data.map((f) => {
            const content = (
              <Card className={cn('h-full p-5 transition-colors', f.locked ? 'opacity-70' : 'hover:border-border-strong')}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-display text-lg font-semibold">{f.short}</div>
                    <div className="text-xs text-muted">
                      {f.name} · {f.version}
                    </div>
                  </div>
                  {f.locked ? (
                    <Badge tone="neutral">
                      <Lock aria-hidden /> Upgrade
                    </Badge>
                  ) : (
                    <ChevronRight className="size-4 text-subtle" aria-hidden />
                  )}
                </div>
                <div className="mt-4 flex items-end justify-between">
                  <span className="kpi-value">{f.percent === null ? '—' : `${f.percent}%`}</span>
                  <span className="text-xs text-muted">checks passing</span>
                </div>
                <Meter value={f.percent} className="mt-2" />
                <div className="mt-3 flex flex-wrap gap-1.5 text-xs">
                  <Badge tone="danger">{f.failed} failing</Badge>
                  <Badge tone="success">{f.passed} passing</Badge>
                  <Badge tone="info">{f.not_assessed} manual</Badge>
                </div>
              </Card>
            );
            return f.locked ? (
              <div key={f.key} title="Not included in your plan">
                {content}
              </div>
            ) : (
              <Link key={f.key} to={`/app/security/compliance/${f.key}`} className="rounded-lg focus-visible:outline-2">
                {content}
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}

function ControlPanel({ framework, control }: { framework: string; control: Control }) {
  const { data, isPending } = useControl(framework, control.control_id);
  return (
    <Card className="sticky top-4">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Badge tone={STATUS[control.status]?.tone ?? 'neutral'}>{STATUS[control.status]?.label ?? control.status}</Badge>
          <span className="font-mono text-sm">{control.control_id}</span>
        </div>
        <CardTitle className="mt-1">{control.title}</CardTitle>
        <p className="text-sm text-muted">
          {control.passed} passing check(s), {control.failed} failing.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <h4 className="mb-2 text-sm font-semibold">Mapped checks</h4>
          {control.rules.length === 0 ? (
            <p className="text-sm text-muted">No automated check covers this control. Collect evidence manually.</p>
          ) : (
            <ul className="divide-y divide-border rounded-md border border-border text-sm">
              {control.rules.map((r) => (
                <li key={String(r.rule_id)} className="flex items-center justify-between gap-2 px-3 py-2">
                  <Link to={`/app/security/findings?rule=${String(r.rule_id)}`} className="min-w-0 truncate hover:text-brand-strong">
                    {String(r.title)}
                  </Link>
                  <span className={cn('shrink-0 tabular text-xs', Number(r.failed) ? 'text-critical-strong' : 'text-success-strong')}>
                    {Number(r.failed)} / {Number(r.evaluated)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <h4 className="mb-2 text-sm font-semibold">Failing resources</h4>
          {isPending ? (
            <Skeleton className="h-24" />
          ) : !data?.failing.length ? (
            <p className="text-sm text-muted">None.</p>
          ) : (
            <ul className="max-h-96 space-y-1.5 overflow-auto">
              {data.failing.map((f) => (
                <li key={f.id}>
                  <Link to={`/app/security/findings/${f.id}`} className="flex items-center gap-2 rounded-md border border-border px-2.5 py-1.5 text-sm hover:bg-surface-2">
                    <SeverityBadge severity={f.severity} />
                    <span className="min-w-0 flex-1 truncate">{f.resource_name}</span>
                    <RiskScore score={f.risk_score} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function FrameworkPage() {
  const { framework } = useParams();
  const { data, isPending, isError, error } = useFramework(framework);
  const [params, setParams] = useSearchParams();
  const [status, setStatus] = React.useState('');
  const [q, setQ] = React.useState('');
  const [exporting, setExporting] = React.useState(false);
  const scanId = useAsOf();
  const selectedId = params.get('control');
  if (isPending) return <Skeleton className="h-96" />;
  if (isError) {
    return <EmptyState tone="error" title="Framework not available" description={errorMessage(error)} action={<Button asChild variant="secondary"><Link to="/app/security/compliance">Back</Link></Button>} />;
  }
  const controls = data.controls.filter((c) => (!status || c.status === status) && (!q || `${c.control_id} ${c.title}`.toLowerCase().includes(q.toLowerCase())));
  const selected = data.controls.find((c) => c.control_id === selectedId);
  return (
    <>
      <Link to="/app/security/compliance" className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-text">
        <ArrowLeft className="size-4" /> Compliance
      </Link>
      <PageHeader
        title={data.name}
        description={`${data.version} · ${data.percent ?? '—'}% of checks passing · ${data.failed} control(s) failing, ${data.passed} passing, ${data.not_assessed} manual.`}
        actions={
          <Button
            variant="secondary"
            loading={exporting}
            onClick={() => {
              setExporting(true);
              downloadFile(`/api/v1/compliance/frameworks/${data.key}/evidence`, { scan_id: scanId }, `kloudrecon-evidence-${data.key}.zip`)
                .then(() => toast.success('Evidence exported'))
                .catch((e: unknown) => toast.error(errorMessage(e)))
                .finally(() => setExporting(false));
            }}
          >
            <Download /> Export evidence (ZIP)
          </Button>
        }
      />
      <p className="-mt-3 mb-4 flex items-start gap-2 rounded-md border border-border bg-surface-2 p-3 text-xs text-muted">
        <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden /> {data.disclaimer}
      </p>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_26rem]">
        <Card>
          <div className="flex flex-wrap gap-2 px-5 py-3">
            <Input className="max-w-xs" placeholder="Search controls" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search controls" />
            <NativeSelect className="w-44" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
              <option value="">All controls</option>
              <option value="failed">Failing</option>
              <option value="passed">Passing</option>
              <option value="not_assessed">Manual</option>
              <option value="not_applicable">No resources</option>
            </NativeSelect>
          </div>
          <Table>
            <THead>
              <TR>
                <TH>Control</TH>
                <TH>Description</TH>
                <TH>Status</TH>
                <TH className="text-right">Checks</TH>
              </TR>
            </THead>
            <TBody>
              {controls.map((c) => (
                <TR key={c.control_id} className={cn('cursor-pointer', c.control_id === selectedId && 'bg-brand-soft/50')} onClick={() => setParams({ control: c.control_id }, { replace: true })}>
                  <TD className="whitespace-nowrap font-mono text-xs font-medium">{c.control_id}</TD>
                  <TD>{c.title}</TD>
                  <TD>
                    <Badge tone={STATUS[c.status]?.tone ?? 'neutral'}>{STATUS[c.status]?.label ?? c.status}</Badge>
                  </TD>
                  <TD className="whitespace-nowrap text-right tabular text-muted">
                    {c.rules.length ? (
                      <>
                        <span className={c.failed ? 'text-critical-strong' : 'text-success-strong'}>{c.failed}</span> / {c.passed + c.failed}
                      </>
                    ) : (
                      '—'
                    )}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
        <div>
          {selected ? (
            <ControlPanel framework={data.key} control={selected} />
          ) : (
            <EmptyState title="Select a control" description="See the checks mapped to it and the resources that fail them." />
          )}
        </div>
      </div>
    </>
  );
}
