import { ChevronDown, History, Loader2, Radar, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';
import { hasRole } from '@/components/layout/nav';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip } from '@/components/ui/misc';
import { useConnections } from '@/features/connections/api';
import { useMe } from '@/lib/auth/context';
import { formatDateTime, timeAgo } from '@/lib/format';
import { useNow } from '@/lib/hooks';
import { useUi } from '@/lib/ui-store';
import { completedScans, useActiveScans, useScans, useStartScan } from './api';

/** Top bar: data freshness, live scan progress and Scan now (plan 14.4). */
export function ScanControl() {
  const { data: me } = useMe();
  const { data: connections } = useConnections();
  const { data: active } = useActiveScans(!!connections?.length);
  const { data: scans } = useScans(undefined, 20);
  const start = useStartScan();
  const openDrawer = useUi((s) => s.openScanDrawer);
  useNow(60_000);
  if (!connections?.length) return null;

  const canScan = hasRole(me?.user?.org_role, 'member');
  const running = active?.[0];
  const latest = completedScans(scans)[0];
  const scannable = connections.filter(
    (c) => c.status === 'valid' || c.status === 'partially_valid',
  );

  if (running) {
    return (
      <Button
        variant="subtle"
        size="sm"
        onClick={() => openDrawer(running.id)}
        aria-label={`Scan in progress, ${running.progress}%. Show progress`}
      >
        <Loader2 className="animate-spin" />
        {running.status === 'queued' ? 'Scan queued' : `Scanning ${running.progress}%`}
      </Button>
    );
  }

  const freshness = latest ? (
    <Tooltip content={`Last scan ${formatDateTime(latest.finished_at)}`}>
      <button
        type="button"
        className="hidden items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted hover:bg-surface-2 hover:text-text md:inline-flex"
        onClick={() => openDrawer(latest.id)}
      >
        <Radar className="size-3.5" aria-hidden />
        Updated {timeAgo(latest.finished_at)}
      </button>
    </Tooltip>
  ) : null;

  if (!canScan || !scannable.length) return freshness;

  const only = scannable.length === 1 ? scannable[0] : undefined;
  return (
    <div className="flex items-center gap-1">
      {freshness}
      {only ? (
        <Button
          variant="secondary"
          size="sm"
          loading={start.isPending}
          onClick={() => start.mutate(only.id)}
        >
          <RefreshCw /> Scan now
        </Button>
      ) : (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="secondary" size="sm" loading={start.isPending}>
              <RefreshCw /> Scan now <ChevronDown className="size-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Scan a connection</DropdownMenuLabel>
            {scannable.map((c) => (
              <DropdownMenuItem key={c.id} onSelect={() => start.mutate(c.id)}>
                {c.name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}

/** Time machine: choose which scan the data pages show (plan 8.5). */
export function AsOfSelect() {
  const { data: scans } = useScans(undefined, 30);
  const asOf = useUi((s) => s.asOfScanId);
  const setAsOf = useUi((s) => s.setAsOfScanId);
  const done = completedScans(scans);
  if (done.length < 2) return null;
  const selected = done.find((s) => s.id === asOf);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant={selected ? 'subtle' : 'ghost'}
          size="sm"
          aria-label="Choose the scan to view (time machine)"
        >
          <History />
          <span className="hidden lg:inline">
            {selected ? `As of ${formatDateTime(selected.started_at)}` : 'Latest'}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel>View data as of</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={asOf ?? 'latest'}
          onValueChange={(v) => setAsOf(v === 'latest' ? null : v)}
        >
          <DropdownMenuRadioItem value="latest">Latest scan</DropdownMenuRadioItem>
          <DropdownMenuSeparator />
          {done.map((s) => (
            <DropdownMenuRadioItem key={s.id} value={s.id}>
              <span className="flex w-full justify-between gap-3">
                <span>{formatDateTime(s.started_at)}</span>
                <span className="text-xs text-muted">#{s.sequence}</span>
              </span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/app/changes/compare">Compare two scans…</Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Banner shown while viewing an older scan. */
export function AsOfBanner() {
  const asOf = useUi((s) => s.asOfScanId);
  const setAsOf = useUi((s) => s.setAsOfScanId);
  const { data: scans } = useScans(undefined, 30);
  if (!asOf) return null;
  const scan = scans?.find((s) => s.id === asOf);
  return (
    <div className="flex items-center justify-center gap-3 border-b border-border bg-medium-soft px-4 py-1.5 text-xs">
      <History className="size-3.5 text-medium-strong" aria-hidden />
      <span>
        Time machine: you are viewing data as of{' '}
        <strong>{scan ? formatDateTime(scan.started_at) : 'an earlier scan'}</strong>.
      </span>
      <button
        type="button"
        className="font-medium text-brand-strong hover:underline"
        onClick={() => setAsOf(null)}
      >
        Back to latest
      </button>
    </div>
  );
}
