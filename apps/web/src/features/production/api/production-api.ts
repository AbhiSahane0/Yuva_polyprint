import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AddProductionStageInput,
  CreateProductionOrderInput,
  ListProductionQuery,
  ProductionOrder,
  UpdateProductionOrderInput,
  UpdateProductionStageInput,
} from '@yuva/shared';
import { request } from '@/lib/api-client';
import { settle } from '@/lib/query';
import { orderKeys } from '@/features/orders/api/order-api';

export const productionKeys = {
  all: ['production'] as const,
  lists: () => [...productionKeys.all, 'list'] as const,
  list: (params: Partial<ListProductionQuery>) => [...productionKeys.lists(), params] as const,
  detail: (id: string) => [...productionKeys.all, 'detail', id] as const,
};

interface ProductionPage {
  items: ProductionOrder[];
  total: number;
  page: number;
  pageSize: number;
}

export function useProductionOrders(params: Partial<ListProductionQuery>) {
  return useQuery({
    queryKey: productionKeys.list(params),
    queryFn: () =>
      request<ProductionPage>({
        url: '/production',
        method: 'GET',
        params: Object.fromEntries(
          Object.entries(params).filter(([, value]) => value !== undefined && value !== ''),
        ),
      }),
  });
}

export function useProductionOrder(id: string | null) {
  return useQuery({
    queryKey: productionKeys.detail(id ?? ''),
    queryFn: () => request<ProductionOrder>({ url: `/production/${id}`, method: 'GET' }),
    enabled: Boolean(id),
  });
}

/*
 * Every one of these settles the ORDERS cache too.
 *
 * Starting a job card moves its order to in-production, on the server, inside
 * the same transaction. A screen showing that order as still confirmed a moment
 * later would be the system disagreeing with itself in the one place this
 * module exists to stop it.
 */
function useCardMutation<TArgs>(run: (args: TArgs) => Promise<ProductionOrder>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: run,
    onSuccess: (card) => {
      queryClient.setQueryData(productionKeys.detail(card.id), card);
      return settle(queryClient, productionKeys.lists(), orderKeys.all);
    },
  });
}

export function useCreateProduction() {
  return useCardMutation((input: CreateProductionOrderInput) =>
    request<ProductionOrder>({ url: '/production', method: 'POST', data: input }),
  );
}

export function useUpdateProduction() {
  return useCardMutation(({ id, input }: { id: string; input: UpdateProductionOrderInput }) =>
    request<ProductionOrder>({ url: `/production/${id}`, method: 'PATCH', data: input }),
  );
}

/** The one the floor uses: a single stage, as it happens. */
export function useUpdateStage() {
  return useCardMutation(
    ({ stageId, input }: { stageId: string; input: UpdateProductionStageInput }) =>
      request<ProductionOrder>({
        url: `/production/stages/${stageId}`,
        method: 'PATCH',
        data: input,
      }),
  );
}

export function useAddStage() {
  return useCardMutation(({ id, input }: { id: string; input: AddProductionStageInput }) =>
    request<ProductionOrder>({ url: `/production/${id}/stages`, method: 'POST', data: input }),
  );
}

export function useDeleteProduction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      request<{ id: string }>({ url: `/production/${id}`, method: 'DELETE' }),
    onSuccess: () => settle(queryClient, productionKeys.all, orderKeys.all),
  });
}
