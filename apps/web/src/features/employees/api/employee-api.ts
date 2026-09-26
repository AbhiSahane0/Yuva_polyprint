import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  Employee,
  EmployeeInput,
  EmployeeList,
  ListEmployeesQuery,
  UpdateEmployeeInput,
} from '@yuva/shared';
import { request } from '@/lib/api-client';
import { settle } from '@/lib/query';
import { productionKeys } from '@/features/production/api/production-api';

export const employeeKeys = {
  all: ['employees'] as const,
  list: (params: Partial<ListEmployeesQuery>) => [...employeeKeys.all, 'list', params] as const,
};

export function useEmployees(params: Partial<ListEmployeesQuery> = {}) {
  return useQuery({
    queryKey: employeeKeys.list(params),
    queryFn: () =>
      request<EmployeeList>({
        url: '/employees',
        method: 'GET',
        params: Object.fromEntries(
          Object.entries(params).filter(([, value]) => value !== undefined && value !== ''),
        ),
      }),
    placeholderData: keepPreviousData,
  });
}

/*
 * Every write settles PRODUCTION as well.
 *
 * Who is on which machine is derived from the job cards, so the two screens are
 * two views of one fact — and a renamed operator that goes on reading the old
 * way on a card left open in another tab is the system disagreeing with itself.
 */
function useInvalidate() {
  const queryClient = useQueryClient();
  return () => settle(queryClient, employeeKeys.all, productionKeys.all);
}

export function useCreateEmployee() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: EmployeeInput) =>
      request<Employee>({ url: '/employees', method: 'POST', data: input }),
    onSuccess: invalidate,
  });
}

export function useUpdateEmployee() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateEmployeeInput }) =>
      request<Employee>({ url: `/employees/${id}`, method: 'PATCH', data: input }),
    onSuccess: invalidate,
  });
}

/** Refused by the server for anyone who has run a stage — leaving is the switch. */
export function useDeleteEmployee() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) =>
      request<{ id: string }>({ url: `/employees/${id}`, method: 'DELETE' }),
    onSuccess: invalidate,
  });
}
