import { useQuery } from '@tanstack/react-query';
import type { MonitorSnapshot } from '@yuva/shared';
import { request } from '@/lib/api-client';

export const monitorKeys = {
  all: ['monitor'] as const,
  snapshot: (limit: number) => [...monitorKeys.all, limit] as const,
};

/**
 * The sign-in snapshot.
 *
 * Not cached for long: this screen exists to answer "what is true right now",
 * and a stale answer is worse than a slow one. It refetches whenever the tab is
 * focused again, which is what someone leaving it open all day expects.
 */
export function useMonitor(limit: number) {
  return useQuery({
    queryKey: monitorKeys.snapshot(limit),
    queryFn: () => request<MonitorSnapshot>({ url: `/monitor?limit=${limit}` }),
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
}
