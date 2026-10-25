import {
  Activity,
  ArrowRight,
  Building2,
  Clock,
  Database,
  Users,
} from 'lucide-react';
import type * as React from 'react';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader, Skeleton } from '@/components/ui/misc';
import { formatBytes, formatDuration } from '@/lib/format';
import { useNow } from '@/lib/hooks';
import { cn } from '@/lib/utils';
import { useOwnerOverview, useRegistrations } from './api';
import { WorkerList } from './WorkerList';

export function Kpi({
  label,
  value,
  icon,
  hint,
  to,
  highlight = false,
}: {
  label: string;
  value: React.ReactNode;
  icon: React.ReactNode;
  hint?: string;
  to?: string;
  highlight?: boolean;
}) {
  const body = (
    <Card
      className={cn(
        'h-full p-4 transition-colors',
        to && 'hover:border-border-strong',
        highlight && 'border-brand',
      )}
    >
      <div className="flex items-center justify-between text-xs font-semibold text-muted">
        {label}
        <span className="icon-tile icon-tile-sm">{icon}</span>
      </div>
      <div className="mt-2 kpi-value">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-muted">{hint}</div>}
    </Card>
  );
  return to ? <Link to={to}>{body}</Link> : body;
}

export function OwnerOverviewPage() {
  const { data, isPending } = useOwnerOverview();
  const queue = useRegistrations();
  const now = useNow(30_000);

  return (
    <>
      <PageHeader
        title="Owner overview"
        description="Registrations, customers and platform health."
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {isPending || !data ? (
          [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-32" />)
        ) : (
          <>
            <Kpi
              label="Pending approvals"
              value={data.pending_registrations}
              icon={<Clock />}
              hint="Waiting for your review"
              to="/owner/approvals"
              highlight={data.pending_registrations > 0}
            />
            <Kpi
              label="Active organizations"
              value={data.active_orgs}
              icon={<Building2 />}
              hint={`${data.total_orgs} in total`}
              to="/owner/orgs"
            />
            <Kpi label="Users" value={data.total_users} icon={<Users />} to="/owner/users" />
            <Kpi
              label="Job queue"
              value={data.jobs.queued ?? 0}
              icon={<Activity />}
              hint={`${data.jobs.running ?? 0} running · ${data.jobs.dead ?? 0} dead`}
            />
          </>
        )}
      </div>

      <div className="mt-6 grid items-start gap-4 xl:grid-cols-5">
        <Card className="xl:col-span-3">
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle>Approval queue</CardTitle>
              <CardDescription>Oldest first. Customers wait on this list.</CardDescription>
            </div>
            <Button asChild variant="secondary" size="sm">
              <Link to="/owner/approvals">
                Open queue <ArrowRight />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            {queue.isPending ? (
              <div className="space-y-2 p-5">
                <Skeleton className="h-10" />
                <Skeleton className="h-10" />
              </div>
            ) : queue.data?.length ? (
              <ul className="divide-y divide-border border-t border-border">
                {queue.data.slice(0, 6).map((r) => (
                  <li key={r.org.id} className="flex items-center justify-between gap-4 px-5 py-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{r.org.name}</div>
                      <div className="truncate text-xs text-muted">
                        {r.owner?.email} · {r.org.country ?? '—'}
                      </div>
                    </div>
                    <Badge tone={r.waiting_seconds > 86_400 ? 'high' : 'warning'}>
                      <Clock aria-hidden />
                      {formatDuration(r.waiting_seconds)}
                    </Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="border-t border-border px-5 py-3 text-sm text-muted">No registrations are waiting.</p>
            )}
          </CardContent>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>System health</CardTitle>
            <CardDescription>Worker heartbeats (every 60 s) and database size.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="flex items-center justify-between border-t border-border px-4 py-2.5 text-sm">
              <span className="flex items-center gap-2 text-muted">
                <Database className="size-4" aria-hidden /> Database size
              </span>
              <span className="font-mono tabular">{formatBytes(data?.db_size_bytes)}</span>
            </div>
            <div className="border-t border-border">
              <WorkerList workers={data?.workers ?? []} now={now} />
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
