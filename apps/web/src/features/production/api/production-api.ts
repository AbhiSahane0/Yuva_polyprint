import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AddProductionStageInput,
  CreateProductionOrderInput,
  ListProductionQuery,
  OverrideMaterialsInput,
  ProductionOrder,
  UpdateProductionOrderInput,
  UpdateProductionStageInput,
} from '@yuva/shared';
import { request } from '@/lib/api-client';
import { settle } from '@/lib/query';
import { orderKeys } from '@/features/orders/api/order-api';
import { inventoryKeys } from '@/features/inventory/api/inventory-api';

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
      /*
       * Inventory too: raising or re-quantifying a card changes what the works
       * has FREE, which is the figure the stock screens lead on. No batch has
       * moved and no movement has been written — a claim is not an issue — but
       * a stock screen open in another tab would go on showing film as free
       * that this card has just taken a claim on.
       */
      return settle(queryClient, productionKeys.lists(), orderKeys.all, inventoryKeys.all);
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

/**
 * Lets a card run on film the works has not got, with a reason on the record.
 *
 * Sending a blank reason clears it, which puts the block back — so this is the
 * one control for both, and there is nothing else to find.
 */
export function useOverrideMaterials() {
  return useCardMutation(({ id, input }: { id: string; input: OverrideMaterialsInput }) =>
    request<ProductionOrder>({ url: `/production/${id}/override`, method: 'POST', data: input }),
  );
}

export function useDeleteProduction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      request<{ id: string }>({ url: `/production/${id}`, method: 'DELETE' }),
    /* The card's claims go with it — the row cascades — so free stock moves. */
    onSuccess: () => settle(queryClient, productionKeys.all, orderKeys.all, inventoryKeys.all),
  });
}
