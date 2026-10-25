import { Building2, ShieldCheck } from 'lucide-react';
import { Outlet } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { appNav, ownerNav } from '@/components/layout/nav';
import { Badge } from '@/components/ui/badge';
import { useMe } from '@/lib/auth/context';
import { useLiveEvents } from '@/lib/sse';
import { AskButton } from '@/features/ai/ChatPanel';
import { BillingBanner } from '@/features/billing/BillingBanner';
import { AnnouncementBanner, DemoBanner, ViewAsBanner } from '@/features/platform/Banners';
import { useFeature } from '@/features/platform/api';
import { isDemoSession } from '@/lib/auth/adapters';
import { getViewAs } from '@/lib/view-as';
import { NotificationBell } from '@/features/notifications/NotificationBell';
import { useConnections } from '@/features/connections/api';
import { usePendingCount } from '@/features/owner/api';
import { useScanLiveUpdates } from '@/features/scans/api';
import { AsOfBanner, AsOfSelect, ScanControl } from '@/features/scans/ScanControl';
import { ScanProgressDrawer } from '@/features/scans/ScanProgressDrawer';

/** Customer workspace shell (`/app/*`). */
export function CustomerShell() {
  const { data: me } = useMe();
  useLiveEvents(true);
  useScanLiveUpdates();
  const { data: connections } = useConnections();
  const demo = connections?.some((c) => c.is_demo) ?? false;
  const viewAs = getViewAs() !== null;
  const readOnlySession = viewAs || isDemoSession();
  const chat = useFeature('ai_chat');
  return (
    <AppShell
      sections={appNav}
      homePath="/app"
      orgRole={me?.user?.org_role ?? null}
      context={
        <div className="flex min-w-0 items-center gap-2 text-sm">
          <Building2 className="size-4 shrink-0 text-muted" aria-hidden />
          <span className="truncate font-medium">{me?.org?.name}</span>
          {me?.plan && <Badge tone="brand">{me.plan.name}</Badge>}
          {demo && <Badge tone="info">Demo data</Badge>}
        </div>
      }
      actions={
        <>
          {/* Mobile is read-only (plan 14.4): scan controls from tablet width up. */}
          <div className="hidden items-center gap-1 md:flex">
            {!readOnlySession && <ScanControl />}
            <AsOfSelect />
          </div>
          {chat && !readOnlySession && <AskButton />}
          <NotificationBell />
        </>
      }
      banner={
        <>
          <ViewAsBanner />
          <DemoBanner />
          <AnnouncementBanner />
          <AsOfBanner />
          {!readOnlySession && <BillingBanner />}
        </>
      }
    >
      <Outlet />
      <ScanProgressDrawer />
    </AppShell>
  );
}

/** Platform Owner console shell (`/owner/*`). */
export function OwnerShell() {
  useLiveEvents(true);
  const pending = usePendingCount();
  return (
    <AppShell
      sections={ownerNav}
      homePath="/owner"
      badges={{ pendingApprovals: pending }}
      context={
        <div className="flex items-center gap-2 text-sm">
          <ShieldCheck className="size-4 text-brand-strong" aria-hidden />
          <span className="font-medium">Owner console</span>
          <Badge tone="info">KloudSchool</Badge>
        </div>
      }
      actions={<NotificationBell />}
    />
  );
}
