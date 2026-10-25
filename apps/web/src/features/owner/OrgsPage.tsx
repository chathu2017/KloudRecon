import { Building2, Search } from 'lucide-react';
import * as React from 'react';
import { Link } from 'react-router-dom';
import { StatusBadge } from '@/components/StatusBadge';
import { Card } from '@/components/ui/card';
import { Input, NativeSelect } from '@/components/ui/input';
import { EmptyState, PageHeader, Skeleton } from '@/components/ui/misc';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { formatDate } from '@/lib/format';
import { useDebounced } from '@/lib/hooks';
import { useOrgs, type OrgStatus } from './api';

export function OrgsPage() {
  const [q, setQ] = React.useState('');
  const [status, setStatus] = React.useState<OrgStatus | ''>('');
  const query = useDebounced(q);
  const { data, isPending } = useOrgs(status || undefined, query || undefined);

  return (
    <>
      <PageHeader title="Organizations" description="Every customer organization and its plan." />
      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <div className="relative sm:max-w-xs sm:flex-1">
          <Search
            className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle"
            aria-hidden
          />
          <Input
            className="pl-9"
            placeholder="Search by name"
            aria-label="Search organizations"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <NativeSelect
          className="sm:w-48"
          aria-label="Filter by status"
          value={status}
          onChange={(e) => setStatus(e.target.value as OrgStatus | '')}
        >
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="pending_approval">Pending approval</option>
          <option value="suspended">Suspended</option>
          <option value="rejected">Rejected</option>
        </NativeSelect>
      </div>
      {isPending ? (
        <Skeleton className="h-64" />
      ) : !data?.length ? (
        <EmptyState icon={<Building2 />} title="No organizations match" />
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <THead>
              <TR className="hover:bg-transparent">
                <TH>Organization</TH>
                <TH>Status</TH>
                <TH>Plan</TH>
                <TH>Owner</TH>
                <TH className="text-right">Members</TH>
                <TH>Created</TH>
              </TR>
            </THead>
            <TBody>
              {data.map((o) => (
                <TR key={o.id}>
                  <TD>
                    <Link to={`/owner/orgs/${o.id}`} className="font-medium hover:text-brand-strong">
                      {o.name}
                    </Link>
                    <div className="text-xs text-muted">{o.country ?? '—'}</div>
                  </TD>
                  <TD>
                    <StatusBadge status={o.status} />
                  </TD>
                  <TD>{o.plan_name ?? <span className="text-subtle">—</span>}</TD>
                  <TD className="text-muted">{o.owner_email ?? '—'}</TD>
                  <TD className="text-right tabular">{o.member_count}</TD>
                  <TD className="whitespace-nowrap text-muted">{formatDate(o.created_at)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      )}
    </>
  );
}
