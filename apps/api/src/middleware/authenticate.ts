import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { AppModule } from '@yuva/shared';
import { bearerToken, resolveSession } from '../modules/auth/auth.service.js';
import { ApiError } from '../utils/api-error.js';

/**
 * Requires a valid session, and attaches the user to the request.
 *
 * This is the real gate. The sidebar hides what a user cannot reach, but that
 * is a courtesy — anyone can type a URL or call the endpoint with curl, so the
 * server has to be the one that says no.
 */
export const authenticate: RequestHandler = (req: Request, _res: Response, next: NextFunction) => {
  const token = bearerToken(req.headers.authorization);

  resolveSession(token)
    .then((user) => {
      if (!user) {
        next(ApiError.unauthorized('Please sign in to continue'));
        return;
      }
      req.user = user;
      req.sessionToken = token;
      next();
    })
    .catch(next);
};

/** Admin only — user management, and anything that reconfigures the system. */
export const requireAdmin: RequestHandler = (req: Request, _res: Response, next: NextFunction) => {
  if (!req.user) {
    next(ApiError.unauthorized('Please sign in to continue'));
    return;
  }
  if (!req.user.isAdmin) {
    next(ApiError.forbidden('This area is for administrators'));
    return;
  }
  next();
};

/**
 * Requires access to one module. Admins pass regardless — that is what being
 * an admin means here, and checking their module list would be a second place
 * for the two ideas to disagree.
 */
export function requireModule(module: AppModule): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      next(ApiError.unauthorized('Please sign in to continue'));
      return;
    }
    if (req.user.isAdmin || req.user.modules.includes(module)) {
      next();
      return;
    }
    next(ApiError.forbidden('You do not have access to this section'));
  };
}
