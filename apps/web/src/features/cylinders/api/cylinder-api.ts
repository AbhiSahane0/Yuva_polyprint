import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  Cylinder,
  CylinderEvent,
  CylinderStatus,
  DesignDeleted,
  DesignDeletion,
  DesignDetail,
  DesignList,
  DesignSummary,
  RecordCylinderEventInput,
  RegisterCylindersInput,
  UpdateCylinderInput,
} from '@yuva/shared';
import { request } from '@/lib/api-client';

export interface DesignListParams {
  q?: string;
  status?: CylinderStatus;
  customerId?: string;
  attentionOnly?: boolean;
}

export const cylinderKeys = {
  all: ['cylinders'] as const,
  list: (params: DesignListParams) => [...cylinderKeys.all, 'list', params] as const,
  design: (id: string) => [...cylinderKeys.all, 'design', id] as const,
  deletion: (id: string) => [...cylinderKeys.all, 'deletion', id] as const,
  unregistered: () => [...cylinderKeys.all, 'unregistered'] as const,
};

export function useDesigns(params: DesignListParams) {
  return useQuery({
    queryKey: cylinderKeys.list(params),
    queryFn: () => request<DesignList>({ url: '/cylinders', method: 'GET', params }),
    placeholderData: keepPreviousData,
  });
}

export function useDesign(jobId: string | null) {
  return useQuery({
    queryKey: cylinderKeys.design(jobId ?? ''),
    queryFn: () => request<DesignDetail>({ url: `/cylinders/${jobId}`, method: 'GET' }),
    enabled: Boolean(jobId),
  });
}

/** Designs the job says need cylinders, with none registered yet. */
export function useUnregisteredDesigns(enabled: boolean) {
  return useQuery({
    queryKey: cylinderKeys.unregistered(),
    queryFn: () => request<DesignSummary[]>({ url: '/cylinders/unregistered', method: 'GET' }),
    enabled,
  });
}

function useInvalidate() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: cylinderKeys.all });
}

export function useRegisterCylinders() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: RegisterCylindersInput) =>
      request<DesignDetail>({ url: '/cylinders', method: 'POST', data: input }),
    onSuccess: invalidate,
  });
}

export function useRecordCylinderEvent() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: RecordCylinderEventInput) =>
      request<CylinderEvent[]>({ url: '/cylinders/events', method: 'POST', data: input }),
    onSuccess: invalidate,
  });
}

export function useUpdateCylinder(id: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: UpdateCylinderInput) =>
      request<Cylinder>({ url: `/cylinders/${id}`, method: 'PATCH', data: input }),
    onSuccess: invalidate,
  });
}

/**
 * What deleting this design would destroy.
 *
 * Fetched when the dialog opens rather than with the design: it counts across
 * three other tables, and every page view would pay for a question almost
 * nobody asks. Never cached — a quotation raised in another tab changes the
 * answer, and a stale one here is a stale one on the only screen that matters.
 */
export function useDesignDeletion(jobId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: cylinderKeys.deletion(jobId ?? ''),
    queryFn: () => request<DesignDeletion>({ url: `/cylinders/${jobId}/deletion`, method: 'GET' }),
    enabled: enabled && Boolean(jobId),
    staleTime: 0,
    gcTime: 0,
  });
}

export function useDeleteDesign() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (jobId: string) =>
      request<DesignDeleted>({ url: `/cylinders/${jobId}`, method: 'DELETE' }),
    onSuccess: () => {
      /*
       * The artwork cache too: its files went with the design, and a stale
       * entry would show a panel for a design that is no longer there.
       */
      void queryClient.invalidateQueries({ queryKey: cylinderKeys.all });
      void queryClient.invalidateQueries({ queryKey: ['artwork'] });
    },
  });
}
