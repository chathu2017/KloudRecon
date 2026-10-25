import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as React from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { api, errorMessage, fieldErrors, unwrap } from '@/lib/api/client';
import { meQueryKey, useAuth, useMe } from '@/lib/auth/context';
import { AuthLayout } from '@/pages/auth/AuthLayout';
import { COMPANY_SIZES, COMPANY_SIZE_HINTS, onboardingSchema, type OnboardingValues } from './onboarding-schema';

export function OnboardingPage() {
  const { data: me } = useMe();
  const { signOut } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const form = useForm<OnboardingValues>({
    resolver: zodResolver(onboardingSchema),
    defaultValues: {
      name: me?.name ?? '',
      job_title: '',
      company: '',
      country: '',
      company_size: undefined,
      industry: '',
      phone: '',
      use_case: '',
      accept_terms: false,
    },
  });
  React.useEffect(() => {
    if (me?.name && !form.getValues('name')) form.setValue('name', me.name);
  }, [me?.name, form]);

  const submit = useMutation({
    mutationFn: (values: OnboardingValues) =>
      unwrap(api.POST('/api/v1/onboarding', { body: values })),
    onSuccess: (data) => {
      qc.setQueryData(meQueryKey, data);
      void navigate('/under-review', { replace: true });
    },
    onError: (error) => {
      const fields = fieldErrors(error);
      for (const [key, message] of Object.entries(fields)) {
        if (key in form.getValues()) form.setError(key as keyof OnboardingValues, { message });
      }
    },
  });

  const e = form.formState.errors;
  return (
    <AuthLayout>
      <div className="mb-6">
        <p className="text-xs font-semibold text-brand-strong">Step 2 of 2</p>
        <h1 className="mt-1 text-2xl font-semibold">Tell us about your company</h1>
        <p className="mt-1.5 text-sm text-muted">
          Signed in as <span className="font-medium text-text">{me?.email}</span>. Our team reviews
          each new account, usually within one business day.
        </p>
      </div>
      <form
        noValidate
        className="grid gap-4 sm:grid-cols-2"
        onSubmit={form.handleSubmit((values) => submit.mutate(values))}
      >
        <Field label="Full name" htmlFor="name" error={e.name?.message}>
          <Input id="name" autoComplete="name" aria-invalid={!!e.name} {...form.register('name')} />
        </Field>
        <Field label="Job title" htmlFor="job_title" error={e.job_title?.message}>
          <Input
            id="job_title"
            autoComplete="organization-title"
            aria-invalid={!!e.job_title}
            {...form.register('job_title')}
          />
        </Field>
        <Field label="Company" htmlFor="company" error={e.company?.message}>
          <Input
            id="company"
            autoComplete="organization"
            aria-invalid={!!e.company}
            {...form.register('company')}
          />
        </Field>
        <Field label="Country" htmlFor="country" error={e.country?.message}>
          <Input
            id="country"
            autoComplete="country-name"
            aria-invalid={!!e.country}
            {...form.register('country')}
          />
        </Field>
        <Field label="Company size" htmlFor="company_size" error={e.company_size?.message}>
          <Controller
            control={form.control}
            name="company_size"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger
                  id="company_size"
                  ref={field.ref}
                  onBlur={field.onBlur}
                  aria-invalid={!!e.company_size}
                >
                  <SelectValue placeholder="Choose a size" />
                </SelectTrigger>
                <SelectContent align="start">
                  {COMPANY_SIZES.map((s) => (
                    <SelectItem key={s} value={s} hint={COMPANY_SIZE_HINTS[s]}>
                      {s} employees
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </Field>
        <Field label="Industry (optional)" htmlFor="industry" error={e.industry?.message}>
          <Input id="industry" {...form.register('industry')} />
        </Field>
        <Field
          label="Phone (optional)"
          htmlFor="phone"
          error={e.phone?.message}
          className="sm:col-span-2"
        >
          <Input
            id="phone"
            type="tel"
            autoComplete="tel"
            aria-invalid={!!e.phone}
            {...form.register('phone')}
          />
        </Field>
        <Field
          label="What do you want to achieve with KloudRecon?"
          htmlFor="use_case"
          error={e.use_case?.message}
          className="sm:col-span-2"
        >
          <Textarea
            id="use_case"
            aria-invalid={!!e.use_case}
            placeholder="For example: a read-only security review of 12 subscriptions before our ISO 27001 audit."
            {...form.register('use_case')}
          />
        </Field>
        <div className="sm:col-span-2">
          <label className="flex items-start gap-2.5 text-sm">
            <input
              type="checkbox"
              className="mt-0.5 size-4 accent-brand"
              {...form.register('accept_terms')}
            />
            <span className="text-muted">
              I accept the{' '}
              <Link to="/terms" target="_blank" className="text-brand-strong underline underline-offset-2">
                Terms of Service
              </Link>{' '}
              and{' '}
              <Link to="/privacy" target="_blank" className="text-brand-strong underline underline-offset-2">
                Privacy Policy
              </Link>
              .
            </span>
          </label>
          {e.accept_terms && (
            <p role="alert" className="mt-1 text-xs text-critical-strong">
              {e.accept_terms.message}
            </p>
          )}
        </div>
        {submit.isError && Object.keys(fieldErrors(submit.error)).length === 0 && (
          <p role="alert" className="text-sm text-critical-strong sm:col-span-2">
            {errorMessage(submit.error)}
          </p>
        )}
        <div className="flex items-center justify-between gap-3 sm:col-span-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => void signOut().then(() => navigate('/login'))}
          >
            Sign out
          </Button>
          <Button type="submit" loading={submit.isPending}>
            Submit for review
          </Button>
        </div>
      </form>
    </AuthLayout>
  );
}
