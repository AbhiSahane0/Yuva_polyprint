import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateMaterialInput,
  Material,
  MaterialRateHistoryEntry,
  RatesSaveResult,
  SaveRatesInput,
  UpdateMaterialInput,
} from '@yuva/shared';
import { request } from '@/lib/api-client';

export const materialKeys = {
  all: ['materials'] as const,
  list: (onDate?: string) => [...materialKeys.all, 'list', onDate ?? 'today'] as const,
  history: (id: string) => [...materialKeys.all, 'history', id] as const,
};

/** Materials with the rate in force on `onDate` and the one before it. */
export function useMaterials(onDate?: string) {
  return useQuery({
    queryKey: materialKeys.list(onDate),
    queryFn: () =>
      request<Material[]>({
        url: '/materials',
        method: 'GET',
        ...(onDate ? { params: { onDate } } : {}),
      }),
  });
}

export function useRateHistory(id: string | null) {
  return useQuery({
    queryKey: materialKeys.history(id ?? ''),
    queryFn: () =>
      request<MaterialRateHistoryEntry[]>({ url: `/materials/${id}/history`, method: 'GET' }),
    enabled: Boolean(id),
  });
}

export function useSaveRates() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SaveRatesInput) =>
      request<RatesSaveResult>({ url: '/materials/rates', method: 'PUT', data: input }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: materialKeys.all });
      // Quotation costing reads these rates, so its figures are now stale.
      queryClient.invalidateQueries({ queryKey: ['quotations'] });
    },
  });
}

export function useCreateMaterial() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateMaterialInput) =>
      request<Material>({ url: '/materials', method: 'POST', data: input }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: materialKeys.all }),
  });
}

/**
 * Removes a material the works never used.
 *
 * Refused by the server the moment it is on a quotation, a stock batch or a
 * purchase line — those have to stay able to say what they were priced on, and
 * taking it off the price list is what that case wants instead.
 */
export function useDeleteMaterial() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      request<{ id: string }>({ url: `/materials/${id}`, method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: materialKeys.all }),
  });
}

export function useUpdateMaterial() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateMaterialInput }) =>
      request<Material>({ url: `/materials/${id}`, method: 'PATCH', data: input }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: materialKeys.all }),
  });
}
