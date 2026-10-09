import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { JobSheet, JobSheetSummary, Paginated } from '@yuva/shared';
import { request } from '@/lib/api-client';
import { settle } from '@/lib/query';
import { inventoryKeys } from '@/features/inventory/api/inventory-api';
import { productionKeys } from '@/features/production/api/production-api';

export interface JobSheetListParams {
  search?: string;
  status?: 'OPEN' | 'COSTED' | 'CLOSED';
  page?: number;
  pageSize?: number;
}

export const jobSheetKeys = {
  all: ['job-sheets'] as const,
  list: (params: JobSheetListParams) => [...jobSheetKeys.all, 'list', params] as const,
  one: (id: string) => [...jobSheetKeys.all, 'one', id] as const,
  nextNumber: () => [...jobSheetKeys.all, 'next-number'] as const,
};

export function useJobSheets(params: JobSheetListParams) {
  return useQuery({
    queryKey: jobSheetKeys.list(params),
    queryFn: () =>
      request<Paginated<JobSheetSummary>>({ url: '/job-sheets', method: 'GET', params }),
    placeholderData: keepPreviousData,
  });
}

export function useJobSheet(id: string | undefined) {
  return useQuery({
    queryKey: jobSheetKeys.one(id ?? ''),
    queryFn: () => request<JobSheet>({ url: `/job-sheets/${id}`, method: 'GET' }),
    enabled: Boolean(id),
  });
}

export function useNextJobSheetNumber() {
  return useQuery({
    queryKey: jobSheetKeys.nextNumber(),
    queryFn: () => request<{ number: number }>({ url: '/job-sheets/next-number', method: 'GET' }),
  });
}

export function useCreateJobSheet() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      request<JobSheet>({ url: '/job-sheets', method: 'POST', data: body }),
    /* A sheet can be raised against a production run, and that run now has one
       — which is what its screen offers instead of raising a second. */
    onSuccess: () => settle(queryClient, jobSheetKeys.all, productionKeys.all),
  });
}

/**
 * Saving a sheet re-costs it on the server and returns what it came to.
 *
 * The response is written straight into the cache rather than triggering a
 * refetch: the office types down a column of twenty-one rows, and a round trip
 * that blanks the figures between save and reload makes the page look like it
 * lost them.
 */
export function useUpdateJobSheet(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      request<JobSheet>({ url: `/job-sheets/${id}`, method: 'PATCH', data: body }),
    onSuccess: (sheet) => {
      /* The server's own answer, so it needs no round trip to confirm — the
         wait below is only for the LIST, which is derived. */
      queryClient.setQueryData(jobSheetKeys.one(id), sheet);
      /* The production run this sheet points at may have changed with this save. */
      return settle(queryClient, jobSheetKeys.all, productionKeys.all);
    },
  });
}

export function useCostJobSheet(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => request<JobSheet>({ url: `/job-sheets/${id}/cost`, method: 'POST' }),
    onSuccess: (sheet) => {
      queryClient.setQueryData(jobSheetKeys.one(id), sheet);
      return settle(queryClient, jobSheetKeys.all);
    },
  });
}

/** The irreversible one: writes the run's consumption off stock. */
export function usePostJobSheetToStock(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      request<{ sheet: JobSheet; posted: number; skipped: string[] }>({
        url: `/job-sheets/${id}/post-to-stock`,
        method: 'POST',
      }),
    onSuccess: (result) => {
      queryClient.setQueryData(jobSheetKeys.one(id), result.sheet);
      /*
       * Stock has genuinely moved, so every inventory screen is now stale — and
       * so is every production screen: posting releases the linked run's claim
       * on its film, which changes what every OTHER run sees as free.
       */
      return settle(queryClient, jobSheetKeys.all, inventoryKeys.all, productionKeys.all);
    },
  });
}

export function useDeleteJobSheet() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      request<{ id: string }>({ url: `/job-sheets/${id}`, method: 'DELETE' }),
    onSuccess: () => settle(queryClient, jobSheetKeys.all),
  });
}
