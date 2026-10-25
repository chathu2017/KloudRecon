import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, FlaskConical, ShieldCheck } from 'lucide-react';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { Separator } from '@/components/ui/misc';
import { api, errorMessage, unwrap } from '@/lib/api/client';
import { takeReturnTo } from '@/lib/auth/adapters';
import { useAuth } from '@/lib/auth/context';
import { isSafeInternalPath } from '@/lib/url';
import { AuthLayout } from './AuthLayout';
import { LocalSignIn } from './LocalSignIn';

const schema = z.object({
  email: z.email('Enter a valid email address.'),
  name: z.string().max(200),
});
type FormValues = z.infer<typeof schema>;

function safeNext(value: string | null): string {
  return isSafeInternalPath(value) ? value : '/start';
}

function DevSignIn({ next, email }: { next: string; email: string }) {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const users = useQuery({
    queryKey: ['dev-users'],
    queryFn: () => unwrap(api.GET('/api/v1/auth/dev/users')),
    staleTime: Infinity,
  });
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email, name: '' },
  });

  const login = async (email: string, name = '') => {
    setBusy(email);
    setError(null);
    try {
      await signIn({ email, name });
      void navigate(next, { replace: true });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3 rounded-lg border border-medium/40 bg-medium-soft px-4 py-3 text-sm">
        <FlaskConical className="mt-0.5 size-4 shrink-0 text-medium-strong" aria-hidden />
        <p>
          <span className="font-semibold">Development sign-in.</span>{' '}
          <span className="text-muted">
            AUTH_MODE=dev — no password. Production uses Microsoft Entra External ID.
          </span>
        </p>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">Seeded accounts</p>
        {users.isPending && <p className="text-sm text-muted">Loading…</p>}
        {users.data?.map((user) => (
          <button
            key={user.email}
            type="button"
            onClick={() => void login(user.email)}
            disabled={busy !== null}
            className="group flex w-full items-center justify-between rounded-xl border border-border bg-surface px-4 py-3 text-left shadow-sm transition-colors hover:border-brand hover:bg-brand-soft/40 disabled:opacity-60"
          >
            <span>
              <span className="block text-sm font-medium">{user.label}</span>
              <span className="block font-mono text-xs text-muted">{user.email}</span>
              <span className="block text-xs text-subtle">{user.description}</span>
            </span>
            <ArrowRight className="size-4 text-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-brand-strong" />
          </button>
        ))}
        {users.isError && <p className="text-sm text-critical-strong">{errorMessage(users.error)}</p>}
      </div>

      <div className="flex items-center gap-3 text-xs text-subtle">
        <Separator className="flex-1" /> or use any email (acts as a new sign-up)
        <Separator className="flex-1" />
      </div>

      <form
        className="space-y-4"
        noValidate
        onSubmit={form.handleSubmit((values) => login(values.email, values.name))}
      >
        <Field label="Email" htmlFor="email" error={form.formState.errors.email?.message}>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="you@company.com"
            aria-invalid={!!form.formState.errors.email}
            {...form.register('email')}
          />
        </Field>
        <Field label="Display name (optional)" htmlFor="name">
          <Input id="name" autoComplete="name" {...form.register('name')} />
        </Field>
        {error && (
          <p role="alert" className="text-sm text-critical-strong">
            {error}
          </p>
        )}
        <Button type="submit" className="w-full" loading={busy !== null}>
          Continue
        </Button>
      </form>
    </div>
  );
}

function EntraSignIn({ signUp, next }: { signUp: boolean; next: string }) {
  const { signIn } = useAuth();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const go = async (create: boolean) => {
    setBusy(true);
    setError(null);
    try {
      await signIn({ signUp: create, returnTo: next });
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };
  return (
    <div className="space-y-4">
      <Button size="lg" className="w-full" loading={busy} onClick={() => void go(signUp)}>
        <ShieldCheck />
        {signUp ? 'Create your account' : 'Sign in securely'}
      </Button>
      <p className="text-center text-xs text-muted">
        Email verification and multi-factor authentication are handled by Microsoft Entra.
      </p>
      {error && (
        <p role="alert" className="text-center text-sm text-critical-strong">
          {error}
        </p>
      )}
    </div>
  );
}

export function LoginPage({ signUp = false }: { signUp?: boolean }) {
  const { adapter, ready, signedIn } = useAuth();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  // prefilled from the landing page's trial form (UI only; Entra asks for the address itself)
  const email = params.get('email')?.slice(0, 320) ?? '';

  if (ready && signedIn) {
    return <Navigate to={takeReturnTo() ?? next} replace />;
  }

  return (
    <AuthLayout>
      <div className="mb-7">
        <h1 className="text-[28px] font-medium leading-9 tracking-[-0.025em]">
          {signUp ? 'Create your KloudRecon account' : 'Sign in to KloudRecon'}
        </h1>
        <p className="mt-2 text-md leading-6 text-muted">
          {signUp
            ? 'Start with a read-only review of your Azure environment. New accounts are reviewed by our team.'
            : 'Welcome back. Sign in to continue to your workspace.'}
        </p>
      </div>
      {adapter.mode === 'local' ? (
        <LocalSignIn next={next} email={email} signUp={signUp} />
      ) : adapter.mode === 'dev' ? (
        <DevSignIn next={next} email={email} />
      ) : (
        <EntraSignIn signUp={signUp} next={next} />
      )}
      <p className="mt-8 text-center text-sm text-muted">
        {signUp ? (
          <>
            Already have an account?{' '}
            <Link to="/login" className="font-medium text-brand-strong hover:underline">
              Sign in
            </Link>
          </>
        ) : (
          <>
            New to KloudRecon?{' '}
            <Link to="/signup" className="font-medium text-brand-strong hover:underline">
              Create an account
            </Link>
          </>
        )}
      </p>
      <p className="mt-3 text-center text-xs text-subtle">
        By continuing you agree to the{' '}
        <Link to="/terms" className="underline hover:text-muted">
          Terms
        </Link>{' '}
        and{' '}
        <Link to="/privacy" className="underline hover:text-muted">
          Privacy Policy
        </Link>
        .
      </p>
    </AuthLayout>
  );
}
