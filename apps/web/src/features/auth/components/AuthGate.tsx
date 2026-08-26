import { useEffect, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import type { AppModule } from '@yuva/shared';
import { LoadingState } from '@/components/ui/LoadingState';
import { EmptyState } from '@/components/ui/EmptyState';
import { Lock } from 'lucide-react';
import { fetchMe } from '../api/auth-api';
import { canAccess, useAuthStore } from '../auth-store';

/**
 * Turns a stored token back into a session on boot.
 *
 * Until this has answered, we know a token exists but not whether it is still
 * valid, so the app renders a loading state rather than guessing. Guessing
 * "signed in" flashes the dashboard before bouncing to login; guessing "signed
 * out" bounces a perfectly good session to the login screen on every refresh.
 */
export function AuthBootstrap({ children }: { children: ReactNode }) {
  const token = useAuthStore((state) => state.token);
  const ready = useAuthStore((state) => state.ready);
  const setUser = useAuthStore((state) => state.setUser);
  const setReady = useAuthStore((state) => state.setReady);
  const signOut = useAuthStore((state) => state.signOut);

  useEffect(() => {
    if (ready) return;
    if (!token) {
      setReady(true);
      return;
    }

    let cancelled = false;
    fetchMe()
      .then((user) => {
        if (cancelled) return;
        setUser(user);
        setReady(true);
      })
      .catch(() => {
        // Expired, revoked, or the account was deactivated. Either way this
        // token is no longer a session.
        if (!cancelled) signOut();
      });

    return () => {
      cancelled = true;
    };
  }, [token, ready, setUser, setReady, signOut]);

  if (!ready) return <LoadingState label="Signing you in…" />;
  return <>{children}</>;
}

/** Requires a session. Remembers where you were headed. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const user = useAuthStore((state) => state.user);
  const location = useLocation();

  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <>{children}</>;
}

/**
 * Requires access to one module.
 *
 * This only decides what to render. The API enforces the same rule
 * independently, because a route guard is a convenience for honest users and
 * no obstacle at all to anyone willing to open the network tab.
 */
export function RequireModule({ module, children }: { module: AppModule; children: ReactNode }) {
  const user = useAuthStore((state) => state.user);

  if (!canAccess(user, module)) {
    return (
      <EmptyState
        icon={<Lock className="size-8" />}
        title="You do not have access to this section"
        description="Ask an administrator if you need it."
      />
    );
  }
  return <>{children}</>;
}

/** Admin-only screens. */
export function RequireAdmin({ children }: { children: ReactNode }) {
  const user = useAuthStore((state) => state.user);

  if (!user?.isAdmin) {
    return (
      <EmptyState
        icon={<Lock className="size-8" />}
        title="Administrators only"
        description="This screen manages who can sign in and what they can see."
      />
    );
  }
  return <>{children}</>;
}
