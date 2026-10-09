import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateOrderInput, ListOrdersQuery, Order, UpdateOrderInput } from '@yuva/shared';
import { request, requestBlob } from '@/lib/api-client';
import { settle } from '@/lib/query';

export const orderKeys = {
  all: ['orders'] as const,
  lists: () => [...orderKeys.all, 'list'] as const,
  list: (params: Partial<ListOrdersQuery>) => [...orderKeys.lists(), params] as const,
  detail: (id: string) => [...orderKeys.all, 'detail', id] as const,
};

interface OrderPage {
  items: Order[];
  total: number;
  page: number;
  pageSize: number;
}

export function useOrders(params: Partial<ListOrdersQuery>) {
  return useQuery({
    queryKey: orderKeys.list(params),
    queryFn: () =>
      request<OrderPage>({
        url: '/orders',
        method: 'GET',
        params: Object.fromEntries(
          Object.entries(params).filter(([, value]) => value !== undefined && value !== ''),
        ),
      }),
  });
}

export function useOrder(id: string | null) {
  return useQuery({
    queryKey: orderKeys.detail(id ?? ''),
    queryFn: () => request<Order>({ url: `/orders/${id}`, method: 'GET' }),
    enabled: Boolean(id),
  });
}

export function useNextOrderNumber() {
  return useQuery({
    queryKey: [...orderKeys.all, 'next-number'],
    queryFn: () => request<{ number: number }>({ url: '/orders/next-number', method: 'GET' }),
  });
}

export function useCreateOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateOrderInput) =>
      request<Order>({ url: '/orders', method: 'POST', data: input }),
    onSuccess: () => settle(queryClient, orderKeys.all),
  });
}

export function useUpdateOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateOrderInput }) =>
      request<Order>({ url: `/orders/${id}`, method: 'PATCH', data: input }),
    onSuccess: (order) => {
      /* The server's own answer needs no round trip to confirm; only the list
         is derived, so only the list is waited on. See `settle`. */
      queryClient.setQueryData(orderKeys.detail(order.id), order);
      return settle(queryClient, orderKeys.lists());
    },
  });
}

/** Only while nobody has started it — the server refuses anything further on. */
export function useDeleteOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => request<{ id: string }>({ url: `/orders/${id}`, method: 'DELETE' }),
    onSuccess: () => settle(queryClient, orderKeys.all),
  });
}

/** Which of the two certificates the office is issuing. */
export type CertificateKind = 'analysis' | 'food-grade';

/**
 * A certificate for this order, rendered by the server.
 *
 * Fetched by script, not linked: the endpoint needs a session and the token
 * travels in a header, which a browser navigation cannot carry.
 */
export function fetchOrderCertificate(id: string, kind: CertificateKind) {
  return requestBlob({ url: `/orders/${id}/certificate/${kind}`, method: 'GET' });
}
