import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { AppModule, LoginInput, LoginResult, User } from '@yuva/shared';
import { isAppModule } from '@yuva/shared';
import { prisma } from '../../lib/prisma.js';
import { hashPassword, verifyPassword } from '../../lib/password.js';
import { ApiError } from '../../utils/api-error.js';

/** How long a sign-in lasts. Long enough for a working week. */
const SESSION_DAYS = 7;

/*
 * A user agent is client-supplied and unbounded. Truncating keeps a hostile or
 * merely absurd header from turning every sign-in into a large row.
 */
const MAX_CONTEXT_LENGTH = 512;

/**
 * A dummy hash, verified against when the username does not exist.
 *
 * Without it, an unknown username returns immediately while a known one waits
 * for scrypt, and that difference is enough to enumerate who has an account.
 */
const DUMMY_HASH =
  'scrypt$32768$8$1$AAAAAAAAAAAAAAAAAAAAAA$' +
  'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

/** The token goes to the browser; only this hash is ever stored. */
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function toPublicUser(row: {
  id: string;
  username: string;
  displayName: string;
  isAdmin: boolean;
  isActive: boolean;
  modules: string[];
  createdAt: Date;
  lastLoginAt: Date | null;
}): User {
  return {
    id: row.id,
    username: row.username,
    displayName: row.displayName,
    isAdmin: row.isAdmin,
    isActive: row.isActive,
    // Filtered rather than cast: a module removed from the app should vanish
    // from a user's permissions, not linger as an unrecognised string.
    modules: row.modules.filter(isAppModule) as AppModule[],
    createdAt: row.createdAt.toISOString(),
    lastLoginAt: row.lastLoginAt?.toISOString() ?? null,
  };
}

/**
 * Checks a username and password, without starting a session.
 *
 * Sign-in is not the only thing that has to test a password: the monitor page
 * authenticates on every request over HTTP Basic and never holds a session.
 * Both go through here so the constant-time shape below exists once.
 *
 * Deactivated accounts fail like a wrong password, and the dummy hash keeps an
 * unknown username as slow as a known one — without it the reply comes back
 * immediately for names that do not exist, which is enough to enumerate them.
 */
export async function verifyCredentials(username: string, password: string): Promise<User | null> {
  const user = await prisma.user.findUnique({ where: { username } });

  const ok = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok || !user.isActive) return null;

  return toPublicUser(user);
}

/** Where a sign-in came from. Both are best-effort and may be absent. */
export interface LoginContext {
  ipAddress?: string | undefined;
  userAgent?: string | undefined;
}

/**
 * Signs a user in.
 *
 * Every failure — unknown user, wrong password, deactivated account — returns
 * the same message. Saying "no such user" or "this account is disabled" tells
 * whoever is guessing which half of the pair to keep working on.
 *
 * Three things are written, and they answer three different questions:
 * the session is "who is signed in now", `lastLoginAt` is "when was this
 * account last used", and the login event is "who has ever signed in". Only the
 * last of those is kept permanently.
 */
export async function login(input: LoginInput, context: LoginContext = {}): Promise<LoginResult> {
  const user = await verifyCredentials(input.username, input.password);
  if (!user) {
    throw ApiError.unauthorized('Incorrect username or password');
  }

  const token = randomBytes(32).toString('base64url');
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_DAYS * 24 * 60 * 60 * 1000);

  await prisma.$transaction([
    prisma.session.create({ data: { tokenHash: hashToken(token), userId: user.id, expiresAt } }),
    prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: now } }),
    prisma.loginEvent.create({
      data: {
        userId: user.id,
        // Snapshots: renaming the account later must not rewrite its history.
        username: user.username,
        displayName: user.displayName,
        ipAddress: context.ipAddress?.slice(0, MAX_CONTEXT_LENGTH) ?? null,
        userAgent: context.userAgent?.slice(0, MAX_CONTEXT_LENGTH) ?? null,
        createdAt: now,
      },
    }),
    // Housekeeping: expired rows are dead weight and this is the one moment we
    // know we are already writing to the table. Login events are never swept —
    // an audit trail that quietly forgets is not one.
    prisma.session.deleteMany({ where: { expiresAt: { lt: now } } }),
  ]);

  return { token, user: { ...user, lastLoginAt: now.toISOString() } };
}

/**
 * Resolves a bearer token to its user, or null.
 *
 * Returns null for every failure rather than throwing, so the caller decides
 * what an anonymous request means.
 */
export async function resolveSession(token: string): Promise<User | null> {
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });

  if (!session) return null;
  if (session.expiresAt.getTime() <= Date.now()) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => undefined);
    return null;
  }
  // Deactivating a user takes effect on their next request, not their next login.
  if (!session.user.isActive) return null;

  // Cheap liveness stamp, at most once a minute, so reading is not a write on
  // every single request.
  if (Date.now() - session.lastSeenAt.getTime() > 60_000) {
    await prisma.session
      .update({ where: { id: session.id }, data: { lastSeenAt: new Date() } })
      .catch(() => undefined);
  }

  return toPublicUser(session.user);
}

/** Signs out one session. Unknown tokens succeed quietly — the goal is reached. */
export async function logout(token: string): Promise<void> {
  if (!token) return;
  await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
}

/**
 * Changes the signed-in user's own password.
 *
 * Every other session for that user is dropped: the usual reason to change a
 * password is that someone else may know it.
 */
export async function changeOwnPassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
  currentToken: string,
): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw ApiError.unauthorized();

  if (!(await verifyPassword(currentPassword, user.passwordHash))) {
    throw ApiError.badRequest('Your current password is not correct');
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await hashPassword(newPassword) },
    }),
    prisma.session.deleteMany({
      where: { userId, NOT: { tokenHash: hashToken(currentToken) } },
    }),
  ]);
}

/** Reads the bearer token out of an Authorization header. */
export function bearerToken(header: string | undefined): string {
  if (!header) return '';
  const [scheme, value] = header.split(' ');
  if (!value || scheme?.toLowerCase() !== 'bearer') return '';
  return value.trim();
}

/** Exported for the seed script, which needs the same hashing as everything else. */
export { hashPassword, timingSafeEqual };
