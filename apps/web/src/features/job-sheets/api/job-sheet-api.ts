import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { JobSheet, JobSheetSummary, Paginated } from '@yuva/shared';
import { request } from '@/lib/api-client';
import { inventoryKeys } from '@/features/inventory/api/inventory-api';

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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: jobSheetKeys.all }),
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
      queryClient.setQueryData(jobSheetKeys.one(id), sheet);
      void queryClient.invalidateQueries({ queryKey: jobSheetKeys.all });
    },
  });
}

export function useCostJobSheet(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => request<JobSheet>({ url: `/job-sheets/${id}/cost`, method: 'POST' }),
    onSuccess: (sheet) => {
      queryClient.setQueryData(jobSheetKeys.one(id), sheet);
      void queryClient.invalidateQueries({ queryKey: jobSheetKeys.all });
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
      void queryClient.invalidateQueries({ queryKey: jobSheetKeys.all });
      /* Stock has genuinely moved, so every inventory screen is now stale. */
      void queryClient.invalidateQueries({ queryKey: inventoryKeys.all });
    },
  });
}

export function useDeleteJobSheet() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      request<{ id: string }>({ url: `/job-sheets/${id}`, method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: jobSheetKeys.all }),
  });
}
