import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { JobCard, JobCardInput, JobCardSummary, Paginated } from '@yuva/shared';
import { request, requestBlob } from '@/lib/api-client';
import { settle } from '@/lib/query';

export interface JobCardListParams {
  search?: string;
  page?: number;
  pageSize?: number;
}

export const jobCardKeys = {
  all: ['job-cards'] as const,
  list: (params: JobCardListParams) => [...jobCardKeys.all, 'list', params] as const,
  one: (id: string) => [...jobCardKeys.all, 'one', id] as const,
  nextNumber: () => [...jobCardKeys.all, 'next-number'] as const,
};

export function useJobCards(params: JobCardListParams) {
  return useQuery({
    queryKey: jobCardKeys.list(params),
    queryFn: () => request<Paginated<JobCardSummary>>({ url: '/job-cards', method: 'GET', params }),
    placeholderData: keepPreviousData,
  });
}

export function useJobCard(id: string | undefined) {
  return useQuery({
    queryKey: jobCardKeys.one(id ?? ''),
    queryFn: () => request<JobCard>({ url: `/job-cards/${id}`, method: 'GET' }),
    enabled: Boolean(id),
  });
}

export function useNextJobCardNumber() {
  return useQuery({
    queryKey: jobCardKeys.nextNumber(),
    queryFn: () => request<{ number: number }>({ url: '/job-cards/next-number', method: 'GET' }),
  });
}

export function useCreateJobCard() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<JobCardInput>) =>
      request<JobCard>({ url: '/job-cards', method: 'POST', data: body }),
    onSuccess: () => settle(queryClient, jobCardKeys.all),
  });
}

export function useUpdateJobCard(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<JobCardInput>) =>
      request<JobCard>({ url: `/job-cards/${id}`, method: 'PATCH', data: body }),
    onSuccess: (card) => {
      queryClient.setQueryData(jobCardKeys.one(id), card);
      return settle(queryClient, jobCardKeys.all);
    },
  });
}

export function useDeleteJobCard() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      request<{ id: string }>({ url: `/job-cards/${id}`, method: 'DELETE' }),
    onSuccess: () => settle(queryClient, jobCardKeys.all),
  });
}

/**
 * The printed card.
 *
 * Fetched by script rather than linked: the endpoint needs a session and the
 * token travels in a header, which a browser navigation cannot carry — a plain
 * `<a href>` to it answers 401. Chromium renders the sheet on the server, so
 * this takes a few seconds and every caller shows that wait.
 */
export function fetchJobCardPdf(id: string) {
  return requestBlob({ url: `/job-cards/${id}/print`, method: 'GET' });
}

/** Falls back to a readable name when the server sends no Content-Disposition. */
export function jobCardPdfName(filename: string | null, number: number | string): string {
  return filename ?? `Job_Card_${number}.pdf`;
}
