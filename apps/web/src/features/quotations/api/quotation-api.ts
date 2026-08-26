import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AppSettings,
  CreateQuotationInput,
  Paginated,
  Quotation,
  QuotationStatus,
  QuotationSummary,
  UpdateQuotationInput,
} from '@yuva/shared';
import { apiUrl, request } from '@/lib/api-client';

export interface QuotationListParams {
  page: number;
  pageSize: number;
  q?: string;
  status?: QuotationStatus;
}

export const quotationKeys = {
  all: ['quotations'] as const,
  lists: () => [...quotationKeys.all, 'list'] as const,
  list: (params: QuotationListParams) => [...quotationKeys.lists(), params] as const,
  detail: (id: string) => [...quotationKeys.all, 'detail', id] as const,
  nextNumber: () => [...quotationKeys.all, 'next-number'] as const,
};

export function useQuotations(params: QuotationListParams) {
  return useQuery({
    queryKey: quotationKeys.list(params),
    queryFn: () =>
      request<Paginated<QuotationSummary>>({ url: '/quotations', method: 'GET', params }),
    placeholderData: keepPreviousData,
  });
}

export function useQuotation(id: string | null) {
  return useQuery({
    queryKey: quotationKeys.detail(id ?? ''),
    queryFn: () => request<Quotation>({ url: `/quotations/${id}`, method: 'GET' }),
    enabled: Boolean(id),
  });
}

export function useNextQuotationNumber(enabled: boolean) {
  return useQuery({
    queryKey: quotationKeys.nextNumber(),
    queryFn: () => request<{ number: number }>({ url: '/quotations/next-number', method: 'GET' }),
    enabled,
  });
}

export function useSettings() {
  return useQuery({
    queryKey: ['settings'],
    queryFn: () => request<AppSettings>({ url: '/settings', method: 'GET' }),
    staleTime: 5 * 60_000,
  });
}

export function useCreateQuotation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateQuotationInput) =>
      request<Quotation>({ url: '/quotations', method: 'POST', data: input }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: quotationKeys.all }),
  });
}

export function useUpdateQuotation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateQuotationInput }) =>
      request<Quotation>({ url: `/quotations/${id}`, method: 'PATCH', data: input }),
    onSuccess: (quotation) => {
      queryClient.invalidateQueries({ queryKey: quotationKeys.lists() });
      queryClient.setQueryData(quotationKeys.detail(quotation.id), quotation);
    },
  });
}

export function useDeleteQuotation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      request<{ id: string }>({ url: `/quotations/${id}`, method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: quotationKeys.lists() }),
  });
}

/**
 * URLs the browser hits directly. The preview shows the real generated PDF
 * (served inline rather than as a download), so the document on screen is
 * exactly the file the customer receives.
 */
/**
 * The PDF endpoints as URLs rather than client calls, because the browser
 * fetches these itself — an <object> embed and a download link.
 *
 * Built through `apiUrl` so they follow VITE_API_BASE_URL like every other
 * request. Writing `/api/...` here instead assumes the API is same-origin,
 * which is true of the Vite dev proxy and not true of a deployment that points
 * the client straight at the API host.
 */
export const quotationUrls = {
  preview: (id: string) => apiUrl(`/quotations/${id}/pdf?inline=1`),
  pdf: (id: string) => apiUrl(`/quotations/${id}/pdf`),
};
