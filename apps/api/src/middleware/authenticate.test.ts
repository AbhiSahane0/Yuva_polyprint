import { describe, expect, it, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';
import type { User } from '@yuva/shared';
import { requireAdmin, requireModule } from './authenticate.js';

/*
 * The guards, in isolation.
 *
 * `authenticate` itself resolves a token against the sessions table and so
 * needs a database, but everything it hands on to is a pure decision about the
 * user it attached — and that decision is the one worth pinning down, because
 * getting it wrong exposes data rather than merely erroring.
 */

function user(overrides: Partial<User> = {}): User {
  return {
    id: 'u1',
    username: 'ravi',
    displayName: 'Ravi Kumar',
    isAdmin: false,
    isActive: true,
    modules: [],
    createdAt: '2026-08-01T00:00:00.000Z',
    lastLoginAt: null,
    ...overrides,
  };
}

/** Runs a guard and reports what it passed to next(). */
function run(guard: (req: Request, res: Response, next: NextFunction) => void, current?: User) {
  const next = vi.fn();
  guard({ user: current } as Request, {} as Response, next);

  const argument: unknown = next.mock.calls[0]?.[0];
  return {
    allowed: next.mock.calls.length === 1 && argument === undefined,
    status: (argument as { statusCode?: number } | undefined)?.statusCode,
  };
}

describe('requireAdmin', () => {
  it('lets an administrator through', () => {
    expect(run(requireAdmin, user({ isAdmin: true })).allowed).toBe(true);
  });

  it('refuses a signed-in user who is not an administrator', () => {
    const result = run(requireAdmin, user());

    expect(result.allowed).toBe(false);
    expect(result.status).toBe(403);
  });

  it('refuses an unauthenticated request as unauthorised, not forbidden', () => {
    // The distinction matters to the client: 401 means "sign in", 403 means
    // "signing in again will not help you".
    const result = run(requireAdmin, undefined);

    expect(result.allowed).toBe(false);
    expect(result.status).toBe(401);
  });
});

describe('requireModule', () => {
  it('lets through a user who has been given that module', () => {
    expect(run(requireModule('quotations'), user({ modules: ['quotations'] })).allowed).toBe(true);
  });

  it('refuses a user who has a different module', () => {
    const result = run(requireModule('quotations'), user({ modules: ['rates'] }));

    expect(result.allowed).toBe(false);
    expect(result.status).toBe(403);
  });

  it('lets an administrator through whatever their module list says', () => {
    expect(run(requireModule('quotations'), user({ isAdmin: true })).allowed).toBe(true);
  });

  it('refuses an unauthenticated request', () => {
    expect(run(requireModule('quotations'), undefined).status).toBe(401);
  });
});
