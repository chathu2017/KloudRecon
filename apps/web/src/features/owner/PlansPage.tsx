import { Pencil, Plus } from 'lucide-react';
import * as React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input, Textarea } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { PageHeader, Skeleton } from '@/components/ui/misc';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { formatMoney, titleCase } from '@/lib/format';
import { usePlans, useSavePlan, type Plan, type PlanInput } from './api';

const EMPTY: PlanInput = {
  code: '',
  name: '',
  description: '',
  price_monthly: '0',
  currency: 'USD',
  limits: {},
  features: {},
  provider_prices: {},
  active: true,
  sort_order: 10,
};

function limitText(value: unknown): string {
  if (value === null) return 'Unlimited';
  return typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean'
    ? String(value)
    : JSON.stringify(value);
}

function toForm(plan: Plan | null): PlanInput {
  return plan
    ? {
        code: plan.code,
        name: plan.name,
        description: plan.description,
        price_monthly: plan.price_monthly,
        currency: plan.currency,
        limits: plan.limits,
        features: plan.features,
        provider_prices: plan.provider_prices as PlanInput['provider_prices'],
        active: plan.active,
        sort_order: plan.sort_order,
      }
    : EMPTY;
}

function PlanDialog({
  plan,
  open,
  onClose,
}: {
  plan: Plan | null;
  open: boolean;
  onClose: () => void;
}) {
  const save = useSavePlan();
  // Initial state from props; the parent remounts this dialog (key) for each plan it opens.
  const [form, setForm] = React.useState<PlanInput>(() => toForm(plan));
  const [limits, setLimits] = React.useState(() => JSON.stringify(toForm(plan).limits, null, 2));
  const [features, setFeatures] = React.useState(() =>
    JSON.stringify(toForm(plan).features, null, 2),
  );
  const setPrice = (provider: 'stripe' | 'paddle', value: string) => {
    const next = Object.fromEntries(
      Object.entries({ ...(form.provider_prices ?? {}), [provider]: value.trim() }).filter(([, v]) => v),
    );
    setForm({ ...form, provider_prices: next });
  };
  const [jsonError, setJsonError] = React.useState<string | null>(null);

  const submit = async () => {
    let parsedLimits: Record<string, unknown>;
    let parsedFeatures: Record<string, unknown>;
    try {
      parsedLimits = JSON.parse(limits) as Record<string, unknown>;
      parsedFeatures = JSON.parse(features) as Record<string, unknown>;
    } catch {
      setJsonError('Limits and features must be valid JSON objects.');
      return;
    }
    await save.mutateAsync({
      ...(plan ? { id: plan.id } : {}),
      body: { ...form, limits: parsedLimits, features: parsedFeatures },
    });
    onClose();
  };

  const set = <K extends keyof PlanInput>(key: K, value: PlanInput[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{plan ? `Edit ${plan.name}` : 'New plan'}</DialogTitle>
          <DialogDescription>
            Limits are enforced server-side. Use <code className="font-mono">null</code> for
            unlimited.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Code" htmlFor="code" hint="Lowercase letters, digits, - and _">
            <Input id="code" value={form.code} onChange={(e) => set('code', e.target.value)} />
          </Field>
          <Field label="Name" htmlFor="name">
            <Input id="name" value={form.name} onChange={(e) => set('name', e.target.value)} />
          </Field>
          <Field label="Price per month" htmlFor="price" hint="Leave empty for custom pricing">
            <Input
              id="price"
              type="number"
              min={0}
              step="0.01"
              value={form.price_monthly ?? ''}
              onChange={(e) => set('price_monthly', e.target.value === '' ? null : e.target.value)}
            />
          </Field>
          <Field label="Sort order" htmlFor="sort">
            <Input
              id="sort"
              type="number"
              value={form.sort_order}
              onChange={(e) => set('sort_order', Number(e.target.value))}
            />
          </Field>
          <Field label="Description" htmlFor="desc" className="sm:col-span-2">
            <Input
              id="desc"
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
            />
          </Field>
          <Field label="Limits (JSON)" htmlFor="limits">
            <Textarea
              id="limits"
              className="min-h-36 font-mono text-xs"
              value={limits}
              onChange={(e) => setLimits(e.target.value)}
            />
          </Field>
          <Field label="Features (JSON)" htmlFor="features">
            <Textarea
              id="features"
              className="min-h-36 font-mono text-xs"
              value={features}
              onChange={(e) => setFeatures(e.target.value)}
            />
          </Field>
          <Field label="Stripe price ID (optional)" htmlFor="stripe-price">
            <Input
              id="stripe-price"
              placeholder="price_…"
              className="font-mono text-xs"
              value={form.provider_prices?.stripe ?? ''}
              onChange={(e) => setPrice('stripe', e.target.value)}
            />
          </Field>
          <Field label="Paddle price ID (optional)" htmlFor="paddle-price">
            <Input
              id="paddle-price"
              placeholder="pri_…"
              className="font-mono text-xs"
              value={form.provider_prices?.paddle ?? ''}
              onChange={(e) => setPrice('paddle', e.target.value)}
            />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4 accent-brand"
              checked={form.active}
              onChange={(e) => set('active', e.target.checked)}
            />
            Active (available for approvals and on the pricing page)
          </label>
        </div>
        {jsonError && <p className="text-sm text-critical-strong">{jsonError}</p>}
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} loading={save.isPending}>
            Save plan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function PlansPage() {
  const { data, isPending } = usePlans();
  const [editing, setEditing] = React.useState<Plan | null>(null);
  const [open, setOpen] = React.useState(false);

  return (
    <>
      <PageHeader
        title="Plans"
        description="Prices, limits and features. With manual billing you assign plans when approving; with Stripe or Paddle, add the provider price IDs so customers can buy online."
        actions={
          <Button
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
          >
            <Plus /> New plan
          </Button>
        }
      />
      {isPending ? (
        <Skeleton className="h-64" />
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <THead>
              <TR className="hover:bg-transparent">
                <TH>Plan</TH>
                <TH className="text-right">Price</TH>
                <TH>Limits</TH>
                <TH>Status</TH>
                <TH />
              </TR>
            </THead>
            <TBody>
              {data?.map((p) => (
                <TR key={p.id}>
                  <TD>
                    <div className="font-medium">{p.name}</div>
                    <div className="font-mono text-xs text-muted">{p.code}</div>
                  </TD>
                  <TD className="text-right tabular">
                    {formatMoney(p.price_monthly, p.currency)}
                    {p.price_monthly !== null && <span className="text-muted">/mo</span>}
                  </TD>
                  <TD>
                    <div className="flex flex-wrap gap-1">
                      {Object.entries(p.limits).map(([k, v]) => (
                        <Badge key={k}>
                          {titleCase(k)}: {limitText(v)}
                        </Badge>
                      ))}
                    </div>
                  </TD>
                  <TD>
                    {p.active ? <Badge tone="success">Active</Badge> : <Badge>Inactive</Badge>}
                  </TD>
                  <TD className="text-right">
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`Edit ${p.name}`}
                      onClick={() => {
                        setEditing(p);
                        setOpen(true);
                      }}
                    >
                      <Pencil />
                    </Button>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      )}
      <PlanDialog
        key={`${editing?.id ?? 'new'}-${String(open)}`}
        plan={editing}
        open={open}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
