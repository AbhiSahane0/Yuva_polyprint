import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  Cylinder,
  CylinderEvent,
  CylinderStatus,
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
