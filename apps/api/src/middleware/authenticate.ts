import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import type { Role } from '@yuva/shared';
import { env } from '../config/env.js';
import { ApiError } from '../utils/api-error.js';

export interface AccessTokenPayload {
  sub: string;
  email: string;
  role: Role;
}

function extractBearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return null;
  const token = header.slice('Bearer '.length).trim();
  return token.length > 0 ? token : null;
}

/**
 * Verifies the access token and attaches the caller to `req.user`.
 * Identity lookup against the database belongs to the auth module — this
 * middleware only proves the token is valid and unexpired.
 */
export function authenticate(req: Request, _res: Response, next: NextFunction) {
  const token = extractBearerToken(req);
  if (!token) {
    next(ApiError.unauthorized('Missing or malformed Authorization header'));
    return;
  }

  try {
    req.user = jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessTokenPayload;
    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      next(ApiError.unauthorized('Access token has expired'));
      return;
    }
    next(ApiError.unauthorized('Invalid access token'));
  }
}

/** Route guard: `authorize('OWNER', 'MANAGER')`. Use after `authenticate`. */
export function authorize(...allowedRoles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      next(ApiError.unauthorized());
      return;
    }
    if (allowedRoles.length > 0 && !allowedRoles.includes(req.user.role)) {
      next(ApiError.forbidden());
      return;
    }
    next();
  };
}
