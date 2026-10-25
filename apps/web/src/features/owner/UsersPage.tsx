import { Search, Users } from 'lucide-react';
import * as React from 'react';
import { StatusBadge } from '@/components/StatusBadge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input, NativeSelect } from '@/components/ui/input';
import { EmptyState, PageHeader, Skeleton } from '@/components/ui/misc';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { useMe } from '@/lib/auth/context';
import { formatDateTime, titleCase } from '@/lib/format';
import { useSuspendUser, useUsers, type OrgStatus } from './api';
import { useDebounced } from '@/lib/hooks';

export function UsersPage() {
  const [q, setQ] = React.useState('');
  const [status, setStatus] = React.useState<OrgStatus | ''>('');
  const query = useDebounced(q);
  const { data, isPending } = useUsers(query || undefined, status || undefined);
  const suspend = useSuspendUser();
  const { data: me } = useMe();

  return (
    <>
      <PageHeader title="Users" description="Everyone with a KloudRecon profile." />
      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <div className="relative sm:max-w-xs sm:flex-1">
          <Search
            className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle"
            aria-hidden
          />
          <Input
            className="pl-9"
            placeholder="Search name or email"
            aria-label="Search users"
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
        <EmptyState icon={<Users />} title="No users match" />
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <THead>
              <TR className="hover:bg-transparent">
                <TH>User</TH>
                <TH>Organization</TH>
                <TH>Role</TH>
                <TH>Status</TH>
                <TH>Last sign-in</TH>
                <TH className="text-right">Actions</TH>
              </TR>
            </THead>
            <TBody>
              {data.map((u) => (
                <TR key={u.id}>
                  <TD>
                    <div className="font-medium">{u.name || u.email}</div>
                    <div className="text-xs text-muted">{u.email}</div>
                  </TD>
                  <TD className="text-muted">{u.org_name ?? '—'}</TD>
                  <TD>
                    {u.platform_role === 'owner' ? (
                      <Badge tone="brand">Platform Owner</Badge>
                    ) : (
                      titleCase(u.org_role ?? '—')
                    )}
                  </TD>
                  <TD>
                    <StatusBadge status={u.status} />
                  </TD>
                  <TD className="whitespace-nowrap text-muted">
                    {formatDateTime(u.last_login_at)}
                  </TD>
                  <TD className="text-right">
                    {u.id !== me?.user?.id && u.status === 'active' && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => suspend.mutate({ id: u.id, suspend: true })}
                      >
                        Suspend
                      </Button>
                    )}
                    {u.status === 'suspended' && (
                      <Button
                        size="sm"
                        onClick={() => suspend.mutate({ id: u.id, suspend: false })}
                      >
                        Reactivate
                      </Button>
                    )}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      )}
    </>
  );
}
