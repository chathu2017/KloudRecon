import { ShieldCheck } from 'lucide-react';
import * as React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { NativeSelect } from '@/components/ui/input';
import { EmptyState, PageHeader, Skeleton } from '@/components/ui/misc';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { hasRole } from '@/components/layout/nav';
import { useMe } from '@/lib/auth/context';
import { formatDate } from '@/lib/format';
import { useDecideException, useExceptions, useRevokeException } from './api';
import { FindingStatusBadge } from './severity';

type Status = 'pending' | 'approved' | 'rejected' | 'revoked' | 'expired';

export function ExceptionsPage() {
  const [status, setStatus] = React.useState<Status | ''>('');
  const { data, isPending } = useExceptions(status || undefined);
  const { data: me } = useMe();
  const isAdmin = hasRole(me?.user?.org_role, 'admin');
  const decide = useDecideException();
  const revoke = useRevokeException();
  return (
    <>
      <PageHeader
        title="Exceptions"
        description="Accepted risks with their reason, approver and expiry. Expired exceptions reopen their findings automatically."
        actions={
          <NativeSelect className="w-44" aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value as Status | '')}>
            <option value="">All statuses</option>
            <option value="pending">Pending approval</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="revoked">Revoked</option>
            <option value="expired">Expired</option>
          </NativeSelect>
        }
      />
      <Card>
        {isPending ? (
          <Skeleton className="m-5 h-64" />
        ) : !data?.length ? (
          <EmptyState className="m-5" icon={<ShieldCheck />} title="No exceptions" description="Request one from a finding when a risk is acceptable for a limited time." />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Status</TH>
                <TH>Finding</TH>
                <TH>Scope</TH>
                <TH>Reason</TH>
                <TH>Requested by</TH>
                <TH>Expires</TH>
                {isAdmin && <TH />}
              </TR>
            </THead>
            <TBody>
              {data.map((e) => (
                <TR key={e.id}>
                  <TD>
                    <FindingStatusBadge status={e.status} />
                  </TD>
                  <TD className="max-w-xs">
                    {e.finding_id ? (
                      <Link to={`/app/security/findings/${e.finding_id}`} className="font-medium hover:text-brand-strong">
                        {e.rule_title}
                      </Link>
                    ) : (
                      e.rule_title
                    )}
                  </TD>
                  <TD className="text-muted">{e.resource_name ?? 'All resources of the rule'}</TD>
                  <TD className="max-w-sm text-muted">{e.reason}</TD>
                  <TD className="text-muted">
                    {e.requested_by_name ?? '—'}
                    {e.approved_by_name && <div className="text-xs">decided by {e.approved_by_name}</div>}
                  </TD>
                  <TD className="whitespace-nowrap tabular text-muted">{formatDate(e.expires_at)}</TD>
                  {isAdmin && (
                    <TD className="whitespace-nowrap text-right">
                      {e.status === 'pending' && (
                        <span className="inline-flex gap-1">
                          <Button size="sm" onClick={() => decide.mutate({ id: e.id, decision: 'approve' })}>
                            Approve
                          </Button>
                          <Button size="sm" variant="secondary" onClick={() => decide.mutate({ id: e.id, decision: 'reject' })}>
                            Reject
                          </Button>
                        </span>
                      )}
                      {e.status === 'approved' && (
                        <Button size="sm" variant="ghost" onClick={() => revoke.mutate(e.id)}>
                          Revoke
                        </Button>
                      )}
                    </TD>
                  )}
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </>
  );
}
