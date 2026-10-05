import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AddProductionStageInput,
  CreateProductionOrderInput,
  ListProductionQuery,
  OverrideMaterialsInput,
  ProductionOrder,
  ProductionStageRow,
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

/*
 * Every stage edit shares this key, so each one can see whether it is the last
 * still in flight. A floor hand changing machine, operator and weight in three
 * seconds should cause one refresh, not three.
 */
const STAGE_MUTATION = ['production', 'stage'] as const;

/**
 * Every stage edit takes a number as it leaves, and they only go up.
 *
 * `isMutating` says how many are still in the air; it cannot say which was
 * asked last. That matters because the answers do not have to come back in the
 * order they were asked, and only the newest request's answer describes the
 * card as it now stands.
 */
let issued = 0;

/** Replaces one stage inside a cached card, leaving everything else alone. */
function withStage(
  card: ProductionOrder,
  stageId: string,
  patch: Partial<ProductionStageRow>,
): ProductionOrder {
  return {
    ...card,
    stages: card.stages.map((stage) => {
      if (stage.id !== stageId) return stage;
      const next = { ...stage, ...patch };
      /* Waste is derived on the server and derived here, the same way, so the
         figure beside the two weights moves with them instead of lagging a
         round trip behind. */
      return { ...next, wasteKg: Math.round((next.inputKg - next.outputKg) * 1000) / 1000 };
    }),
  };
}

/**
 * **The one the floor uses: a single stage, as it happens.**
 *
 * Two kinds of edit go through here and they want opposite things.
 *
 * **A field** — the machine, who ran it, a weight — is the value somebody
 * typed, stored verbatim. The screen shows it the moment it is picked and the
 * request goes behind it. If the save fails the field goes back to what it was
 * and says so. Nothing outside the card changes, so nothing outside the card
 * is refetched.
 *
 * **A flow step** — starting, finishing, skipping — is not a field. The server
 * may refuse it outright (a stage cannot start on film the works has not got),
 * starting one starts the card and the order with it, and finishing one hands
 * the reel and its weight to the next machine. None of that can be guessed at
 * on the client, so these wait for the answer and then settle the screens the
 * change reaches.
 *
 * Before this, both paths waited: the select was bound to server state, so
 * picking a machine put the old one back for as long as the round trip and the
 * three refetches behind it took, and then snapped to the new one. On a works
 * network that was seconds of a field appearing to reject what it was told.
 */
export function useUpdateStage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: STAGE_MUTATION,
    mutationFn: ({
      stageId,
      input,
    }: {
      cardId: string;
      stageId: string;
      input: UpdateProductionStageInput;
      /** What to show at once. Absent on a flow step, which waits instead. */
      optimistic?: Partial<ProductionStageRow>;
    }) =>
      request<ProductionOrder>({
        url: `/production/stages/${stageId}`,
        method: 'PATCH',
        data: input,
      }),

    async onMutate({ cardId, stageId, optimistic }) {
      const seq = ++issued;
      if (!optimistic) return { previous: undefined, cardId, seq };
      /* A refetch already in the air would land on top of the value we are
         about to write, and put the old one back. */
      await queryClient.cancelQueries({ queryKey: productionKeys.detail(cardId) });
      const previous = queryClient.getQueryData<ProductionOrder>(productionKeys.detail(cardId));
      if (previous) {
        queryClient.setQueryData(
          productionKeys.detail(cardId),
          withStage(previous, stageId, optimistic),
        );
      }
      return { previous, cardId, seq };
    },

    onError(_error, _variables, context) {
      /* Put back exactly what was there. The caller raises the toast. */
      if (context?.previous) {
        queryClient.setQueryData(productionKeys.detail(context.cardId), context.previous);
      }
    },

    onSettled(card, _error, variables, context) {
      /*
       * Only the last edit standing speaks for the card.
       *
       * Two fields changed a second apart are two requests, and nothing makes
       * the answers come back in the order they were asked. An earlier reply
       * written over a later one quietly undoes what is on screen — the
       * operator you just picked emptying itself a beat after it stuck.
       *
       * Three cases, and the second is the one worth stating:
       *
       *  - Others still in flight: say nothing, and let whoever settles last
       *    speak for the card.
       *  - Last to settle, but not the last to have been ASKED: a newer
       *    request exists and has already settled quietly, so nobody has
       *    written the truth and this reply is too old to. Ask once, in the
       *    background. What is on screen is already right.
       *  - Last to settle and last asked: this reply describes the card as it
       *    now stands, and is taken as it is. The common case, and free.
       */
      const stillGoing = queryClient.isMutating({ mutationKey: STAGE_MUTATION });
      if (stillGoing > 1) return undefined;

      if (context && context.seq !== issued) {
        void settle(queryClient, productionKeys.detail(context.cardId));
      } else if (card) {
        queryClient.setQueryData(productionKeys.detail(card.id), card);
      }

      if (variables.optimistic) {
        /*
         * In the background, on purpose. The card is already right; the board
         * and the order list behind it can catch up in their own time, and
         * making the floor wait for them is what this change exists to stop.
         */
        void settle(queryClient, productionKeys.lists());
        return undefined;
      }

      /* A flow step moves the order and can move stock, so the screens that
         show either are brought up to date before this settles. */
      return settle(queryClient, productionKeys.lists(), orderKeys.all, inventoryKeys.all);
    },
  });
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
