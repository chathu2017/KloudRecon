import { AlertTriangle, CheckCircle2, KeyRound, Lightbulb, Users, XCircle } from 'lucide-react';
import * as React from 'react';
import { Link } from 'react-router-dom';
import { BarRows } from '@/components/charts/charts';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState, PageHeader, Skeleton } from '@/components/ui/misc';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatDate, str, timeAgo } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useIdentity } from './api';

type Row = Record<string, unknown>;

function Stat({ label, value, tone, hint }: { label: string; value: React.ReactNode; tone?: 'bad' | 'good'; hint?: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
      <div className="text-xs font-medium text-muted">{label}</div>
      <div className={cn('mt-1.5 kpi-value', tone === 'bad' && 'text-critical-strong', tone === 'good' && 'text-success-strong')}>{value}</div>
      {hint && <div className="mt-0.5 text-xs text-muted">{hint}</div>}
    </div>
  );
}

function YesNo({ ok, yes = 'Yes', no = 'No' }: { ok: boolean | null | undefined; yes?: string; no?: string }) {
  if (ok === null || ok === undefined) return <Badge tone="neutral">Not available</Badge>;
  return ok ? (
    <Badge tone="success">
      <CheckCircle2 aria-hidden />
      {yes}
    </Badge>
  ) : (
    <Badge tone="danger">
      <XCircle aria-hidden />
      {no}
    </Badge>
  );
}

function Ciem({ ciem }: { ciem: Row }) {
  const privileged = (ciem.privileged as Row[] | undefined) ?? [];
  const owners = (ciem.owners_by_scope as { scope: string; owners: Row[] }[] | undefined) ?? [];
  const suggestions = (ciem.suggestions as Row[] | undefined) ?? [];
  const byRole = (ciem.by_role as { role: string; count: number }[] | undefined) ?? [];
  const custom = (ciem.custom_roles as Row[] | undefined) ?? [];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Role assignments" value={str(ciem.total_assignments)} />
        <Stat label="Privileged assignments" value={str(ciem.privileged_assignments)} tone={Number(ciem.privileged_assignments) > 10 ? 'bad' : undefined} />
        <Stat label="Principals" value={str(ciem.principals)} />
        <Stat label="Guests with privileged roles" value={str(ciem.guests_with_privileged_roles)} tone={Number(ciem.guests_with_privileged_roles) ? 'bad' : 'good'} />
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lightbulb className="size-4 text-medium-strong" aria-hidden /> Least-privilege suggestions
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {suggestions.length === 0 ? (
              <p className="px-5 pb-5 text-sm text-muted">No suggestions.</p>
            ) : (
              <ul className="divide-y divide-border border-t border-border">
                {suggestions.map((s, i) => (
                  <li key={i} className="px-5 py-3 text-sm">
                    <div className="font-medium">
                      {str(s.principal_name) || str(s.role)} <span className="font-normal text-muted">· {str(s.role)} on {str(s.scope_label)}</span>
                    </div>
                    <p className="mt-0.5 text-muted">{str(s.suggestion)}</p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Assignments by role</CardTitle>
          </CardHeader>
          <CardContent>
            <BarRows rows={byRole.slice(0, 8).map((r) => ({ key: r.role, label: r.role, value: r.count }))} />
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Owners and access administrators by scope</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {owners.map((o) => (
            <div key={o.scope} className="rounded-md border border-border p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{o.scope}</span>
                <Badge tone={o.owners.length > 3 ? 'danger' : 'neutral'}>{o.owners.length}</Badge>
              </div>
              <ul className="mt-2 space-y-1 text-sm text-muted">
                {o.owners.map((a) => (
                  <li key={str(a.assignment_id)} className="flex items-center justify-between gap-2">
                    <span className="truncate">{str(a.principal_name)}</span>
                    <span className="shrink-0 text-xs">
                      {str(a.role)}
                      {a.guest ? ' · guest' : ''}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Privileged role assignments</CardTitle>
        </CardHeader>
        <Table>
          <THead>
            <TR>
              <TH>Principal</TH>
              <TH>Type</TH>
              <TH>Role</TH>
              <TH>Scope</TH>
            </TR>
          </THead>
          <TBody>
            {privileged.map((a) => (
              <TR key={str(a.assignment_id)}>
                <TD className="font-medium">
                  {str(a.principal_name)}
                  {a.guest ? (
                    <Badge tone="danger" className="ml-2">
                      Guest
                    </Badge>
                  ) : null}
                </TD>
                <TD className="text-muted">{str(a.principal_type)}</TD>
                <TD>
                  {str(a.role)}
                  {a.custom ? (
                    <Badge tone="warning" className="ml-2">
                      Custom
                    </Badge>
                  ) : null}
                </TD>
                <TD className="text-muted">
                  {str(a.scope_label)} <span className="text-xs text-subtle">({str(a.level)})</span>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
      {custom.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Custom roles</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {custom.map((r) => (
              <div key={str(r.name)} className="rounded-md border border-border p-3 text-sm">
                <div className="flex items-center gap-2 font-medium">
                  {str(r.name)}
                  {(r.risky_actions as string[]).length > 0 && (
                    <Badge tone="danger">
                      <AlertTriangle aria-hidden /> Can escalate privileges
                    </Badge>
                  )}
                </div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {(r.actions as string[]).map((a) => (
                    <code key={a} className={cn('rounded bg-surface-2 px-1.5 py-0.5 font-mono text-xs', (r.risky_actions as string[]).includes(a) && 'bg-critical-soft text-critical-strong')}>
                      {a}
                    </code>
                  ))}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Entra({ entra }: { entra: Row }) {
  const s = (entra.summary as Row | undefined) ?? {};
  const admins = (entra.admins as Row[] | undefined) ?? [];
  const guests = (entra.guests as Row[] | undefined) ?? [];
  const apps = (entra.applications as Row[] | undefined) ?? [];
  const ca = (entra.conditionalAccess as Row[] | null) ?? null;
  const missing = (entra.missing as string[] | undefined) ?? [];
  const authz = (entra.authorizationPolicy as Row | null) ?? null;
  const problemApps = apps.filter((a) => (a.high_privilege as string[]).length || (a.credentials as Row[]).some((c) => Number(c.days_left) < 30 || Number(c.lifetime_days) > 365));
  return (
    <div className="space-y-4">
      {missing.length > 0 && (
        <div className="rounded-md border border-medium/30 bg-medium-soft p-3 text-sm">
          Some Entra ID data is not available ({missing.join(', ')}). It needs more Microsoft Graph permissions or an Entra ID P1/P2 license.
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat label="MFA registered" value={s.mfa_coverage === null || s.mfa_coverage === undefined ? '—' : `${str(s.mfa_coverage)}%`} tone={Number(s.mfa_coverage) < 90 ? 'bad' : 'good'} hint={`${str(s.mfa_registered)} of ${str(s.members)} members`} />
        <Stat label="Admins without MFA" value={str(s.admins_without_mfa)} tone={Number(s.admins_without_mfa) ? 'bad' : 'good'} />
        <Stat label="Global administrators" value={str(s.global_admins)} tone={Number(s.global_admins) > 5 || Number(s.global_admins) < 2 ? 'bad' : 'good'} hint="recommended 2-5" />
        <Stat label="Guests" value={str(s.guests)} hint={`${str(s.stale_guests)} inactive 90+ days`} />
        <Stat label="Stale members" value={str(s.stale_users)} hint="no sign-in for 90+ days" />
        <Stat label="App credentials" value={`${str(s.credentials_expired)} / ${str(s.credentials_expiring)}`} hint="expired / expiring 30 days" tone={Number(s.credentials_expired) ? 'bad' : undefined} />
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Conditional Access and tenant settings</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="divide-y divide-border text-sm">
              {[
                ['Security defaults', <YesNo key="sd" ok={s.security_defaults as boolean | null} yes="On" no="Off" />],
                ['MFA required for all users', <YesNo key="all" ok={s.ca_mfa_all_users as boolean | null} />],
                ['MFA required for administrators', <YesNo key="adm" ok={s.ca_mfa_admins as boolean | null} />],
                ['Legacy authentication blocked', <YesNo key="leg" ok={s.legacy_auth_blocked as boolean | null} />],
                ['Guest invitations', <span key="inv" className="text-muted">{str(authz?.allowInvitesFrom) || '—'}</span>],
                ['Users can register apps', <YesNo key="apps" ok={authz ? !(authz.defaultUserRolePermissions as Row | undefined)?.allowedToCreateApps : null} yes="No" no="Yes" />],
              ].map(([k, v]) => (
                <div key={str(k)} className="flex items-center justify-between py-2">
                  <dt className="text-muted">{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
            {ca && (
              <div className="mt-4">
                <h4 className="mb-2 text-sm font-semibold">Conditional Access policies</h4>
                <ul className="space-y-1.5 text-sm">
                  {ca.map((p) => (
                    <li key={str(p.id)} className="flex items-center justify-between gap-2">
                      <span className="truncate">{str(p.displayName)}</span>
                      <Badge tone={p.state === 'enabled' ? 'success' : p.state === 'disabled' ? 'neutral' : 'warning'}>
                        {p.state === 'enabledForReportingButNotEnforced' ? 'Report-only' : str(p.state)}
                      </Badge>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Directory administrators</CardTitle>
          </CardHeader>
          <Table>
            <THead>
              <TR>
                <TH>Account</TH>
                <TH>Roles</TH>
                <TH>MFA</TH>
                <TH>Last sign-in</TH>
              </TR>
            </THead>
            <TBody>
              {admins.map((a) => (
                <TR key={str(a.id)}>
                  <TD className="max-w-56">
                    <span className="block truncate font-medium">{str(a.name)}</span>
                    <span className="text-xs text-muted">
                      {a.guest ? 'Guest' : 'Member'}
                      {a.synced ? ' · synced from AD' : ''}
                    </span>
                  </TD>
                  <TD className="text-xs text-muted">{(a.roles as string[]).join(', ')}</TD>
                  <TD>
                    <YesNo ok={a.mfa as boolean | null} />
                  </TD>
                  <TD className="text-muted">{a.last_sign_in ? timeAgo(str(a.last_sign_in)) : '—'}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>App registrations needing attention</CardTitle>
          </CardHeader>
          <Table>
            <THead>
              <TR>
                <TH>Application</TH>
                <TH>Credentials</TH>
                <TH>High-privilege permissions</TH>
              </TR>
            </THead>
            <TBody>
              {problemApps.map((a) => (
                <TR key={str(a.id)}>
                  <TD className="font-medium">{str(a.name)}</TD>
                  <TD className="text-xs">
                    {(a.credentials as Row[]).map((c, i) => {
                      const days = Number(c.days_left);
                      return (
                        <div key={i} className={cn(days < 0 ? 'text-critical-strong' : days < 30 ? 'text-high-strong' : 'text-muted')}>
                          {str(c.kind)} · {days < 0 ? `expired ${Math.abs(days)} d ago` : `expires ${formatDate(str(c.ends))}`}
                          {Number(c.lifetime_days) > 365 ? ' · long-lived' : ''}
                        </div>
                      );
                    })}
                  </TD>
                  <TD className="text-xs">{(a.high_privilege as string[]).join(', ') || '—'}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Guests</CardTitle>
          </CardHeader>
          <Table>
            <THead>
              <TR>
                <TH>Guest</TH>
                <TH>MFA</TH>
                <TH>Last sign-in</TH>
              </TR>
            </THead>
            <TBody>
              {guests.map((g) => (
                <TR key={str(g.id)}>
                  <TD className="max-w-64 truncate">{str(g.name).split('#EXT#')[0]}</TD>
                  <TD>
                    <YesNo ok={g.mfa as boolean | null} />
                  </TD>
                  <TD className="text-muted">{g.last_sign_in ? timeAgo(str(g.last_sign_in)) : '—'}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      </div>
    </div>
  );
}

export function IdentityPage() {
  const { data, isPending } = useIdentity();
  return (
    <>
      <PageHeader
        title="Identity"
        description="Who can do what in Azure (RBAC entitlements) and how well Microsoft Entra ID protects sign-ins."
        actions={
          <Link to="/app/security/findings?pillar=security&source=rule" className="text-sm font-medium text-brand-strong hover:underline">
            Identity findings →
          </Link>
        }
      />
      {isPending || !data ? (
        <Skeleton className="h-96" />
      ) : (
        <Tabs defaultValue="rbac">
          <TabsList>
            <TabsTrigger value="rbac">
              <KeyRound className="size-3.5" /> Azure RBAC
            </TabsTrigger>
            <TabsTrigger value="entra">
              <Users className="size-3.5" /> Microsoft Entra ID
            </TabsTrigger>
          </TabsList>
          <TabsContent value="rbac">
            <Ciem ciem={data.ciem} />
          </TabsContent>
          <TabsContent value="entra">
            {data.entra ? (
              <Entra entra={data.entra} />
            ) : (
              <EmptyState
                icon={<Users />}
                title="Identity tier not connected"
                description="Grant the Microsoft Graph application permissions (User.Read.All, Policy.Read.All, AuditLog.Read.All and more) on the connection to see MFA, Conditional Access, admins, guests and app credentials."
              />
            )}
          </TabsContent>
        </Tabs>
      )}
    </>
  );
}
