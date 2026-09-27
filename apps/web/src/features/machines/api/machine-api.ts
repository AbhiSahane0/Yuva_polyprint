import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  EndMaintenanceInput,
  MachineBoard,
  MachineBoardQuery,
  MaintenanceRecord,
  StartMaintenanceInput,
} from '@yuva/shared';
import { request } from '@/lib/api-client';
import { settle } from '@/lib/query';

export const machineKeys = {
  all: ['machines'] as const,
  board: (params: Partial<MachineBoardQuery>) => [...machineKeys.all, 'board', params] as const,
  history: (id: string) => [...machineKeys.all, 'history', id] as const,
};

/**
 * The board refetches on a timer as well as on every write.
 *
 * Somebody leaves this open on a screen in the office to see the floor, and a
 * machine that went down at eleven should appear without anybody reloading. A
 * minute is plenty — the floor works in reels.
 */
export function useMachineBoard(params: Partial<MachineBoardQuery> = {}) {
  return useQuery({
    queryKey: machineKeys.board(params),
    queryFn: () => request<MachineBoard>({ url: '/machines', method: 'GET', params }),
    refetchInterval: 60_000,
  });
}

export function useMachineHistory(machineId: string | null) {
  return useQuery({
    queryKey: machineKeys.history(machineId ?? ''),
    queryFn: () =>
      request<MaintenanceRecord[]>({ url: `/machines/${machineId}/history`, method: 'GET' }),
    enabled: Boolean(machineId),
  });
}

/**
 * Putting a machine down takes it off the floor's picker and warns Planning,
 * so both are refetched with it.
 */
const touched = [machineKeys.all, ['floor'], ['planning']];

export function useStartMaintenance() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: StartMaintenanceInput) =>
      request<MaintenanceRecord>({ url: '/machines/maintenance', method: 'POST', data: input }),
    onSuccess: () => settle(queryClient, ...touched),
  });
}

export function useEndMaintenance() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: EndMaintenanceInput }) =>
      request<MaintenanceRecord>({
        url: `/machines/maintenance/${id}/end`,
        method: 'POST',
        data: input,
      }),
    onSuccess: () => settle(queryClient, ...touched),
  });
}
