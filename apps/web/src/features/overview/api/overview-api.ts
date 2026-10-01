import { useQuery } from '@tanstack/react-query';
import type { Overview } from '@yuva/shared';
import { request } from '@/lib/api-client';

export const overviewKeys = { all: ['overview'] as const };

/**
 * The whole works, refetched on its own.
 *
 * This is the screen somebody leaves open on a desk all morning, so it has to
 * keep up without being reloaded. Thirty seconds is quick enough that a job
 * finishing shows up before anybody thinks to ask, and slow enough that a
 * screen left on overnight is not hammering anything: it is one read-only
 * request that takes about a tenth of a second.
 *
 * `refetchOnWindowFocus` is the other half — coming back to the tab after a
 * meeting should not show the state you left.
 */
export function useOverview() {
  return useQuery({
    queryKey: overviewKeys.all,
    queryFn: () => request<Overview>({ url: '/overview', method: 'GET' }),
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });
}
