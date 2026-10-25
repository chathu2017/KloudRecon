import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { PageHeader } from '@/components/ui/misc';
import { api, errorMessage, unwrap, type Schemas } from '@/lib/api/client';
import { meQueryKey, useMe } from '@/lib/auth/context';
import { titleCase } from '@/lib/format';

const schema = z.object({
  name: z.string().trim().min(1, 'Enter your name.').max(200),
  job_title: z.string().trim().max(120),
  phone: z
    .string()
    .trim()
    .max(40)
    .regex(/^[+0-9 ()-]*$/, 'Digits, spaces, +, - and parentheses only.'),
});
type Values = z.infer<typeof schema>;

const PREFS = [
  {
    key: 'email_product',
    label: 'Product and account emails',
    hint: 'Approvals, team changes, reports.',
  },
  {
    key: 'email_scans',
    label: 'Scan results by email',
    hint: 'When a first scan finishes or a scan fails.',
  },
  {
    key: 'email_security',
    label: 'Security alerts by email',
    hint: 'Risky changes, expiring client secrets, new critical risks.',
  },
] as const;

export function ProfilePage() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    values: {
      name: me?.user?.name ?? '',
      job_title: me?.user?.job_title ?? '',
      phone: me?.user?.phone ?? '',
    },
  });
  const [prefs, setPrefs] = React.useState<Record<string, boolean>>({});

  const save = useMutation({
    mutationFn: (body: Schemas['MeUpdateIn']) => unwrap(api.PATCH('/api/v1/me', { body })),
    onSuccess: (data) => {
      qc.setQueryData(meQueryKey, data);
      toast.success('Profile saved');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const e = form.formState.errors;
  return (
    <>
      <PageHeader title="Profile" description="Your personal details and email preferences." />
      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Personal details</CardTitle>
            <CardDescription>
              {me?.email} ·{' '}
              {me?.is_platform_owner ? 'Platform Owner' : titleCase(me?.user?.org_role ?? '')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              noValidate
              className="grid gap-4"
              onSubmit={form.handleSubmit((values) => save.mutate(values))}
            >
              <Field label="Full name" htmlFor="name" error={e.name?.message}>
                <Input id="name" aria-invalid={!!e.name} {...form.register('name')} />
              </Field>
              <Field label="Job title" htmlFor="job_title" error={e.job_title?.message}>
                <Input id="job_title" {...form.register('job_title')} />
              </Field>
              <Field label="Phone" htmlFor="phone" error={e.phone?.message}>
                <Input id="phone" type="tel" aria-invalid={!!e.phone} {...form.register('phone')} />
              </Field>
              <div>
                <Button type="submit" loading={save.isPending}>
                  Save
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
        {!me?.is_platform_owner && (
          <Card>
            <CardHeader>
              <CardTitle>Email notifications</CardTitle>
              <CardDescription>In-app notifications are always on.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {PREFS.map((pref) => {
                const stored = me?.user?.notification_prefs?.[pref.key];
                const checked = prefs[pref.key] ?? (typeof stored === 'boolean' ? stored : true);
                return (
                  <label
                    key={pref.key}
                    className="flex items-start justify-between gap-4 rounded-md border border-border px-4 py-3"
                  >
                    <span>
                      <span className="block text-sm font-medium">{pref.label}</span>
                      <span className="block text-xs text-muted">{pref.hint}</span>
                    </span>
                    <input
                      type="checkbox"
                      className="mt-1 size-4 accent-brand"
                      checked={checked}
                      onChange={(ev) => {
                        const next = { ...prefs, [pref.key]: ev.target.checked };
                        setPrefs(next);
                        save.mutate({ notification_prefs: { [pref.key]: ev.target.checked } });
                      }}
                    />
                  </label>
                );
              })}
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
}
