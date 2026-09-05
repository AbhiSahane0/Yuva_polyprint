import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AdjustStockInput,
  IssueStockInput,
  MaterialCategory,
  MaterialStock,
  ReceiveStockInput,
  SetReorderLevelInput,
  StockBatch,
  StockList,
  StockMovement,
  TransferStockInput,
} from '@yuva/shared';
import { request } from '@/lib/api-client';

export interface StockListParams {
  q?: string;
  category?: MaterialCategory;
  lowOnly?: boolean;
}

export const inventoryKeys = {
  all: ['inventory'] as const,
  lists: () => [...inventoryKeys.all, 'list'] as const,
  list: (params: StockListParams) => [...inventoryKeys.lists(), params] as const,
  detail: (id: string) => [...inventoryKeys.all, 'detail', id] as const,
};

export function useStock(params: StockListParams) {
  return useQuery({
    queryKey: inventoryKeys.list(params),
    queryFn: () => request<StockList>({ url: '/inventory', method: 'GET', params }),
    placeholderData: keepPreviousData,
  });
}

export function useMaterialStock(id: string | null) {
  return useQuery({
    queryKey: inventoryKeys.detail(id ?? ''),
    queryFn: () => request<MaterialStock>({ url: `/inventory/${id}`, method: 'GET' }),
    enabled: Boolean(id),
  });
}

/**
 * Every write invalidates both the list and the detail.
 *
 * A movement changes the material's quantity, its value, its health and the
 * totals across the top — there is no useful partial update, and a stale figure
 * on a stock screen is the one thing this module must not show.
 */
function useStockMutation<TInput, TResult>(url: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: TInput) => request<TResult>({ url, method: 'POST', data: input }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: inventoryKeys.all }),
  });
}

export const useReceiveStock = () =>
  useStockMutation<ReceiveStockInput, StockBatch>('/inventory/receive');
export const useIssueStock = () =>
  useStockMutation<IssueStockInput, StockMovement>('/inventory/issue');
export const useAdjustStock = () =>
  useStockMutation<AdjustStockInput, StockMovement>('/inventory/adjust');
export const useTransferStock = () =>
  useStockMutation<TransferStockInput, StockMovement>('/inventory/transfer');

export function useSetReorderLevel(materialId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SetReorderLevelInput) =>
      request({ url: `/inventory/${materialId}/reorder-level`, method: 'PATCH', data: input }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: inventoryKeys.all }),
  });
}
