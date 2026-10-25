import { Cable, Plus } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState, PageHeader, Skeleton } from '@/components/ui/misc';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { hasRole } from '@/components/layout/nav';
import { useMe } from '@/lib/auth/context';
import { timeAgo } from '@/lib/format';
import { useConnections } from './api';
import { ConnectionStatusBadge, SecretSummary } from './ValidationChecklist';

export function ConnectionsPage() {
  const { data: me } = useMe();
  const { data, isPending } = useConnections();
  const isAdmin = hasRole(me?.user?.org_role, 'admin');

  const addButton = isAdmin && (
    <Button asChild>
      <Link to="/app/settings/connections/new">
        <Plus /> Add connection
      </Link>
    </Button>
  );

  return (
    <>
      <PageHeader
        title="Connections"
        description="Read-only Azure app registrations that KloudRecon scans."
        actions={data?.length ? addButton : null}
      />
      {isPending ? (
        <Skeleton className="h-48" />
      ) : !data?.length ? (
        <EmptyState
          icon={<Cable />}
          title="Connect your Azure environment"
          description="Create a read-only app registration with the Reader role. It takes about three minutes, and we guide you through every step."
          action={addButton || <p className="text-sm text-muted">Ask an admin to connect Azure.</p>}
        />
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <THead>
              <TR className="hover:bg-transparent">
                <TH>Connection</TH>
                <TH>Status</TH>
                <TH>Subscriptions</TH>
                <TH>Client secret</TH>
                <TH>Last scan</TH>
              </TR>
            </THead>
            <TBody>
              {data.map((c) => (
                <TR key={c.id}>
                  <TD>
                    <Link
                      to={`/app/settings/connections/${c.id}`}
                      className="font-medium hover:text-brand-strong"
                    >
                      {c.name}
                    </Link>
                    {c.is_demo && (
                      <Badge tone="info" className="ml-2">
                        Demo
                      </Badge>
                    )}
                    <div className="font-mono text-xs text-muted">{c.tenant_id}</div>
                  </TD>
                  <TD>
                    <ConnectionStatusBadge status={c.status} />
                  </TD>
                  <TD className="tabular">
                    {c.enabled_subscription_count} of {c.subscription_count} enabled
                  </TD>
                  <TD className="text-sm">
                    {c.is_demo ? (
                      <span className="text-muted">Not needed</span>
                    ) : (
                      <SecretSummary stored={c.secret.stored} daysLeft={c.secret.days_left} />
                    )}
                  </TD>
                  <TD className="whitespace-nowrap text-muted">
                    {c.last_scan_at ? timeAgo(c.last_scan_at) : 'Never'}
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
