import type { CreateUserInput, UpdateUserInput, User } from '@yuva/shared';
import { prisma } from '../../lib/prisma.js';
import { hashPassword } from '../../lib/password.js';
import { ApiError } from '../../utils/api-error.js';
import { toPublicUser } from '../auth/auth.service.js';

const SELECT = {
  id: true,
  username: true,
  displayName: true,
  isAdmin: true,
  isActive: true,
  modules: true,
  createdAt: true,
  lastLoginAt: true,
} as const;

export async function listUsers(): Promise<User[]> {
  const rows = await prisma.user.findMany({
    orderBy: [{ isActive: 'desc' }, { isAdmin: 'desc' }, { username: 'asc' }],
    select: SELECT,
  });
  return rows.map(toPublicUser);
}

export async function createUser(input: CreateUserInput): Promise<User> {
  const clash = await prisma.user.findUnique({
    where: { username: input.username },
    select: { id: true },
  });
  if (clash) {
    throw ApiError.conflict(`The username "${input.username}" is already taken`);
  }

  const created = await prisma.user.create({
    data: {
      username: input.username,
      passwordHash: await hashPassword(input.password),
      displayName: input.displayName,
      isAdmin: input.isAdmin,
      // An admin reaches everything anyway; storing a module list alongside
      // would be a second source of truth that can drift from the flag.
      modules: input.isAdmin ? [] : input.modules,
    },
    select: SELECT,
  });

  return toPublicUser(created);
}

/**
 * Updates a user's name, admin flag, module access or active state.
 *
 * Two things are refused, both for the same reason — an admin must not be able
 * to lock every administrator out of the system by accident.
 */
export async function updateUser(
  id: string,
  input: UpdateUserInput,
  actingUserId: string,
): Promise<User> {
  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) throw ApiError.notFound('User not found');

  const losingAdmin = existing.isAdmin && (input.isAdmin === false || input.isActive === false);
  if (losingAdmin) {
    const otherAdmins = await prisma.user.count({
      where: { isAdmin: true, isActive: true, NOT: { id } },
    });
    if (otherAdmins === 0) {
      throw ApiError.badRequest(
        'This is the only administrator. Make someone else an administrator first.',
      );
    }
  }

  if (id === actingUserId && input.isActive === false) {
    throw ApiError.badRequest('You cannot deactivate your own account');
  }

  const willBeAdmin = input.isAdmin ?? existing.isAdmin;

  const updated = await prisma.user.update({
    where: { id },
    data: {
      ...(input.displayName !== undefined ? { displayName: input.displayName } : {}),
      ...(input.isAdmin !== undefined ? { isAdmin: input.isAdmin } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      ...(willBeAdmin
        ? { modules: [] }
        : input.modules !== undefined
          ? { modules: input.modules }
          : {}),
    },
    select: SELECT,
  });

  // Losing access should take effect now, not whenever the token expires.
  if (input.isActive === false) {
    await prisma.session.deleteMany({ where: { userId: id } });
  }

  return toPublicUser(updated);
}

/**
 * Sets a new password for someone else.
 *
 * Every session that user had is dropped — an admin resetting a password is
 * usually responding to a problem, and leaving the old sessions alive would
 * defeat the point.
 */
export async function resetPassword(id: string, password: string): Promise<void> {
  const existing = await prisma.user.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw ApiError.notFound('User not found');

  await prisma.$transaction([
    prisma.user.update({ where: { id }, data: { passwordHash: await hashPassword(password) } }),
    prisma.session.deleteMany({ where: { userId: id } }),
  ]);
}

/**
 * Deletes a user.
 *
 * Deactivating is almost always the better move — `entered_by` on a rate names
 * a person, and deleting them makes that record ambiguous — so the UI offers
 * deactivation first and keeps this for genuine mistakes.
 */
export async function deleteUser(id: string, actingUserId: string): Promise<void> {
  if (id === actingUserId) throw ApiError.badRequest('You cannot delete your own account');

  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) throw ApiError.notFound('User not found');

  if (existing.isAdmin) {
    const otherAdmins = await prisma.user.count({
      where: { isAdmin: true, isActive: true, NOT: { id } },
    });
    if (otherAdmins === 0) throw ApiError.badRequest('This is the only administrator');
  }

  await prisma.user.delete({ where: { id } });
}
