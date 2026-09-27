import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  FinishFloorJobInput,
  FloorBoard,
  FloorMachine,
  HoldFloorJobInput,
  ResumeFloorJobInput,
  StartFloorJobInput,
} from '@yuva/shared';
import { request } from '@/lib/api-client';
import { settle } from '@/lib/query';

export const floorKeys = {
  all: ['floor'] as const,
  machines: () => [...floorKeys.all, 'machines'] as const,
  board: (machineId: string) => [...floorKeys.all, 'board', machineId] as const,
};

export function useFloorMachines() {
  return useQuery({
    queryKey: floorKeys.machines(),
    queryFn: () => request<FloorMachine[]>({ url: '/floor/machines', method: 'GET' }),
  });
}

/**
 * Everything one tablet shows, in one call.
 *
 * Refetched on an interval as well as on every write: the screen is bolted to
 * a machine and nobody is going to reload it, so a job the office adds or
 * reassigns has to arrive on its own. A minute is often enough — the floor
 * works in reels, not seconds — and it keeps a tablet left on overnight from
 * hammering the server.
 */
export function useFloorBoard(machineId: string | null) {
  return useQuery({
    queryKey: floorKeys.board(machineId ?? ''),
    queryFn: () => request<FloorBoard>({ url: '/floor', method: 'GET', params: { machineId } }),
    enabled: Boolean(machineId),
    refetchInterval: 60_000,
  });
}

/** Every write answers with the whole board, so the screen never goes stale. */
function useFloorAction<T>(path: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ stageId, machineId, input }: { stageId: string; machineId: string; input: T }) =>
      request<FloorBoard>({
        url: `/floor/${stageId}/${path}`,
        method: 'POST',
        params: { machineId },
        data: input,
      }),
    onSuccess: (board, variables) => {
      queryClient.setQueryData(floorKeys.board(variables.machineId), board);
      /* The office is watching the same job from the other side of the wall. */
      return settle(queryClient, floorKeys.machines(), ['production'], ['planning']);
    },
  });
}

export const useStartJob = () => useFloorAction<StartFloorJobInput>('start');
export const useFinishJob = () => useFloorAction<FinishFloorJobInput>('finish');
export const useHoldJob = () => useFloorAction<HoldFloorJobInput>('hold');
export const useResumeJob = () => useFloorAction<ResumeFloorJobInput>('resume');
