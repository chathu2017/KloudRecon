import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, errorMessage, unwrap, type Schemas } from '@/lib/api/client';

export type DiagramView = Schemas['DiagramView'];
export type DiagramGraph = Schemas['DiagramGraph'];
export type DiagramNode = Schemas['DiagramNode'];
export type DiagramGroup = Schemas['DiagramGroup'];
export type DiagramEdge = Schemas['DiagramEdge'];
export type DiagramOverlays = Schemas['DiagramOverlays'];
export type AttackPathInfo = Schemas['AttackPathInfo'];
export type Annotation = Schemas['AnnotationOut'];
export type AnnotationIn = Schemas['AnnotationIn'];
export type TimelineItem = Schemas['TimelineItem'];
export type ViewName = AnnotationIn['view'];

export const VIEWS: { key: ViewName; label: string; short: string }[] = [
  { key: 'network', label: 'Network topology', short: 'Network' },
  { key: 'hub_spoke', label: 'Hub and spoke', short: 'Hub & spoke' },
  { key: 'resource_group', label: 'Resource groups', short: 'Resource groups' },
  { key: 'application', label: 'Applications', short: 'Applications' },
  { key: 'data_flow', label: 'Data flow', short: 'Data flow' },
  { key: 'region', label: 'Regions', short: 'Regions' },
  { key: 'hierarchy', label: 'Management groups', short: 'Hierarchy' },
  { key: 'draw', label: 'KloudRecon Draw', short: 'KloudRecon Draw' },
];

export function useDiagram(view: ViewName, scanId: string | undefined, tag: string, enabled = true) {
  return useQuery({
    enabled,
    queryKey: ['diagrams', view, scanId ?? '', view === 'application' ? tag : ''],
    queryFn: () =>
      unwrap(
        api.GET('/api/v1/diagrams/{view}', {
          params: {
            path: { view },
            query: { ...(scanId ? { scan_id: scanId } : {}), ...(view === 'application' ? { tag } : {}) },
          },
        }),
      ),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });
}

export function useTimeline() {
  return useQuery({
    queryKey: ['diagrams', 'timeline'],
    queryFn: () => unwrap(api.GET('/api/v1/diagrams/timeline')),
    staleTime: 60_000,
  });
}

export function useAnnotations(view: ViewName) {
  return useQuery({
    queryKey: ['diagrams', 'annotations', view],
    queryFn: () => unwrap(api.GET('/api/v1/diagrams/annotations', { params: { query: { view } } })),
  });
}

export function useSaveAnnotation(view: ViewName) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id?: string; body: AnnotationIn }) =>
      id
        ? unwrap(api.PUT('/api/v1/diagrams/annotations/{annotation_id}', { params: { path: { annotation_id: id } }, body }))
        : unwrap(api.POST('/api/v1/diagrams/annotations', { body })),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['diagrams', 'annotations', view] }),
    onError: (e) => toast.error(errorMessage(e)),
  });
}

export function useDeleteAnnotation(view: ViewName) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(api.DELETE('/api/v1/diagrams/annotations/{annotation_id}', { params: { path: { annotation_id: id } } })),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['diagrams', 'annotations', view] }),
    onError: (e) => toast.error(errorMessage(e)),
  });
}

export type ArchitectureDocument = Schemas['ArchitectureDocument'];
export type DocSection = Schemas['DocSection'];
export type VnetPlan = Schemas['VnetPlan'];
export type ComponentTable = Schemas['ComponentTable'];

export function useArchitectureDocument(scanId: string | undefined) {
  return useQuery({
    queryKey: ['diagrams', 'document', scanId ?? ''],
    queryFn: () => unwrap(api.GET('/api/v1/diagrams/document', { params: { query: scanId ? { scan_id: scanId } : {} } })),
    staleTime: 60_000,
  });
}
