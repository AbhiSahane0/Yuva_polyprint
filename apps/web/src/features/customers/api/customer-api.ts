import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import type { CreateCustomerInput, Customer, Paginated, UpdateCustomerInput } from '@yuva/shared';
import { request } from '@/lib/api-client';

export interface CustomerListParams {
  page: number;
  pageSize: number;
  q?: string;
  source?: 'SHEET' | 'BRAND_INFERRED';
  isVerified?: boolean;
  sortBy?: 'companyName' | 'city' | 'createdAt' | 'updatedAt';
  sortOrder?: 'asc' | 'desc';
}

/** One factory for every key, so invalidation cannot drift out of sync. */
export const customerKeys = {
  all: ['customers'] as const,
  lists: () => [...customerKeys.all, 'list'] as const,
  list: (params: CustomerListParams) => [...customerKeys.lists(), params] as const,
  detail: (id: string) => [...customerKeys.all, 'detail', id] as const,
};

export function useCustomers(params: CustomerListParams) {
  return useQuery({
    queryKey: customerKeys.list(params),
    queryFn: () => request<Paginated<Customer>>({ url: '/customers', method: 'GET', params }),
    // Keeps the previous page visible while the next one loads, so the table
    // does not flash empty on every keystroke of the search box.
    placeholderData: keepPreviousData,
  });
}

export function useCreateCustomer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateCustomerInput) =>
      request<Customer>({ url: '/customers', method: 'POST', data: input }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: customerKeys.lists() }),
  });
}

export function useUpdateCustomer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateCustomerInput }) =>
      request<Customer>({ url: `/customers/${id}`, method: 'PATCH', data: input }),
    onSuccess: (customer) => {
      queryClient.invalidateQueries({ queryKey: customerKeys.lists() });
      queryClient.setQueryData(customerKeys.detail(customer.id), customer);
    },
  });
}

export function useDeleteCustomer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      request<{ id: string; releasedJobs: number }>({
        url: `/customers/${id}`,
        method: 'DELETE',
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: customerKeys.lists() }),
  });
}
