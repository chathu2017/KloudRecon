import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useAsOf } from '@/features/inventory/api';
import { api, errorMessage, unwrap, type Schemas } from '@/lib/api/client';

export type CostExplorer = Schemas['CostExplorer'];
export type CostSummary = Schemas['CostSummary'];
export type CostForecast = Schemas['CostForecastOut'];
export type Anomaly = Schemas['AnomalyOut'];
export type Rightsizing = Schemas['RightsizingOut'];
export type WasteReport = Schemas['WasteReport'];
export type Commitments = Schemas['CommitmentsOut'];
export type WhatIfOut = Schemas['WhatIfOut'];
export type WhatIfScenario = Schemas['WhatIfScenario'];
export type WhatIfOptions = Schemas['WhatIfOptions'];
export type Showback = Schemas['ShowbackOut'];
export type SavingsIn = Schemas['SavingsIn'];
export type SavingsList = Schemas['SavingsList'];
export type ResourceCost = Schemas['ResourceCost'];
export type BudgetOut = Schemas['BudgetOut'];

export type CostRange = '7d' | '30d' | '90d' | 'mtd' | '6m' | '12m' | 'custom';
export type CostMetric = 'actual' | 'amortized';

export interface ExplorerParams {
  metric: CostMetric;
  group_by: string;
  range: CostRange;
  start?: string;
  end?: string;
  subscription_id?: string;
  service?: string;
  resource_group?: string;
  location?: string;
  meter?: string;
}

const scanQuery = (scanId?: string) => (scanId ? { scan_id: scanId } : {});

function clean<T extends object>(obj: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined && v !== ''),
  ) as Partial<T>;
}

export function useCostSummary() {
  const scanId = useAsOf();
  return useQuery({
    queryKey: ['cost', 'summary', scanId ?? ''],
    queryFn: () =>
      unwrap(api.GET('/api/v1/costs/summary', { params: { query: scanQuery(scanId) } })),
  });
}

export function useExplorer(params: ExplorerParams) {
  const scanId = useAsOf();
  const query = clean(params);
  return useQuery({
    queryKey: ['cost', 'explorer', scanId ?? '', query],
    queryFn: () =>
      unwrap(
        api.GET('/api/v1/costs/explorer', {
          params: { query: { ...query, ...scanQuery(scanId) } },
        }),
      ),
    placeholderData: keepPreviousData,
    retry: false,
  });
}

export function useForecast() {
  const scanId = useAsOf();
  return useQuery({
    queryKey: ['cost', 'forecast', scanId ?? ''],
    queryFn: () =>
      unwrap(api.GET('/api/v1/costs/forecast', { params: { query: scanQuery(scanId) } })),
  });
}

export function useAnomalies(status?: 'open' | 'acknowledged' | 'resolved' | 'expected') {
  const scanId = useAsOf();
  return useQuery({
    queryKey: ['cost', 'anomalies', scanId ?? '', status ?? ''],
    queryFn: () =>
      unwrap(
        api.GET('/api/v1/costs/anomalies', {
          params: { query: { ...scanQuery(scanId), ...(status ? { status } : {}) } },
        }),
      ),
  });
}

export function useUpdateAnomaly() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: Schemas['AnomalyUpdate']['status'] }) =>
      unwrap(
        api.PATCH('/api/v1/costs/anomalies/{anomaly_id}', {
          params: { path: { anomaly_id: id } },
          body: { status },
        }),
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['cost'] });
      toast.success('Anomaly updated');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
}

export function useRightsizing() {
  const scanId = useAsOf();
  return useQuery({
    queryKey: ['cost', 'rightsizing', scanId ?? ''],
    queryFn: () =>
      unwrap(api.GET('/api/v1/costs/rightsizing', { params: { query: scanQuery(scanId) } })),
  });
}

export function useWaste() {
  const scanId = useAsOf();
  return useQuery({
    queryKey: ['cost', 'waste', scanId ?? ''],
    queryFn: () => unwrap(api.GET('/api/v1/costs/waste', { params: { query: scanQuery(scanId) } })),
  });
}

export function useCommitments() {
  const scanId = useAsOf();
  return useQuery({
    queryKey: ['cost', 'commitments', scanId ?? ''],
    queryFn: () =>
      unwrap(api.GET('/api/v1/costs/commitments', { params: { query: scanQuery(scanId) } })),
  });
}

export function useWhatIfResources(q: string) {
  const scanId = useAsOf();
  return useQuery({
    queryKey: ['cost', 'whatif-resources', scanId ?? '', q],
    queryFn: () =>
      unwrap(
        api.GET('/api/v1/costs/whatif/resources', {
          params: { query: { ...scanQuery(scanId), ...(q ? { q } : {}) } },
        }),
      ),
    placeholderData: keepPreviousData,
  });
}

export function useWhatIf() {
  const scanId = useAsOf();
  return useMutation({
    mutationFn: (scenarios: WhatIfScenario[]) =>
      unwrap(
        api.POST('/api/v1/costs/whatif', {
          params: { query: scanQuery(scanId) },
          body: { scenarios },
        }),
      ),
    onError: (e) => toast.error(errorMessage(e)),
  });
}

export function useShowback(key: string | undefined, range: CostRange) {
  const scanId = useAsOf();
  return useQuery({
    queryKey: ['cost', 'showback', scanId ?? '', key ?? '', range],
    queryFn: () =>
      unwrap(
        api.GET('/api/v1/costs/showback', {
          params: {
            query: {
              ...scanQuery(scanId),
              ...(key ? { key } : {}),
              range: range === 'custom' ? '30d' : range,
            },
          },
        }),
      ),
    placeholderData: keepPreviousData,
  });
}

export function useSavings() {
  return useQuery({
    queryKey: ['cost', 'savings'],
    queryFn: () => unwrap(api.GET('/api/v1/costs/savings')),
  });
}

export function useTrackSaving() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: SavingsIn) => unwrap(api.POST('/api/v1/costs/savings', { body })),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['cost'] });
      toast.success(
        'Marked as implemented. Realized savings are measured from the next cost data.',
      );
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
}

export function useUntrackSaving() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(
        api.DELETE('/api/v1/costs/savings/{entry_id}', { params: { path: { entry_id: id } } }),
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['cost'] });
      toast.success('Removed from the savings tracker');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
}

export function useResourceCost(armId: string | null) {
  const scanId = useAsOf();
  return useQuery({
    queryKey: ['cost', 'resource', scanId ?? '', armId ?? ''],
    queryFn: () =>
      unwrap(
        api.GET('/api/v1/costs/resource', {
          params: { query: { arm_id: armId ?? '', ...scanQuery(scanId) } },
        }),
      ),
    enabled: Boolean(armId),
  });
}
