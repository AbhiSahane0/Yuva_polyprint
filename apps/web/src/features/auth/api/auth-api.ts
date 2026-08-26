import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ChangePasswordInput, LoginInput, LoginResult, User } from '@yuva/shared';
import { request } from '@/lib/api-client';
import { useAuthStore } from '../auth-store';

export function login(input: LoginInput) {
  return request<LoginResult>({ url: '/auth/login', method: 'POST', data: input });
}

export function fetchMe() {
  return request<User>({ url: '/auth/me' });
}

export function useLogin() {
  const signIn = useAuthStore((state) => state.signIn);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: login,
    onSuccess: (result) => {
      // Anything cached belongs to whoever was signed in before.
      queryClient.clear();
      signIn(result.token, result.user);
    },
  });
}

export function useLogout() {
  const signOut = useAuthStore((state) => state.signOut);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => request<{ signedOut: boolean }>({ url: '/auth/logout', method: 'POST' }),
    // Sign out locally whatever the server said. A failed call must not strand
    // someone in a session they have asked to leave.
    onSettled: () => {
      queryClient.clear();
      signOut();
    },
  });
}

export function useChangePassword() {
  return useMutation({
    mutationFn: (input: ChangePasswordInput) =>
      request<{ changed: boolean }>({ url: '/auth/change-password', method: 'POST', data: input }),
  });
}
