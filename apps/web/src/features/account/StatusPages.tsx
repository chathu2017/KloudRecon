import { Ban, Clock3, Mail, RefreshCw, XCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useAuth, useMe } from '@/lib/auth/context';
import { formatDateTime } from '@/lib/format';
import { useLiveEvents } from '@/lib/sse';
import { AuthLayout } from '@/pages/auth/AuthLayout';

function SignOutButton() {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  return (
    <Button variant="ghost" onClick={() => void signOut().then(() => navigate('/login'))}>
      Sign out
    </Button>
  );
}

/** "Your account is under review" — switches to the app automatically when approved (SSE). */
export function UnderReviewPage() {
  const me = useMe();
  useLiveEvents(true);
  const data = me.data;
  return (
    <AuthLayout>
      <div className="text-center">
        <div className="mx-auto flex shrink-0 items-center text-medium-strong [&_svg]:size-8 [&_svg]:stroke-[1.5]">
          <Clock3 className="size-7" aria-hidden />
        </div>
        <h1 className="mt-5 text-2xl font-semibold">Your account is under review</h1>
        <p className="mx-auto mt-2 max-w-sm text-sm text-muted">
          Thanks for registering{data?.org ? ` ${data.org.name}` : ''}. Our team reviews every new
          account, usually within one business day. This page updates by itself when you are
          approved.
        </p>
      </div>
      <dl className="mt-8 divide-y divide-border rounded-xl border border-border bg-surface text-sm">
        <div className="flex justify-between gap-4 px-4 py-3">
          <dt className="text-muted">Account</dt>
          <dd className="truncate font-medium">{data?.email}</dd>
        </div>
        <div className="flex justify-between gap-4 px-4 py-3">
          <dt className="text-muted">Organization</dt>
          <dd className="truncate font-medium">{data?.org?.name ?? '—'}</dd>
        </div>
        <div className="flex justify-between gap-4 px-4 py-3">
          <dt className="text-muted">Submitted</dt>
          <dd className="font-medium">{formatDateTime(data?.org?.created_at)}</dd>
        </div>
      </dl>
      <div className="mt-4 flex items-start gap-2 rounded-md bg-surface-2 px-3 py-2.5 text-xs text-muted">
        <Mail className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        We will also email you from donotreply@azurerec.kloudschool.com.
      </div>
      <div className="mt-6 flex justify-center gap-2">
        <Button variant="secondary" loading={me.isFetching} onClick={() => void me.refetch()}>
          <RefreshCw /> Check status
        </Button>
        <SignOutButton />
      </div>
    </AuthLayout>
  );
}

/** Rejected or suspended account. */
export function RejectedPage() {
  const { data } = useMe();
  const suspended = data?.state === 'suspended';
  return (
    <AuthLayout>
      <div className="text-center">
        <div className="mx-auto flex shrink-0 items-center text-critical-strong [&_svg]:size-8 [&_svg]:stroke-[1.5]">
          {suspended ? (
            <Ban className="size-7" aria-hidden />
          ) : (
            <XCircle className="size-7" aria-hidden />
          )}
        </div>
        <h1 className="mt-5 text-2xl font-semibold">
          {suspended ? 'Your account is suspended' : 'We could not approve your account'}
        </h1>
        <p className="mx-auto mt-2 max-w-sm text-sm text-muted">
          {suspended
            ? 'Access to this organization has been paused. Contact KloudSchool to restore it.'
            : 'Thank you for your interest in KloudRecon. Your registration was not approved.'}
        </p>
        {data?.rejection_reason && (
          <div className="mx-auto mt-6 max-w-sm rounded-xl border border-border bg-surface px-4 py-3 text-left text-sm">
            <div className="text-xs font-medium text-muted">Reason</div>
            <p className="mt-1">{data.rejection_reason}</p>
          </div>
        )}
        <p className="mt-6 text-sm text-muted">
          If you think this is a mistake, reply to the email we sent or contact KloudSchool.
        </p>
        <div className="mt-6">
          <SignOutButton />
        </div>
      </div>
    </AuthLayout>
  );
}
