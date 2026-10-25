import { ScrollText, Search } from 'lucide-react';
import * as React from 'react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { EmptyState, PageHeader, Skeleton } from '@/components/ui/misc';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { formatDateTime } from '@/lib/format';
import { useAuditLogs, type AuditLog } from './api';
import { useDebounced } from '@/lib/hooks';

function summarize(details: Record<string, unknown>): string {
  return Object.entries(details)
    .filter(([, v]) => v !== null && v !== undefined && v !== '')
    .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : String(v)}`)
    .join(' · ');
}

export function AuditTable({ rows, loading }: { rows: AuditLog[]; loading: boolean }) {
  if (loading) {
    return (
      <div className="space-y-2 p-5">
        <Skeleton className="h-9" />
        <Skeleton className="h-9" />
      </div>
    );
  }
  if (!rows.length) {
    return <div className="px-5 pb-6 text-sm text-muted">No activity recorded yet.</div>;
  }
  return (
    <Table>
      <THead>
        <TR className="hover:bg-transparent">
          <TH>When</TH>
          <TH>Actor</TH>
          <TH>Action</TH>
          <TH>Details</TH>
          <TH>IP</TH>
        </TR>
      </THead>
      <TBody>
        {rows.map((a) => (
          <TR key={a.id}>
            <TD className="whitespace-nowrap text-muted">{formatDateTime(a.created_at)}</TD>
            <TD className="text-sm">{a.actor_email ?? 'system'}</TD>
            <TD>
              <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-xs">
                {a.action}
              </code>
            </TD>
            <TD className="max-w-md truncate text-xs text-muted" title={summarize(a.details)}>
              {summarize(a.details) || a.target}
            </TD>
            <TD className="font-mono text-xs text-muted">{a.ip ?? '—'}</TD>
          </TR>
        ))}
      </TBody>
    </Table>
  );
}

export function OwnerAuditPage() {
  const [action, setAction] = React.useState('');
  const debounced = useDebounced(action);
  const { data, isPending } = useAuditLogs(debounced || undefined);
  return (
    <>
      <PageHeader
        title="Audit log"
        description="Sensitive actions across the platform: approvals, roles, invitations and owner changes."
      />
      <div className="relative mb-4 max-w-xs">
        <Search
          className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle"
          aria-hidden
        />
        <Input
          className="pl-9"
          placeholder="Filter by action, e.g. registration"
          aria-label="Filter by action"
          value={action}
          onChange={(e) => setAction(e.target.value)}
        />
      </div>
      {!isPending && !data?.length ? (
        <EmptyState icon={<ScrollText />} title="No matching entries" />
      ) : (
        <Card className="overflow-hidden">
          <AuditTable rows={data ?? []} loading={isPending} />
        </Card>
      )}
    </>
  );
}
