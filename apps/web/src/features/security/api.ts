import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useAsOf } from '@/features/inventory/api';
import { api, errorMessage, unwrap, type Schemas } from '@/lib/api/client';

export type Finding = Schemas['FindingOut'];
export type FindingDetail = Schemas['FindingDetail'];
export type FindingPage = Schemas['FindingPage'];
export type AttackPath = Schemas['AttackPathOut'];
export type Exposure = Schemas['ExposureOut'];
export type ExceptionItem = Schemas['ExceptionOut'];
export type Threat = Schemas['ThreatOut'];
export type Vulnerability = Schemas['VulnerabilityOut'];

export interface FindingFilters {
  q?: string;
  severity?: string[];
  status?: string[];
  source?: string[];
  pillar?: string[];
  area?: string[];
  category?: string;
  rule_id?: string;
  arm_id?: string;
  subscription_id?: string;
  framework?: string;
  control?: string;
  assignee?: string;
  overdue?: boolean;
  sort?: 'risk' | 'severity' | 'first_seen' | 'due' | 'title' | 'savings';
  offset?: number;
  limit?: number;
}

function cleanFilters(f: FindingFilters): FindingFilters {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(f)) {
    if (v === undefined || v === '' || v === false) continue;
    if (Array.isArray(v) && v.length === 0) continue;
    out[k] = v;
  }
  return out;
}

const scanQuery = (scanId?: string) => (scanId ? { scan_id: scanId } : {});

export function useSecuritySummary() {
  const scanId = useAsOf();
  return useQuery({
    queryKey: ['security', 'summary', scanId ?? ''],
    queryFn: () => unwrap(api.GET('/api/v1/security/summary', { params: { query: scanQuery(scanId) } })),
  });
}

export function useFindings(filters: FindingFilters) {
  const scanId = useAsOf();
  const query = cleanFilters(filters);
  return useQuery({
    queryKey: ['security', 'findings', scanId ?? '', query],
    queryFn: () =>
      unwrap(api.GET('/api/v1/security/findings', { params: { query: { ...query, ...scanQuery(scanId) } } })),
    placeholderData: keepPreviousData,
  });
}

export function useFindingFacets(pillar?: string[]) {
  const scanId = useAsOf();
  return useQuery({
    queryKey: ['security', 'facets', scanId ?? '', pillar ?? []],
    queryFn: () =>
      unwrap(
        api.GET('/api/v1/security/findings/facets', {
          params: { query: { ...scanQuery(scanId), ...(pillar?.length ? { pillar } : {}) } },
        }),
      ),
  });
}

export function useFinding(id: string | undefined) {
  return useQuery({
    queryKey: ['security', 'finding', id ?? ''],
    queryFn: () => unwrap(api.GET('/api/v1/security/findings/{finding_id}', { params: { path: { finding_id: id ?? '' } } })),
    enabled: !!id,
    retry: false,
  });
}

function useInvalidateFindings() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ['security'] });
    void qc.invalidateQueries({ queryKey: ['overview'] });
  };
}

export function useUpdateFinding(id: string) {
  const qc = useQueryClient();
  const invalidate = useInvalidateFindings();
  return useMutation({
    mutationFn: (body: Schemas['FindingUpdateIn']) =>
      unwrap(api.PATCH('/api/v1/security/findings/{finding_id}', { params: { path: { finding_id: id } }, body })),
    onSuccess: (data) => {
      qc.setQueryData(['security', 'finding', id], data);
      invalidate();
      toast.success('Finding updated');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
}

export function useBulkUpdate() {
  const invalidate = useInvalidateFindings();
  return useMutation({
    mutationFn: (body: Schemas['FindingBulkIn']) => unwrap(api.POST('/api/v1/security/findings/bulk', { body })),
    onSuccess: (_d, vars) => {
      invalidate();
      toast.success(`${vars.ids.length} finding(s) updated`);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
}

export function useAddComment(id: string) {
  const invalidate = useInvalidateFindings();
  return useMutation({
    mutationFn: (body: string) =>
      unwrap(api.POST('/api/v1/security/findings/{finding_id}/comments', { params: { path: { finding_id: id } }, body: { body } })),
    onSuccess: () => invalidate(),
    onError: (e) => toast.error(errorMessage(e)),
  });
}

export function useRequestException(id: string) {
  const invalidate = useInvalidateFindings();
  return useMutation({
    mutationFn: (body: Schemas['ExceptionIn']) =>
      unwrap(api.POST('/api/v1/security/findings/{finding_id}/exceptions', { params: { path: { finding_id: id } }, body })),
    onSuccess: (exc) => {
      invalidate();
      toast.success(exc.status === 'approved' ? 'Exception approved: risk accepted' : 'Exception requested for approval');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
}

export function useExceptions(status?: 'pending' | 'approved' | 'rejected' | 'revoked' | 'expired') {
  return useQuery({
    queryKey: ['security', 'exceptions', status ?? ''],
    queryFn: () => unwrap(api.GET('/api/v1/security/exceptions', { params: { query: status ? { status } : {} } })),
  });
}

export function useDecideException() {
  const invalidate = useInvalidateFindings();
  return useMutation({
    mutationFn: ({ id, decision, note }: { id: string; decision: 'approve' | 'reject'; note?: string }) =>
      unwrap(
        api.POST('/api/v1/security/exceptions/{exception_id}/decision', {
          params: { path: { exception_id: id } },
          body: { decision, note: note ?? null },
        }),
      ),
    onSuccess: (exc) => {
      invalidate();
      toast.success(exc.status === 'approved' ? 'Exception approved' : 'Exception rejected');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
}

export function useRevokeException() {
  const invalidate = useInvalidateFindings();
  return useMutation({
    mutationFn: (id: string) => unwrap(api.DELETE('/api/v1/security/exceptions/{exception_id}', { params: { path: { exception_id: id } } })),
    onSuccess: () => {
      invalidate();
      toast.success('Exception revoked');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
}

export function useAttackPaths() {
  const scanId = useAsOf();
  return useQuery({
    queryKey: ['security', 'attack-paths', scanId ?? ''],
    queryFn: () => unwrap(api.GET('/api/v1/security/attack-paths', { params: { query: scanQuery(scanId) } })),
  });
}

export function useExposure() {
  const scanId = useAsOf();
  return useQuery({
    queryKey: ['security', 'exposure', scanId ?? ''],
    queryFn: () => unwrap(api.GET('/api/v1/security/exposure', { params: { query: scanQuery(scanId) } })),
  });
}

export function useBlastRadius(armId: string | null) {
  const scanId = useAsOf();
  return useQuery({
    queryKey: ['security', 'blast', armId ?? '', scanId ?? ''],
    queryFn: () =>
      unwrap(api.GET('/api/v1/security/blast-radius', { params: { query: { arm_id: armId ?? '', ...scanQuery(scanId) } } })),
    enabled: !!armId,
    retry: false,
  });
}

export function useIdentity() {
  const scanId = useAsOf();
  return useQuery({
    queryKey: ['security', 'identity', scanId ?? ''],
    queryFn: () => unwrap(api.GET('/api/v1/security/identity', { params: { query: scanQuery(scanId) } })),
  });
}

export function useVulnerabilities(q?: string, severity?: string) {
  const scanId = useAsOf();
  return useQuery({
    queryKey: ['security', 'vulns', scanId ?? '', q ?? '', severity ?? ''],
    queryFn: () =>
      unwrap(
        api.GET('/api/v1/security/vulnerabilities', {
          params: { query: { ...scanQuery(scanId), ...(q ? { q } : {}), ...(severity ? { severity } : {}) } },
        }),
      ),
    placeholderData: keepPreviousData,
  });
}

export function useThreats(days: number) {
  const scanId = useAsOf();
  return useQuery({
    queryKey: ['security', 'threats', scanId ?? '', days],
    queryFn: () => unwrap(api.GET('/api/v1/security/threats', { params: { query: { ...scanQuery(scanId), days } } })),
  });
}

export function useCoverage() {
  const scanId = useAsOf();
  return useQuery({
    queryKey: ['security', 'coverage', scanId ?? ''],
    queryFn: () => unwrap(api.GET('/api/v1/security/coverage', { params: { query: scanQuery(scanId) } })),
  });
}
