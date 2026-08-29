import { prisma } from '../../lib/prisma.js';

/**
 * Who signed in, and when.
 *
 * Read-only, and deliberately narrow: this answers the one question the
 * director asks — is the system being used, and by whom — without becoming a
 * second, half-built admin screen.
 */

export interface MonitorUser {
  username: string;
  displayName: string;
  isAdmin: boolean;
  isActive: boolean;
  lastLoginAt: Date | null;
  /** Unexpired sessions. More than one means more than one browser or machine. */
  activeSessions: number;
}

export interface MonitorSession {
  username: string;
  displayName: string;
  signedInAt: Date;
  lastSeenAt: Date;
  expiresAt: Date;
}

export interface MonitorLogin {
  username: string;
  displayName: string;
  at: Date;
  ipAddress: string | null;
  userAgent: string | null;
  /** False once the account has been deleted — the names above are a snapshot. */
  accountExists: boolean;
}

export interface MonitorSnapshot {
  generatedAt: Date;
  users: MonitorUser[];
  sessions: MonitorSession[];
  history: MonitorLogin[];
  /** Sign-ins on record in total, which is usually more than `history` holds. */
  historyTotal: number;
  /** How many were asked for, so the page can say when it is showing a slice. */
  historyLimit: number;
}

/** Newest sign-ins shown by default, and the ceiling on `?limit=`. */
export const DEFAULT_HISTORY_LIMIT = 100;
export const MAX_HISTORY_LIMIT = 1000;

export async function getMonitorSnapshot(
  historyLimit: number = DEFAULT_HISTORY_LIMIT,
): Promise<MonitorSnapshot> {
  const generatedAt = new Date();
  const limit = Math.min(Math.max(Math.trunc(historyLimit) || 0, 1), MAX_HISTORY_LIMIT);

  const [users, sessions, history, historyTotal] = await Promise.all([
    prisma.user.findMany({
      select: {
        username: true,
        displayName: true,
        isAdmin: true,
        isActive: true,
        lastLoginAt: true,
      },
      /*
       * Most recent sign-in first, and never-signed-in last. Postgres sorts
       * NULLs first on a descending order, which would put the accounts nobody
       * has ever used at the top of the page.
       */
      orderBy: [{ lastLoginAt: { sort: 'desc', nulls: 'last' } }, { username: 'asc' }],
    }),
    prisma.session.findMany({
      where: { expiresAt: { gt: generatedAt } },
      select: {
        createdAt: true,
        lastSeenAt: true,
        expiresAt: true,
        user: { select: { username: true, displayName: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.loginEvent.findMany({
      select: {
        username: true,
        displayName: true,
        createdAt: true,
        ipAddress: true,
        userAgent: true,
        userId: true,
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    }),
    prisma.loginEvent.count(),
  ]);

  const sessionsPerUser = new Map<string, number>();
  for (const session of sessions) {
    sessionsPerUser.set(
      session.user.username,
      (sessionsPerUser.get(session.user.username) ?? 0) + 1,
    );
  }

  return {
    generatedAt,
    users: users.map((user) => ({
      ...user,
      activeSessions: sessionsPerUser.get(user.username) ?? 0,
    })),
    sessions: sessions.map((session) => ({
      username: session.user.username,
      displayName: session.user.displayName,
      signedInAt: session.createdAt,
      lastSeenAt: session.lastSeenAt,
      expiresAt: session.expiresAt,
    })),
    history: history.map((event) => ({
      username: event.username,
      displayName: event.displayName,
      at: event.createdAt,
      ipAddress: event.ipAddress,
      userAgent: event.userAgent,
      accountExists: event.userId !== null,
    })),
    historyTotal,
    historyLimit: limit,
  };
}
