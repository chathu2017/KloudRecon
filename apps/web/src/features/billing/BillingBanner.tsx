import { AlertTriangle, Clock, Lock } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useNow } from '@/lib/hooks';
import { cn } from '@/lib/utils';
import { useBilling } from './api';

const LINK = 'font-semibold underline-offset-2 hover:underline';

/** One line under the top bar: trial countdown, payment problem (grace) or read-only mode. */
export function BillingBanner() {
  const { data } = useBilling();
  const now = useNow(3_600_000);
  if (!data) return null;
  if (data.read_only) {
    return (
      <Bar tone="critical" icon={<Lock className="size-3.5" aria-hidden />}>
        {data.message ?? 'This organization is read-only.'}{' '}
        <Link to="/app/settings/billing" className={LINK}>
          Billing & plan
        </Link>
      </Bar>
    );
  }
  if (data.state === 'grace') {
    return (
      <Bar tone="warning" icon={<AlertTriangle className="size-3.5" aria-hidden />}>
        {data.message}{' '}
        <Link to="/app/settings/billing" className={LINK}>
          Update payment
        </Link>
      </Bar>
    );
  }
  if (data.state === 'trial' && data.trial_ends_at) {
    const days = Math.max(0, Math.ceil((new Date(data.trial_ends_at).getTime() - now) / 86_400_000));
    return (
      <Bar tone="brand" icon={<Clock className="size-3.5" aria-hidden />}>
        {days === 0 ? 'Your trial ends today.' : `${days} day${days === 1 ? '' : 's'} left in your trial.`}{' '}
        <Link to="/app/settings/billing" className={LINK}>
          Choose a plan
        </Link>
      </Bar>
    );
  }
  return null;
}

function Bar({ tone, icon, children }: { tone: 'brand' | 'warning' | 'critical'; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div
      role={tone === 'brand' ? 'status' : 'alert'}
      className={cn(
        'flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5 border-b border-border px-4 py-1.5 text-center text-xs',
        tone === 'brand' && 'bg-brand-soft text-brand-strong',
        tone === 'warning' && 'bg-medium-soft text-medium-strong',
        tone === 'critical' && 'bg-critical-soft text-critical-strong',
      )}
    >
      {icon}
      <span>{children}</span>
    </div>
  );
}
