import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CancelDispatchInput,
  CreateDispatchInput,
  Dispatch,
  DispatchList,
  ListDispatchesQuery,
  PostDispatchInput,
  ReadyToSend,
  ReadyToSendQuery,
  UpdateDispatchInput,
} from '@yuva/shared';
import { orderKeys } from '@/features/orders/api/order-api';
import { request } from '@/lib/api-client';
import { settle } from '@/lib/query';

export const dispatchKeys = {
  all: ['dispatches'] as const,
  lists: () => [...dispatchKeys.all, 'list'] as const,
  list: (params: Partial<ListDispatchesQuery>) => [...dispatchKeys.lists(), params] as const,
  detail: (id: string) => [...dispatchKeys.all, 'detail', id] as const,
  ready: (params: Partial<ReadyToSendQuery>) => [...dispatchKeys.all, 'ready', params] as const,
};

/**
 * Sending or un-sending a note changes an order's status and empties the godown
 * queue, so both are refetched with it.
 *
 * The production list is left alone deliberately: a delivery does not move a job
 * card. The card was finished before the lorry was loaded, and nothing dispatch
 * does can change what a run made.
 */
const touched = [dispatchKeys.all, orderKeys.all];

const clean = (params: Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== ''),
  );

export function useDispatches(params: Partial<ListDispatchesQuery>) {
  return useQuery({
    queryKey: dispatchKeys.list(params),
    queryFn: () =>
      request<DispatchList>({ url: '/dispatches', method: 'GET', params: clean(params) }),
  });
}

export function useDispatch(id: string | null) {
  return useQuery({
    queryKey: dispatchKeys.detail(id ?? ''),
    queryFn: () => request<Dispatch>({ url: `/dispatches/${id}`, method: 'GET' }),
    enabled: Boolean(id),
  });
}

export function useNextDispatchNumber() {
  return useQuery({
    queryKey: [...dispatchKeys.all, 'next-number'],
    queryFn: () => request<{ number: number }>({ url: '/dispatches/next-number', method: 'GET' }),
  });
}

/** The godown queue: made, not yet gone. Every figure worked out by the server. */
export function useReadyToSend(params: Partial<ReadyToSendQuery> = {}) {
  return useQuery({
    queryKey: dispatchKeys.ready(params),
    queryFn: () =>
      request<ReadyToSend[]>({ url: '/dispatches/ready', method: 'GET', params: clean(params) }),
  });
}

export function useCreateDispatch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateDispatchInput) =>
      request<Dispatch>({ url: '/dispatches', method: 'POST', data: input }),
    onSuccess: () => settle(queryClient, dispatchKeys.all),
  });
}

export function useUpdateDispatch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateDispatchInput }) =>
      request<Dispatch>({ url: `/dispatches/${id}`, method: 'PATCH', data: input }),
    onSuccess: (note) => {
      queryClient.setQueryData(dispatchKeys.detail(note.id), note);
      return settle(queryClient, dispatchKeys.lists());
    },
  });
}

/** Sends it. This is what completes a customer's order. */
export function usePostDispatch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: PostDispatchInput }) =>
      request<Dispatch>({ url: `/dispatches/${id}/dispatch`, method: 'POST', data: input }),
    onSuccess: (note) => {
      queryClient.setQueryData(dispatchKeys.detail(note.id), note);
      return settle(queryClient, ...touched);
    },
  });
}

/** Including a lorry that went and came back, which gives the order back. */
export function useCancelDispatch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: CancelDispatchInput }) =>
      request<Dispatch>({ url: `/dispatches/${id}/cancel`, method: 'POST', data: input }),
    onSuccess: (note) => {
      queryClient.setQueryData(dispatchKeys.detail(note.id), note);
      return settle(queryClient, ...touched);
    },
  });
}

/** Only a draft — the server refuses anything that has gone out. */
export function useDeleteDispatch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      request<{ id: string }>({ url: `/dispatches/${id}`, method: 'DELETE' }),
    onSuccess: () => settle(queryClient, dispatchKeys.all),
  });
}
