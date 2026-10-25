import { Check, CreditCard, ExternalLink, Lock, Trash2 } from 'lucide-react';
import * as React from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { PageHeader, Skeleton } from '@/components/ui/misc';
import { hasRole } from '@/components/layout/nav';
import { UsageBar } from '@/features/ai/AiSettingsPage';
import { api, errorMessage, unwrap } from '@/lib/api/client';
import { useAuth, useMe } from '@/lib/auth/context';
import { formatDate, formatMoney, formatNumber } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useBilling, useCheckout, usePortal, useUpgradeRequest, type Billing, type PlanOption } from './api';

const STATE: Record<Billing['state'], { label: string; tone: 'success' | 'brand' | 'warning' | 'danger' }> = {
  active: { label: 'Active', tone: 'success' },
  trial: { label: 'Trial', tone: 'brand' },
  grace: { label: 'Payment problem', tone: 'warning' },
  trial_expired: { label: 'Trial ended · read-only', tone: 'danger' },
  payment_overdue: { label: 'Payment overdue · read-only', tone: 'danger' },
  canceled: { label: 'Canceled · read-only', tone: 'danger' },
};

const LIMIT_LABEL: Record<string, string> = {
  connections: 'connections',
  subscriptions: 'subscriptions',
  scans_per_day: 'scans / day',
  ai_messages: 'AI messages / month',
  frameworks: 'compliance frameworks',
};
const FEATURE_LABEL: Record<string, string> = {
  all_reports: 'All PDF reports',
  custom_rules: 'Custom KQL rules',
  white_label: 'White-label reports',
  scheduled_reports: 'Scheduled reports',
  webhooks: 'Teams, Slack & webhooks',
  multi_tenant: 'Consultant multi-tenant',
  sla: 'SLA',
};

function limitText(key: string, value: unknown): string {
  const label = LIMIT_LABEL[key] ?? key;
  if (typeof value === 'number') return `${formatNumber(value)} ${label}`;
  return `Unlimited ${label}`;
}

function PlanCard({ plan, billing, canManage }: { plan: PlanOption; billing: Billing; canManage: boolean }) {
  const checkout = useCheckout();
  const request = useUpgradeRequest();
  const price = plan.price_monthly === null ? 'Custom' : Number(plan.price_monthly) === 0 ? 'Free' : formatMoney(plan.price_monthly, plan.currency);
  const features = Object.entries(plan.features).filter(([k, v]) => v === true && k in FEATURE_LABEL);
  const limits = Object.entries(plan.limits).filter(([k]) => k in LIMIT_LABEL);
  return (
    <Card className={cn('flex flex-col', plan.current && 'border-brand ring-1 ring-brand')}>
      <CardHeader className="space-y-1">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base">{plan.name}</CardTitle>
          {plan.current && <Badge tone="brand">Current plan</Badge>}
        </div>
        <div className="text-2xl font-semibold tabular">
          {price}
          {plan.price_monthly !== null && Number(plan.price_monthly) > 0 && <span className="text-sm font-normal text-muted"> / month</span>}
        </div>
        <CardDescription>{plan.description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4">
        <ul className="space-y-1.5 text-sm">
          {[...limits.map(([k, v]) => limitText(k, v)), ...features.map(([k]) => FEATURE_LABEL[k] ?? k)].map((t) => (
            <li key={t} className="flex items-start gap-2">
              <Check className="mt-0.5 size-4 shrink-0 text-success-strong" aria-hidden />
              {t}
            </li>
          ))}
        </ul>
        {canManage && !plan.current && plan.code !== 'trial' && (
          <div className="mt-auto">
            {plan.purchasable ? (
              <Button className="w-full" loading={checkout.isPending && checkout.variables === plan.code} onClick={() => checkout.mutate(plan.code)}>
                Choose {plan.name}
              </Button>
            ) : (
              <Button
                variant="secondary"
                className="w-full"
                loading={request.isPending && request.variables.plan_code === plan.code}
                onClick={() => request.mutate({ plan_code: plan.code })}
              >
                {billing.self_serve ? 'Contact sales' : `Request ${plan.name}`}
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function BillingPage() {
  const { data, isPending } = useBilling();
  const { data: me } = useMe();
  const portal = usePortal();
  const canManage = hasRole(me?.user?.org_role, 'admin');
  const isOwner = me?.user?.org_role === 'owner';
  const [params, setParams] = useSearchParams();
  React.useEffect(() => {
    const result = params.get('checkout');
    if (!result) return;
    if (result === 'success') toast.success('Thank you! Your plan updates as soon as the payment is confirmed.');
    setParams({}, { replace: true });
  }, [params, setParams]);

  if (isPending || !data) {
    return (
      <>
        <PageHeader title="Billing & plan" />
        <Skeleton className="h-64" />
      </>
    );
  }
  const state = STATE[data.state];
  return (
    <>
      <PageHeader
        title="Billing & plan"
        description="Your plan, what you use and how to change it."
        actions={
          canManage &&
          data.has_portal && (
            <Button variant="secondary" loading={portal.isPending} onClick={() => portal.mutate()}>
              <ExternalLink /> Manage payment
            </Button>
          )
        }
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <Card>
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-2">
              <CreditCard className="size-4 text-brand-strong" aria-hidden />
              {data.plan_name} plan
              <Badge tone={state.tone}>{state.label}</Badge>
            </CardTitle>
            <CardDescription>
              {data.state === 'trial' && data.trial_ends_at
                ? `Trial until ${formatDate(data.trial_ends_at)}.`
                : data.state === 'grace' && data.grace_ends_at
                  ? `Full access until ${formatDate(data.grace_ends_at)}, then read-only.`
                  : data.period_end
                    ? `Current period ends ${formatDate(data.period_end)}.`
                    : data.provider === 'manual'
                      ? 'Billed by KloudSchool.'
                      : null}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {data.read_only && (
              <p className="flex items-start gap-2 rounded-md bg-critical-soft p-3 text-sm text-critical-strong">
                <Lock className="mt-0.5 size-4 shrink-0" aria-hidden />
                {data.message} Your data stays available; scans, AI, reports and changes resume with a plan.
              </p>
            )}
            {data.usage.map((u) => (
              <UsageBar key={u.key} used={u.used} limit={u.limit ?? null} unit={u.label} />
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>How billing works</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted">
            {data.self_serve ? (
              <p>Plans are paid monthly by card through our payment provider. Change or cancel anytime from Manage payment.</p>
            ) : (
              <p>KloudSchool assigns your plan and invoices you. Use Request on a plan and we will set it up.</p>
            )}
            <p>If a payment fails, everything keeps working for a grace period. After that the organization becomes read-only until the payment is fixed; nothing is deleted.</p>
          </CardContent>
        </Card>
      </div>
      <h2 className="mb-3 mt-8 text-lg font-semibold">Plans</h2>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {data.plans.map((p) => (
          <PlanCard key={p.code} plan={p} billing={data} canManage={canManage} />
        ))}
      </div>
      {isOwner && me.org && <DangerZone orgName={me.org.name} />}
    </>
  );
}

/** Org Owner only: delete the organization (secrets now, all data purged by the worker). */
function DangerZone({ orgName }: { orgName: string }) {
  const [open, setOpen] = React.useState(false);
  const [confirm, setConfirm] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const remove = () => {
    setBusy(true);
    unwrap(api.DELETE('/api/v1/org', { params: { query: { confirm } } }))
      .then(async () => {
        toast.success('Your organization is deleted. Its data is being purged.');
        await signOut();
        void navigate('/', { replace: true });
      })
      .catch((e: unknown) => toast.error(errorMessage(e)))
      .finally(() => setBusy(false));
  };
  return (
    <Card className="mt-8 border-critical/40">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-critical-strong">
          <Trash2 className="size-4" aria-hidden /> Danger zone
        </CardTitle>
        <CardDescription>
          Deleting the organization removes every stored client secret immediately, signs out all members and purges
          all scan data, reports and files. This cannot be undone.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button variant="danger" onClick={() => setOpen(true)}>
          Delete organization
        </Button>
      </CardContent>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete {orgName}?</DialogTitle>
            <DialogDescription>Type the organization&apos;s name to confirm.</DialogDescription>
          </DialogHeader>
          <Input aria-label="Organization name" autoComplete="off" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" disabled={confirm !== orgName} loading={busy} onClick={remove}>
              Delete permanently
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
