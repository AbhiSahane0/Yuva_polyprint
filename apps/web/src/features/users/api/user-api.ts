import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateUserInput, UpdateUserInput, User } from '@yuva/shared';
import { request } from '@/lib/api-client';

export const userKeys = {
  all: ['users'] as const,
  list: () => [...userKeys.all, 'list'] as const,
};

export function useUsers() {
  return useQuery({
    queryKey: userKeys.list(),
    queryFn: () => request<User[]>({ url: '/users' }),
  });
}

export function useCreateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateUserInput) =>
      request<User>({ url: '/users', method: 'POST', data: input }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: userKeys.all }),
  });
}

export function useUpdateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: UpdateUserInput & { id: string }) =>
      request<User>({ url: `/users/${id}`, method: 'PATCH', data: input }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: userKeys.all }),
  });
}

export function useResetPassword() {
  return useMutation({
    mutationFn: ({ id, password }: { id: string; password: string }) =>
      request<{ reset: boolean }>({
        url: `/users/${id}/password`,
        method: 'POST',
        data: { password },
      }),
  });
}

export function useDeleteUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      request<{ deleted: boolean }>({ url: `/users/${id}`, method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: userKeys.all }),
  });
}
