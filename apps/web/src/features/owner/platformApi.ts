import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, errorMessage, unwrap, type Schemas } from '@/lib/api/client';

export type OwnerHealth = Schemas['OwnerHealth'];
export type Announcement = Schemas['AnnouncementOut'];
export type AnnouncementIn = Schemas['AnnouncementIn'];
export type FeatureFlag = Schemas['FeatureFlagOut'];
export type FeatureFlagIn = Schemas['FeatureFlagIn'];
export type EmailTemplate = Schemas['EmailTemplateOut'];
export type EmailTemplateIn = Schemas['EmailTemplateIn'];
export type Retirement = Schemas['RetirementOut'];
export type RetirementIn = Schemas['RetirementIn'];

const K = {
  health: ['owner', 'health'] as const,
  announcements: ['owner', 'announcements'] as const,
  flags: ['owner', 'flags'] as const,
  templates: ['owner', 'email-templates'] as const,
  retirements: ['owner', 'retirements'] as const,
};

function onError(e: unknown) {
  toast.error(errorMessage(e));
}

export function useOwnerHealth() {
  return useQuery({
    queryKey: K.health,
    queryFn: () => unwrap(api.GET('/api/v1/owner/health')),
    refetchInterval: 30_000,
  });
}

export function useRetryJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (jobId: string) => unwrap(api.POST('/api/v1/owner/jobs/{job_id}/retry', { params: { path: { job_id: jobId } } })),
    onSuccess: () => {
      toast.success('Job queued again.');
      void qc.invalidateQueries({ queryKey: K.health });
    },
    onError,
  });
}

// ---- announcements ----------------------------------------------------------------------------
export function useAnnouncementsAdmin() {
  return useQuery({ queryKey: K.announcements, queryFn: () => unwrap(api.GET('/api/v1/owner/announcements')) });
}

export function useSaveAnnouncement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id?: string; body: AnnouncementIn }) =>
      id
        ? unwrap(api.PUT('/api/v1/owner/announcements/{announcement_id}', { params: { path: { announcement_id: id } }, body }))
        : unwrap(api.POST('/api/v1/owner/announcements', { body })),
    onSuccess: () => {
      toast.success('Announcement saved.');
      void qc.invalidateQueries({ queryKey: K.announcements });
      void qc.invalidateQueries({ queryKey: ['announcements'] });
    },
    onError,
  });
}

export function useDeleteAnnouncement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(api.DELETE('/api/v1/owner/announcements/{announcement_id}', { params: { path: { announcement_id: id } } })),
    onSuccess: () => void qc.invalidateQueries({ queryKey: K.announcements }),
    onError,
  });
}

// ---- feature flags ----------------------------------------------------------------------------
export function useFlagsAdmin() {
  return useQuery({ queryKey: K.flags, queryFn: () => unwrap(api.GET('/api/v1/owner/feature-flags')) });
}

export function useSaveFlag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: FeatureFlagIn) => unwrap(api.PUT('/api/v1/owner/feature-flags', { body })),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: K.flags });
      void qc.invalidateQueries({ queryKey: ['features'] });
    },
    onError,
  });
}

export function useDeleteFlag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (key: string) => unwrap(api.DELETE('/api/v1/owner/feature-flags/{key}', { params: { path: { key } } })),
    onSuccess: () => void qc.invalidateQueries({ queryKey: K.flags }),
    onError,
  });
}

// ---- email templates --------------------------------------------------------------------------
export function useEmailTemplates() {
  return useQuery({ queryKey: K.templates, queryFn: () => unwrap(api.GET('/api/v1/owner/email-templates')) });
}

export function useSaveTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ key, body }: { key: string; body: EmailTemplateIn }) =>
      unwrap(api.PUT('/api/v1/owner/email-templates/{key}', { params: { path: { key } }, body })),
    onSuccess: () => {
      toast.success('Template saved.');
      void qc.invalidateQueries({ queryKey: K.templates });
    },
    onError,
  });
}

export function previewTemplate(key: string, body: EmailTemplateIn) {
  return unwrap(api.POST('/api/v1/owner/email-templates/{key}/preview', { params: { path: { key } }, body }));
}

// ---- retirement catalog -----------------------------------------------------------------------
export function useRetirementsAdmin() {
  return useQuery({ queryKey: K.retirements, queryFn: () => unwrap(api.GET('/api/v1/owner/retirements')) });
}

export function useSaveRetirement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id?: string; body: RetirementIn }) =>
      id
        ? unwrap(api.PUT('/api/v1/owner/retirements/{entry_id}', { params: { path: { entry_id: id } }, body }))
        : unwrap(api.POST('/api/v1/owner/retirements', { body })),
    onSuccess: () => {
      toast.success('Catalog entry saved.');
      void qc.invalidateQueries({ queryKey: K.retirements });
    },
    onError,
  });
}

export function useDeleteRetirement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(api.DELETE('/api/v1/owner/retirements/{entry_id}', { params: { path: { entry_id: id } } })),
    onSuccess: () => void qc.invalidateQueries({ queryKey: K.retirements }),
    onError,
  });
}

// ---- read-only org view -----------------------------------------------------------------------
export function requestViewAs(orgId: string) {
  return unwrap(api.POST('/api/v1/owner/orgs/{org_id}/view', { params: { path: { org_id: orgId } } }));
}
