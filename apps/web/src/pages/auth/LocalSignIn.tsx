import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Building2, Eye, EyeOff, MailCheck, ShieldCheck } from 'lucide-react';
import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { Separator } from '@/components/ui/misc';
import { api, errorMessage, unwrap } from '@/lib/api/client';
import { useAuth } from '@/lib/auth/context';
import { env } from '@/lib/env';
import { cn } from '@/lib/utils';

/**
 * Real sign-in (AUTH_MODE=local, decision 0047): customers get a one-time code by email;
 * platform owners enter their password first, then a code. Optional Google / Microsoft buttons
 * work when the API has them configured.
 */

type Audience = 'workspace' | 'owner';

interface Challenge {
  id: string;
  email: string;
  resendAt: number;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const SSO_ERRORS: Record<string, string> = {
  cancelled: 'The sign-in with the provider was cancelled.',
  too_many_codes: 'Too many sign-in codes were requested. Wait 15 minutes and try again.',
  email_unavailable: 'The sign-in code could not be sent. Try again in a minute.',
};

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-[18px]" aria-hidden focusable="false">
      <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.5a5.5 5.5 0 0 1-2.4 3.6v3h3.9c2.300-2.100 3.500-5.200 3.500-8.700Z" />
      <path fill="#34A853" d="M12 24c3.200 0 6-1.100 8-2.900l-3.900-3c-1.100.700-2.500 1.200-4.100 1.200-3.100 0-5.800-2.100-6.700-5H1.300v3.100A12 12 0 0 0 12 24Z" />
      <path fill="#FBBC05" d="M5.300 14.300a7.200 7.200 0 0 1 0-4.600V6.600H1.300a12 12 0 0 0 0 10.800l4-3.100Z" />
      <path fill="#EA4335" d="M12 4.800c1.800 0 3.300.600 4.600 1.800l3.400-3.400A12 12 0 0 0 1.300 6.600l4 3.100c.900-2.900 3.600-4.900 6.700-4.900Z" />
    </svg>
  );
}

function MicrosoftMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-[18px]" aria-hidden focusable="false">
      <path fill="#F25022" d="M2 2h9.500v9.500H2z" />
      <path fill="#7FBA00" d="M12.500 2H22v9.500h-9.500z" />
      <path fill="#00A4EF" d="M2 12.500h9.500V22H2z" />
      <path fill="#FFB900" d="M12.500 12.500H22V22h-9.500z" />
    </svg>
  );
}

const PROVIDERS = [
  { key: 'google', label: 'Continue with Google', Mark: GoogleMark },
  { key: 'microsoft', label: 'Continue with Microsoft', Mark: MicrosoftMark },
] as const;

/** Six boxes drawn over one real input, so paste and one-time-code autofill work. */
function CodeInput({
  value,
  onChange,
  disabled,
  invalid,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  invalid: boolean;
}) {
  const [focused, setFocused] = React.useState(false);
  return (
    <div className="relative">
      <div className="grid grid-cols-6 gap-2 sm:gap-3" aria-hidden>
        {Array.from({ length: 6 }, (_, i) => (
          <span
            key={i}
            className={cn(
              'otp-box',
              focused && i === Math.min(value.length, 5) && 'otp-box-active',
              value[i] && 'otp-box-filled',
              invalid && 'otp-box-invalid',
            )}
          >
            {value[i] ?? ''}
          </span>
        ))}
      </div>
      <input
        id="code"
        aria-label="6-digit code"
        aria-invalid={invalid}
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="\d{6}"
        maxLength={6}
        autoFocus
        disabled={disabled}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        className="absolute inset-0 h-full w-full cursor-text rounded-xl opacity-0"
      />
    </div>
  );
}

function useCountdown(until: number): number {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    if (until <= Date.now()) return;
    const timer = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, [until]);
  return Math.max(0, Math.ceil((until - now) / 1000));
}

function readFragment(): URLSearchParams | null {
  const raw = window.location.hash.replace(/^#/, '');
  if (!raw.includes('sso')) return null;
  // the fragment may carry a session: take it out of the address bar at once
  window.history.replaceState(null, '', window.location.pathname + window.location.search);
  return new URLSearchParams(raw);
}

export function LocalSignIn({ next, email: initialEmail, signUp }: { next: string; email: string; signUp: boolean }) {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const config = useQuery({
    queryKey: ['auth-config'],
    queryFn: () => unwrap(api.GET('/api/v1/auth/config')),
    staleTime: 5 * 60_000,
  });
  const [fragment] = React.useState(readFragment);
  const [audience, setAudience] = React.useState<Audience>('workspace');
  const [email, setEmail] = React.useState(initialEmail);
  const [name, setName] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [showPassword, setShowPassword] = React.useState(false);
  const [challenge, setChallenge] = React.useState<Challenge | null>(() => {
    const id = fragment?.get('sso') === 'code' ? fragment.get('challenge_id') : null;
    return id
      ? { id, email: fragment?.get('email') ?? '', resendAt: Date.now() + Number(fragment?.get('resend_in') ?? 30) * 1000 }
      : null;
  });
  const [code, setCode] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(() => {
    const failed = fragment?.get('sso_error');
    return failed ? (SSO_ERRORS[failed] ?? 'The sign-in with the provider did not complete. Try again.') : null;
  });
  const [notice, setNotice] = React.useState<string | null>(null);
  const wait = useCountdown(challenge?.resendAt ?? 0);
  const owner = audience === 'owner' && !signUp;

  const finish = React.useCallback(
    async (session: { token: string; expiresIn: number; email: string }) => {
      await signIn({ session });
      void navigate(next, { replace: true });
    },
    [signIn, navigate, next],
  );

  // provider sign-in that needs no further code (SSO_REQUIRE_OTP=false)
  React.useEffect(() => {
    const token = fragment?.get('sso') === 'session' ? fragment.get('access_token') : null;
    if (!token) return;
    void finish({ token, expiresIn: Number(fragment?.get('expires_in') ?? 0), email: fragment?.get('email') ?? '' }).catch(
      (e: unknown) => setError(errorMessage(e)),
    );
  }, [fragment, finish]);

  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await work();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const start = () =>
    run(async () => {
      const address = email.trim().toLowerCase();
      if (!EMAIL.test(address)) throw new Error('Enter a valid email address.');
      if (owner && !password) throw new Error('Enter your password.');
      const data = owner
        ? await unwrap(api.POST('/api/v1/auth/owner/start', { body: { email: address, password } }))
        : await unwrap(api.POST('/api/v1/auth/otp/start', { body: { email: address, name: name.trim() } }));
      setPassword('');
      setCode('');
      setChallenge({ id: data.challenge_id, email: address, resendAt: Date.now() + data.resend_in * 1000 });
    });

  const verify = (value: string) =>
    run(async () => {
      if (!challenge) return;
      try {
        const data = await unwrap(api.POST('/api/v1/auth/otp/verify', { body: { challenge_id: challenge.id, code: value } }));
        await finish({ token: data.access_token, expiresIn: data.expires_in, email: data.email });
      } catch (e) {
        setCode('');
        throw e;
      }
    });

  const resend = () =>
    run(async () => {
      if (!challenge) return;
      const data = await unwrap(api.POST('/api/v1/auth/otp/resend', { body: { challenge_id: challenge.id } }));
      setCode('');
      setChallenge({ ...challenge, resendAt: Date.now() + data.resend_in * 1000 });
      setNotice('A new code is on its way.');
    });

  if (challenge) {
    return (
      <div className="space-y-6">
        <div className="flex items-start gap-3 rounded-xl bg-brand-soft px-4 py-3.5">
          <MailCheck className="mt-0.5 size-5 shrink-0 text-brand-strong" strokeWidth={1.75} aria-hidden />
          <p className="text-sm leading-6">
            We sent a 6-digit code to <span className="font-semibold break-all">{challenge.email}</span>. It works once and
            expires in 10 minutes.
          </p>
        </div>
        <form
          className="space-y-5"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            if (code.length === 6) void verify(code);
          }}
        >
          <CodeInput
            value={code}
            disabled={busy}
            invalid={!!error}
            onChange={(value) => {
              setCode(value);
              setError(null);
              if (value.length === 6) void verify(value);
            }}
          />
          <p role="alert" className="min-h-5 text-sm text-critical-strong">
            {error}
          </p>
          <Button type="submit" size="lg" className="w-full" loading={busy} disabled={code.length !== 6}>
            <ShieldCheck /> Verify and sign in
          </Button>
        </form>
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-sm">
          <button
            type="button"
            className="inline-flex min-h-9 items-center gap-1.5 font-medium text-muted hover:text-text"
            onClick={() => {
              setChallenge(null);
              setCode('');
              setError(null);
              setNotice(null);
            }}
          >
            <ArrowLeft className="size-4" aria-hidden /> Use a different email
          </button>
          <button
            type="button"
            disabled={wait > 0 || busy}
            className="min-h-9 font-semibold text-brand-strong underline-offset-4 hover:underline disabled:font-medium disabled:text-muted disabled:no-underline"
            onClick={() => void resend()}
          >
            {wait > 0 ? `Send a new code in ${wait}s` : 'Send a new code'}
          </button>
        </div>
        <p role="status" className="min-h-5 text-sm text-success-strong">
          {notice}
        </p>
      </div>
    );
  }

  const enabled = new Set(config.data?.sso ?? []);
  return (
    <div className="space-y-6">
      {!signUp && (
        <div role="tablist" aria-label="Who is signing in" className="seg" data-active={audience}>
          {(
            [
              ['workspace', 'Workspace', Building2],
              ['owner', 'Control Center', ShieldCheck],
            ] as const
          ).map(([key, label, Icon]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={audience === key}
              className="seg-item"
              onClick={() => {
                setAudience(key);
                setError(null);
              }}
            >
              <Icon className="size-4" strokeWidth={1.75} aria-hidden />
              {label}
            </button>
          ))}
        </div>
      )}
      <p className="text-sm leading-6 text-muted">
        {owner
          ? 'For KloudSchool platform owners. Password first, then a one-time code by email.'
          : signUp
            ? 'Enter your work email. We send a one-time code to confirm it is yours.'
            : 'For customers and their teams. We email you a one-time code, no password needed.'}
      </p>

      {!owner && (
        <>
          <div className="grid gap-2.5 sm:grid-cols-2">
            {PROVIDERS.map(({ key, label, Mark }) =>
              enabled.has(key) ? (
                <Button key={key} asChild variant="secondary" size="lg" className="w-full text-sm">
                  <a href={`${env.apiBaseUrl}/api/v1/auth/sso/${key}/start`}>
                    <Mark /> {label}
                  </a>
                </Button>
              ) : (
                <Button
                  key={key}
                  variant="secondary"
                  size="lg"
                  className="w-full text-sm"
                  disabled
                  title="Not set up yet"
                >
                  <Mark /> {label}
                </Button>
              ),
            )}
          </div>
          <div className="flex items-center gap-3 text-xs text-subtle">
            <Separator className="flex-1" /> or with your email
            <Separator className="flex-1" />
          </div>
        </>
      )}

      <form
        className="space-y-4"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void start();
        }}
      >
        <Field label={owner ? 'Owner email' : 'Work email'} htmlFor="email">
          <Input
            id="email"
            type="email"
            autoComplete="username"
            placeholder="you@company.com"
            className="h-11"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        {signUp && (
          <Field label="Full name" htmlFor="name">
            <Input id="name" autoComplete="name" className="h-11" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
        )}
        {owner && (
          <Field label="Password" htmlFor="password">
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                className="h-11 pr-11"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                aria-pressed={showPassword}
                className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-md text-muted hover:text-text"
                onClick={() => setShowPassword((s) => !s)}
              >
                {showPassword ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
              </button>
            </div>
          </Field>
        )}
        <p role="alert" className="min-h-5 text-sm text-critical-strong">
          {error}
        </p>
        <Button type="submit" size="lg" className="w-full" loading={busy}>
          {owner ? 'Continue' : 'Email me a code'}
        </Button>
      </form>
    </div>
  );
}
