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
 * Tighter limiter for the login endpoint. A username and password form is
 * exactly what brute-force attempts target, and scrypt makes every attempt
 * expensive for us too — so this guards the CPU as much as the account.
 *
 * Successful logins are not counted. The office signs in every morning on a
 * shared machine, and counting those would let ordinary work lock them out.
 */
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: () => env.isTest,
  handler: (_req, res) => {
    res.status(HTTP_STATUS.TOO_MANY_REQUESTS).json(tooManyRequests);
  },
});

/**
 * Sending quotations by email.
 *
 * Every call costs money at the provider and renders a PDF with Chromium
 * first, so this is looser than login but far tighter than the general API. It
 * is per-IP, which for one office is effectively per-company — the intent is to
 * bound a runaway loop, not to ration ordinary work.
 */
export const emailRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 60,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: () => env.isTest,
  handler: (_req, res) => {
    res.status(HTTP_STATUS.TOO_MANY_REQUESTS).json(tooManyRequests);
  },
});
