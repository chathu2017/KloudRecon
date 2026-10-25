import { zodResolver } from '@hookform/resolvers/zod';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ExternalLink,
  KeyRound,
  Lock,
  ShieldCheck,
  Terminal,
  MousePointerClick,
} from 'lucide-react';
import * as React from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { Link, useNavigate } from 'react-router-dom';
import { CodeBlock } from '@/components/CopyButton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, NativeSelect, Textarea } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { PageHeader } from '@/components/ui/misc';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { errorMessage, fieldErrors } from '@/lib/api/client';
import { cn } from '@/lib/utils';
import { useCreateConnection } from './api';
import { connectionSchema, toCreateBody, type ConnectionFormValues } from './form';
import {
  cliCommands,
  GRAPH_PERMISSIONS,
  KNOWN_LIMITS,
  PORTAL_STEPS,
  TIERS,
  type TierKey,
} from './content';
import { ConnectionStatusBadge, ValidationChecklist } from './ValidationChecklist';

const STEPS = ['Permissions', 'Set up in Azure', 'Connection details', 'Validate'] as const;

function Stepper({ step }: { step: number }) {
  return (
    <ol className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Setup progress">
      {STEPS.map((label, i) => {
        const done = i < step;
        const current = i === step;
        return (
          <li
            key={label}
            aria-current={current ? 'step' : undefined}
            className={cn(
              'flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-sm',
              current ? 'card-3d border-brand text-brand-strong' : 'well border-border text-muted',
            )}
          >
            <span
              className={cn(
                'flex size-6 shrink-0 items-center justify-center rounded-lg text-xs font-semibold',
                done
                  ? 'bg-success-soft text-success-strong'
                  : current
                    ? 'num-key'
                    : 'bg-surface text-muted shadow-[var(--raise-sm)]',
              )}
            >
              {done ? <Check className="size-3" aria-hidden /> : i + 1}
            </span>
            <span className="truncate font-medium">{label}</span>
          </li>
        );
      })}
    </ol>
  );
}

function defaultExpiry(): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().slice(0, 10);
}

export function ConnectionWizard() {
  const navigate = useNavigate();
  const [step, setStep] = React.useState(0);
  const [tiers, setTiers] = React.useState<Record<TierKey, boolean>>({
    core: true,
    identity: false,
    commitments: false,
  });
  const [cliSub, setCliSub] = React.useState('');
  const create = useCreateConnection();
  const form = useForm<ConnectionFormValues>({
    resolver: zodResolver(connectionSchema),
    defaultValues: {
      name: 'Production tenant',
      tenant_id: '',
      client_id: '',
      client_secret: '',
      secret_expires_on: defaultExpiry(),
      scope_type: 'all',
      subscription_ids: '',
      management_group_id: '',
    },
  });
  const e = form.formState.errors;
  const scopeType = useWatch({ control: form.control, name: 'scope_type' });

  const submit = form.handleSubmit((values) => {
    setStep(3);
    create.mutate(toCreateBody(values, tiers), {
      onError: (err) => {
        const fields = fieldErrors(err);
        for (const [key, message] of Object.entries(fields)) {
          if (key in values) form.setError(key as keyof ConnectionFormValues, { message });
        }
        setStep(2);
      },
    });
  });

  const saved = create.data;
  const status = saved?.connection.status;

  return (
    <>
      <PageHeader
        title="Connect Azure"
        description="Read-only access in about three minutes. We never need write permissions."
        actions={
          <Button asChild variant="ghost">
            <Link to="/app/settings/connections">
              <ArrowLeft /> Connections
            </Link>
          </Button>
        }
      />
      <Stepper step={step} />

      {step === 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Choose what KloudRecon may read</CardTitle>
            <CardDescription>
              Start with Core. You can add the optional tiers now or later.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {TIERS.map((tier) => {
              const required = tier.key === 'core';
              return (
                <label
                  key={tier.key}
                  className={cn(
                    'flex gap-4 rounded-lg border p-4 transition-colors',
                    tiers[tier.key] ? 'border-brand bg-brand-soft/40' : 'border-border',
                    !required && 'cursor-pointer hover:bg-surface-2',
                  )}
                >
                  <input
                    type="checkbox"
                    className="mt-1 size-4 accent-brand"
                    checked={tiers[tier.key]}
                    disabled={required}
                    onChange={(ev) => setTiers({ ...tiers, [tier.key]: ev.target.checked })}
                  />
                  <span className="min-w-0">
                    <span className="flex items-center gap-2 font-medium">
                      {tier.title}
                      <Badge tone={required ? 'brand' : 'neutral'}>{tier.badge}</Badge>
                    </span>
                    <span className="mt-1 block text-sm">
                      <span className="text-muted">Grant: </span>
                      {tier.grant}
                    </span>
                    <span className="mt-0.5 block text-sm">
                      <span className="text-muted">Unlocks: </span>
                      {tier.unlocks}
                    </span>
                  </span>
                </label>
              );
            })}
            <div className="flex items-start gap-3 rounded-lg bg-surface-2 p-4 text-sm text-muted">
              <Lock className="mt-0.5 size-4 shrink-0 text-brand-strong" aria-hidden />
              Reader cannot read secrets, keys, app settings or data. Your client secret is stored
              only in Azure Key Vault and is never shown again after you save it.
            </div>
            <div className="flex justify-end">
              <Button onClick={() => setStep(1)}>
                Continue <ArrowRight />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Create a read-only app registration</CardTitle>
            <CardDescription>Use the Azure portal or one Cloud Shell command.</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="portal">
              <TabsList>
                <TabsTrigger value="portal">
                  <MousePointerClick className="size-3.5" /> Azure portal
                </TabsTrigger>
                <TabsTrigger value="cli">
                  <Terminal className="size-3.5" /> Cloud Shell
                </TabsTrigger>
              </TabsList>
              <TabsContent value="portal">
                <ol className="grid gap-3">
                  {PORTAL_STEPS.map((s, i) => (
                    <li key={s.title} className="flex gap-3">
                      <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-surface text-xs font-semibold text-brand-strong shadow-[var(--raise-sm)] tabular">
                        {i + 1}
                      </span>
                      <div>
                        <div className="text-sm font-semibold">{s.title}</div>
                        <p className="text-sm text-muted">{s.text}</p>
                      </div>
                    </li>
                  ))}
                </ol>
                <a
                  href="https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade"
                  target="_blank"
                  rel="noreferrer"
                  className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-brand-strong hover:underline"
                >
                  Open App registrations <ExternalLink className="size-3.5" aria-hidden />
                </a>
              </TabsContent>
              <TabsContent value="cli" className="grid gap-3">
                <Field
                  label="Subscription ID (fills in the command)"
                  htmlFor="cli-sub"
                  hint="Optional. Leave empty to keep the placeholder."
                >
                  <Input
                    id="cli-sub"
                    className="font-mono"
                    placeholder="00000000-0000-0000-0000-000000000000"
                    value={cliSub}
                    onChange={(ev) => setCliSub(ev.target.value)}
                  />
                </Field>
                <CodeBlock code={cliCommands(cliSub)} />
              </TabsContent>
            </Tabs>
            {tiers.identity && (
              <div className="mt-5 rounded-lg border border-border p-4">
                <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                  <KeyRound className="size-4 text-brand-strong" aria-hidden /> Identity tier: Microsoft
                  Graph application permissions (grant admin consent)
                </div>
                <CodeBlock code={GRAPH_PERMISSIONS.join('\n')} />
              </div>
            )}
            <div className="mt-5 rounded-lg bg-surface-2 p-4">
              <div className="mb-1 text-sm font-medium">Good to know</div>
              <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
                {KNOWN_LIMITS.map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
            </div>
            <div className="mt-5 flex justify-between">
              <Button variant="ghost" onClick={() => setStep(0)}>
                <ArrowLeft /> Back
              </Button>
              <Button onClick={() => setStep(2)}>
                I have the IDs and secret <ArrowRight />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle>Connection details</CardTitle>
            <CardDescription>
              The secret goes straight to Key Vault. It is write-only: you can replace it, never
              read it back.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form noValidate className="grid gap-4 md:grid-cols-2" onSubmit={submit}>
              <Field label="Connection name" htmlFor="name" error={e.name?.message}>
                <Input id="name" aria-invalid={!!e.name} {...form.register('name')} />
              </Field>
              <Field label="Directory (tenant) ID" htmlFor="tenant_id" error={e.tenant_id?.message}>
                <Input
                  id="tenant_id"
                  className="font-mono"
                  autoComplete="off"
                  aria-invalid={!!e.tenant_id}
                  {...form.register('tenant_id')}
                />
              </Field>
              <Field
                label="Application (client) ID"
                htmlFor="client_id"
                error={e.client_id?.message}
              >
                <Input
                  id="client_id"
                  className="font-mono"
                  autoComplete="off"
                  aria-invalid={!!e.client_id}
                  {...form.register('client_id')}
                />
              </Field>
              <Field
                label="Client secret Value"
                htmlFor="client_secret"
                error={e.client_secret?.message}
                hint="The Value column, not the Secret ID."
              >
                <Input
                  id="client_secret"
                  type="password"
                  autoComplete="new-password"
                  aria-invalid={!!e.client_secret}
                  {...form.register('client_secret')}
                />
              </Field>
              <Field
                label="Secret expiry date"
                htmlFor="secret_expires_on"
                hint="We remind admins 30, 14, 7 and 1 days before it expires."
              >
                <Input id="secret_expires_on" type="date" {...form.register('secret_expires_on')} />
              </Field>
              <Field label="Scope" htmlFor="scope_type">
                <NativeSelect id="scope_type" {...form.register('scope_type')}>
                  <option value="all">All subscriptions the app can see</option>
                  <option value="subscriptions">Selected subscriptions</option>
                  <option value="management_group">A management group</option>
                </NativeSelect>
              </Field>
              {scopeType === 'subscriptions' && (
                <Field
                  label="Subscription IDs"
                  htmlFor="subscription_ids"
                  error={e.subscription_ids?.message}
                  className="md:col-span-2"
                  hint="One per line."
                >
                  <Textarea
                    id="subscription_ids"
                    className="font-mono"
                    aria-invalid={!!e.subscription_ids}
                    {...form.register('subscription_ids')}
                  />
                </Field>
              )}
              {scopeType === 'management_group' && (
                <Field
                  label="Management group ID"
                  htmlFor="management_group_id"
                  error={e.management_group_id?.message}
                  className="md:col-span-2"
                >
                  <Input
                    id="management_group_id"
                    className="font-mono"
                    aria-invalid={!!e.management_group_id}
                    {...form.register('management_group_id')}
                  />
                </Field>
              )}
              {create.isError && (
                <p role="alert" className="text-sm text-critical-strong md:col-span-2">
                  {errorMessage(create.error)}
                </p>
              )}
              <div className="flex justify-between md:col-span-2">
                <Button type="button" variant="ghost" onClick={() => setStep(1)}>
                  <ArrowLeft /> Back
                </Button>
                <Button type="submit" loading={create.isPending}>
                  <ShieldCheck /> Save & validate
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {step === 3 && (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle>
                {create.isPending ? 'Validating your connection…' : 'Validation result'}
              </CardTitle>
              {status && <ConnectionStatusBadge status={status} />}
            </div>
            <CardDescription>
              {create.isPending
                ? 'This takes up to 25 seconds.'
                : status === 'invalid'
                  ? 'Fix the failed checks, then validate again from the connection page.'
                  : 'Your first full scan starts right away. You can follow it live.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <ValidationChecklist
              pending={create.isPending}
              checks={saved?.validation?.checks ?? undefined}
            />
            {saved && (
              <div className="flex flex-wrap justify-end gap-2">
                <Button
                  onClick={() => void navigate(`/app/settings/connections/${saved.connection.id}`)}
                >
                  Open connection <ArrowRight />
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </>
  );
}
