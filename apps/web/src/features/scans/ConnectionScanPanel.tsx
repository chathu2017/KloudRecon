import { CalendarClock, RefreshCw } from 'lucide-react';
import * as React from 'react';
import { hasRole } from '@/components/layout/nav';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { NativeSelect } from '@/components/ui/input';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import type { ConnectionDetail } from '@/features/connections/api';
import { useMe } from '@/lib/auth/context';
import { formatDateTime, formatElapsed, titleCase } from '@/lib/format';
import { useUi } from '@/lib/ui-store';
import { useSaveScanSettings, useScans, useScanSettings, useStartScan } from './api';
import { ScanStatusBadge } from './ScanProgressDrawer';

const HOURS = Array.from({ length: 24 }, (_, h) => h);

function ScheduleEditor({ canEdit }: { canEdit: boolean }) {
  const { data } = useScanSettings();
  const save = useSaveScanSettings();
  if (!data) return null;
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-md bg-surface-2 px-4 py-3 text-sm">
      <CalendarClock className="size-4 text-brand-strong" aria-hidden />
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          className="size-4 accent-brand"
          checked={data.daily_scan_enabled}
          disabled={!canEdit || save.isPending}
          onChange={(e) => save.mutate({ ...data, daily_scan_enabled: e.target.checked })}
        />
        Daily scan
      </label>
      <label className="flex items-center gap-2 text-muted">
        at
        <NativeSelect
          className="h-8 w-36"
          aria-label="Daily scan hour (UTC)"
          value={data.scan_hour_utc}
          disabled={!canEdit || !data.daily_scan_enabled || save.isPending}
          onChange={(e) => save.mutate({ ...data, scan_hour_utc: Number(e.target.value) })}
        >
          {HOURS.map((h) => (
            <option key={h} value={h}>
              {String(h).padStart(2, '0')}:00 UTC
            </option>
          ))}
        </NativeSelect>
      </label>
      <span className="text-xs text-muted">Applies to all connections of your organization.</span>
    </div>
  );
}

/** Scan controls and recent scans on the connection page. */
export function ConnectionScanPanel({ connection }: { connection: ConnectionDetail }) {
  const { data: me } = useMe();
  const { data: scans } = useScans(connection.id, 10);
  const start = useStartScan();
  const openDrawer = useUi((s) => s.openScanDrawer);
  const canScan = hasRole(me?.user?.org_role, 'member');
  const isAdmin = hasRole(me?.user?.org_role, 'admin');
  const scannable = connection.status === 'valid' || connection.status === 'partially_valid';
  const busy = scans?.some((s) => s.status === 'queued' || s.status === 'running') ?? false;

  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>Scans</CardTitle>
            <CardDescription>
              {connection.last_scan_at
                ? `Last scan ${formatDateTime(connection.last_scan_at)}.`
                : 'Not scanned yet.'}
            </CardDescription>
          </div>
          {canScan && (
            <Button
              size="sm"
              loading={start.isPending}
              disabled={!scannable || busy}
              title={!scannable ? 'Validate the connection first' : undefined}
              onClick={() => start.mutate(connection.id)}
            >
              <RefreshCw /> {busy ? 'Scan running' : 'Scan now'}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <ScheduleEditor canEdit={isAdmin} />
      </CardContent>
      {scans && scans.length > 0 && (
        <Table>
          <THead>
            <TR className="hover:bg-transparent">
              <TH>Scan</TH>
              <TH>Status</TH>
              <TH>Trigger</TH>
              <TH className="text-right">Resources</TH>
              <TH className="text-right">Duration</TH>
            </TR>
          </THead>
          <TBody>
            {scans.map((s) => (
              <TR
                key={s.id}
                className="cursor-pointer"
                onClick={() => openDrawer(s.id)}
                onKeyDown={(e: React.KeyboardEvent) => {
                  if (e.key === 'Enter') openDrawer(s.id);
                }}
                tabIndex={0}
              >
                <TD>
                  <div className="font-medium">#{s.sequence}</div>
                  <div className="text-xs text-muted">
                    {formatDateTime(s.started_at ?? s.created_at)}
                  </div>
                </TD>
                <TD>
                  <ScanStatusBadge status={s.status} />
                </TD>
                <TD className="text-sm">{titleCase(s.trigger)}</TD>
                <TD className="text-right tabular">
                  {typeof s.stats.resources === 'number' ? s.stats.resources.toLocaleString() : '—'}
                </TD>
                <TD className="text-right tabular text-muted">
                  {typeof s.stats.duration_ms === 'number'
                    ? formatElapsed(s.stats.duration_ms)
                    : '—'}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </Card>
  );
}
