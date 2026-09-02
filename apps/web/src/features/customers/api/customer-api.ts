import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import type {
  CreateCustomerInput,
  Customer,
  CustomerDetail,
  CustomerJob,
  Paginated,
  SaveQuotationJobInput,
  UpdateCustomerInput,
} from '@yuva/shared';
import { request } from '@/lib/api-client';

export interface CustomerListParams {
  page: number;
  pageSize: number;
  q?: string;
  source?: 'SHEET' | 'BRAND_INFERRED';
  isVerified?: boolean;
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

/**
 * A single customer with their jobs. Only fetched when a row is expanded or
 * opened for editing, so the list request stays small.
 */
export function useCustomer(id: string | null) {
  return useQuery({
    queryKey: customerKeys.detail(id ?? ''),
    queryFn: () => request<CustomerDetail>({ url: `/customers/${id}`, method: 'GET' }),
    enabled: Boolean(id),
  });
}

export function useCreateCustomer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateCustomerInput) =>
      request<CustomerDetail>({ url: '/customers', method: 'POST', data: input }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: customerKeys.lists() }),
  });
}

export function useUpdateCustomer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateCustomerInput }) =>
      request<CustomerDetail>({ url: `/customers/${id}`, method: 'PATCH', data: input }),
    onSuccess: (customer) => {
      queryClient.invalidateQueries({ queryKey: customerKeys.lists() });
      // Jobs may have changed, so replace the cached detail rather than
      // leaving a stale expanded row on screen.
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

/**
 * One job, saved on its own.
 *
 * Separate from `useUpdateCustomer` because that sends the customer and every
 * job they hold — right for the customer editor, wrong for the quotation
 * wizard, where saving one design must not rewrite the others.
 *
 * Creating is idempotent by job name on the server, so a double-clicked Next,
 * a retry or a refresh cannot leave a customer holding duplicates.
 */
export function useSaveCustomerJob() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      customerId,
      jobId,
      input,
    }: {
      customerId: string;
      /** Absent for a design not yet on record. */
      jobId?: string | null;
      input: SaveQuotationJobInput;
    }) =>
      jobId
        ? request<CustomerJob>({ url: `/jobs/${jobId}`, method: 'PATCH', data: input })
        : request<CustomerJob>({
            // The owner travels in the path, so a job cannot be attached to the
            // wrong customer by a body that says otherwise.
            url: `/customers/${customerId}/jobs`,
            method: 'POST',
            data: input,
          }),
    onSuccess: (_job, variables) => {
      // The saved-job dropdown reads from the customer detail, so a design
      // added here has to appear there without a reload.
      void queryClient.invalidateQueries({
        queryKey: customerKeys.detail(variables.customerId),
      });
    },
  });
}
