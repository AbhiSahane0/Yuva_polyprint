import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AppSettings,
  CreateQuotationInput,
  Paginated,
  Quotation,
  QuotationEmail as QuotationEmailRecord,
  QuotationStatus,
  QuotationSummary,
  SendQuotationInput,
  SendQuotationResult,
  UpdateQuotationInput,
} from '@yuva/shared';
import { request, requestBlob } from '@/lib/api-client';

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
  emails: (id: string) => [...quotationKeys.all, 'emails', id] as const,
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
 * Fetches the generated PDF.
 *
 * The document is rendered by Chromium on the server and takes fifteen seconds
 * or more, so it is fetched **once** and the resulting blob is reused for the
 * preview, the download and the open-in-a-new-tab. Pointing each of those at
 * the endpoint separately would rebuild the same document from scratch every
 * time.
 *
 * It goes through `requestBlob` — and therefore the shared axios instance —
 * because the endpoint requires a session, and the token is attached by the
 * request interceptor. That is also why these are no longer plain URLs handed
 * to `<a href>` and `<object data>`: a browser navigation cannot carry an
 * Authorization header, so those links answered 401 the moment sign-in landed.
 */
export function fetchQuotationPdf(id: string) {
  return requestBlob({ url: `/quotations/${id}/pdf`, method: 'GET' });
}

/** Falls back to a readable name when the server sends no Content-Disposition. */
export function quotationPdfName(filename: string | null, number: number | string): string {
  return filename ?? `Quotation_${number}.pdf`;
}

/**
 * Emails the quotation with its PDF attached.
 *
 * Rendering happens on the server before the message goes out, so this is slow
 * — fifteen seconds and up. Every caller shows that wait.
 */
export function useSendQuotation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, ...input }: SendQuotationInput & { id: string }) =>
      request<SendQuotationResult>({ url: `/quotations/${id}/send`, method: 'POST', data: input }),
    onSuccess: (_result, variables) => {
      // Sending moves a draft to Sent, so the list and the row are both stale.
      void queryClient.invalidateQueries({ queryKey: quotationKeys.all });
      void queryClient.invalidateQueries({ queryKey: quotationKeys.emails(variables.id) });
    },
  });
}

/** Every recorded send for one quotation, newest first. */
export function useQuotationEmails(id: string | null) {
  return useQuery({
    queryKey: quotationKeys.emails(id ?? ''),
    queryFn: () => request<QuotationEmailRecord[]>({ url: `/quotations/${id}/emails` }),
    enabled: id !== null,
  });
}
