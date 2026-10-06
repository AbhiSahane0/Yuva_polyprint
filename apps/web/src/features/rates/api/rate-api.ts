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
import { settle } from '@/lib/query';
import { inventoryKeys } from '@/features/inventory/api/inventory-api';

export const materialKeys = {
  all: ['materials'] as const,
  list: (onDate?: string) => [...materialKeys.all, 'list', onDate ?? 'today'] as const,
  history: (id: string) => [...materialKeys.all, 'history', id] as const,
};

/** Materials with the rate in force on `onDate` and the one before it. */
/**
 * The materials list, as at a date.
 *
 * `includeInactive` is for the screens that have to render something already
 * written against a retired material — a quotation whose third ply names a
 * film the works has since stopped stocking. Leaving it out of the list does
 * not leave the ply alone: the form resolves a ply through the list, so the
 * selection reads as empty and saving would write the blank back.
 */
export function useMaterials(onDate?: string, includeInactive = false) {
  return useQuery({
    queryKey: [...materialKeys.list(onDate), includeInactive ? 'all' : 'active'],
    queryFn: () =>
      request<Material[]>({
        url: '/materials',
        method: 'GET',
        params: {
          ...(onDate ? { onDate } : {}),
          ...(includeInactive ? { includeInactive: 'true' } : {}),
        },
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
    /* Awaited, so the list already holds the new rate when the drafts clear
       and the toast fires — see `settle`. Without it the box you typed 200
       into falls back to 185 for a round trip. */
    onSuccess: () =>
      // Quotation costing reads these rates, so its figures are now stale.
      settle(queryClient, materialKeys.all, ['quotations']),
  });
}

export function useCreateMaterial() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateMaterialInput) =>
      request<Material>({ url: '/materials', method: 'POST', data: input }),
    onSuccess: () => settle(queryClient, materialKeys.all),
  });
}

/**
 * Removes a material the works never used.
 *
 * Refused by the server the moment it is on a quotation or a purchase line —
 * those have to stay able to say what they were priced on, and taking it off
 * the price list is what that case wants instead.
 *
 * `discardStock` is what the Inventory screen sends, because that is the
 * screen showing how much stock goes with it. Without it a material holding
 * stock is refused and says so; a caller cannot wipe a ledger by accident.
 *
 * Stock is invalidated as well as the price list: a material that goes takes
 * its batches with it, and the Inventory screen is looking at those.
 */
export function useDeleteMaterial() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, discardStock = false }: { id: string; discardStock?: boolean }) =>
      request<{ id: string }>({
        url: `/materials/${id}`,
        method: 'DELETE',
        ...(discardStock ? { params: { discardStock: 'true' } } : {}),
      }),
    onSuccess: () => settle(queryClient, materialKeys.all, inventoryKeys.all),
  });
}

export function useUpdateMaterial() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateMaterialInput }) =>
      request<Material>({ url: `/materials/${id}`, method: 'PATCH', data: input }),
    onSuccess: () => settle(queryClient, materialKeys.all),
  });
}
