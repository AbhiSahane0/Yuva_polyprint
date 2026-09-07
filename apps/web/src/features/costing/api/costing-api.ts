import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AppSettings,
  CostingMasterData,
  Labour,
  LabourInput,
  Machine,
  MachineInput,
  UpdateLabourInput,
  UpdateMachineInput,
} from '@yuva/shared';
import { request } from '@/lib/api-client';

export const costingKeys = {
  all: ['costing'] as const,
  master: (includeRetired: boolean) => [...costingKeys.all, 'master', includeRetired] as const,
};

/**
 * The machines and wages every quoted rate rests on.
 *
 * Held for five minutes, like the settings it is used beside: a wage does not
 * change while a quotation is being written, and refetching it on every
 * keystroke of the wizard would be a request per character.
 */
export function useCostingMasterData(includeRetired = false) {
  return useQuery({
    queryKey: costingKeys.master(includeRetired),
    queryFn: () =>
      request<CostingMasterData>({
        url: '/costing',
        method: 'GET',
        params: includeRetired ? { includeRetired: 'true' } : {},
      }),
    staleTime: 5 * 60_000,
  });
}

function useInvalidate() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: costingKeys.all });
    /* The wizard prices against these, so its costing must be recomputed. */
    void queryClient.invalidateQueries({ queryKey: ['settings'] });
  };
}

export function useSaveMachine() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, ...input }: MachineInput & { id?: string }) =>
      id
        ? request<Machine>({ url: `/costing/machines/${id}`, method: 'PATCH', data: input })
        : request<Machine>({ url: '/costing/machines', method: 'POST', data: input }),
    onSuccess: invalidate,
  });
}

export function useRetireMachine() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) =>
      request<Machine>({ url: `/costing/machines/${id}/retire`, method: 'POST' }),
    onSuccess: invalidate,
  });
}

export function useSaveLabour() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, ...input }: LabourInput & { id?: string }) =>
      id
        ? request<Labour>({ url: `/costing/labour/${id}`, method: 'PATCH', data: input })
        : request<Labour>({ url: '/costing/labour', method: 'POST', data: input }),
    onSuccess: invalidate,
  });
}

export function useRetireLabour() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) =>
      request<Labour>({ url: `/costing/labour/${id}/retire`, method: 'POST' }),
    onSuccess: invalidate,
  });
}

export function useUpdateSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Partial<AppSettings>) =>
      request<AppSettings>({ url: '/settings', method: 'PATCH', data: input }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['settings'] }),
  });
}

export type { UpdateLabourInput, UpdateMachineInput };
