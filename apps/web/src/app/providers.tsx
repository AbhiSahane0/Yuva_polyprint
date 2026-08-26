import type { ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { BrowserRouter } from 'react-router-dom';
import { queryClient } from './query-client';
import { Toaster } from '@/components/ui/Toaster';
import { env } from '@/config/env';
import { configureAuth } from '@/lib/api-client';
import { useAuthStore } from '@/features/auth/auth-store';

/*
 * Hand the API client its two auth hooks, once, at import time.
 *
 * api-client.ts deliberately knows nothing about the auth store — it is
 * injected here — so the client stays importable by anything without dragging
 * a store, and a session that the server has already rejected cannot linger in
 * the browser: a 401 from any request signs the user out immediately.
 */
configureAuth({
  getAccessToken: () => useAuthStore.getState().token,
  onUnauthorized: () => {
    if (useAuthStore.getState().token !== null) useAuthStore.getState().signOut();
  },
});

/** Single place to compose app-wide providers. */
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>{children}</BrowserRouter>
      <Toaster />
      {env.isDevelopment ? <ReactQueryDevtools initialIsOpen={false} /> : null}
    </QueryClientProvider>
  );
}
