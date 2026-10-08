import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { keepPreviousData } from '@tanstack/react-query';
import type {
  AssignDesignCustomerInput,
  DesignMasterList,
  DesignMasterRow,
  JobSpecification,
  ListDesignsQuery,
} from '@yuva/shared';
import { request } from '@/lib/api-client';
import { settle } from '@/lib/query';

export const designKeys = {
  all: ['designs'] as const,
  list: (params: Partial<ListDesignsQuery>) => [...designKeys.all, 'list', params] as const,
  specification: (id: string) => [...designKeys.all, 'specification', id] as const,
};

/**
 * One design's full specification — what the job card prints.
 *
 * A design's structure does not change while a card is open, so this is left
 * to sit: refetching it on every focus would reprint the card under the
 * operator's hands for nothing.
 */
export function useJobSpecification(jobId: string | null) {
  return useQuery({
    queryKey: designKeys.specification(jobId ?? ''),
    queryFn: () =>
      request<JobSpecification>({ url: `/jobs/${jobId}/specification`, method: 'GET' }),
    enabled: Boolean(jobId),
    staleTime: 5 * 60 * 1000,
  });
}

export function useDesigns(params: Partial<ListDesignsQuery>) {
  return useQuery({
    queryKey: designKeys.list(params),
    queryFn: () =>
      request<DesignMasterList>({
        url: '/jobs',
        method: 'GET',
        params: Object.fromEntries(
          Object.entries(params).filter(([, value]) => value !== undefined && value !== ''),
        ),
      }),
    /* Paging four hundred designs should not blank the table each time. */
    placeholderData: keepPreviousData,
  });
}

/**
 * Putting a customer to a design that arrived without one.
 *
 * The customers list is refetched with it: the design now belongs to somebody
 * and appears on their page, which is where it is edited from then on.
 */
export function useAssignDesignCustomer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: AssignDesignCustomerInput }) =>
      request<DesignMasterRow>({ url: `/jobs/${id}/customer`, method: 'POST', data: input }),
    onSuccess: () => settle(queryClient, designKeys.all, ['customers']),
  });
}
