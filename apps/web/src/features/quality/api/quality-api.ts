import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateIssueInput,
  IssueTarget,
  QualityBoard,
  QualityIssue,
  QualityQuery,
  UpdateIssueInput,
} from '@yuva/shared';
import { request } from '@/lib/api-client';
import { settle } from '@/lib/query';

export const qualityKeys = {
  all: ['quality'] as const,
  board: (params: Partial<QualityQuery>) => [...qualityKeys.all, 'board', params] as const,
  cards: () => [...qualityKeys.all, 'cards'] as const,
  detail: (id: string) => [...qualityKeys.all, 'detail', id] as const,
};

const clean = (params: Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== ''),
  );

export function useQualityBoard(params: Partial<QualityQuery> = {}) {
  return useQuery({
    queryKey: qualityKeys.board(params),
    queryFn: () => request<QualityBoard>({ url: '/quality', method: 'GET', params: clean(params) }),
  });
}

/** The cards an issue can be raised against, with their stages. */
export function useIssueTargets() {
  return useQuery({
    queryKey: qualityKeys.cards(),
    queryFn: () => request<IssueTarget[]>({ url: '/quality/cards', method: 'GET' }),
  });
}

/**
 * Raising or changing an issue refetches Dispatch too.
 *
 * A rejection is film that cannot be sent, so the godown's figure moves the
 * moment one is recorded — and the despatch clerk is often the person who
 * recorded it.
 */
const touched = [qualityKeys.all, ['dispatches'], ['floor']];

export function useRaiseIssue() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateIssueInput) =>
      request<QualityIssue>({ url: '/quality', method: 'POST', data: input }),
    onSuccess: () => settle(queryClient, ...touched),
  });
}

export function useUpdateIssue() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateIssueInput }) =>
      request<QualityIssue>({ url: `/quality/${id}`, method: 'PATCH', data: input }),
    onSuccess: () => settle(queryClient, ...touched),
  });
}
