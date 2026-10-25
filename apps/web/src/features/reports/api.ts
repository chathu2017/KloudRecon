import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, errorMessage, unwrap, type Schemas } from '@/lib/api/client';
import { useLiveEvent } from '@/lib/sse';

export type Report = Schemas['ReportOut'];
export type ReportIn = Schemas['ReportIn'];
export type Schedule = Schemas['ScheduleOut'];
export type ScheduleIn = Schemas['ScheduleIn'];
export type Branding = Schemas['BrandingOut'];
export type BrandingIn = Schemas['BrandingIn'];

const KEY = ['reports'] as const;

export function useReports() {
  const qc = useQueryClient();
  useLiveEvent('report.ready', () => void qc.invalidateQueries({ queryKey: KEY }));
  return useQuery({
    queryKey: [...KEY, 'list'],
    queryFn: () => unwrap(api.GET('/api/v1/reports')),
    refetchInterval: (q) =>
      q.state.data?.some((r) => r.status === 'queued' || r.status === 'rendering') ? 4000 : false,
  });
}

export function useCreateReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ReportIn) => unwrap(api.POST('/api/v1/reports', { body })),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: KEY });
      toast.success('Report queued. It is ready in a minute; we will notify you.');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
}

export function useDeleteReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => unwrap(api.DELETE('/api/v1/reports/{report_id}', { params: { path: { report_id: id } } })),
    onSuccess: () => void qc.invalidateQueries({ queryKey: KEY }),
    onError: (e) => toast.error(errorMessage(e)),
  });
}

export function reportLink(id: string) {
  return unwrap(api.POST('/api/v1/reports/{report_id}/link', { params: { path: { report_id: id } } }));
}

export function useSchedules() {
  return useQuery({ queryKey: [...KEY, 'schedules'], queryFn: () => unwrap(api.GET('/api/v1/reports/schedules')) });
}

export function useSaveSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id?: string; body: ScheduleIn }) =>
      id
        ? unwrap(api.PUT('/api/v1/reports/schedules/{schedule_id}', { params: { path: { schedule_id: id } }, body }))
        : unwrap(api.POST('/api/v1/reports/schedules', { body })),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [...KEY, 'schedules'] });
      toast.success('Schedule saved.');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
}

export function useDeleteSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(api.DELETE('/api/v1/reports/schedules/{schedule_id}', { params: { path: { schedule_id: id } } })),
    onSuccess: () => void qc.invalidateQueries({ queryKey: [...KEY, 'schedules'] }),
    onError: (e) => toast.error(errorMessage(e)),
  });
}

export function useBranding() {
  return useQuery({ queryKey: [...KEY, 'branding'], queryFn: () => unwrap(api.GET('/api/v1/settings/branding')) });
}

export function useSaveBranding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: BrandingIn) => unwrap(api.PUT('/api/v1/settings/branding', { body })),
    onSuccess: (data) => {
      qc.setQueryData([...KEY, 'branding'], data);
      toast.success('Branding saved. It applies to new reports.');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
}
