import { create } from 'zustand';
import type { AppModule, User } from '@yuva/shared';

/*
 * The session token lives in localStorage, which is the trade-off that comes
 * with sending it as a header rather than a cookie: it survives a refresh and
 * works identically no matter which host the API is on, but JavaScript on this
 * page can read it. That is acceptable for an internal tool and would stop
 * being necessary if the app and API ever share a domain — at which point an
 * httpOnly cookie becomes possible and this store keeps only the user.
 */
const TOKEN_KEY = 'yuva.session';

/** localStorage throws in private mode and when site data is blocked. */
function readToken(): string | null {
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function writeToken(token: string | null) {
  try {
    if (token === null) window.localStorage.removeItem(TOKEN_KEY);
    else window.localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // A session that lasts only until the tab closes still beats no session.
  }
}

interface AuthStore {
  token: string | null;
  user: User | null;
  /** False until the stored token has been checked against the server. */
  ready: boolean;
  signIn: (token: string, user: User) => void;
  setUser: (user: User | null) => void;
  setReady: (ready: boolean) => void;
  signOut: () => void;
}

export const useAuthStore = create<AuthStore>((set) => ({
  token: readToken(),
  user: null,
  ready: false,
  signIn: (token, user) => {
    writeToken(token);
    set({ token, user, ready: true });
  },
  setUser: (user) => set({ user }),
  setReady: (ready) => set({ ready }),
  signOut: () => {
    writeToken(null);
    set({ token: null, user: null, ready: true });
  },
}));

/** Read outside React — the axios interceptor needs it on every request. */
export const getToken = () => useAuthStore.getState().token;

/**
 * Whether a user reaches a module. Admins reach everything, which is the whole
 * definition of admin here; checking their module list as well would be a
 * second rule that can disagree with the first.
 */
export function canAccess(user: User | null, module: AppModule): boolean {
  if (!user) return false;
  return user.isAdmin || user.modules.includes(module);
}
