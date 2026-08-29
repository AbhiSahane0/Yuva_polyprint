import type { MonitorSnapshot } from '@yuva/shared';
import { prisma } from '../../lib/prisma.js';

/**
 * Who signed in, and when.
 *
 * Read-only, and deliberately narrow: this answers the one question the
 * director asks — is the system being used, and by whom — without becoming a
 * second, half-built admin screen.
 *
 * Three tables, three different spans. `users.lastLoginAt` is one value per
 * account, overwritten every time. `sessions` is only ever "right now", because
 * expired rows are deleted. `login_events` is the history, and nothing removes
 * a row from it.
 */

/** Newest sign-ins returned by default, and the ceiling on what may be asked for. */
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
       * has ever used at the top of the list.
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
    const count = sessionsPerUser.get(session.user.username) ?? 0;
    sessionsPerUser.set(session.user.username, count + 1);
  }

  return {
    generatedAt: generatedAt.toISOString(),
    users: users.map((user) => ({
      username: user.username,
      displayName: user.displayName,
      isAdmin: user.isAdmin,
      isActive: user.isActive,
      lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
      activeSessions: sessionsPerUser.get(user.username) ?? 0,
    })),
    sessions: sessions.map((session) => ({
      username: session.user.username,
      displayName: session.user.displayName,
      signedInAt: session.createdAt.toISOString(),
      lastSeenAt: session.lastSeenAt.toISOString(),
      expiresAt: session.expiresAt.toISOString(),
    })),
    history: history.map((event) => ({
      username: event.username,
      displayName: event.displayName,
      at: event.createdAt.toISOString(),
      ipAddress: event.ipAddress,
      userAgent: event.userAgent,
      accountExists: event.userId !== null,
    })),
    historyTotal,
    historyLimit: limit,
  };
}
