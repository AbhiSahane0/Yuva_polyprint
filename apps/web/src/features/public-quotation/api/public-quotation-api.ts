import { useMutation, useQuery } from '@tanstack/react-query';
import type {
  PublicQuotation,
  PublicQuotationResponse,
  RespondToQuotationInput,
} from '@yuva/shared';
import { request, requestBlob } from '@/lib/api-client';

/**
 * **The customer's side of the API, from a page nobody has signed in to.**
 *
 * It goes through the same client as everything else, which is deliberate:
 * that client is where this app knows the base URL, how to unwrap the
 * envelope, and how to turn a 502 into a sentence a human can read. The
 * request interceptor attaches a session token when there is one and nothing
 * when there is not, so these calls simply go out unauthenticated.
 *
 * The one thing to keep in mind here is that a 401 handler is wired into that
 * client and bounces the app to the login screen. These endpoints never answer
 * 401 — see `public-route.test.ts`, which pins that — so a customer cannot be
 * dropped onto a sign-in form for a system they have no account on.
 */

export const publicQuotationKeys = {
  byToken: (token: string) => ['public-quotation', token] as const,
};

export function usePublicQuotation(token: string) {
  return useQuery({
    queryKey: publicQuotationKeys.byToken(token),
    queryFn: () => request<PublicQuotation>({ url: `/public/quotations/${token}`, method: 'GET' }),
    /* A link is opened once and answered; refetching on every window focus
       would count a view each time the customer tabs back to their mail. */
    refetchOnWindowFocus: false,
    retry: false,
  });
}

export function useRespondToQuotation(token: string) {
  return useMutation({
    mutationFn: (input: RespondToQuotationInput) =>
      request<PublicQuotationResponse>({
        url: `/public/quotations/${token}/respond`,
        method: 'POST',
        data: input,
      }),
  });
}

export function fetchPublicQuotationPdf(token: string) {
  return requestBlob({ url: `/public/quotations/${token}/pdf`, method: 'GET' });
}
