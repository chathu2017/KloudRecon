import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Ban, Eye, PlayCircle } from 'lucide-react';
import * as React from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { StatusBadge } from '@/components/StatusBadge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, NativeSelect, Textarea } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { PageHeader, Skeleton } from '@/components/ui/misc';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { errorMessage } from '@/lib/api/client';
import { formatDate, formatDateTime, titleCase } from '@/lib/format';
import { startViewAs } from '@/lib/view-as';
import { AuditTable } from './AuditPage';
import { requestViewAs } from './platformApi';
import {
  useAuditLogs,
  useOrg,
  usePlans,
  useSuspendOrg,
  useUpdateOrg,
  type OwnerOrgDetail,
  type Plan,
} from './api';

/** Read-only, audited view of the customer app as this organization (decision 0039). */
function ViewAsButton({ orgId, orgName }: { orgId: string; orgName: string }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [busy, setBusy] = React.useState(false);
  return (
    <Button
      variant="secondary"
      loading={busy}
      onClick={() => {
        setBusy(true);
        requestViewAs(orgId)
          .then((grant) => {
            startViewAs({
              token: grant.token,
              orgId: grant.org_id,
              orgName: grant.org_name || orgName,
              expiresAt: Date.now() + grant.expires_in * 1000,
            });
            qc.clear();
            void navigate('/app');
          })
          .catch((e: unknown) => toast.error(errorMessage(e)))
          .finally(() => setBusy(false));
      }}
    >
      <Eye /> View as organization
    </Button>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 text-sm">{children}</dd>
    </div>
  );
}

function PlanNotesForm({ org, plans }: { org: OwnerOrgDetail; plans: Plan[] }) {
  const update = useUpdateOrg(org.id);
  const [notes, setNotes] = React.useState(org.owner_notes ?? '');
  const [planCode, setPlanCode] = React.useState(
    plans.find((p) => p.id === org.plan_id)?.code ?? '',
  );
  const [trialEnds, setTrialEnds] = React.useState(
    org.trial_ends_at ? org.trial_ends_at.slice(0, 10) : '',
  );

  const save = () =>
    update.mutate({
      owner_notes: notes,
      ...(planCode ? { plan_code: planCode } : {}),
      trial_ends_at: trialEnds ? new Date(`${trialEnds}T23:59:59Z`).toISOString() : null,
    });

  return (
    <CardContent className="space-y-4">
      <Field label="Plan" htmlFor="plan">
        <NativeSelect id="plan" value={planCode} onChange={(e) => setPlanCode(e.target.value)}>
          <option value="">No plan</option>
          {plans.map((p) => (
            <option key={p.id} value={p.code}>
              {p.name}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field label="Trial ends" htmlFor="trial" hint="Extend or clear the trial.">
        <Input
          id="trial"
          type="date"
          value={trialEnds}
          onChange={(e) => setTrialEnds(e.target.value)}
        />
      </Field>
      <Field label="Internal notes" htmlFor="notes">
        <Textarea
          id="notes"
          value={notes}
          maxLength={5000}
          onChange={(e) => setNotes(e.target.value)}
        />
      </Field>
      <Button onClick={save} loading={update.isPending}>
        Save changes
      </Button>
    </CardContent>
  );
}

export function OrgDetailPage() {
  const { orgId = '' } = useParams();
  const { data: org, isPending } = useOrg(orgId);
  const plans = usePlans();
  const suspend = useSuspendOrg(orgId);
  const audit = useAuditLogs(undefined, orgId);

  if (isPending || !org || plans.isPending) return <Skeleton className="h-96" />;

  return (
    <>
      <Link
        to="/owner/orgs"
        className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-text"
      >
        <ArrowLeft className="size-4" /> Organizations
      </Link>
      <PageHeader
        title={org.name}
        description={
          <span className="flex items-center gap-2">
            <StatusBadge status={org.status} />
            {org.plan_name && <Badge tone="brand">{org.plan_name}</Badge>}
          </span>
        }
        actions={
          org.status === 'active' ? (
            <>
              <ViewAsButton orgId={org.id} orgName={org.name} />
              <Button
                variant="secondary"
                loading={suspend.isPending}
                onClick={() => suspend.mutate(true)}
              >
                <Ban /> Suspend
              </Button>
            </>
          ) : org.status === 'suspended' ? (
            <Button loading={suspend.isPending} onClick={() => suspend.mutate(false)}>
              <PlayCircle /> Reactivate
            </Button>
          ) : null
        }
      />
      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Profile</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-4 sm:grid-cols-3">
              <Detail label="Country">{org.country ?? '—'}</Detail>
              <Detail label="Company size">{org.size ?? '—'}</Detail>
              <Detail label="Industry">{org.industry ?? '—'}</Detail>
              <Detail label="Registered">{formatDateTime(org.created_at)}</Detail>
              <Detail label="Approved">{formatDateTime(org.approved_at)}</Detail>
              <Detail label="Trial ends">{formatDate(org.trial_ends_at)}</Detail>
            </dl>
            <div className="mt-4">
              <Detail label="Use case">{org.use_case ?? '—'}</Detail>
            </div>
            {org.rejection_reason && (
              <div className="mt-4 rounded-md bg-critical-soft px-3 py-2 text-sm text-critical-strong">
                Rejected: {org.rejection_reason}
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Plan & notes</CardTitle>
            <CardDescription>Only visible to KloudSchool.</CardDescription>
          </CardHeader>
          <PlanNotesForm
            key={`${org.id}-${org.plan_id ?? ''}-${org.trial_ends_at ?? ''}-${org.owner_notes ?? ''}`}
            org={org}
            plans={plans.data ?? []}
          />
        </Card>
      </div>

      <Card className="mt-4 overflow-hidden">
        <CardHeader>
          <CardTitle>Members</CardTitle>
        </CardHeader>
        <Table>
          <THead>
            <TR className="hover:bg-transparent">
              <TH>Name</TH>
              <TH>Role</TH>
              <TH>Status</TH>
              <TH>Last sign-in</TH>
            </TR>
          </THead>
          <TBody>
            {org.members.map((m) => (
              <TR key={m.id}>
                <TD>
                  <div className="font-medium">{m.name || m.email}</div>
                  <div className="text-xs text-muted">{m.email}</div>
                </TD>
                <TD>{titleCase(m.org_role ?? '—')}</TD>
                <TD>
                  <StatusBadge status={m.status} />
                </TD>
                <TD className="text-muted">{formatDateTime(m.last_login_at)}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>

      <Card className="mt-4 overflow-hidden">
        <CardHeader>
          <CardTitle>Activity</CardTitle>
          <CardDescription>Audit log for this organization.</CardDescription>
        </CardHeader>
        <AuditTable rows={audit.data ?? []} loading={audit.isPending} />
      </Card>
    </>
  );
}
