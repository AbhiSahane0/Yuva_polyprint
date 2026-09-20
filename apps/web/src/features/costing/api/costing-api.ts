import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AppSettings,
  CostingInput,
  CostingMasterData,
  CostingOverhead,
  CostingOverheadInput,
  UpdateCostingOverheadInput,
  Labour,
  LabourInput,
  Machine,
  MachineInput,
  UpdateLabourInput,
  UpdateMachineInput,
} from '@yuva/shared';
import { apiClient, request } from '@/lib/api-client';
import { saveBlob } from '@/lib/download';

export const costingKeys = {
  all: ['costing'] as const,
  master: (includeRetired: boolean, onDate?: string) =>
    [...costingKeys.all, 'master', includeRetired, onDate ?? 'today'] as const,
};

/**
 * The machines and wages every quoted rate rests on.
 *
 * Held for five minutes, like the settings it is used beside: a wage does not
 * change while a quotation is being written, and refetching it on every
 * keystroke of the wizard would be a request per character.
 */
export function useCostingMasterData(includeRetired = false, onDate?: string) {
  return useQuery({
    queryKey: costingKeys.master(includeRetired, onDate),
    queryFn: () =>
      request<CostingMasterData>({
        url: '/costing',
        method: 'GET',
        params: {
          ...(includeRetired ? { includeRetired: 'true' } : {}),
          /* Only the works' own overheads are dated; the machines and wages
             come back the same whatever day is asked for. */
          ...(onDate ? { onDate } : {}),
        },
      }),
    staleTime: 5 * 60_000,
  });
}

/* --- the works' own overheads ------------------------------------------- */

function useOverheadMutation<TArgs>(run: (args: TArgs) => Promise<CostingOverhead>) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: run,
    /* Every costing on screen rests on these, so the whole tree is refreshed
       rather than one key — a stale rate is worse than a second request. */
    onSuccess: () => client.invalidateQueries({ queryKey: costingKeys.all }),
  });
}

export function useCreateOverhead() {
  return useOverheadMutation((input: CostingOverheadInput) =>
    request<CostingOverhead>({ url: '/costing/overheads', method: 'POST', data: input }),
  );
}

export function useUpdateOverhead() {
  return useOverheadMutation(({ id, input }: { id: string; input: UpdateCostingOverheadInput }) =>
    request<CostingOverhead>({ url: `/costing/overheads/${id}`, method: 'PATCH', data: input }),
  );
}

/** Ends it from today. The row stays, so what it priced stays explicable. */
export function useEndOverhead() {
  return useOverheadMutation((id: string) =>
    request<CostingOverhead>({ url: `/costing/overheads/${id}/end`, method: 'POST' }),
  );
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

/**
 * Downloads the costing as a spreadsheet, laid out like the works' own sheet.
 *
 * Goes through the API rather than being built in the browser: the layout is
 * long, the office wants live formulas in it, and a workbook writer in the
 * page bundle would be shipped to every screen that never asks for one.
 */
export async function downloadCostingWorkbook(input: {
  quotationNumber?: number | null;
  customerName: string;
  jobName: string;
  costing: CostingInput;
}): Promise<void> {
  const response = await apiClient.post('/costing/workbook', input, { responseType: 'blob' });
  const name = `Costing ${input.jobName || 'quotation'}`.replace(/[^\w -]+/g, '').slice(0, 60);
  saveBlob(response.data as Blob, `${name}.xlsx`);
}
