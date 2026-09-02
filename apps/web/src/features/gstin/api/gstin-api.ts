import { useMutation } from '@tanstack/react-query';
import type { GstinLookup } from '@yuva/shared';
import { request } from '@/lib/api-client';

/**
 * Looking a GSTIN up.
 *
 * A mutation rather than a query, despite being a GET, because the office
 * decides when it happens. A query would fetch on mount, refetch on window
 * focus and retry on failure — three ways to spend a paid credit that nobody
 * asked for. This fires exactly when the button is pressed and never otherwise.
 */
export function useGstinLookup() {
  return useMutation({
    mutationFn: ({ gstin, refresh = false }: { gstin: string; refresh?: boolean }) =>
      request<GstinLookup>({
        url: `/gstin/${encodeURIComponent(gstin)}`,
        method: 'GET',
        params: refresh ? { refresh: '1' } : undefined,
      }),
    // Retrying a lookup that failed would spend a second credit to be told the
    // same thing. The office can press the button again if they want to.
    retry: false,
  });
}
