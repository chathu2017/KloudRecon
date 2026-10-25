import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { api, ApiError, getAccessToken, unwrap, type Schemas } from '@/lib/api/client';
import { env } from '@/lib/env';
import { useUi } from '@/lib/ui-store';

export type Resource = Schemas['ResourceOut'];
export type ResourceDetail = Schemas['ResourceDetail'];
export type Facets = Schemas['InventoryFacets'];
export type Orphan = Schemas['OrphanOut'];
export type Change = Schemas['ChangeOut'];

export interface InventoryFilters {
  q?: string;
  type?: string;
  resource_group?: string;
  subscription_id?: string;
  location?: string;
  tag?: string;
  sort?: 'name' | 'type' | 'resource_group' | 'location' | 'subscription_id';
}

function clean(filters: InventoryFilters): InventoryFilters {
  const out: InventoryFilters = {};
  for (const [k, v] of Object.entries(filters)) {
    if (typeof v === 'string' && v !== '') (out as Record<string, string>)[k] = v;
  }
  return out;
}

function apiQuery(filters: InventoryFilters) {
  const { type, ...rest } = clean(filters);
  return { ...rest, ...(type ? { type: [type] } : {}) };
}

/** The scan the data pages show: the time-machine selection or the latest scans. */
export function useAsOf(): string | undefined {
  return useUi((s) => s.asOfScanId) ?? undefined;
}

export function useResources(filters: InventoryFilters) {
  const scanId = useAsOf();
  const query = clean(filters);
  return useInfiniteQuery({
    queryKey: ['inventory', 'resources', scanId ?? '', query],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      unwrap(
        api.GET('/api/v1/resources', {
          params: {
            query: {
              ...apiQuery(query),
              limit: 200,
              ...(scanId ? { scan_id: scanId } : {}),
              ...(pageParam ? { cursor: pageParam } : {}),
            },
          },
        }),
      ),
    getNextPageParam: (last) => last.next_cursor ?? undefined,
    placeholderData: keepPreviousData,
  });
}

export function useFacets() {
  const scanId = useAsOf();
  return useQuery({
    queryKey: ['inventory', 'facets', scanId ?? ''],
    queryFn: () =>
      unwrap(
        api.GET('/api/v1/resources/facets', {
          params: { query: scanId ? { scan_id: scanId } : {} },
        }),
      ),
  });
}

export function useResourceDetail(armId: string | null) {
  const scanId = useAsOf();
  return useQuery({
    queryKey: ['inventory', 'detail', armId ?? '', scanId ?? ''],
    queryFn: () =>
      unwrap(
        api.GET('/api/v1/resources/detail', {
          params: { query: { arm_id: armId ?? '', ...(scanId ? { scan_id: scanId } : {}) } },
        }),
      ),
    enabled: !!armId,
    retry: false,
  });
}

export function useOrphans() {
  const scanId = useAsOf();
  return useQuery({
    queryKey: ['inventory', 'orphans', scanId ?? ''],
    queryFn: () =>
      unwrap(
        api.GET('/api/v1/resources/orphans', {
          params: { query: scanId ? { scan_id: scanId } : {} },
        }),
      ),
  });
}

/** Download the filtered inventory as CSV or XLSX (authenticated fetch → file). */
export async function downloadInventory(
  format: 'csv' | 'xlsx',
  filters: InventoryFilters,
  scanId?: string,
): Promise<void> {
  const params = new URLSearchParams({ format, ...clean(filters) });
  params.delete('sort');
  if (scanId) params.set('scan_id', scanId);
  const token = await getAccessToken();
  const response = await fetch(`${env.apiBaseUrl}/api/v1/resources/export?${params.toString()}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) throw new ApiError(response.status, 'export_failed', 'The export failed.');
  const blob = await response.blob();
  const disposition = response.headers.get('content-disposition') ?? '';
  const name = /filename="([^"]+)"/.exec(disposition)?.[1] ?? `kloudrecon-inventory.${format}`;
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
