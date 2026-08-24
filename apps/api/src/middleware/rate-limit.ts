import rateLimit from 'express-rate-limit';
import { ERROR_CODE, HTTP_STATUS } from '@yuva/shared';
import type { ApiFailure } from '@yuva/shared';
import { env } from '../config/env.js';

const tooManyRequests: ApiFailure = {
  success: false,
  error: { code: ERROR_CODE.RATE_LIMITED, message: 'Too many requests, please try again later' },
};

/** Baseline limiter for the whole API surface. */
export const apiRateLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: () => env.isTest,
  handler: (_req, res) => {
    res.status(HTTP_STATUS.TOO_MANY_REQUESTS).json(tooManyRequests);
  },
});

/**
 * Tighter limiter for the future login endpoint. A username + password form is
 * exactly what brute-force attempts target, so this stays even though the auth
 * module is not built yet.
 */
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: () => env.isTest,
  handler: (_req, res) => {
    res.status(HTTP_STATUS.TOO_MANY_REQUESTS).json(tooManyRequests);
  },
});
