import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, errorMessage, unwrap, type Schemas } from '@/lib/api/client';
import { useLiveEvent } from '@/lib/sse';
import { useUi } from '@/lib/ui-store';

export type Scan = Schemas['ScanOut'];
export type ScanDetail = Schemas['ScanDetail'];
export type ScanStage = Schemas['ScanStageOut'];

export const scanKeys = {
  all: ['scans'] as const,
  list: (connectionId?: string) => ['scans', 'list', connectionId ?? ''] as const,
  active: ['scans', 'active'] as const,
  detail: (id: string) => ['scans', 'detail', id] as const,
};

/** Query keys of scan-derived data, refreshed when a scan finishes. */
export const SCAN_DATA_KEYS = [
  ['scans'],
  ['connections'],
  ['inventory'],
  ['changes'],
  ['overview'],
  ['compare'],
] as const;

const COMPLETED = new Set(['succeeded', 'partial']);

export function completedScans(scans: Scan[] | undefined): Scan[] {
  return (scans ?? []).filter((s) => COMPLETED.has(s.status));
}

export function useScans(connectionId?: string, limit = 30) {
  return useQuery({
    queryKey: scanKeys.list(connectionId),
    queryFn: () =>
      unwrap(
        api.GET('/api/v1/scans', {
          params: { query: { limit, ...(connectionId ? { connection_id: connectionId } : {}) } },
        }),
      ),
  });
}

/** Queued or running scans; polls slowly as a fallback to SSE while any is active. */
export function useActiveScans(enabled = true) {
  return useQuery({
    queryKey: scanKeys.active,
    queryFn: () => unwrap(api.GET('/api/v1/scans', { params: { query: { status: 'active' } } })),
    enabled,
    refetchInterval: (query) => ((query.state.data?.length ?? 0) > 0 ? 10_000 : false),
  });
}

export function useScan(id: string | null) {
  return useQuery({
    queryKey: scanKeys.detail(id ?? ''),
    queryFn: () =>
      unwrap(api.GET('/api/v1/scans/{scan_id}', { params: { path: { scan_id: id ?? '' } } })),
    enabled: !!id,
  });
}

export function useStartScan() {
  const qc = useQueryClient();
  const openDrawer = useUi((s) => s.openScanDrawer);
  return useMutation({
    mutationFn: (connectionId: string) =>
      unwrap(api.POST('/api/v1/scans', { body: { connection_id: connectionId } })),
    onSuccess: (scan) => {
      toast.success('Scan started', { description: 'Follow the progress live.' });
      void qc.invalidateQueries({ queryKey: scanKeys.all });
      openDrawer(scan.id);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
}

/**
 * Mounted once in the customer shell: keeps scan queries live from SSE
 * (`scan.progress`, `scan.completed`, `scan.failed`) and refreshes scan-derived data.
 */
export function useScanLiveUpdates() {
  const qc = useQueryClient();
  const openDrawer = useUi((s) => s.openScanDrawer);
  useLiveEvent('scan.progress', (event) => {
    const scanId = typeof event.payload.scan_id === 'string' ? event.payload.scan_id : '';
    void qc.invalidateQueries({ queryKey: scanKeys.active });
    if (scanId) void qc.invalidateQueries({ queryKey: scanKeys.detail(scanId) });
  });
  const finished = (ok: boolean) => (event: { payload: Record<string, unknown> }) => {
    const scanId = typeof event.payload.scan_id === 'string' ? event.payload.scan_id : null;
    for (const key of SCAN_DATA_KEYS) void qc.invalidateQueries({ queryKey: key });
    const status = typeof event.payload.status === 'string' ? event.payload.status : '';
    const title = ok
      ? status === 'partial'
        ? 'Scan finished with warnings'
        : 'Scan finished'
      : 'Scan failed';
    const show = ok ? toast.success : toast.error;
    show(title, {
      action: scanId ? { label: 'Details', onClick: () => openDrawer(scanId) } : undefined,
    });
  };
  useLiveEvent('scan.completed', finished(true));
  useLiveEvent('scan.failed', finished(false));
}

export function useScanSettings() {
  return useQuery({
    queryKey: ['org', 'scan-settings'],
    queryFn: () => unwrap(api.GET('/api/v1/org/settings/scans')),
  });
}

export function useSaveScanSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Schemas['OrgScanSettings']) =>
      unwrap(api.PUT('/api/v1/org/settings/scans', { body })),
    onSuccess: (data) => {
      qc.setQueryData(['org', 'scan-settings'], data);
      toast.success('Scan schedule saved');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
}
