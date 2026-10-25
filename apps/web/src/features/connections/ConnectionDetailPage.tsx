import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, KeyRound, RefreshCw, Trash2 } from 'lucide-react';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { z } from 'zod';
import { hasRole } from '@/components/layout/nav';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { EmptyState, PageHeader, Skeleton } from '@/components/ui/misc';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { errorMessage } from '@/lib/api/client';
import { ConnectionScanPanel } from '@/features/scans/ConnectionScanPanel';
import { useMe } from '@/lib/auth/context';
import { formatDateTime, titleCase } from '@/lib/format';
import {
  useConnection,
  useDeleteConnection,
  useReplaceSecret,
  useUpdateSubscription,
  useValidateConnection,
  type ConnectionDetail,
} from './api';
import { ConnectionStatusBadge, SecretSummary, ValidationChecklist } from './ValidationChecklist';

const secretSchema = z.object({
  client_secret: z
    .string()
    .trim()
    .min(8, 'Paste the new client secret Value.')
    .refine(
      (v) => !/^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(v),
      'This looks like the secret ID. Copy the secret Value instead.',
    ),
  secret_expires_on: z.string().optional(),
});
type SecretValues = z.infer<typeof secretSchema>;

function ReplaceSecretDialog({
  connection,
  open,
  onOpenChange,
}: {
  connection: ConnectionDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const replace = useReplaceSecret(connection.id);
  const form = useForm<SecretValues>({
    resolver: zodResolver(secretSchema),
    defaultValues: { client_secret: '', secret_expires_on: '' },
  });
  const e = form.formState.errors;
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) form.reset();
        onOpenChange(v);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Replace client secret</DialogTitle>
          <DialogDescription>
            The new secret replaces the old one in Key Vault, then we validate again.
          </DialogDescription>
        </DialogHeader>
        <form
          noValidate
          className="grid gap-4"
          onSubmit={form.handleSubmit((values) =>
            replace.mutate(
              {
                client_secret: values.client_secret,
                secret_expires_on: values.secret_expires_on || null,
              },
              {
                onSuccess: (res) => {
                  toast[res.validation?.status === 'invalid' ? 'error' : 'success'](
                    res.validation?.status === 'invalid'
                      ? 'Secret saved, but validation failed'
                      : 'Secret replaced and validated',
                  );
                  form.reset();
                  onOpenChange(false);
                },
                onError: (err) => toast.error(errorMessage(err)),
              },
            ),
          )}
        >
          <Field
            label="New client secret Value"
            htmlFor="new_secret"
            error={e.client_secret?.message}
          >
            <Input
              id="new_secret"
              type="password"
              autoComplete="new-password"
              aria-invalid={!!e.client_secret}
              {...form.register('client_secret')}
            />
          </Field>
          <Field label="Expiry date" htmlFor="new_expiry">
            <Input id="new_expiry" type="date" {...form.register('secret_expires_on')} />
          </Field>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={replace.isPending}>
              Replace & validate
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteDialog({
  connection,
  open,
  onOpenChange,
}: {
  connection: ConnectionDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [typed, setTyped] = React.useState('');
  const remove = useDeleteConnection();
  const navigate = useNavigate();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete connection</DialogTitle>
          <DialogDescription>
            This deletes the client secret from Key Vault and all scans, inventory and change
            history of this connection. It cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <Field label={`Type "${connection.name}" to confirm`} htmlFor="confirm-name">
          <Input id="confirm-name" value={typed} onChange={(e) => setTyped(e.target.value)} />
        </Field>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            disabled={typed !== connection.name}
            loading={remove.isPending}
            onClick={() =>
              remove.mutate(connection.id, {
                onSuccess: () => void navigate('/app/settings/connections'),
              })
            }
          >
            <Trash2 /> Delete connection
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium text-muted">{label}</dt>
      <dd className="mt-1 text-sm">{children}</dd>
    </div>
  );
}

function scopeText(scope: Record<string, unknown>): string {
  if (scope.type === 'subscriptions') {
    const ids = Array.isArray(scope.subscription_ids) ? scope.subscription_ids.length : 0;
    return `${ids} selected subscription${ids === 1 ? '' : 's'}`;
  }
  if (scope.type === 'management_group')
    return `Management group ${typeof scope.management_group_id === 'string' ? scope.management_group_id : ''}`;
  return 'All subscriptions the app can see';
}

export function ConnectionDetailPage() {
  const { connectionId = '' } = useParams();
  const { data: me } = useMe();
  const { data: conn, isPending, isError } = useConnection(connectionId);
  const validate = useValidateConnection(connectionId);
  const updateSub = useUpdateSubscription();
  const [secretOpen, setSecretOpen] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const isAdmin = hasRole(me?.user?.org_role, 'admin');

  if (isPending) return <Skeleton className="h-96" />;
  if (isError)
    return (
      <EmptyState tone="error"
        title="Connection not found"
        action={
          <Button asChild variant="secondary">
            <Link to="/app/settings/connections">Back to connections</Link>
          </Button>
        }
      />
    );

  const tiers = Object.entries(conn.tiers)
    .filter(([, on]) => on === true)
    .map(([k]) => titleCase(k));

  return (
    <>
      <PageHeader
        title={conn.name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <ConnectionStatusBadge status={conn.status} />
            {conn.is_demo && <Badge tone="info">Demo data</Badge>}
            <span>Validated {formatDateTime(conn.validated_at)}</span>
          </span>
        }
        actions={
          <>
            <Button asChild variant="ghost">
              <Link to="/app/settings/connections">
                <ArrowLeft /> Connections
              </Link>
            </Button>
            {isAdmin && (
              <Button
                variant="secondary"
                loading={validate.isPending}
                onClick={() => validate.mutate()}
              >
                <RefreshCw /> Validate again
              </Button>
            )}
          </>
        }
      />

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="grid gap-4 xl:col-span-2">
          <ConnectionScanPanel connection={conn} />
          <Card>
            <CardHeader>
              <CardTitle>Validation checklist</CardTitle>
              <CardDescription>
                {conn.validation
                  ? `Last checked ${conn.validated_at ? formatDateTime(conn.validated_at) : ''} (took ${(conn.validation.duration_ms / 1000).toFixed(1)} s). Changed something in Azure since then? Select Validate again.`
                  : 'Not validated yet.'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {validate.isPending ? (
                <ValidationChecklist pending />
              ) : conn.validation ? (
                <ValidationChecklist checks={conn.validation.checks} />
              ) : (
                <p className="text-sm text-muted">Run a validation to see the checklist.</p>
              )}
            </CardContent>
          </Card>

          <Card className="overflow-hidden">
            <CardHeader>
              <CardTitle>Subscriptions</CardTitle>
              <CardDescription>
                Disabled subscriptions are not scanned. Production subscriptions raise the risk of
                their findings.
              </CardDescription>
            </CardHeader>
            {conn.subscriptions.length === 0 ? (
              <CardContent>
                <p className="text-sm text-muted">No subscriptions found yet.</p>
              </CardContent>
            ) : (
              <Table>
                <THead>
                  <TR className="hover:bg-transparent">
                    <TH>Subscription</TH>
                    <TH>State</TH>
                    <TH>Cost data</TH>
                    <TH className="text-center">Scan</TH>
                    <TH className="text-center">Production</TH>
                  </TR>
                </THead>
                <TBody>
                  {conn.subscriptions.map((s) => (
                    <TR key={s.id}>
                      <TD>
                        <div className="font-medium">{s.name}</div>
                        <div className="font-mono text-xs text-muted">{s.subscription_id}</div>
                        {s.disabled_reason && (
                          <div className="text-xs text-medium-strong">{s.disabled_reason}</div>
                        )}
                      </TD>
                      <TD className="text-sm">{s.state}</TD>
                      <TD className="text-sm">
                        {s.cost_available === null
                          ? '—'
                          : s.cost_available
                            ? 'Available'
                            : 'Not available'}
                      </TD>
                      <TD className="text-center">
                        <input
                          type="checkbox"
                          className="size-4 accent-brand"
                          aria-label={`Scan ${s.name}`}
                          checked={s.enabled}
                          disabled={!isAdmin || updateSub.isPending}
                          onChange={(e) =>
                            updateSub.mutate({ id: s.id, body: { enabled: e.target.checked } })
                          }
                        />
                      </TD>
                      <TD className="text-center">
                        <input
                          type="checkbox"
                          className="size-4 accent-brand"
                          aria-label={`${s.name} is production`}
                          checked={s.is_production}
                          disabled={!isAdmin || updateSub.isPending}
                          onChange={(e) =>
                            updateSub.mutate({
                              id: s.id,
                              body: { is_production: e.target.checked },
                            })
                          }
                        />
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </Card>
        </div>

        <div className="grid content-start gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-4">
                <Detail label="Directory (tenant) ID">
                  <span className="font-mono text-xs">{conn.tenant_id}</span>
                </Detail>
                <Detail label="Application (client) ID">
                  <span className="font-mono text-xs">{conn.client_id}</span>
                </Detail>
                <Detail label="Client secret">
                  {conn.is_demo ? (
                    <span className="text-muted">Not needed for demo data</span>
                  ) : (
                    <SecretSummary stored={conn.secret.stored} daysLeft={conn.secret.days_left} />
                  )}
                </Detail>
                <Detail label="Scope">{scopeText(conn.scope)}</Detail>
                <Detail label="Permission tiers">{tiers.join(', ')}</Detail>
                {conn.management_groups.length > 0 && (
                  <Detail label="Management groups">
                    <ul className="space-y-0.5">
                      {conn.management_groups.map((m) => (
                        <li key={m.mg_id}>{m.name}</li>
                      ))}
                    </ul>
                  </Detail>
                )}
              </dl>
              {isAdmin && !conn.is_demo && (
                <Button
                  variant="secondary"
                  className="mt-5 w-full"
                  onClick={() => setSecretOpen(true)}
                >
                  <KeyRound /> Replace secret
                </Button>
              )}
            </CardContent>
          </Card>
          {isAdmin && (
            <Card className="border-critical/40">
              <CardHeader>
                <CardTitle>Danger zone</CardTitle>
                <CardDescription>
                  Deleting removes the secret and all data of this connection.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button variant="danger" className="w-full" onClick={() => setDeleteOpen(true)}>
                  <Trash2 /> Delete connection
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
      <ReplaceSecretDialog connection={conn} open={secretOpen} onOpenChange={setSecretOpen} />
      <DeleteDialog connection={conn} open={deleteOpen} onOpenChange={setDeleteOpen} />
    </>
  );
}
