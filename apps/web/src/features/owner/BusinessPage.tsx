import { Bot, Building2, DollarSign, Repeat, TrendingDown, UserCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState, PageHeader, Skeleton } from '@/components/ui/misc';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { formatDate, formatMoney, formatNumber } from '@/lib/format';
import { useOwnerMetrics } from './api';
import { Kpi } from './OwnerOverviewPage';

function pct(value: number | null | undefined): string {
  return value === null || value === undefined ? '—' : `${(value * 100).toFixed(1)}%`;
}

/** Business metrics (plan 9.13): MRR, customers by billing state, conversion, churn, AI cost. */
export function BusinessPage() {
  const { data, isPending } = useOwnerMetrics();
  return (
    <>
      <PageHeader
        title="Business"
        description={`Recurring revenue and customer health. Billing provider: ${data?.provider ?? '…'}.`}
      />
      {isPending || !data ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi
              label="MRR"
              value={formatMoney(data.mrr, data.currency)}
              icon={<DollarSign />}
              hint={`ARR ${formatMoney(data.arr, data.currency)}`}
              highlight
            />
            <Kpi
              label="Paying customers"
              value={formatNumber(data.orgs.paying ?? 0)}
              icon={<Building2 />}
              hint={`${formatNumber(data.orgs.active ?? 0)} active orgs · ${formatNumber(data.orgs.trial ?? 0)} in trial`}
              to="/owner/orgs"
            />
            <Kpi
              label="Trial → paid (90 days)"
              value={pct(data.conversion_rate_90d)}
              icon={<UserCheck />}
              hint={`${data.trials_converted_90d} of ${data.trials_started_90d} trials converted`}
            />
            <Kpi
              label="Churn (30 days)"
              value={pct(data.churn_rate_30d)}
              icon={<TrendingDown />}
              hint={`${data.churned_30d} cancellation(s)`}
            />
          </div>
          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Repeat className="size-4 text-brand-strong" aria-hidden /> Revenue by plan
                </CardTitle>
                <CardDescription>
                  {data.orgs.read_only
                    ? `${data.orgs.read_only} organization(s) are read-only (trial ended or payment overdue).`
                    : 'No organization is read-only.'}
                  {data.orgs.grace ? ` ${data.orgs.grace} in the payment grace period.` : ''}
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                {data.by_plan.length ? (
                  <Table>
                    <THead>
                      <TR>
                        <TH>Plan</TH>
                        <TH className="text-right">Customers</TH>
                        <TH className="text-right">MRR</TH>
                      </TR>
                    </THead>
                    <TBody>
                      {data.by_plan.map((r) => (
                        <TR key={r.plan}>
                          <TD className="font-medium">{r.plan}</TD>
                          <TD className="text-right tabular">{formatNumber(r.orgs)}</TD>
                          <TD className="text-right tabular">{formatMoney(r.mrr, data.currency)}</TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                ) : (
                  <p className="p-5 text-sm text-muted">No paying customers yet.</p>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Trials ending within 7 days</CardTitle>
                <CardDescription>Reach out before they become read-only.</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                {data.trials_expiring_7d.length ? (
                  <Table>
                    <TBody>
                      {data.trials_expiring_7d.map((t) => (
                        <TR key={t.org_id}>
                          <TD>
                            <Link to={`/owner/orgs/${t.org_id}`} className="font-medium hover:text-brand-strong">
                              {t.name}
                            </Link>
                          </TD>
                          <TD className="text-right text-muted">{formatDate(t.ends_at)}</TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                ) : (
                  <p className="p-5 text-sm text-muted">No trial ends this week.</p>
                )}
              </CardContent>
            </Card>
          </div>
          <Card className="mt-6">
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Bot className="size-4 text-brand-strong" aria-hidden /> AI cost this month
                </CardTitle>
                <CardDescription>Azure OpenAI usage per organization, at the token prices in the server settings.</CardDescription>
              </div>
              <Badge tone="brand">{formatMoney(data.ai_cost_month_usd, 'USD')}</Badge>
            </CardHeader>
            <CardContent className="p-0">
              {data.ai_cost_by_org.length ? (
                <Table>
                  <THead>
                    <TR>
                      <TH>Organization</TH>
                      <TH className="text-right">Model calls</TH>
                      <TH className="text-right">Cost</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {data.ai_cost_by_org.map((r) => (
                      <TR key={r.org_id}>
                        <TD>
                          <Link to={`/owner/orgs/${r.org_id}`} className="font-medium hover:text-brand-strong">
                            {r.name}
                          </Link>
                        </TD>
                        <TD className="text-right tabular">{formatNumber(r.calls)}</TD>
                        <TD className="text-right tabular">{formatMoney(r.cost_usd, 'USD')}</TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              ) : (
                <EmptyState className="m-5" icon={<Bot />} title="No AI usage this month" />
              )}
            </CardContent>
          </Card>
        </>
      )}
    </>
  );
}
