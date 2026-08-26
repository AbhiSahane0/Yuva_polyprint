import type { AppModule } from '../constants/modules.js';

/**
 * A user as the API returns it. There is deliberately no password field of any
 * kind here — not the hash, not a redacted placeholder — so it cannot leak by
 * being spread into a response.
 */
export interface User {
  id: string;
  username: string;
  displayName: string;
  /** Admins reach everything, including user management, whatever `modules` says. */
  isAdmin: boolean;
  /** A deactivated user keeps their history but cannot sign in. */
  isActive: boolean;
  modules: AppModule[];
  createdAt: string;
  lastLoginAt: string | null;
}

/** What a successful sign-in returns. */
export interface LoginResult {
  /** Opaque session token. Sent back as `Authorization: Bearer <token>`. */
  token: string;
  user: User;
}
