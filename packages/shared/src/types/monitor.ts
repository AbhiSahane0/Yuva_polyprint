/**
 * The sign-in monitor — an administrator's view of who is using the system.
 *
 * Every instant is an ISO string, as everywhere else in these contracts. The
 * screen renders them in India Standard Time; the wire stays in UTC.
 */

export interface MonitorUser {
  username: string;
  displayName: string;
  isAdmin: boolean;
  isActive: boolean;
  lastLoginAt: string | null;
  /** Unexpired sessions. More than one means more than one browser or machine. */
  activeSessions: number;
}

export interface MonitorSession {
  username: string;
  displayName: string;
  signedInAt: string;
  lastSeenAt: string;
  expiresAt: string;
}

export interface MonitorLogin {
  username: string;
  displayName: string;
  at: string;
  ipAddress: string | null;
  /** The raw header. The screen shows a short description derived from it. */
  userAgent: string | null;
  /** False once the account has been deleted — the names above are a snapshot. */
  accountExists: boolean;
}

export interface MonitorSnapshot {
  generatedAt: string;
  users: MonitorUser[];
  sessions: MonitorSession[];
  history: MonitorLogin[];
  /** Sign-ins on record in total, which is usually more than `history` holds. */
  historyTotal: number;
  /** How many were asked for, so the screen can say it is showing a slice. */
  historyLimit: number;
}
