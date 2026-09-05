import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ClosePurchaseLineInput,
  CreatePurchaseOrderInput,
  PurchaseOrder,
  PurchaseOrderList,
  PurchaseOrderStatus,
  ReceivePurchaseLineInput,
  Supplier,
  SupplierInput,
  UpdatePurchaseOrderInput,
  UpdateSupplierInput,
} from '@yuva/shared';
import { request } from '@/lib/api-client';
import { inventoryKeys } from '@/features/inventory/api/inventory-api';

export interface OrderListParams {
  q?: string;
  status?: PurchaseOrderStatus;
  supplierId?: string;
  delayedOnly?: boolean;
}

export const purchaseKeys = {
  all: ['purchase'] as const,
  suppliers: (q?: string) => [...purchaseKeys.all, 'suppliers', q ?? ''] as const,
  orders: (params: OrderListParams) => [...purchaseKeys.all, 'orders', params] as const,
  order: (id: string) => [...purchaseKeys.all, 'order', id] as const,
};

export function useSuppliers(q?: string) {
  return useQuery({
    queryKey: purchaseKeys.suppliers(q),
    queryFn: () =>
      request<Supplier[]>({
        url: '/purchase/suppliers',
        method: 'GET',
        params: q ? { q } : undefined,
      }),
    placeholderData: keepPreviousData,
  });
}

export function usePurchaseOrders(params: OrderListParams) {
  return useQuery({
    queryKey: purchaseKeys.orders(params),
    queryFn: () => request<PurchaseOrderList>({ url: '/purchase/orders', method: 'GET', params }),
    placeholderData: keepPreviousData,
  });
}

export function usePurchaseOrder(id: string | null) {
  return useQuery({
    queryKey: purchaseKeys.order(id ?? ''),
    queryFn: () => request<PurchaseOrder>({ url: `/purchase/orders/${id}`, method: 'GET' }),
    enabled: Boolean(id),
  });
}

function useInvalidate() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: purchaseKeys.all });
}

export function useCreateSupplier() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: SupplierInput) =>
      request<Supplier>({ url: '/purchase/suppliers', method: 'POST', data: input }),
    onSuccess: invalidate,
  });
}

export function useUpdateSupplier(id: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: UpdateSupplierInput) =>
      request<Supplier>({ url: `/purchase/suppliers/${id}`, method: 'PATCH', data: input }),
    onSuccess: invalidate,
  });
}

export function useCreatePurchaseOrder() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: CreatePurchaseOrderInput) =>
      request<PurchaseOrder>({ url: '/purchase/orders', method: 'POST', data: input }),
    onSuccess: invalidate,
  });
}

export function useUpdatePurchaseOrder(id: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: UpdatePurchaseOrderInput) =>
      request<PurchaseOrder>({ url: `/purchase/orders/${id}`, method: 'PATCH', data: input }),
    onSuccess: invalidate,
  });
}

/**
 * Receiving touches both modules, so both caches are cleared.
 *
 * The accepted quantity becomes a stock batch, so an inventory screen left open
 * in another tab would otherwise go on showing the figure from before the lorry
 * arrived — and stock is the one thing this app must not show stale.
 */
export function useReceivePurchaseLine() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ReceivePurchaseLineInput) =>
      request<PurchaseOrder>({ url: '/purchase/receipts', method: 'POST', data: input }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: purchaseKeys.all }),
        queryClient.invalidateQueries({ queryKey: inventoryKeys.all }),
      ]);
    },
  });
}

export function useClosePurchaseLine() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: ClosePurchaseLineInput) =>
      request<PurchaseOrder>({ url: '/purchase/lines/close', method: 'POST', data: input }),
    onSuccess: invalidate,
  });
}
