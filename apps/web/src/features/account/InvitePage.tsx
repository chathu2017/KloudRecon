import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Building2, UserPlus } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/misc';
import { api, errorMessage, unwrap } from '@/lib/api/client';
import { meQueryKey, useAuth, useMe } from '@/lib/auth/context';
import { formatDate, titleCase } from '@/lib/format';
import { AuthLayout } from '@/pages/auth/AuthLayout';

/** /invite/:token — sign in first (the guard handles it), then join the org directly. */
export function InvitePage() {
  const { token = '' } = useParams();
  const { signOut } = useAuth();
  const me = useMe();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const preview = useQuery({
    queryKey: ['invitation', token],
    queryFn: () => unwrap(api.GET('/api/v1/invitations/{token}', { params: { path: { token } } })),
    retry: false,
  });
  const accept = useMutation({
    mutationFn: () =>
      unwrap(api.POST('/api/v1/invitations/{token}/accept', { params: { path: { token } } })),
    onSuccess: (data) => {
      qc.setQueryData(meQueryKey, data);
      void navigate('/app', { replace: true });
    },
  });

  const inv = preview.data;
  const alreadyMember = !!me.data?.user;
  const mismatch = inv && me.data && inv.email.toLowerCase() !== me.data.email.toLowerCase();

  return (
    <AuthLayout>
      {preview.isPending ? (
        <div className="space-y-3">
          <Skeleton className="h-8 w-2/3" />
          <Skeleton className="h-24" />
        </div>
      ) : preview.isError || !inv ? (
        <div className="text-center">
          <AlertTriangle className="mx-auto size-10 text-high-strong" aria-hidden />
          <h1 className="mt-4 text-xl font-semibold">This invitation link is not valid</h1>
          <p className="mt-2 text-sm text-muted">{errorMessage(preview.error)}</p>
          <Button className="mt-6" variant="secondary" onClick={() => navigate('/start')}>
            Continue
          </Button>
        </div>
      ) : (
        <div>
          <div className="mx-auto flex shrink-0 items-center text-muted [&_svg]:size-8 [&_svg]:stroke-[1.5]">
            <UserPlus className="size-6" aria-hidden />
          </div>
          <h1 className="mt-4 text-center text-2xl font-semibold">Join {inv.org_name}</h1>
          <p className="mt-2 text-center text-sm text-muted">
            You were invited to KloudRecon as{' '}
            <strong className="text-text">{titleCase(inv.role)}</strong>.
          </p>
          <div className="mt-6 flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3">
            <Building2 className="size-5 text-muted" aria-hidden />
            <div className="min-w-0 text-sm">
              <div className="font-medium">{inv.org_name}</div>
              <div className="truncate text-xs text-muted">
                For {inv.email} · expires {formatDate(inv.expires_at)}
              </div>
            </div>
          </div>
          {inv.status !== 'pending' ? (
            <p className="mt-4 rounded-md bg-medium-soft px-3 py-2 text-sm text-medium-strong">
              This invitation is {inv.status}. Ask your admin for a new one.
            </p>
          ) : mismatch ? (
            <div className="mt-4 rounded-md bg-medium-soft px-3 py-2 text-sm">
              You are signed in as <strong>{me.data.email}</strong>. This invitation is for{' '}
              <strong>{inv.email}</strong>.{' '}
              <button
                type="button"
                className="font-medium text-brand-strong underline"
                onClick={() => void signOut().then(() => navigate(`/login?next=/invite/${token}`))}
              >
                Switch account
              </button>
            </div>
          ) : alreadyMember ? (
            <p className="mt-4 rounded-md bg-medium-soft px-3 py-2 text-sm">
              Your account already belongs to an organization.
            </p>
          ) : null}
          {accept.isError && (
            <p role="alert" className="mt-4 text-sm text-critical-strong">
              {errorMessage(accept.error)}
            </p>
          )}
          <Button
            className="mt-6 w-full"
            size="lg"
            disabled={inv.status !== 'pending' || !!mismatch || alreadyMember}
            loading={accept.isPending}
            onClick={() => accept.mutate()}
          >
            Accept and continue
          </Button>
        </div>
      )}
    </AuthLayout>
  );
}
