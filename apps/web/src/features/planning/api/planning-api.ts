import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  MachineLoad,
  PlanningBoard,
  PlanningQuery,
  PlanningRow,
  PlanOrderInput,
} from '@yuva/shared';
import { orderKeys } from '@/features/orders/api/order-api';
import { request } from '@/lib/api-client';
import { settle } from '@/lib/query';

export const planningKeys = {
  all: ['planning'] as const,
  board: (params: Partial<PlanningQuery>) => [...planningKeys.all, 'board', params] as const,
  machines: () => [...planningKeys.all, 'machines'] as const,
  order: (id: string) => [...planningKeys.all, 'order', id] as const,
};

const clean = (params: Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== ''),
  );

export function usePlanningBoard(params: Partial<PlanningQuery> = {}) {
  return useQuery({
    queryKey: planningKeys.board(params),
    queryFn: () =>
      request<PlanningBoard>({ url: '/planning', method: 'GET', params: clean(params) }),
  });
}

/** What each machine has booked onto it. */
export function useMachineLoad() {
  return useQuery({
    queryKey: planningKeys.machines(),
    queryFn: () => request<MachineLoad[]>({ url: '/planning/machines', method: 'GET' }),
  });
}

export function usePlanningForOrder(orderId: string | null) {
  return useQuery({
    queryKey: planningKeys.order(orderId ?? ''),
    queryFn: () => request<PlanningRow>({ url: `/planning/${orderId}`, method: 'GET' }),
    enabled: Boolean(orderId),
  });
}

/**
 * Books an order onto a day and a machine.
 *
 * The orders list is refetched with the board: a plan puts a date on an order,
 * and the order screen is where somebody will go looking for it.
 */
export function usePlanOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ orderId, input }: { orderId: string; input: PlanOrderInput }) =>
      request<PlanningRow>({ url: `/planning/${orderId}`, method: 'PUT', data: input }),
    onSuccess: () => settle(queryClient, planningKeys.all, orderKeys.all),
  });
}
