import { CheckCircle2, MinusCircle, XCircle } from 'lucide-react';
import { Meter } from '@/components/charts/charts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader, Skeleton } from '@/components/ui/misc';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { typeInfo } from '@/features/inventory/types';
import { useCoverage } from './api';

function Cell({ on }: { on: boolean | undefined }) {
  if (on === undefined) return <MinusCircle className="mx-auto size-4 text-subtle" aria-label="Not available" />;
  return on ? <CheckCircle2 className="mx-auto size-4 text-success-strong" aria-label="On" /> : <XCircle className="mx-auto size-4 text-critical-strong" aria-label="Off" />;
}

function Percent({ label, value, hint }: { label: string; value: number | null | undefined; hint: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
      <div className="text-xs font-medium text-muted">{label}</div>
      <div className="mt-1.5 kpi-value">{value === null || value === undefined ? '—' : `${value}%`}</div>
      <Meter value={value} className="mt-2" />
      <div className="mt-1 text-xs text-muted">{hint}</div>
    </div>
  );
}

function Distribution({ title, values, good }: { title: string; values: Record<string, number>; good: string[] }) {
  const total = Object.values(values).reduce((a, b) => a + b, 0);
  return (
    <div>
      <div className="mb-1 text-sm font-medium">{title}</div>
      {total === 0 ? (
        <p className="text-sm text-muted">No resources.</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {Object.entries(values)
            .sort()
            .map(([k, v]) => (
              <li key={k} className="flex items-center justify-between">
                <span className={good.includes(k) ? '' : 'text-critical-strong'}>{k}</span>
                <span className="tabular text-muted">{v}</span>
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}

export function CoveragePage() {
  const { data, isPending } = useCoverage();
  return (
    <>
      <PageHeader title="Coverage" description="How much of your estate is protected, logged and backed up." />
      {isPending || !data ? (
        <Skeleton className="h-96" />
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Percent label="Diagnostic logs" value={data.diagnostics.percent as number | null} hint={`${String(data.diagnostics.covered)} of ${String(data.diagnostics.total)} key resources`} />
            <Percent label="Production VMs backed up" value={data.backup.production_percent as number | null} hint={`${String(data.backup.production_protected)} of ${String(data.backup.production_total)}`} />
            <Percent
              label="Activity Log exported"
              value={data.activity_export.length ? Math.round((100 * data.activity_export.filter((a) => a.exported).length) / data.activity_export.length) : null}
              hint={`${data.activity_export.filter((a) => a.exported).length} of ${data.activity_export.length} subscriptions`}
            />
            <Percent
              label="Secure Score (Defender)"
              value={data.secure_scores.length ? Math.round(data.secure_scores.reduce((a, s) => a + Number(s.percent), 0) / data.secure_scores.length) : null}
              hint="average across subscriptions"
            />
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Microsoft Defender plans</CardTitle>
            </CardHeader>
            <Table>
              <THead>
                <TR>
                  <TH>Subscription</TH>
                  {data.plans.map((p) => (
                    <TH key={p} className="text-center">
                      {p}
                    </TH>
                  ))}
                  <TH className="text-right">Secure score</TH>
                </TR>
              </THead>
              <TBody>
                {data.defender.map((row) => {
                  const plans = row.plans as Record<string, boolean>;
                  const score = data.secure_scores.find((s) => s.subscription_id === row.subscription_id);
                  return (
                    <TR key={String(row.subscription_id)}>
                      <TD className="font-medium">{String(row.subscription)}</TD>
                      {data.plans.map((p) => (
                        <TD key={p}>
                          <Cell on={plans[p]} />
                        </TD>
                      ))}
                      <TD className="text-right tabular">{score ? `${String(score.percent)}%` : '—'}</TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </Card>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle>Diagnostic settings by type</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2.5">
                  {(data.diagnostics.by_type as { type: string; covered: number; total: number }[]).map((t) => (
                    <li key={t.type}>
                      <div className="flex items-center justify-between text-sm">
                        <span>{typeInfo(t.type).label}</span>
                        <span className="tabular text-muted">
                          {t.covered}/{t.total}
                        </span>
                      </div>
                      <Meter value={t.total ? (100 * t.covered) / t.total : null} className="mt-1" />
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Encryption</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {[
                  ['Storage with customer-managed keys', data.encryption.storage_cmk, data.encryption.storage_total],
                  ['Disks with customer-managed keys', data.encryption.disks_cmk, data.encryption.disks_total],
                  ['Storage requiring HTTPS', data.encryption.https_only_storage, data.encryption.storage_total],
                ].map(([label, a, b]) => (
                  <div key={String(label)}>
                    <div className="flex justify-between">
                      <span>{String(label)}</span>
                      <span className="tabular text-muted">
                        {String(a)}/{String(b)}
                      </span>
                    </div>
                    <Meter value={Number(b) ? (100 * Number(a)) / Number(b) : null} className="mt-1" />
                  </div>
                ))}
                <p className="text-xs text-muted">Every Azure disk and storage account is encrypted at rest with Microsoft-managed keys by default.</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Minimum TLS versions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Distribution title="Storage accounts" values={data.tls.storage as Record<string, number>} good={['TLS1_2', 'TLS1_3']} />
                <Distribution title="Web apps" values={data.tls.web_apps as Record<string, number>} good={['1.2', '1.3']} />
                <Distribution title="SQL servers" values={data.tls.sql as Record<string, number>} good={['1.2', '1.3']} />
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </>
  );
}
