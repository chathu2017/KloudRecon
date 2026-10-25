import { AlertTriangle } from 'lucide-react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { LogoGlyph } from '@/components/brand/Logo';
import { Button } from '@/components/ui/button';
import { errorMessage } from '@/lib/api/client';
import { useAuth, useMe } from '@/lib/auth/context';
import { homeFor, type AccountState } from './home';

export function FullPageSpinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center gap-4 bg-bg"
      role="status"
    >
      <LogoGlyph className="size-10 animate-pulse" />
      <span className="text-sm text-muted">{label}</span>
    </div>
  );
}

export function FullPageError({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const { signOut } = useAuth();
  return (
    <div className="flex min-h-screen items-center justify-center bg-bg p-6">
      <div className="max-w-md rounded-xl border border-border bg-surface p-6 text-center shadow-sm">
        <AlertTriangle className="mx-auto mb-3 size-8 text-high-strong" aria-hidden />
        <h1 className="text-lg font-semibold">We could not load your account</h1>
        <p className="mt-1 text-sm text-muted">{errorMessage(error)}</p>
        <div className="mt-5 flex justify-center gap-2">
          {onRetry && <Button onClick={onRetry}>Try again</Button>}
          <Button variant="secondary" onClick={() => void signOut()}>
            Sign out
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Requires a signed-in identity; otherwise sends the visitor to /login?next=… */
export function RequireSignedIn() {
  const { ready, signedIn } = useAuth();
  const location = useLocation();
  if (!ready) return <FullPageSpinner />;
  if (!signedIn) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?next=${next}`} replace />;
  }
  return <Outlet />;
}

/** Allows only accounts in the given states (the client-side mirror of the API access gate). */
export function RequireState({
  states,
  ownerOnly = false,
  customerOnly = false,
}: {
  states: AccountState[];
  ownerOnly?: boolean;
  customerOnly?: boolean;
}) {
  const me = useMe();
  if (me.isPending) return <FullPageSpinner />;
  if (me.isError) return <FullPageError error={me.error} onRetry={() => void me.refetch()} />;
  const data = me.data;
  const ok =
    states.includes(data.state) &&
    (!ownerOnly || data.is_platform_owner) &&
    (!customerOnly || !data.is_platform_owner);
  if (!ok) return <Navigate to={homeFor(data)} replace />;
  return <Outlet />;
}

/** After sign-in: send the account to the right place. */
export function StartRedirect() {
  const me = useMe();
  if (me.isPending) return <FullPageSpinner />;
  if (me.isError) return <FullPageError error={me.error} onRetry={() => void me.refetch()} />;
  return <Navigate to={homeFor(me.data)} replace />;
}
