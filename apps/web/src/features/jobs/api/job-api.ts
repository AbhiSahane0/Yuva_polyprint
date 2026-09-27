import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { keepPreviousData } from '@tanstack/react-query';
import type {
  AssignDesignCustomerInput,
  DesignMasterList,
  DesignMasterRow,
  ListDesignsQuery,
} from '@yuva/shared';
import { request } from '@/lib/api-client';
import { settle } from '@/lib/query';

export const designKeys = {
  all: ['designs'] as const,
  list: (params: Partial<ListDesignsQuery>) => [...designKeys.all, 'list', params] as const,
};

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
